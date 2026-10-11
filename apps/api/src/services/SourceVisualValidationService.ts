import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import type { ConversionCoverage } from "../domain.js";
import { assertConversionActive, runCommand } from "./SubprocessRunner.js";
import type { SourceVisualReview, VisualCorrectionProposal, VisualEvidenceAsset, VisualNoteValue, VisualSourceSegment } from "./SourceVisualReviewTypes.js";
import { parseVisualMusicXml, type VisualParsedEvent, type VisualParsedMeasure } from "./VisualMusicXml.js";
import { readAudiverisSourceAnchors } from "./AudiverisSourceAnchors.js";

/**
 * Local reader protocol v1. The request is a file path argument, with JSON:
 * {version:1,page,imagePath,imageSHA256}. It deliberately contains no candidate
 * XML, pitches, expected measure counts, or previous reader output. The reader
 * prints one bounded JSON response to stdout, with zero-based partIndex and
 * measureIndex; onset and duration are in quarter-note units. It must read the
 * source image independently before any comparison happens here. A measure
 * with no trustworthy box may set contextOnly:true and rectangle to the whole
 * page; its events can be compared, but no measure coordinates are asserted.
 */
const rectangleSchema = z.object({ left: z.number().min(0).max(1), top: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1) }).strict()
  .refine((box) => box.left + box.width <= 1.000001 && box.top + box.height <= 1.000001);
const eventSchema = z.object({ onset: z.number().finite().min(0).max(10000), duration: z.number().finite().min(0).max(10000),
  voice: z.string().min(1).max(32), staff: z.number().int().min(1).max(64), chord: z.boolean().optional(), grace: z.boolean().optional(),
  kind: z.enum(["note", "rest"]), step: z.enum(["A", "B", "C", "D", "E", "F", "G"]).optional(),
  alter: z.number().int().min(-2).max(2).optional(), octave: z.number().int().min(0).max(9).optional(),
  type: z.string().min(1).max(32).optional(), dots: z.number().int().min(0).max(4).optional() }).strict()
  .superRefine((event, context) => {
    if (!event.grace && event.duration <= 0) context.addIssue({ code: "custom", message: "non-grace duration must be positive" });
    if (event.kind === "note" && (event.step === undefined || event.octave === undefined)) context.addIssue({ code: "custom", message: "note pitch missing" });
    if (event.kind === "rest" && (event.step !== undefined || event.octave !== undefined || event.alter !== undefined)) context.addIssue({ code: "custom", message: "rest has pitch" });
  });
const responseSchema = z.object({ version: z.literal(1), page: z.number().int().positive(), inputImageSHA256: z.string().regex(/^[a-f0-9]{64}$/),
  coverageComplete: z.boolean(), diagnostics: z.array(z.object({ code: z.enum(["HOMR_EMPTY_MEASURE", "HOMR_UNSUPPORTED_STRUCTURE"]), message: z.string().max(256).optional() }).strict()).max(8).optional(), reader: z.object({ name: z.string().min(1).max(64), version: z.string().min(1).max(64), model: z.string().min(1).max(128) }).strict().optional(), measures: z.array(z.object({ partIndex: z.number().int().min(0).max(63), measureIndex: z.number().int().min(0).max(9999),
    rectangle: rectangleSchema, contextOnly: z.boolean().optional(), readable: z.boolean(), events: z.array(eventSchema).max(512) }).strict()
    .refine((measure) => !measure.contextOnly || (measure.rectangle.left === 0 && measure.rectangle.top === 0
      && measure.rectangle.width === 1 && measure.rectangle.height === 1),
    { message: "contextOnly requires the full-page rectangle" })).max(2000) }).strict();
type ReaderResponse = z.infer<typeof responseSchema>;
type ReaderEvent = z.infer<typeof eventSchema>;

export type VisualReviewCandidate = { page: number; selected: boolean; xml: string; originalImagePath?: string;
  sourceImagePath?: string; nativeArchivePath?: string };
