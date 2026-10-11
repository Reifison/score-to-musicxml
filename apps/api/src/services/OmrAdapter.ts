import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import sharp from "sharp";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";
import { MusicXmlExportService } from "./MusicXmlExportService.js";
import type { ConversionCoverage, PageClassification, PageContentRole, ScoreType } from "../domain.js";
import { inspectMusicXml, mergeVerifiedPages } from "./MusicXmlCoverage.js";
import { classifyPageContent, sha256File, validatePageDecisions, type VerifiedPageDecision } from "./PageContentClassifier.js";
import { audiverisVersionOf, inspectMusicXmlValidation, type MusicXmlValidation } from "./MusicXmlValidation.js";
import { parseVisualMusicXml, type VisualParsedEvent } from "./VisualMusicXml.js";
import { compareMusicXmlCandidateAgreement } from "./MusicXmlCandidateAgreement.js";
import { compareSourceStaffLayout } from "./SourceImageLayout.js";
import { assertConversionActive, runCommand } from "./SubprocessRunner.js";
import { isTemporaryConversionError } from "./ScoreConversionService.js";

const execFileAsync = runCommand;
const maxAudiverisDimension = 4400;
const pdfRenderTimeoutMs = 180_000;
const missingOcrLanguagesPattern = /No installed OCR languages/i;
const pageRecognitionFailurePattern = /Error in reaching step PAGE|Error processing stub/i;
const pdfPageRangeFailurePattern = /page range|first page|last page|beyond last page|Syntax Error/i;
const audiverisCandidates = [
  "/Applications/Audiveris.app/Contents/MacOS/Audiveris",
  "/opt/audiveris/bin/Audiveris",
  "/usr/local/bin/Audiveris",
  "/opt/homebrew/bin/Audiveris",
  "Audiveris",
  "audiveris"
];

function temporaryErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error) || typeof error.code !== "string") return null;
  // A native timeout must propagate across candidate and page boundaries even
  // though the completed conversion is no longer retried automatically.
  return error.code === "OMR_CONVERSION_TIMEOUT" || isTemporaryConversionError(error.code) ? error.code : null;
}


type PreparedPage = {
  attempts: PreparedAttempt[];
  originalPath?: string;
  classification?: PageClassification;
};

export type PreparedInputInspection = {
  sourcePath: string;
  outputDir: string;
  sourceSHA256: string | null;
  warnings: string[];
  pages: Array<PreparedPage & {
    page: number;
    originalImagePath: string;
    originalImageSHA256: string | null;
    contentRole: PageContentRole;
    supportStatus?: "unsupported";
    classification: PageClassification;
  }>;
};

type PreparedAttempt = {
  paths: string[];
  description: string;
  combineSegments?: boolean;
};

type CompletedAttempt = {
  attempt: PreparedAttempt;
  index: number;
  result: OmrResult;
  validation: MusicXmlValidation;
};

type CandidateSelection = {
  attempt: CompletedAttempt;
  reason: string;
  mode: "original" | "structural-dominance" | "validation";
};

const hardTimingIssueCodes = new Set(["RHYTHM_LONG", "RHYTHM_SHORT", "RHYTHM_INVALID_POSITION", "VOICE_EARLY_END"]);
const temporalAgreementDifferences = new Set(["event_presence", "onset", "duration", "printed_type", "dots"]);

const timingIssueKey = (issue: MusicXmlValidation["issues"][number]): string =>
  `${issue.partId ?? "?"}\u0000${issue.measure ?? "?"}\u0000${issue.code}\u0000${issue.staff ?? "?"}\u0000${issue.voice ?? "?"}`;

const timingMeasureKey = (partId: string | undefined, measure: string | undefined): string =>
  `${partId ?? "?"}\u0000${measure ?? "?"}`;

function hardTimingIssues(validation: MusicXmlValidation): Set<string> {
  return new Set(validation.issues.filter((issue) => hardTimingIssueCodes.has(issue.code)).map(timingIssueKey));
}

type VoiceInventoryEntry = {
  voices: Set<string>;
  /**
   * Pitched events are a multiset: two equal notes in a voice must remain two
   * events in a candidate.  Durations and positions are deliberately absent;
   * the temporal-dominance rule is allowed to repair those in the offending
   * measure, while this inventory prevents it from repairing rhythm by
   * silently changing the written pitches.
   */
  pitchedNotes: Map<string, number>;
  /** Grace pitches must match in both directions; an ornament is not a safe
   * by-product of a temporal repair. */
  gracePitchedNotes: Map<string, number>;
};

type VoiceInventory = Map<string, VoiceInventoryEntry>;

function voiceInventory(xml: string): VoiceInventory | null {
  const errors: string[] = [];
  let document: Document;
  try {
    document = new DOMParser({ errorHandler: {
      warning: (message) => errors.push(String(message)),
      error: (message) => errors.push(String(message)),
      fatalError: (message) => errors.push(String(message))
    } }).parseFromString(xml, "application/xml");
  } catch { return null; }
  const root = document.documentElement;
  if (errors.length || !root || (root.localName || root.nodeName) !== "score-partwise") return null;
  const elements = (parent: Node): Element[] => Array.from(parent.childNodes)
    .filter((node): node is Element => node.nodeType === 1);
  const named = (parent: Node, name: string): Element[] => elements(parent)
    .filter((element) => (element.localName || element.nodeName) === name);
  const textOf = (parent: Node, name: string): string => named(parent, name)[0]?.textContent?.trim() ?? "";
  const inventory: VoiceInventory = new Map();
  for (const part of named(root, "part")) {
    const partId = part.getAttribute("id") ?? "?";
    for (const measure of named(part, "measure")) {
      const measureKey = timingMeasureKey(partId, measure.getAttribute("number") || "?");
      const entry = inventory.get(measureKey) ?? {
        voices: new Set<string>(),
        pitchedNotes: new Map<string, number>(),
        gracePitchedNotes: new Map<string, number>()
      };
      for (const note of named(measure, "note")) {
        const voice = textOf(note, "voice") || "1";
        const staff = textOf(note, "staff") || "1";
        entry.voices.add(`${staff}\u0000${voice}`);
        const pitch = named(note, "pitch")[0];
        if (pitch) {
          const step = textOf(pitch, "step").toUpperCase();
          const alterText = textOf(pitch, "alter") || "0";
          const alterNumber = Number(alterText);
          const alter = Number.isFinite(alterNumber) ? String(alterNumber) : alterText;
          const octave = textOf(pitch, "octave");
          if (step && octave) {
            const isGrace = named(note, "grace").length > 0;
            const pitchKey = `${staff}\u0000${voice}\u0000${step}\u0000${alter}\u0000${octave}`;
            const pitches = isGrace ? entry.gracePitchedNotes : entry.pitchedNotes;
            pitches.set(pitchKey, (pitches.get(pitchKey) ?? 0) + 1);
          }
        }
      }
      if (entry.voices.size) inventory.set(measureKey, entry);
    }
  }
  return inventory;
}

function preservesVoiceAndPitchedInventory(originalXml: string, alternativeXml: string): boolean {
  const original = voiceInventory(originalXml);
  const alternative = voiceInventory(alternativeXml);
  if (!original || !alternative) return false;
  // A temporal repair may change durations or remove rests, but it may not
  // manufacture or erase a pitched event. Compare every measure in both
  // directions so the guard is an exact multiset/cardinality check rather
  // than the previous one-way subset check.
  if (original.size !== alternative.size) return false;
  for (const [measure, originalEntry] of original) {
    const alternativeEntry = alternative.get(measure);
    if (!alternativeEntry || alternativeEntry.voices.size !== originalEntry.voices.size
      || [...originalEntry.voices].some((voice) => !alternativeEntry.voices.has(voice))) return false;
    if (alternativeEntry.pitchedNotes.size !== originalEntry.pitchedNotes.size
      || [...originalEntry.pitchedNotes].some(([pitchKey, count]) => alternativeEntry.pitchedNotes.get(pitchKey) !== count)) return false;
    if (alternativeEntry.gracePitchedNotes.size !== originalEntry.gracePitchedNotes.size
      || [...originalEntry.gracePitchedNotes].some(([pitchKey, count]) => alternativeEntry.gracePitchedNotes.get(pitchKey) !== count)) return false;
  }
  return true;
}