export type SourceVisualValidationInput = {
  sourcePath: string;
  workDir: string;
  musicXml: string;
  coverage: ConversionCoverage;
  candidates: VisualReviewCandidate[];
};
export type SourceVisualValidationOptions = { readerExecutable?: string; maxPages?: number; maxMeasures?: number; timeoutMs?: number };

const sha256 = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex");
const maxPageAssetBytes = 32 * 1024 * 1024;
const maxEvidenceBytes = 128 * 1024 * 1024;
const isFullPageRectangle = (rectangle: z.infer<typeof rectangleSchema>): boolean => rectangle.left === 0
  && rectangle.top === 0 && rectangle.width === 1 && rectangle.height === 1;
// Voice labels and chord flags are emitted inconsistently by OMR engines.
// They are identity guards for a proposed edit, but not grouping keys: the
// event value multiset below must first establish whether anything actually
// differs at this staff/onset/grace context.
const eventKey = (event: { onset: number; staff: number; grace?: boolean }): string =>
  JSON.stringify([Math.round(event.onset * 1_000_000), event.staff, Boolean(event.grace)]);
const valueOf = (event: VisualParsedEvent | ReaderEvent): VisualNoteValue => ({ kind: event.kind, duration: event.duration,
  ...(event.kind === "note" ? { step: event.step, alter: event.alter ?? 0, octave: event.octave } : {}),
  ...(event.type ? { type: event.type } : {}), ...(event.dots !== undefined ? { dots: event.dots } : {}) });
const differences = (before: VisualNoteValue, after: VisualNoteValue): string[] => {
  const result: string[] = [];
  if (before.kind !== after.kind) result.push("note_or_rest");
  if (before.step !== after.step || (before.alter ?? 0) !== (after.alter ?? 0) || before.octave !== after.octave) result.push("pitch");
  if (Math.abs(before.duration - after.duration) > 0.000001) result.push("duration");
  if (after.type && before.type !== after.type) result.push("printed_type");
  if (after.dots !== undefined && (before.dots ?? 0) !== after.dots) result.push("dots");
  return result;
};

/**
 * Reader details such as printed type and dots are optional.  Treating an
 * omitted detail as a mismatch would turn a complete multiset into a pair of
 * false insertion/deletion proposals, while a detail explicitly read from the
 * source must still be compared.
 */
const sourceValueFor = (encoded: VisualParsedEvent, source: ReaderEvent): VisualNoteValue => {
  const value = valueOf(source);
  if (value.type === undefined) value.type = encoded.type;
  if (value.dots === undefined) value.dots = encoded.dots;
  return value;
};

const comparableValue = (value: VisualNoteValue): string => JSON.stringify({
  kind: value.kind,
  step: value.step,
  alter: value.alter ?? 0,
  octave: value.octave,
  duration: value.duration,
  type: value.type,
  dots: value.dots ?? 0
});

export class SourceVisualValidationService {
  private readonly options: Required<Pick<SourceVisualValidationOptions, "maxPages" | "maxMeasures" | "timeoutMs">> & Pick<SourceVisualValidationOptions, "readerExecutable">;

  constructor(options: SourceVisualValidationOptions = {}) {
    this.options = { readerExecutable: options.readerExecutable,
      maxPages: Math.min(3, Math.max(1, options.maxPages ?? 3)),
      maxMeasures: Math.min(200, Math.max(1, options.maxMeasures ?? 200)),
      timeoutMs: Math.min(60_000, Math.max(1000, options.timeoutMs ?? 60_000)) };
  }