type TimedMeasure = {
  partId: string;
  measure: string;
  meter: number | null;
  events: VisualParsedEvent[];
};

const timingEpsilon = 0.000001;

function meterLength(time: Element): number | null {
  const beats = Array.from(time.childNodes).filter((node): node is Element => node.nodeType === 1
    && (node as Element).localName === "beats");
  const units = Array.from(time.childNodes).filter((node): node is Element => node.nodeType === 1
    && (node as Element).localName === "beat-type");
  if (!beats.length || beats.length !== units.length || time.hasAttribute("number")) return null;
  let total = 0;
  for (let index = 0; index < beats.length; index++) {
    const groups = (beats[index].textContent ?? "").split("+").map((value) => Number(value.trim()));
    const unit = Number(units[index].textContent?.trim());
    if (!Number.isFinite(unit) || unit <= 0 || groups.some((value) => !Number.isFinite(value) || value <= 0)) return null;
    total += groups.reduce((sum, value) => sum + value, 0) * 4 / unit;
  }
  return total > 0 ? total : null;
}

function timedMeasures(xml: string): Map<string, TimedMeasure> | null {
  try {
    const errors: string[] = [];
    const document = new DOMParser({ errorHandler: {
      warning: (message) => errors.push(String(message)),
      error: (message) => errors.push(String(message)),
      fatalError: (message) => errors.push(String(message))
    } }).parseFromString(xml, "application/xml");
    const root = document.documentElement;
    if (errors.length || !root || (root.localName || root.nodeName) !== "score-partwise") return null;
    const parsed = parseVisualMusicXml(new XMLSerializer().serializeToString(root));
    const result = new Map<string, TimedMeasure>();
    for (const part of Array.from(root.childNodes).filter((node): node is Element => node.nodeType === 1
      && (node as Element).localName === "part")) {
      const partId = part.getAttribute("id") ?? "?";
      let meter: number | null = null;
      for (const measure of Array.from(part.childNodes).filter((node): node is Element => node.nodeType === 1
        && (node as Element).localName === "measure")) {
        for (const attributes of Array.from(measure.childNodes).filter((node): node is Element => node.nodeType === 1
          && (node as Element).localName === "attributes")) {
          const time = Array.from(attributes.childNodes).find((node): node is Element => node.nodeType === 1
            && (node as Element).localName === "time");
          if (time) meter = meterLength(time);
        }
        const measureNumber = measure.getAttribute("number") || "?";
        const parsedMeasure = parsed.find((item) => item.partId === partId && item.measure === measureNumber
          && item.measureIndex === Array.from(part.childNodes).filter((node) => node.nodeType === 1 && (node as Element).localName === "measure").indexOf(measure));
        if (!parsedMeasure) return null;
        result.set(timingMeasureKey(partId, measureNumber), { partId, measure: measureNumber, meter, events: parsedMeasure.events });
      }
    }
    return result;
  } catch { return null; }
}

const eventPitch = (event: VisualParsedEvent): string | null => event.kind === "note"
  ? `${event.step ?? "?"}\u0000${event.alter ?? 0}\u0000${event.octave ?? "?"}` : null;
const eventContext = (event: VisualParsedEvent): string => `${event.staff}\u0000${event.voice}`;
const eventFingerprint = (event: VisualParsedEvent): string => JSON.stringify([
  eventContext(event), Math.round(event.onset * 1_000_000), Math.round(event.duration * 1_000_000), event.kind,
  eventPitch(event), Boolean(event.grace), Boolean(event.chord), event.type ?? null, event.dots ?? 0
]);

function multiset(values: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

/**
 * Adelita exposes one narrowly bounded repair shape: an invalid rest crosses
 * the barline and is followed by a written pitch after the bar ends. The
 * alternative removes that rest, preserves every original pitch in order for
 * that voice, and uses only the released in-bar tail for new pitches. This is
 * a structural provenance guard, never a claim that the new pitches are right.
 */
function preservesOverflowRestTailRepair(originalXml: string, alternativeXml: string): boolean {
  const original = timedMeasures(originalXml);
  const alternative = timedMeasures(alternativeXml);
  if (!original || !alternative || original.size !== alternative.size) return false;
  const overflowContexts = new Map<string, { rest: VisualParsedEvent; tailStart: number; meter: number }>();
  for (const [key, measure] of original) {
    if (measure.meter === null) continue;
    const byContext = new Map<string, VisualParsedEvent[]>();
    for (const event of measure.events) if (!event.grace) byContext.set(eventContext(event), [...(byContext.get(eventContext(event)) ?? []), event]);
    for (const [context, events] of byContext) {
      const overflowRest = events.find((event) => event.kind === "rest"
        && event.onset < measure.meter! - timingEpsilon
        && event.onset + event.duration > measure.meter! + timingEpsilon);
      const pitchAfterBar = events.some((event) => event.kind === "note" && event.onset >= measure.meter! - timingEpsilon);
      if (overflowRest && pitchAfterBar) overflowContexts.set(`${key}\u0000${context}`, { rest: overflowRest, tailStart: overflowRest.onset, meter: measure.meter });
    }
  }
  if (!overflowContexts.size) return false;

  for (const [key, originalMeasure] of original) {
    const alternativeMeasure = alternative.get(key);
    if (!alternativeMeasure || originalMeasure.partId !== alternativeMeasure.partId) return false;
    // Include grace-only contexts as well: a tail repair must not hide an
    // ornament that exists in a voice with no regular event in this measure.
    const contexts = new Set([...originalMeasure.events, ...alternativeMeasure.events].map(eventContext));
    for (const context of contexts) {
      const contextKey = `${key}\u0000${context}`;
      const overflow = overflowContexts.get(contextKey);
      const originalEvents = originalMeasure.events.filter((event) => !event.grace && eventContext(event) === context);
      const alternativeEvents = alternativeMeasure.events.filter((event) => !event.grace && eventContext(event) === context);
      const originalGraces = originalMeasure.events.filter((event) => event.grace && eventContext(event) === context).map(eventFingerprint);
      const alternativeGraces = alternativeMeasure.events.filter((event) => event.grace && eventContext(event) === context).map(eventFingerprint);
      if (multiset(originalGraces).size !== multiset(alternativeGraces).size
        || [...multiset(originalGraces)].some(([fingerprint, count]) => multiset(alternativeGraces).get(fingerprint) !== count)) return false;
      const originalRests = originalEvents.filter((event) => event.kind === "rest");
      const alternativeRests = alternativeEvents.filter((event) => event.kind === "rest");
      const retainedOriginalRests = originalRests.filter((event) => event !== overflow?.rest).map(eventFingerprint);
      if (multiset(retainedOriginalRests).size !== multiset(alternativeRests.map(eventFingerprint)).size
        || [...multiset(retainedOriginalRests)].some(([fingerprint, count]) => multiset(alternativeRests.map(eventFingerprint)).get(fingerprint) !== count)) return false;
      const originalPitches = originalEvents.filter((event) => event.kind === "note");
      const alternativePitches = alternativeEvents.filter((event) => event.kind === "note");
      if (!overflow) {
        if (originalPitches.length !== alternativePitches.length
          || originalPitches.some((event, index) => eventFingerprint(event) !== eventFingerprint(alternativePitches[index]))) return false;
        continue;
      }
      const originalBeforeTail = originalPitches.filter((event) => event.onset < overflow.tailStart - timingEpsilon);
      const alternativeBeforeTail = alternativePitches.filter((event) => event.onset < overflow.tailStart - timingEpsilon);
      if (originalBeforeTail.length !== alternativeBeforeTail.length
        || originalBeforeTail.some((event, index) => eventFingerprint(event) !== eventFingerprint(alternativeBeforeTail[index]))) return false;

      // Before the barline, every original pitched event is immutable. After
      // the released tail begins, only original pitches that were written
      // beyond the bar may be retimed into the tail; any other events are
      // additions and must fit a single non-overlapping melodic sequence.
      const originalAfterTail = originalPitches.filter((event) => event.onset >= overflow.tailStart - timingEpsilon);
      const alternativeAfterTail = alternativePitches.filter((event) => event.onset >= overflow.tailStart - timingEpsilon);
      let originalIndex = 0;
      const extras: VisualParsedEvent[] = [];
      for (const event of alternativeAfterTail) {
        const originalEvent = originalAfterTail[originalIndex];
        const exactMatch = Boolean(originalEvent && eventFingerprint(event) === eventFingerprint(originalEvent));
        const retimedOriginal = Boolean(originalEvent && originalEvent.onset >= overflow.meter - timingEpsilon
          && eventPitch(event) === eventPitch(originalEvent)
          && event.duration === originalEvent.duration
          && event.type === originalEvent.type
          && (event.dots ?? 0) === (originalEvent.dots ?? 0)
          && event.onset >= overflow.tailStart - timingEpsilon
          && event.onset + event.duration <= overflow.meter + timingEpsilon
          && !event.chord);
        if (exactMatch || retimedOriginal) originalIndex++;
        else extras.push(event);
      }
      if (originalIndex !== originalAfterTail.length) return false;
      if (extras.some((event) => event.onset < overflow.tailStart - timingEpsilon
        || event.onset + event.duration > overflow.meter + timingEpsilon
        || event.chord)) return false;

      const tailEvents = alternativeAfterTail
        .filter((event) => event.onset < overflow.meter + timingEpsilon)
        .sort((left, right) => left.onset - right.onset);
      if (tailEvents.some((event) => event.chord)) return false;
      for (let index = 1; index < tailEvents.length; index++) {
        const previous = tailEvents[index - 1];
        const current = tailEvents[index];
        if (current.onset < previous.onset + previous.duration - timingEpsilon) return false;
      }
    }
  }
  return true;
}

export type CandidateEvidence = {
  page: number;
  candidate: number;
  candidateIds?: number[];
  selected: boolean;
  reason: string;
  xml: string;
  sourceImagePath?: string;
  /** Full original page raster; coordinates from transformed preparations cannot be assumed here. */
  originalImagePath?: string;
  nativeArchivePath?: string;
  sourceImagePaths?: Array<{ candidate: number; path: string; sha256: string }>;
  validation: MusicXmlValidation;
};

export type OmrResult = {
  musicXml: string;
  warnings: string[];
  coverage?: ConversionCoverage;
  validation?: MusicXmlValidation;
  evidence?: CandidateEvidence[];
  engine?: { name: string; version: string | null };
};

export type OmrConversionOptions = {
  preprocessingProfile?: string | null;
  scoreType?: ScoreType;
  scoreTypeSelected?: boolean;
  signal?: AbortSignal;
  pageDecisions?: VerifiedPageDecision[];
  preparedInspection?: PreparedInputInspection;
};

export interface OmrAdapter {
  convert(inputPath: string, originalFilename: string, outputDir: string, options?: OmrConversionOptions): Promise<OmrResult>;
}

export class StubOmrAdapter implements OmrAdapter {
  constructor(private musicXml = new MusicXmlExportService()) {}

  async convert(_inputPath: string, originalFilename: string): Promise<OmrResult> {
    throw new AppError(
      501,
      `A conversao OMR real ainda nao esta configurada para ${originalFilename}. Configure OMR_ENGINE=audiveris e AUDIVERIS_BIN para gerar notas reais.`,
      "OMR_ENGINE_NOT_CONFIGURED"
    );
  }
}

export class AudiverisOmrAdapter implements OmrAdapter {
  async inspectPages(inputPath: string, outputDir: string, options: OmrConversionOptions = {}): Promise<PreparedInputInspection> {
    await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
    const prepared = await this.prepareInputForOmr(inputPath, outputDir, options);
    validatePageDecisions(options.pageDecisions, prepared.pages.length);
    const sourceSHA256 = await sha256File(inputPath).catch(() => null);
    const pages = await Promise.all(prepared.pages.map(async (page, index) => {
      const originalImagePath = page.originalPath ?? page.attempts[0]?.paths[0];
      if (!originalImagePath) throw new AppError(422, "Página sem imagem original preparada.", "PAGE_ORIGINAL_MISSING");
      const originalImageSHA256 = await sha256File(originalImagePath).catch(() => null);
      const assessment = await classifyPageContent(inputPath, originalImagePath, options.pageDecisions?.find((item) => item.page === index + 1), sourceSHA256 ?? undefined);
      return { ...page, page: index + 1, originalImagePath, originalImageSHA256, contentRole: assessment.role, supportStatus: assessment.supportStatus, classification: assessment.classification };
    }));
    return { sourcePath: inputPath, outputDir, sourceSHA256, warnings: prepared.warnings, pages };
  }

  async convert(inputPath: string, originalFilename: string, outputDir: string, options: OmrConversionOptions = {}): Promise<OmrResult> {
    await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
    const inspected = options.preparedInspection;
    if (inspected && (path.resolve(inspected.sourcePath) !== path.resolve(inputPath) || path.resolve(inspected.outputDir) !== path.resolve(outputDir)
      || !inspected.sourceSHA256 || inspected.sourceSHA256 !== await sha256File(inputPath).catch(() => null))) {
      throw new AppError(422, "A inspeção preparada não corresponde ao arquivo atual.", "PAGE_INSPECTION_MISMATCH");
    }
    const preprocessing = inspected
      ? { ...inspected, pages: await Promise.all(inspected.pages.map(async (page) => {
        const currentImageSHA256 = await sha256File(page.originalImagePath).catch(() => null);
        if (!currentImageSHA256 || currentImageSHA256 !== page.originalImageSHA256) throw new AppError(422, "A imagem preparada mudou após a inspeção.", "PAGE_INSPECTION_MISMATCH");
        const assessment = await classifyPageContent(inputPath, page.originalImagePath, options.pageDecisions?.find((item) => item.page === page.page), inspected.sourceSHA256 ?? undefined);
        return { ...page, contentRole: assessment.role, supportStatus: assessment.supportStatus, classification: assessment.classification };
      })) }
      : await this.inspectPages(inputPath, outputDir, options);
    validatePageDecisions(options.pageDecisions, preprocessing.pages.length);
    if (preprocessing.pages.every((page) => page.contentRole === "nonmusical" && page.classification.method === "verified_manual_v1")) {
      throw new AppError(422, "O documento não contém páginas musicais confirmadas.", "NON_MUSICAL_DOCUMENT");
    }
    if (preprocessing.pages.every((page) => page.contentRole === "nonmusical" || page.supportStatus === "unsupported")) {
      throw new AppError(422, "A notação musical está fora dos tipos suportados nesta conversão.", "OMR_UNSUPPORTED_LAYOUT");
    }
    await this.resolveAudiverisBin();
    const pageResults: Array<{ page: number; result: OmrResult }> = [];
    const pageFailures: Array<{ page: number; message: string; code: string }> = [];
    const scoreType = options.scoreType ?? "melody";

    for (const [index, page] of preprocessing.pages.entries()) {
      assertConversionActive();
      if (page.contentRole === "nonmusical" && page.classification.method === "verified_manual_v1") continue;
      if (page.supportStatus === "unsupported") {
        pageFailures.push({ page: index + 1, message: `Página ${index + 1}: notação musical fora dos tipos suportados.`, code: "OMR_UNSUPPORTED_LAYOUT" });
        continue;
      }
      const pageOutputDir = path.join(outputDir, `page-${String(index + 1).padStart(3, "0")}`);
      await fs.mkdir(pageOutputDir, { recursive: true, mode: 0o700 });
      try {
        const result = await this.convertPreparedPage(page, originalFilename, pageOutputDir, index + 1, scoreType);
        pageResults.push({ page: index + 1, result });
      } catch (error) {
        assertConversionActive();
        if (temporaryErrorCode(error) || (error instanceof AppError && ["OMR_PART_INTEGRITY", "OMR_STAFF_INTEGRITY", "OMR_PART_IDENTITY_AMBIGUOUS"].includes(error.code))) throw error;
        pageFailures.push({ page: index + 1, message: `Página ${index + 1}: ${this.summarizePageFailure(error)}`, code: error instanceof AppError ? error.code : "OMR_PAGE_FAILED" });
      }
    }

    if (!pageResults.length) {
      const allExcluded = preprocessing.pages.every((page) => page.contentRole === "nonmusical" && page.classification.method === "verified_manual_v1");
      if (allExcluded) throw new AppError(422, "O documento não contém páginas musicais confirmadas.", "NON_MUSICAL_DOCUMENT");
      if (preprocessing.pages.some((page) => page.contentRole === "uncertain")) {
        throw new AppError(422, "Nenhuma página musical foi reconhecida; revise as páginas ambíguas antes de excluir ou converter.", "PAGE_CLASSIFICATION_REQUIRED");
      }
      if (preprocessing.pages.some((page) => page.supportStatus === "unsupported")) {
        throw new AppError(422, "A notação musical está fora dos tipos suportados nesta conversão.", "OMR_UNSUPPORTED_LAYOUT");
      }
      throw new AppError(
        422,
        pageFailures.length ? pageFailures.map((failure) => failure.message).join("\n") : "Nenhuma página foi preparada para OMR.",
        pageFailures.length ? "OMR_ALL_PAGES_FAILED" : "OMR_NO_PAGES"
      );
    }

    const coverage: ConversionCoverage = {
      totalPages: preprocessing.pages.length,
      processedPages: pageResults.map(({ page }) => page),
      missingPages: pageFailures.map(({ page }) => page),
      excludedPages: preprocessing.pages.filter((page) => page.contentRole === "nonmusical").map((page) => page.page),
      uncertainPages: preprocessing.pages.filter((page) => page.contentRole === "uncertain").map((page) => page.page),
      unsupportedPages: preprocessing.pages.filter((page) => page.supportStatus === "unsupported").map((page) => page.page),
      pages: Array.from({ length: preprocessing.pages.length }, (_value, index) => {
        const page = index + 1;
        const prepared = preprocessing.pages[index];
        const details = { contentRole: prepared.contentRole, supportStatus: prepared.supportStatus, classification: prepared.classification };
        if (prepared.contentRole === "nonmusical") return { page, status: "excluded" as const, parts: [], ...details };
        const result = pageResults.find((item) => item.page === page);
        return result ? { ...inspectMusicXml(result.result.musicXml, page, scoreType).coverage, ...details } : { page, status: "missing" as const, parts: [], errorCode: pageFailures.find((item) => item.page === page)?.code, ...details };
      })
    };
    const musicXml = mergeVerifiedPages(pageResults.map(({ page, result }) => ({ page, xml: result.musicXml })), scoreType, coverage, options.scoreTypeSelected === true);
    const combinedValidation = inspectMusicXmlValidation(musicXml);
    const candidateIssues = pageResults.flatMap(({ page, result }) => (result.validation?.issues ?? [])
      .filter((issue) => issue.code.startsWith("CANDIDATE_") || issue.code.startsWith("SOURCE_"))
      .map((issue) => ({ ...issue, page, message: issue.message.startsWith(`Página ${page}:`) ? issue.message : `Página ${page}: ${issue.message}` })));
    if (candidateIssues.length) {
      combinedValidation.issues.push(...candidateIssues);
      combinedValidation.requiresReview = true;
    }
    const engineVersions = pageResults.map(({ result }) => audiverisVersionOf(result.musicXml));
    const engineVersion = engineVersions.length && engineVersions.every((version) => version && version === engineVersions[0]) ? engineVersions[0] : null;
    return {
      musicXml,
      coverage,
      validation: combinedValidation,
      evidence: pageResults.flatMap(({ result }) => result.evidence ?? []),
      engine: { name: "Audiveris", version: engineVersion },
      warnings: [
        ...preprocessing.warnings,
        ...(coverage.excludedPages?.length ? [`Páginas não musicais confirmadas e excluídas: ${coverage.excludedPages.join(", ")}.`] : []),
        ...(coverage.uncertainPages?.length ? [`Classificação musical pendente nas páginas: ${coverage.uncertainPages.join(", ")}. Confira o original; o OMR não resolve essa dúvida.`] : []),
        ...(coverage.unsupportedPages?.length ? [`Páginas com notação musical fora dos tipos suportados: ${coverage.unsupportedPages.join(", ")}.`] : []),
        ...pageResults.flatMap(({ result }) => result.warnings),
        ...pageFailures.map((failure) => `${failure.message}. A página inteira está ausente do MusicXML parcial.`),
        "Conversao automatica concluida. Revise o resultado para corrigir possiveis erros de OMR."
      ]
    };
  }

  private async prepareInputForOmr(inputPath: string, outputDir: string, options: OmrConversionOptions): Promise<{ pages: PreparedPage[]; warnings: string[] }> {
    try {
      return await this.preprocessInput(inputPath, outputDir, options);
    } catch (error) {
      if (temporaryErrorCode(error) || (error instanceof AppError && ["OMR_PAGE_LIMIT", "PDF_PAGE_COUNT_UNKNOWN", "PDF_RENDER_NOT_CONFIGURED"].includes(error.code))) throw error;
      throw new AppError(422, this.summarizePreprocessFailure(error), "OMR_PREPROCESS_FAILED");
    }
  }

  private async convertPreparedPage(page: PreparedPage, originalFilename: string, pageOutputDir: string, pageNumber: number, scoreType: ScoreType): Promise<OmrResult> {
    const failures: string[] = [];
    const successes: CompletedAttempt[] = [];
    const inspected: Array<{ attempt: PreparedAttempt; index: number; xml: string; validation: MusicXmlValidation; valid: boolean }> = [];
    const imageSHA256ByAttempt = new Map<number, string | null>();
    const duplicateAttemptsByLeader = new Map<number, Array<{ index: number; path: string; sha256: string }>>();
    const firstAttemptByImageSHA256 = new Map<string, number>();
    let integrityFailure: AppError | null = null;
    let temporaryFailure: unknown = null;

    for (const [index, attempt] of page.attempts.entries()) {
      assertConversionActive();
      if (attempt.combineSegments) continue;
      const imagePath = attempt.paths[0];
      if (imagePath) {
        const imageSHA256 = await sha256File(imagePath).catch(() => null);
        imageSHA256ByAttempt.set(index, imageSHA256);
        const firstIndex = imageSHA256 ? firstAttemptByImageSHA256.get(imageSHA256) : undefined;
        if (imageSHA256 && firstIndex !== undefined) {
          const firstPath = page.attempts[firstIndex]?.paths[0];
          const firstCurrentSHA256 = firstPath ? await sha256File(firstPath).catch(() => null) : null;
          if (firstCurrentSHA256 === imageSHA256) {
            const aliases = duplicateAttemptsByLeader.get(firstIndex) ?? [];
            aliases.push({ index, path: imagePath, sha256: imageSHA256 });
            duplicateAttemptsByLeader.set(firstIndex, aliases);
            continue;
          }
          firstAttemptByImageSHA256.delete(imageSHA256);
          firstAttemptByImageSHA256.set(imageSHA256, index);
        }
        if (imageSHA256) firstAttemptByImageSHA256.set(imageSHA256, index);
      }
      const attemptOutputDir = path.join(pageOutputDir, `attempt-${String(index + 1).padStart(2, "0")}`);
      await fs.mkdir(attemptOutputDir, { recursive: true, mode: 0o700 });
      let result: OmrResult | undefined;
      try {
        result = await this.convertPage(attempt.paths[0], originalFilename, attemptOutputDir);
        const baseValidation = inspectMusicXmlValidation(result.musicXml, { scope: "page" });
        const sourceLayoutIssues = page.classification?.sourceLayout
          ? compareSourceStaffLayout(result.musicXml, page.classification.sourceLayout, pageNumber, scoreType).map((issue) => ({ ...issue, page: pageNumber }))
          : [];
        const validation: MusicXmlValidation = sourceLayoutIssues.length
          ? { ...baseValidation, issues: [...baseValidation.issues, ...sourceLayoutIssues], requiresReview: true }
          : baseValidation;
        inspectMusicXml(result.musicXml, pageNumber, scoreType);
        inspected.push({ attempt, index, xml: result.musicXml, validation, valid: true });
        successes.push({
          attempt,
          index,
          validation,
          result: index === 0
            ? { ...result, validation }
            : {
                ...result,
                validation,
                warnings: [
                  `A leitura usou uma preparação alternativa da página: ${attempt.description}.`,
                  ...result.warnings
                ]
              }
        });
      } catch (error) {
        assertConversionActive();
        if (result && !inspected.some((item) => item.index === index)) {
          inspected.push({ attempt, index, xml: result.musicXml, validation: inspectMusicXmlValidation(result.musicXml, { scope: "page" }), valid: false });
        }
        if (error instanceof AppError && ["OMR_PART_INTEGRITY", "OMR_STAFF_INTEGRITY", "OMR_PART_IDENTITY_AMBIGUOUS"].includes(error.code)) integrityFailure ??= error;
        if (temporaryErrorCode(error)) temporaryFailure ??= error;
        failures.push(this.summarizePageFailure(error));
      }
    }

    if (successes.length) {
      const agreementIssues = compareMusicXmlCandidateAgreement(successes.map((item) => ({ candidateIds: [item.index + 1], xml: item.result.musicXml })), pageNumber);
      const selection = this.selectAttempt(successes, agreementIssues);
      const chosen = selection.attempt;
      const differingMeasureCounts = new Set(successes.map((item) => item.validation.checkedMeasures + item.validation.skippedMeasures)).size > 1;
      const differingDiagnostics = new Set(successes.map((item) => JSON.stringify({
        issues: item.validation.issues.map((issue) => [issue.code, issue.partId, issue.measure]),
        checked: item.validation.checkedMeasures,
        skipped: item.validation.skippedMeasures
      }))).size > 1;
      const differingXml = new Set(successes.map((item) => item.result.musicXml)).size > 1;
      const evidence: CandidateEvidence[] = await Promise.all(inspected.map(async (item) => {
        const selected = item.index === chosen.index;
        const sourceImagePath = await this.producedSourceImagePath(item.attempt.paths[0], pageOutputDir);
        const aliases = duplicateAttemptsByLeader.get(item.index) ?? [];
        const candidateIds = [item.index + 1, ...aliases.map((alias) => alias.index + 1)].sort((a, b) => a - b);
        const sourceImagePaths = await Promise.all([{ index: item.index, path: item.attempt.paths[0] }, ...aliases].map(async (source) => {
          const safePath = await this.producedSourceImagePath(source.path, pageOutputDir);
          const imageSHA256 = source.index === item.index ? imageSHA256ByAttempt.get(source.index) : aliases.find((alias) => alias.index === source.index)?.sha256;
          return safePath && imageSHA256 ? { candidate: source.index + 1, path: safePath, sha256: imageSHA256 } : null;
        }));
        const persistedSourceImagePaths = sourceImagePaths.filter((source): source is { candidate: number; path: string; sha256: string } => source !== null);
        const evidenceSourceImagePath = sourceImagePath ?? persistedSourceImagePaths[0]?.path;
        const originalImagePath = page.originalPath;
        const nativeArchivePath = await this.findNativeArchive(path.join(pageOutputDir, `attempt-${String(item.index + 1).padStart(2, "0")}`));
        const reuseReason = aliases.length
          ? ` A(s) preparação(ões) ${aliases.map((alias) => `#${alias.index + 1}`).join(", ")} têm bytes idênticos a este candidato e reutilizaram sua leitura; não são votos independentes.`
          : "";
        return {
          page: pageNumber,
          candidate: item.index + 1,
          candidateIds,
          selected,
          reason: (!item.valid ? "Rejeitado por integridade estrutural." : agreementIssues.length
            ? selected ? selection.reason : selection.mode === "structural-dominance"
              ? "Não escolhido: outra leitura eliminou uma violação temporal comprovável sem introduzir nova violação e preservou as vozes; a leitura foi mantida no histórico para revisão."
              : "Não escolhido: divergência musical impede usar menos avisos como prova de qualidade."
            : differingMeasureCounts
            ? selected ? "Escolhido pela ordem original; candidatos divergem na quantidade de compassos e exigem revisão." : "Não escolhido: candidatos divergem na quantidade de compassos e exigem revisão."
            : selected ? "Escolhido por menor severidade de validação, com desempate pela ordem original." : "Não escolhido após comparação de severidade de validação.") + reuseReason,
          xml: item.xml,
          ...(evidenceSourceImagePath ? { sourceImagePath: evidenceSourceImagePath } : {}),
          ...(originalImagePath ? { originalImagePath } : {}),
          ...(nativeArchivePath ? { nativeArchivePath } : {}),
          ...(persistedSourceImagePaths.length ? { sourceImagePaths: persistedSourceImagePaths } : {}),
          validation: item.validation
        };
      }));
      const divergenceIssue = differingMeasureCounts
        ? { code: "CANDIDATE_MEASURE_COUNT_DIVERGENCE", severity: "warning" as const, message: "As preparações divergem na quantidade de compassos; confira o original." }
        : differingDiagnostics
          ? { code: "CANDIDATE_VALIDATION_DIVERGENCE", severity: "warning" as const, message: "As preparações divergem nos diagnósticos internos; confira o original." }
          : differingXml && agreementIssues.length > 0
            ? { code: "CANDIDATE_XML_DIVERGENCE", severity: "warning" as const, message: "As preparações geraram MusicXML diferente sem diferença nos diagnósticos internos; confira o original." }
            : null;
      const rejectedIssue = inspected.some((item) => !item.valid)
        ? { code: "CANDIDATE_STRUCTURAL_REJECTION", severity: "warning" as const, message: "Uma leitura alternativa perdeu integridade de partes ou pautas; confira a cobertura da versão selecionada na fonte." }
        : null;
      const validation = divergenceIssue || agreementIssues.length || rejectedIssue
        ? { ...chosen.validation, issues: [...chosen.validation.issues, ...(divergenceIssue ? [divergenceIssue] : []), ...(rejectedIssue ? [rejectedIssue] : []), ...agreementIssues], requiresReview: true }
        : chosen.validation;
      return { ...chosen.result, validation, evidence };
    }
    if (integrityFailure) throw integrityFailure;
    if (temporaryFailure) throw temporaryFailure;

    throw new AppError(
      422,
      [
        `Tentamos ${page.attempts.filter((attempt) => !attempt.combineSegments).length} preparacao(oes) da imagem antes do OMR, mas nenhuma foi reconhecida.`,
        failures.at(-1)
      ].filter(Boolean).join("\n"),
      "AUDIVERIS_FAILED"
    );
  }

  private selectAttempt(attempts: CompletedAttempt[], agreementIssues: Array<{ code: string; candidateIds: number[]; partId?: string; measure?: string; differences?: string[] }>): CandidateSelection {
    if (agreementIssues.length && attempts.length > 1) {
      const original = attempts[0];
      const originalTiming = hardTimingIssues(original.validation);
      const inventoryGuards = new Map<number, "exact" | "overflow-rest-tail">();
      const safeAlternatives = attempts.slice(1).filter((alternative) => {
        const pairIssues = agreementIssues.filter((issue) => issue.candidateIds.includes(original.index + 1)
          && issue.candidateIds.includes(alternative.index + 1));
        if (!pairIssues.length || pairIssues.some((issue) => issue.code !== "CANDIDATE_EVENT_DIVERGENCE"
          || !issue.partId || !issue.measure
          || !issue.differences?.length
          || issue.differences.some((difference) => !temporalAgreementDifferences.has(difference)))) return false;
        const alternativeTiming = hardTimingIssues(alternative.validation);
        const removedTiming = [...originalTiming].filter((key) => !alternativeTiming.has(key));
        const introducedTiming = [...alternativeTiming].filter((key) => !originalTiming.has(key));
        if (!removedTiming.length || introducedTiming.length) return false;
        const removedMeasures = new Set(removedTiming.map((key) => {
          const [partId, measure] = key.split("\u0000");
          return timingMeasureKey(partId, measure);
        }));
        if (pairIssues.some((issue) => !removedMeasures.has(timingMeasureKey(issue.partId, issue.measure)))) return false;
        const exactInventory = preservesVoiceAndPitchedInventory(original.result.musicXml, alternative.result.musicXml);
        const overflowTailRepair = !exactInventory
          && preservesOverflowRestTailRepair(original.result.musicXml, alternative.result.musicXml);
        if (!exactInventory && !overflowTailRepair) return false;
        inventoryGuards.set(alternative.index, exactInventory ? "exact" : "overflow-rest-tail");
        return true;
      });
      if (safeAlternatives.length === 1) {
        const attempt = safeAlternatives[0];
        const removed = [...originalTiming].filter((key) => !hardTimingIssues(attempt.validation).has(key));
        const inventoryReason = inventoryGuards.get(attempt.index) === "overflow-rest-tail"
          ? " passou a guarda excepcional de repouso que cruza o fim do compasso: alturas originais preservadas na ordem da voz e novas alturas confinadas à cauda métrica liberada; isso não certifica a fidelidade musical."
          : " preservou o inventário exato de vozes e alturas; isso não certifica a fidelidade musical.";
        return {
          attempt,
          mode: "structural-dominance",
          reason: `Escolhido por dominância estrutural temporal: removeu ${removed.length} violação(ões) rítmica(s) comprovável(is), não criou nova violação,${inventoryReason} manteve a leitura original no histórico.`
        };
      }
    }
    if (agreementIssues.length) {
      return {
        attempt: attempts[0],
        mode: "original",
        reason: "Escolhido provisoriamente pela ordem original; candidatos discordam musicalmente e exigem revisão da fonte."
      };
    }
    return { attempt: this.selectPreferredAttempt(attempts), mode: "validation", reason: "Escolhido por menor severidade de validação, com desempate pela ordem original." };
  }

  private selectPreferredAttempt(attempts: CompletedAttempt[]): CompletedAttempt {
    const measureCounts = new Set(attempts.map((item) => item.validation.checkedMeasures + item.validation.skippedMeasures));
    // A shorter transcription may have fewer warnings only because it lost measures.
    if (measureCounts.size > 1) return attempts[0];
    return [...attempts].sort((a, b) => {
      const errors = a.validation.issues.filter((issue) => issue.severity === "error").length - b.validation.issues.filter((issue) => issue.severity === "error").length;
      if (errors) return errors;
      const warnings = a.validation.issues.filter((issue) => issue.severity === "warning").length - b.validation.issues.filter((issue) => issue.severity === "warning").length;
      if (warnings) return warnings;
      const skipped = a.validation.skippedMeasures - b.validation.skippedMeasures;
      if (skipped) return skipped;
      return a.index - b.index;
    })[0];
  }

  private async producedSourceImagePath(sourcePath: string, pageOutputDir: string): Promise<string | undefined> {
    try {
      const workDir = await fs.realpath(path.resolve(pageOutputDir, ".."));
      const resolved = await fs.realpath(sourcePath);
      if (!resolved.startsWith(`${workDir}${path.sep}`)) return undefined;
      return (await fs.stat(resolved)).isFile() ? resolved : undefined;
    } catch { return undefined; }
  }

  private async findNativeArchive(directory: string): Promise<string | undefined> {
    try {
      const archives: string[] = [];
      const visit = async (dir: string): Promise<void> => {
        for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) await visit(path.join(dir, entry.name));
          else if (entry.isFile() && entry.name.toLowerCase().endsWith(".omr")) archives.push(path.join(dir, entry.name));
        }
      };
      await visit(directory);
      return archives.length === 1 ? archives[0] : undefined;
    } catch { return undefined; }
  }

  private async convertPage(pagePath: string, originalFilename: string, pageOutputDir: string): Promise<OmrResult> {
    try {
      await this.runAudiveris(pagePath, pageOutputDir);
    } catch (error) {
      if (temporaryErrorCode(error)) throw error;
      const output = this.errorOutput(error);
      const exportedAfterError = await this.findExportedMusicXml(pageOutputDir);
      if (exportedAfterError) {
        const musicXml = this.cleanAudiverisText(await fs.readFile(exportedAfterError, "utf8"), originalFilename);
        this.assertUsefulMusicXml(musicXml, originalFilename);
        return {
          musicXml,
          warnings: [
            "Audiveris gerou MusicXML, mas retornou avisos/erro no processo. Revise cuidadosamente no MuseScore.",
            "Textos OCR de cabecalho removidos para evitar titulos e creditos sobrepostos.",
            this.summarizeAudiverisOutput(output)
          ]
        };
      }
      throw new AppError(422, this.summarizeAudiverisOutput(output), "AUDIVERIS_FAILED");
    }

    const exported = await this.findExportedMusicXml(pageOutputDir);
    if (!exported) {
      throw new AppError(422, "A engine OMR não gerou MusicXML.", "OMR_NO_OUTPUT");
    }
    const musicXml = this.cleanAudiverisText(await fs.readFile(exported, "utf8"), originalFilename);
    this.assertUsefulMusicXml(musicXml, originalFilename);
    return {
      musicXml,
      warnings: ["Textos OCR de cabecalho removidos para evitar titulos e creditos sobrepostos."]
    };
  }

  private async runAudiveris(pagePath: string, outputDir: string): Promise<void> {
    const audiverisBin = await this.resolveAudiverisBin();
    // Critical: execFile passes arguments separately and never invokes a shell.
    try {
      await execFileAsync(audiverisBin, [
        "-batch",
        "-transcribe",
        "-export",
        "-constant",
        "org.audiveris.omr.sheet.BookManager.useCompression=false",
        "-output",
        outputDir,
        "--",
        pagePath
      ], {
        timeout: env.OMR_AUDIVERIS_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024
      });
    } catch (error) {
      if (this.isMissingExecutableError(error)) {
        throw this.audiverisNotFoundError(audiverisBin);
      }
      throw error;
    }
  }

  private async preprocessInput(inputPath: string, outputDir: string, options: OmrConversionOptions = {}): Promise<{ pages: PreparedPage[]; warnings: string[] }> {
    const extension = path.extname(inputPath).toLowerCase();
    const warnings: string[] = [];

    if (extension === ".pdf") {
      const pdftoppm = await this.findCommand(["/usr/local/bin/pdftoppm", "/opt/homebrew/bin/pdftoppm", "pdftoppm"]);
      const outputPrefix = path.join(outputDir, "audiveris-input");
      if (pdftoppm) {
        await this.renderPdfPages(pdftoppm, inputPath, outputPrefix);
        const paths = await this.findRenderedPages(outputDir);
        warnings.push(`PDF dividido em ${paths.length} pagina(s) e renderizado em resolucao controlada antes do OMR.`);
        return { pages: await Promise.all(paths.map((pagePath, index) => this.prepareRenderedPdfPage(pagePath, outputDir, index + 1))), warnings };
      }
      throw new AppError(501, "Renderização de PDF indisponível neste servidor.", "PDF_RENDER_NOT_CONFIGURED");
    }

    if (options.preprocessingProfile === "document_scanner") {
      const pagePath = await this.prepareDocumentScannerImage(inputPath, outputDir);
      warnings.push("Imagem recebida do scanner nativo de documentos; aplicado apenas grayscale e redimensionamento de segurança antes do OMR.");
      return { pages: [{ originalPath: inputPath, attempts: [{ paths: [pagePath], description: "scanner nativo padronizado" }] }], warnings };
    }

    const magick = await this.findCommand(["/usr/local/bin/magick", "/opt/homebrew/bin/magick", "magick", "/usr/local/bin/convert", "/opt/homebrew/bin/convert", "convert"]);
    if (magick) {
      const paths: string[] = [];
      const failures: string[] = [];
      let temporaryFailure: unknown = null;
      for (const variant of this.imagePreprocessVariants(inputPath, outputDir)) {
        try {
          await execFileAsync(magick, variant.args, {
            timeout: 120_000,
            maxBuffer: 5 * 1024 * 1024
          });
          paths.push(variant.outputPath);
        } catch (error) {
          if (temporaryErrorCode(error)) temporaryFailure ??= error;
          failures.push(`${variant.name}: ${this.summarizePreprocessFailure(error)}`);
        }
      }
      if (!paths.length) {
        if (temporaryFailure) throw temporaryFailure;
        throw new AppError(422, failures.join("\n") || "Não foi possível preparar a imagem para leitura OMR.", "IMAGE_PREPROCESS_FAILED");
      }
      warnings.push(`Imagem preparada em ${paths.length} versao(oes) antes do OMR: orientacao, contraste, nitidez e tamanho ajustados para leitura pelo Audiveris.`);
      return { pages: [{ originalPath: inputPath, attempts: paths.map((pagePath) => ({ paths: [pagePath], description: path.basename(pagePath) })) }], warnings };
    }

    return { pages: [{ originalPath: inputPath, attempts: [{ paths: [inputPath], description: path.basename(inputPath) }] }], warnings };
  }

  private async prepareDocumentScannerImage(inputPath: string, outputDir: string): Promise<string> {
    const outputPath = path.join(outputDir, "audiveris-input-document-scanner.png");
    await sharp(inputPath, { failOn: "truncated", limitInputPixels: 50_000_000 })
      .rotate()
      .resize(maxAudiverisDimension, maxAudiverisDimension, { fit: "inside", withoutEnlargement: true })
      .grayscale()
      .png()
      .toFile(outputPath);
    return outputPath;
  }

  private async prepareRenderedPdfPage(pagePath: string, outputDir: string, pageNumber: number): Promise<PreparedPage> {
    const attempts: PreparedAttempt[] = [{ paths: [pagePath], description: "página inteira renderizada" }];
    const preparedDir = path.join(outputDir, `prepared-page-${String(pageNumber).padStart(3, "0")}`);
    await fs.mkdir(preparedDir, { recursive: true, mode: 0o700 });

    try {
      const cleanedPath = path.join(preparedDir, "cleaned.png");
      await sharp(pagePath)
        .grayscale()
        .normalize()
        .sharpen()
        .trim({ background: "#ffffff", threshold: 16 })
        .extend({ top: 80, bottom: 80, left: 80, right: 80, background: "#ffffff" })
        .png()
        .toFile(cleanedPath);
      attempts.push({ paths: [cleanedPath], description: "página limpa em tons de cinza" });

    } catch {
      // The original rendered page is still a valid Audiveris input.
    }

    return { originalPath: pagePath, attempts };
  }

  private async renderPdfPages(pdftoppm: string, inputPath: string, outputPrefix: string): Promise<void> {
    const pageCount = await this.findPdfPageCount(inputPath);

    if (!pageCount) {
      throw new AppError(422, "Não foi possível verificar a quantidade de páginas do PDF. Confira o arquivo ou configure pdfinfo.", "PDF_PAGE_COUNT_UNKNOWN");
    }
    if (pageCount > env.OMR_MAX_PAGES) throw new AppError(413, `Este envio tem ${pageCount} páginas; o limite é ${env.OMR_MAX_PAGES}.`, "OMR_PAGE_LIMIT");

    for (let page = 1; page <= pageCount; page += 1) {
      assertConversionActive();
      await execFileAsync(pdftoppm, [
        "-png",
        "-f",
        String(page),
        "-l",
        String(page),
        "-scale-to",
        String(maxAudiverisDimension),
        inputPath,
        outputPrefix
      ], {
        timeout: pdfRenderTimeoutMs,
        maxBuffer: 5 * 1024 * 1024
      });
    }
  }

  private async findPdfPageCount(inputPath: string): Promise<number | null> {
    const pdfinfo = await this.findCommand(["/usr/local/bin/pdfinfo", "/opt/homebrew/bin/pdfinfo", "pdfinfo"]);
    if (!pdfinfo) return null;

    try {
      const { stdout } = await execFileAsync(pdfinfo, [inputPath], {
        timeout: 10_000,
        maxBuffer: 1024 * 1024
      });
      const match = stdout.match(/^Pages:\s+(\d+)\s*$/im);
      if (!match) return null;
      const pages = Number(match[1]);
      return Number.isInteger(pages) && pages > 0 ? pages : null;
    } catch (error) {
      if (temporaryErrorCode(error)) throw error;
      return null;
    }
  }

  private imagePreprocessVariants(inputPath: string, outputDir: string): Array<{ name: string; outputPath: string; args: string[] }> {
    const baseArgs = [
      "-limit", "memory", "256MiB",
      "-limit", "map", "512MiB",
      "-limit", "disk", "1GiB",
      inputPath,
      "-auto-orient",
      "-resize",
      `${maxAudiverisDimension}x${maxAudiverisDimension}>`,
      "-background",
      "white",
      "-alpha",
      "remove",
      "-alpha",
      "off",
      "-colorspace",
      "Gray"
    ];

    return [
      {
        name: "contraste-suave",
        outputPath: path.join(outputDir, "audiveris-input-soft.png"),
        args: [
          ...baseArgs,
          "-deskew",
          "40%",
          "-contrast-stretch",
          "2%x2%",
          "-sharpen",
          "0x1",
          path.join(outputDir, "audiveris-input-soft.png")
        ]
      },
      {
        name: "documento",
        outputPath: path.join(outputDir, "audiveris-input-document.png"),
        args: [
          ...baseArgs,
          "-deskew",
          "40%",
          "-normalize",
          "-adaptive-sharpen",
          "0x1.1",
          "-contrast-stretch",
          "4%x4%",
          path.join(outputDir, "audiveris-input-document.png")
        ]
      },
      {
        name: "alto-contraste",
        outputPath: path.join(outputDir, "audiveris-input-high-contrast.png"),
        args: [
          ...baseArgs,
          "-deskew",
          "40%",
          "-lat",
          "35x35-8%",
          "-morphology",
          "Close",
          "Octagon:1",
          path.join(outputDir, "audiveris-input-high-contrast.png")
        ]
      }
    ];
  }

  private async findRenderedPages(dir: string): Promise<string[]> {
    const files = await fs.readdir(dir);
    const pages = files
      .filter((file) => /^audiveris-input-\d+\.png$/.test(file) || file === "audiveris-input.png")
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((file) => path.join(dir, file));
    if (!pages.length) {
      throw new AppError(422, "Não foi possível renderizar páginas do PDF para OMR.", "PDF_RENDER_FAILED");
    }
    return pages;
  }

  private mergePageMusicXml(pageXml: string[]): string {
    const coverage: ConversionCoverage = { totalPages: pageXml.length, processedPages: pageXml.map((_xml, index) => index + 1), missingPages: [], pages: [] };
    return mergeVerifiedPages(pageXml.map((xml, index) => ({ page: index + 1, xml })), "guitar_duo", coverage);
  }

  private cleanAudiverisText(musicXml: string, originalFilename: string): string {
    const title = this.escapeXml(path.parse(originalFilename).name);
    const withoutCredits = musicXml
      .replace(/\n?\s*<credit\b[\s\S]*?<\/credit>\s*/g, "\n")
      .replace(/\n?\s*<movement-title>[\s\S]*?<\/movement-title>\s*/g, "\n");

    if (/<work>[\s\S]*?<\/work>/.test(withoutCredits)) {
      return withoutCredits.replace(/<work>[\s\S]*?<\/work>/, `<work>\n    <work-title>${title}</work-title>\n  </work>`);
    }

    return withoutCredits.replace(
      /(<score-partwise\b[^>]*>)/,
      `$1\n  <work>\n    <work-title>${title}</work-title>\n  </work>`
    );
  }

  private assertUsefulMusicXml(musicXml: string, originalFilename: string): void {
    if (!musicXml.includes("<score-partwise")) throw new AppError(422, `O resultado de ${originalFilename} não contém uma partitura MusicXML.`, "OMR_INVALID_XML");
  }

  private escapeXml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  private async findCommand(candidates: string[]): Promise<string | null> {
    let temporaryFailure: unknown = null;
    for (const candidate of candidates) {
      if (candidate.includes("/")) {
        try {
          await fs.access(candidate);
          return candidate;
        } catch (error) {
          if (temporaryErrorCode(error)) temporaryFailure ??= error;
          continue;
        }
      }
      try {
        await execFileAsync("/usr/bin/which", [candidate], { timeout: 3000 });
        return candidate;
      } catch (error) {
        if (temporaryErrorCode(error)) temporaryFailure ??= error;
        continue;
      }
    }
    if (temporaryFailure) throw temporaryFailure;
    return null;
  }

  private async resolveAudiverisBin(): Promise<string> {
    if (env.AUDIVERIS_BIN) {
      await this.assertExecutable(env.AUDIVERIS_BIN);
      return env.AUDIVERIS_BIN;
    }

    const detected = await this.findCommand(audiverisCandidates);
    if (detected) return detected;

    throw new AppError(
      500,
      "Audiveris não encontrado. Configure AUDIVERIS_BIN no .env com o caminho do executável do Audiveris e reinicie a API e o worker.",
      "AUDIVERIS_NOT_FOUND"
    );
  }

  private async assertExecutable(binaryPath: string): Promise<void> {
    if (!binaryPath.includes("/")) return;
    try {
      await fs.access(binaryPath, fsConstants.X_OK);
    } catch (error) {
      if (temporaryErrorCode(error)) throw error;
      throw this.audiverisNotFoundError(binaryPath);
    }
  }

  private audiverisNotFoundError(binaryPath: string): AppError {
    const dockerHint = binaryPath.startsWith("/Applications/")
      ? " Se a API estiver rodando em Docker, esse caminho do macOS não existe dentro do container; rode a API/worker localmente ou instale uma versão Linux do Audiveris no container."
      : "";
    return new AppError(
      500,
      `Audiveris não encontrado em ${binaryPath}. Ajuste AUDIVERIS_BIN no .env para o executável correto e reinicie a API e o worker.${dockerHint}`,
      "AUDIVERIS_NOT_FOUND"
    );
  }

  private isMissingExecutableError(error: unknown): boolean {
    return typeof (error as { code?: unknown }).code === "string" && (error as { code: string }).code === "ENOENT";
  }

  private async findExportedMusicXml(dir: string): Promise<string | null> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await this.findExportedMusicXml(fullPath);
        if (nested) return nested;
      }
      if (entry.isFile() && (entry.name.endsWith(".musicxml") || entry.name.endsWith(".xml"))) {
        return fullPath;
      }
    }
    return null;
  }

  private summarizeAudiverisOutput(output: string): string {
    if (missingOcrLanguagesPattern.test(output)) {
      return [
        "O Audiveris não conseguiu iniciar o OCR porque não há nenhum idioma OCR instalado no ambiente onde o worker está rodando.",
        "Instale pelo menos um idioma OCR/Tesseract, como English/eng ou Portuguese/por, reinicie a API e o worker e envie a partitura novamente.",
        "Se estiver usando o Audiveris no macOS, abra o Audiveris e instale em Tools > Languages/OCR languages. Se estiver usando Docker/Linux, instale os pacotes de idioma do Tesseract no container."
      ].join("\n");
    }

    if (pageRecognitionFailurePattern.test(output)) {
      return [
        "Não foi possível reconhecer a página da partitura. Isso costuma acontecer quando a imagem está inclinada, com sombra, desfocada, cortada ou com margem grande demais.",
        "Tire uma nova foto em modo documento/scan, com a folha plana, bem iluminada, sem sombras e ocupando quase toda a imagem, e envie novamente."
      ].join("\n");
    }

    const compact = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith("INFO "))
      .slice(-20)
      .join("\n");

    return compact.slice(0, 3000) || "Audiveris falhou sem mensagem detalhada.";
  }

  private summarizePreprocessFailure(error: unknown): string {
    const output = this.errorOutput(error);
    if (pdfPageRangeFailurePattern.test(output)) {
      return [
        "Não foi possível ler todas as páginas do PDF antes do OMR.",
        "Abra o arquivo em um leitor de PDF e exporte/salve uma nova cópia antes de enviar novamente. Isso costuma resolver PDFs com índice de páginas corrompido ou estrutura interna incompatível."
      ].join("\n");
    }

    const compact = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith("Command failed:"))
      .slice(-12)
      .join("\n");

    return [
      "Não foi possível preparar o PDF para leitura OMR.",
      "Tente exportar/salvar uma nova cópia do PDF ou dividir a partitura em arquivos menores e enviar novamente.",
      compact
    ].filter(Boolean).join("\n");
  }

  private summarizePageFailure(error: unknown): string {
    if (error instanceof AppError) return error.message;
    return this.summarizeAudiverisOutput(this.errorOutput(error));
  }

  private errorOutput(error: unknown): string {
    const message = error instanceof Error ? error.message : "Falha ao executar Audiveris.";
    const stderr = typeof (error as { stderr?: unknown }).stderr === "string" ? (error as { stderr: string }).stderr : "";
    const stdout = typeof (error as { stdout?: unknown }).stdout === "string" ? (error as { stdout: string }).stdout : "";
    return [message, stderr, stdout].filter(Boolean).join("\n");
  }
}

export function createOmrAdapter(): OmrAdapter {
  return env.OMR_ENGINE === "audiveris" ? new AudiverisOmrAdapter() : new StubOmrAdapter();
}