  async evaluate(input: SourceVisualValidationInput): Promise<{ review: SourceVisualReview; assets: VisualEvidenceAsset[] }> {
    assertConversionActive();
    const sourceSHA256 = sha256(await fs.readFile(input.sourcePath));
    const xmlSHA256 = sha256(input.musicXml);
    const assets: VisualEvidenceAsset[] = [];
    let evidenceBytes = 0;
    let cropBytes = 0;
    const limitations: string[] = [];
    const diagnostics: NonNullable<SourceVisualReview["diagnostics"]> = [];
    const warn = (code: string, message: string, page?: number): void => {
      limitations.push(message);
      diagnostics.push({ code, ...(page !== undefined ? { page } : {}), message });
    };
    if (this.options.readerExecutable) {
      warn("VISUAL_READER_ACCURACY_UNHOMOLOGATED",
        "A leitura visual independente ainda não tem acurácia homologada por revisão editorial humana; divergências são propostas e não métricas de acerto.");
    }
    let measures: VisualParsedMeasure[];
    try { measures = parseVisualMusicXml(input.musicXml); }
    catch { measures = []; warn("VISUAL_XML_UNINDEXABLE", "O MusicXML não pôde ser indexado para comparação visual."); }
    const selected = input.candidates.filter((candidate) => candidate.selected).sort((a, b) => a.page - b.page);
    const byPage = new Map<number, VisualParsedMeasure[]>();
    const offsets = new Map<number, number>();
    let mappingValid = true;
    for (const candidate of selected) {
      if (byPage.has(candidate.page)) { mappingValid = false; break; }
      try {
        const candidateMeasures = parseVisualMusicXml(candidate.xml);
        const mapped = candidateMeasures.map((measure) => ({ ...measure,
          measureIndex: measure.measureIndex + (offsets.get(measure.partIndex) ?? 0) }));
        byPage.set(candidate.page, mapped);
        for (const partIndex of new Set(candidateMeasures.map((measure) => measure.partIndex))) {
          offsets.set(partIndex, (offsets.get(partIndex) ?? 0) + candidateMeasures.filter((measure) => measure.partIndex === partIndex).length);
        }
      } catch { mappingValid = false; break; }
    }
    if (mappingValid) mappingValid = measures.length === [...byPage.values()].reduce((count, page) => count + page.length, 0)
      && measures.every((measure) => byPage.get(selected.find((candidate) => byPage.get(candidate.page)?.some((item) => item.partIndex === measure.partIndex && item.measureIndex === measure.measureIndex))?.page ?? -1)
        ?.some((item) => item.partIndex === measure.partIndex && item.measureIndex === measure.measureIndex && item.partId === measure.partId));
    if (!mappingValid) warn("VISUAL_PAGE_MAPPING_AMBIGUOUS", "O mapeamento entre páginas, candidatos e MusicXML final não é inequívoco.");

    const segments: VisualSourceSegment[] = measures.map((measure) => ({ id: `visual-p${measure.partIndex}-m${measure.measureIndex}`,
      page: 0, partIndex: measure.partIndex, partId: measure.partId, measureIndex: measure.measureIndex, measure: measure.measure,
      status: "unknown", reason: "Sem leitura visual independente para este compasso." }));
    for (const [page, mapped] of byPage) for (const measure of mapped) {
      const segment = segments.find((item) => item.partIndex === measure.partIndex && item.measureIndex === measure.measureIndex);
      if (segment) segment.page = page;
    }
    const proposals: VisualCorrectionProposal[] = [];
    let reader: SourceVisualReview["reader"] = this.options.readerExecutable ? { name: path.basename(this.options.readerExecutable), sourceFirst: true } : null;
    const finish = (status: SourceVisualReview["status"]): { review: SourceVisualReview; assets: VisualEvidenceAsset[] } => ({
      review: { version: 1, status, sourceSHA256, xmlSHA256,
        reader,
        checkedMeasures: segments.filter((item) => item.status !== "unknown").length,
        unknownMeasures: segments.filter((item) => item.status === "unknown").length,
        segments, proposals, limitations, diagnostics, accuracyVerified: false, trainingEligible: false, history: [] }, assets });
    if (input.coverage.totalPages > this.options.maxPages) {
      warn("VISUAL_PAGE_LIMIT", `A revisão visual automática está limitada a ${this.options.maxPages} páginas; nenhuma página foi marcada como conferida.`);
      return finish("skipped");
    }
    if (!mappingValid || !measures.length) return finish("unavailable");
    if (measures.length > this.options.maxMeasures) {
      warn("VISUAL_MEASURE_LIMIT", `A partitura contém mais de ${this.options.maxMeasures} compassos de parte; a leitura visual completa foi omitida.`);
      return finish("skipped");
    }
    if (!this.options.readerExecutable) warn("VISUAL_READER_NOT_CONFIGURED", "Leitor visual local não configurado; notas, pausas e durações permanecem sem conferência visual.");

    const visualDir = path.join(input.workDir, "visual-review");
    await fs.mkdir(visualDir, { recursive: true, mode: 0o700 });
    const canonicalWorkDir = await fs.realpath(input.workDir);
    const canonicalSource = await fs.realpath(input.sourcePath);
    for (const candidate of selected) {
      assertConversionActive();
      const pageSegments = segments.filter((item) => item.page === candidate.page);
      if (!pageSegments.length) continue;
      if (!candidate.originalImagePath) {
        warn("VISUAL_SOURCE_UNAVAILABLE", `Página ${candidate.page}: raster original indisponível.`, candidate.page);
        continue;
      }
      try {
        const realImage = await fs.realpath(candidate.originalImagePath);
        if (!realImage.startsWith(`${canonicalWorkDir}${path.sep}`) && realImage !== canonicalSource) throw new Error("source outside work directory");
        const image = await sharp(realImage, { failOn: "truncated", limitInputPixels: 50_000_000 })
          .rotate().resize(4400, 4400, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
        if (image.length > maxPageAssetBytes || evidenceBytes + image.length > maxEvidenceBytes) {
          warn("VISUAL_IMAGE_LIMIT", `Página ${candidate.page}: imagem de evidência excede o limite de armazenamento; compassos permanecem desconhecidos.`, candidate.page);
          continue;
        }
        const imageName = `visual-page-${candidate.page}.png`;
        const imagePath = path.join(visualDir, imageName);
        await fs.writeFile(imagePath, image, { mode: 0o600, flag: "wx" });
        const imageSHA256 = sha256(image);
        assets.push({ name: imageName, path: imagePath, sha256: imageSHA256 });
        evidenceBytes += image.length;
        for (const segment of pageSegments) { segment.sourceAsset = imageName; segment.sourceImageSHA256 = imageSHA256; }
        if (!this.options.readerExecutable) {
          if (candidate.nativeArchivePath && candidate.sourceImagePath) {
            try {
            const nativeArchivePath = await fs.realpath(candidate.nativeArchivePath);
            const sourceImagePath = await fs.realpath(candidate.sourceImagePath);
            if (nativeArchivePath.startsWith(`${canonicalWorkDir}${path.sep}`)
              && (sourceImagePath.startsWith(`${canonicalWorkDir}${path.sep}`) || sourceImagePath === canonicalSource)) {
              const originalMetadata = await sharp(realImage, { failOn: "truncated", limitInputPixels: 50_000_000 }).metadata();
              const normalizedMetadata = await sharp(image).metadata();
              if ((!originalMetadata.orientation || originalMetadata.orientation === 1)
                && originalMetadata.width === normalizedMetadata.width && originalMetadata.height === normalizedMetadata.height) {
                const anchors = await readAudiverisSourceAnchors({ archivePath: nativeArchivePath,
                  imagePath: sourceImagePath, originalImagePath: realImage, pageXml: candidate.xml });
                const mapped = byPage.get(candidate.page) ?? [];
                for (const anchor of anchors) {
                  const originalMeasure = mapped.filter((item) => item.partIndex === anchor.partIndex)[anchor.measureIndex];
                  const segment = pageSegments.find((item) => item.partIndex === originalMeasure?.partIndex && item.measureIndex === originalMeasure?.measureIndex);
                  if (!segment || !normalizedMetadata.width || !normalizedMetadata.height) continue;
                  const rectangle = { left: anchor.rectangle.left / normalizedMetadata.width, top: anchor.rectangle.top / normalizedMetadata.height,
                    width: anchor.rectangle.width / normalizedMetadata.width, height: anchor.rectangle.height / normalizedMetadata.height };
                  const safeRectangle = rectangleSchema.safeParse(rectangle);
                  if (!safeRectangle.success) continue;
                  const cropped = await this.crop(image, safeRectangle.data, visualDir, assets.length + 1,
                    Math.min(maxPageAssetBytes, maxEvidenceBytes - evidenceBytes, maxEvidenceBytes - cropBytes));
                  if (!cropped) {
                    warn("VISUAL_CROP_LIMIT", `Página ${candidate.page}: limite de recortes atingido; alguns compassos permanecem sem recorte.`, candidate.page);
                    continue;
                  }
                  assets.push(cropped);
                  const cropLength = (await fs.stat(cropped.path)).size;
                  evidenceBytes += cropLength;
                  cropBytes += cropLength;
                  segment.cropAsset = cropped.name;
                  segment.rectangle = rectangle;
                  segment.reason = "Recorte localizado pelo Audiveris; notas, pausas e durações ainda não foram conferidas com a fonte.";
                }
              }
            }
            } catch { /* Native crop anchors are optional evidence, never a source reading. */ }
          }
          continue;
        }
        const requestPath = path.join(visualDir, `visual-request-${candidate.page}.json`);
        await fs.writeFile(requestPath, JSON.stringify({ version: 1, page: candidate.page, imagePath, imageSHA256 }), { mode: 0o600, flag: "wx" });
        let response: ReaderResponse;
        try {
          const output = await runCommand(this.options.readerExecutable, [requestPath], { timeout: this.options.timeoutMs, maxBuffer: 2 * 1024 * 1024 });
          response = responseSchema.parse(JSON.parse(output.stdout));
          if (response.page !== candidate.page || response.inputImageSHA256 !== imageSHA256) throw new Error("reader source mismatch");
          const currentImage = await fs.stat(imagePath);
          if (currentImage.size !== image.length || sha256(await fs.readFile(imagePath)) !== imageSHA256) throw new Error("reader changed source image");
          const keys = response.measures.map((measure) => `${measure.partIndex}:${measure.measureIndex}`);
          if (new Set(keys).size !== keys.length) throw new Error("duplicate measure identities");
        } catch (error) {
          assertConversionActive();
          const currentImage = await fs.stat(imagePath).catch(() => null);
          const intact = currentImage?.size === image.length && sha256(await fs.readFile(imagePath).catch(() => Buffer.alloc(0))) === imageSHA256;
          if (!intact) {
            const assetIndex = assets.findIndex((asset) => asset.name === imageName);
            if (assetIndex >= 0) assets.splice(assetIndex, 1);
            evidenceBytes -= image.length;
            for (const segment of pageSegments) { delete segment.sourceAsset; delete segment.sourceImageSHA256; }
            await fs.rm(imagePath, { force: true });
          }
          const failureCode = (error as { code?: string }).code;
          const message = error instanceof Error ? error.message : "";
          const diagnostic = !intact ? "VISUAL_SOURCE_CHANGED"
            : failureCode === "OMR_CONVERSION_TIMEOUT" ? "VISUAL_READER_TIMEOUT"
            : failureCode === "OMR_OUTPUT_LIMIT" ? "VISUAL_READER_OUTPUT_LIMIT"
            : message === "reader source mismatch" ? "VISUAL_READER_SOURCE_MISMATCH"
            : message === "duplicate measure identities" ? "VISUAL_READER_DUPLICATE_MEASURES"
            : failureCode ? "VISUAL_READER_EXECUTION_FAILED" : "VISUAL_READER_INVALID_RESPONSE";
          warn(diagnostic, `Página ${candidate.page}: o leitor visual falhou ou devolveu resposta inválida; os compassos permanecem desconhecidos.`, candidate.page);
          continue;
        } finally { await fs.rm(requestPath, { force: true }); }
        if (response.reader) {
          if (reader?.version && JSON.stringify({ name: reader.name, version: reader.version, model: reader.model }) !== JSON.stringify(response.reader)) {
            warn("VISUAL_READER_VERSION_CHANGED", `Página ${candidate.page}: identidade do leitor mudou entre páginas; comparação bloqueada.`, candidate.page);
            continue;
          }
          reader = { ...response.reader, sourceFirst: true };
        }
        for (const diagnostic of response.diagnostics ?? []) {
          // Never expose reader exception text, file paths or subprocess output.
          const message = diagnostic.code === "HOMR_EMPTY_MEASURE"
            ? "O leitor independente gerou um compasso vazio; a posição dos demais compassos não pode ser confirmada."
            : "O leitor independente gerou uma estrutura musical que ainda não pode ser conferida com segurança.";
          warn(diagnostic.code, `Página ${candidate.page}: ${message}`, candidate.page);
        }
        if (!response.coverageComplete) {
          warn("VISUAL_SOURCE_COVERAGE_UNCONFIRMED", `Página ${candidate.page}: o leitor não confirmou cobertura completa da fonte.`, candidate.page);
          continue;
        }
        const mapped = byPage.get(candidate.page) ?? [];
        const readerByPart = new Map<number, number>();
        for (const item of response.measures) readerByPart.set(item.partIndex, (readerByPart.get(item.partIndex) ?? 0) + 1);
        const expectedByPart = new Map<number, number>();
        for (const item of mapped) expectedByPart.set(item.partIndex, (expectedByPart.get(item.partIndex) ?? 0) + 1);
        if (response.measures.length !== mapped.length || [...expectedByPart].some(([part, count]) => readerByPart.get(part) !== count)) {
          warn("VISUAL_MEASURE_COUNT_MISMATCH", `Página ${candidate.page}: a quantidade de compassos lida na fonte diverge do MusicXML; associação por posição bloqueada.`, candidate.page);
          continue;
        }
        const pageOffsets = new Map<number, number>();
        let pageContextOnly = false;
        for (const item of mapped) {
          const currentOffset = pageOffsets.get(item.partIndex) ?? 0;
          const sourceMeasure = response.measures.find((source) => source.partIndex === item.partIndex && source.measureIndex === currentOffset);
          pageOffsets.set(item.partIndex, currentOffset + 1);
          const segment = pageSegments.find((entry) => entry.partIndex === item.partIndex && entry.measureIndex === item.measureIndex);
          const encoded = measures.find((entry) => entry.partIndex === item.partIndex && entry.measureIndex === item.measureIndex);
          if (!segment || !encoded || !sourceMeasure) continue;
          if (!sourceMeasure.readable) {
            segment.reason = "O leitor não confirmou leitura completa do compasso; os eventos permanecem desconhecidos.";
            warn("VISUAL_MEASURE_UNREADABLE", `Página ${candidate.page}: o leitor não confirmou leitura completa do compasso ${sourceMeasure.measureIndex + 1}.`, candidate.page);
            continue;
          }
          const fullPageContext = Boolean(sourceMeasure.contextOnly) || isFullPageRectangle(sourceMeasure.rectangle);
          if (fullPageContext) pageContextOnly = true;
          else {
            const cropped = await this.crop(image, sourceMeasure.rectangle, visualDir, assets.length + 1,
              Math.min(maxPageAssetBytes, maxEvidenceBytes - evidenceBytes, maxEvidenceBytes - cropBytes));
            if (!cropped) {
              warn("VISUAL_CROP_LIMIT", `Página ${candidate.page}: limite de recortes atingido; o compasso permanece desconhecido.`, candidate.page);
              continue;
            }
            assets.push(cropped);
            const cropLength = (await fs.stat(cropped.path)).size;
            evidenceBytes += cropLength;
            cropBytes += cropLength;
            segment.rectangle = sourceMeasure.rectangle;
            segment.cropAsset = cropped.name;
          }
          const found = this.compareMeasure(encoded, sourceMeasure.events, segment);
          if (found === null) { segment.reason = "Eventos sobrepostos ou identidade temporal ambígua."; continue; }
          proposals.push(...found);
          if (found.some((proposal) => proposal.differences.some((difference) => ["duration", "printed_type", "dots"].includes(difference)))) {
            const rhythmMessage = encoded.rhythmNotationValid
              ? `Página ${candidate.page}: mudanças rítmicas isoladas no compasso ${sourceMeasure.measureIndex + 1} podem deslocar eventos seguintes ou alterar o fechamento do compasso; revisão manual necessária.`
              : `Página ${candidate.page}: a notação rítmica impressa e as durações codificadas do compasso ${sourceMeasure.measureIndex + 1} não puderam ser conciliadas; revisão manual necessária.`;
            warn("VISUAL_RHYTHM_EDIT_REQUIRES_MANUAL", rhythmMessage, candidate.page);
          }
          if (found.length && (!segment.cropAsset || !segment.rectangle)) {
            warn("VISUAL_CONTEXT_ONLY_PROPOSALS_MANUAL",
              `Página ${candidate.page}: propostas do compasso ${sourceMeasure.measureIndex + 1} não podem ser aplicadas sem recorte localizado da partitura.`, candidate.page);
          }
          segment.status = found.length ? "suspected" : "compared";
          segment.reason = found.length ? "Leitura visual e MusicXML divergem neste compasso."
            : sourceMeasure.contextOnly ? "Comparado com a página inteira; posição visual exata do compasso não confirmada." : undefined;
        }
        if (pageContextOnly) warn("VISUAL_FULL_PAGE_CONTEXT", "A leitura foi comparada com a página inteira; a posição visual exata do compasso não foi confirmada.", candidate.page);
      } catch (error) {
        assertConversionActive();
        warn("VISUAL_SOURCE_UNSAFE", `Página ${candidate.page}: imagem original indisponível ou insegura para análise visual.`, candidate.page);
      }
    }
    return finish(this.options.readerExecutable ? segments.some((segment) => segment.status === "unknown") ? "partial" : "completed" : "unavailable");
  }

  private compareMeasure(encoded: VisualParsedMeasure, source: ReaderEvent[], segment: VisualSourceSegment): VisualCorrectionProposal[] {
    const encodedGroups = new Map<string, VisualParsedEvent[]>();
    const sourceGroups = new Map<string, ReaderEvent[]>();
    for (const event of encoded.events) {
      const key = eventKey(event);
      encodedGroups.set(key, [...(encodedGroups.get(key) ?? []), event]);
    }
    for (const event of source) {
      const key = eventKey(event);
      sourceGroups.set(key, [...(sourceGroups.get(key) ?? []), event]);
    }

    const proposals: VisualCorrectionProposal[] = [];
    let proposalOccurrence = 0;
    const hasLocatedCrop = Boolean(segment.cropAsset && segment.rectangle && !isFullPageRectangle(segment.rectangle));
    const contextAmbiguousReason = "manual_review/ambiguous: múltiplos eventos restantes no mesmo contexto; associação ambígua, revisão manual necessária.";

    const addProposal = (key: string, current: VisualParsedEvent | undefined, observed: ReaderEvent | undefined,
      reasonOverride?: string): void => {
      const before = current ? valueOf(current) : null;
      const after = current && observed ? sourceValueFor(current, observed) : observed ? valueOf(observed) : null;
      const changes = before && after ? differences(before, after) : [before ? "extra_encoded_event" : "missing_encoded_event"];
      if (!changes.length) return;
      const rhythmChange = changes.some((change) => ["duration", "printed_type", "dots"].includes(change));
      const sourceIdentityConflicts = Boolean(current && observed
        && (current.voice !== observed.voice || Boolean(current.chord) !== Boolean(observed.chord)));
      const applicable = Boolean(before && after && current && hasLocatedCrop && !rhythmChange &&
        (!changes.includes("note_or_rest") || current.kindChangeSafe) &&
        (!changes.includes("pitch") || (current.pitchChangeSafe && (before.alter ?? 0) === 0 && (after.alter ?? 0) === 0)) &&
        !current.grace && !current.chord && !sourceIdentityConflicts);
      const reason = reasonOverride
        ?? (!before || !after
          ? "Quantidade de eventos da fonte e da saída diverge; edição manual necessária."
          : !hasLocatedCrop
            ? "A proposta foi comparada com a página inteira sem localização visual confirmada; revisão manual necessária."
            : rhythmChange
              ? "Mudança rítmica isolada pode deslocar eventos seguintes ou alterar o fechamento do compasso; revisão manual necessária."
              : sourceIdentityConflicts
                ? "A altura divergente pertence a voz ou posição de acorde diferente entre as leituras; associação automática bloqueada, revisão manual necessária."
              : "O evento lido diretamente da fonte diverge da saída OMR.");
      const occurrence = proposalOccurrence++;
      // noteIndex remains the XML index for encoded events. For source-only
      // events it is a stable negative occurrence marker because insertion is
      // deliberately never auto-applied and the public proposal shape cannot
      // carry a source-reader index yet.
      const noteIndex = current?.noteIndex ?? (-1 - occurrence);
      proposals.push({ id: sha256(JSON.stringify([segment.id, key, occurrence, before, after])).slice(0, 32), status: "pending", segmentId: segment.id,
        page: segment.page, partId: segment.partId, partIndex: segment.partIndex, measureIndex: segment.measureIndex,
        measure: segment.measure, noteIndex, before, after, applicable, reason,
        differences: changes });
    };

    for (const key of new Set([...encodedGroups.keys(), ...sourceGroups.keys()])) {
      const encodedEvents = encodedGroups.get(key) ?? [];
      const sourceEvents = sourceGroups.get(key) ?? [];
      const unmatchedEncoded = [...encodedEvents];
      const unmatchedSource = [...sourceEvents];

      // Match exact values as a multiset, one occurrence at a time. This is
      // deliberately independent of array order and preserves multiplicity.
      for (const current of encodedEvents) {
        const currentValue = valueOf(current);
        const sourceIndex = unmatchedSource.findIndex((observed) =>
          comparableValue(sourceValueFor(current, observed)) === comparableValue(currentValue));
        if (sourceIndex < 0) continue;
        unmatchedSource.splice(sourceIndex, 1);
        const encodedIndex = unmatchedEncoded.indexOf(current);
        if (encodedIndex >= 0) unmatchedEncoded.splice(encodedIndex, 1);
      }

      if (unmatchedEncoded.length === 1 && unmatchedSource.length === 1) {
        // After exact cancellation, a single remaining pair has a unique
        // identity. It retains the existing narrow pitch-only applicability
        // guards; grace/chord and all other ambiguous cases stay manual.
        addProposal(key, unmatchedEncoded[0], unmatchedSource[0]);
        continue;
      }

      const ambiguous = unmatchedEncoded.length > 1 || unmatchedSource.length > 1;
      for (const current of unmatchedEncoded) addProposal(key, current, undefined, ambiguous ? contextAmbiguousReason : undefined);
      for (const observed of unmatchedSource) addProposal(key, undefined, observed, ambiguous ? contextAmbiguousReason : undefined);
    }
    return proposals;
  }

  private async crop(image: Buffer, rectangle: z.infer<typeof rectangleSchema>, directory: string, sequence: number, remainingBytes: number): Promise<VisualEvidenceAsset | null> {
    const metadata = await sharp(image).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const left = Math.floor(rectangle.left * width);
    const top = Math.floor(rectangle.top * height);
    const cropWidth = Math.min(width - left, Math.max(1, Math.ceil(rectangle.width * width)));
    const cropHeight = Math.min(height - top, Math.max(1, Math.ceil(rectangle.height * height)));
    if (!width || !height || cropWidth <= 0 || cropHeight <= 0) throw new Error("Invalid visual rectangle");
    const buffer = await sharp(image).extract({ left, top, width: cropWidth, height: cropHeight }).png().toBuffer();
    if (buffer.length > remainingBytes) return null;
    const name = `visual-crop-${sequence}.png`;
    const filePath = path.join(directory, name);
    await fs.writeFile(filePath, buffer, { mode: 0o600, flag: "wx" });
    return { name, path: filePath, sha256: sha256(buffer) };
  }
}
