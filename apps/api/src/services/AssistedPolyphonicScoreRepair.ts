import { createHash } from "node:crypto";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const MAX_XML_BYTES = 16 * 1024 * 1024;
const sha256 = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");
const nameOf = (node: Node): string => (node as Element).localName || node.nodeName.split(":").at(-1) || node.nodeName;
const children = (parent: Node, name?: string): Element[] => Array.from(parent.childNodes)
  .filter((node): node is Element => node.nodeType === 1 && (!name || nameOf(node) === name));
const first = (parent: Node, name: string): Element | undefined => children(parent, name)[0];
const value = (parent: Node, name: string): string | undefined => first(parent, name)?.textContent?.trim() || undefined;

export type AssistedMeasureInventory = {
  events: number;
  pitched: number;
  rests: number;
  graces: number;
  chords: number;
  voices: string[];
};

export type AssistedPolyphonicRepairOperation = {
  kind: "replace_measure" | "replace_score_metadata";
  measureIndex?: number;
  measure?: string;
  beforeSha256: string;
  afterSha256: string;
  before?: AssistedMeasureInventory;
  after?: AssistedMeasureInventory;
};

/** The reviewed notation is an explicit assisted input, never a model output or an automatic donor. */
export type AssistedPolyphonicRepairPlan = {
  version: 1;
  mode: "explicit_assisted_review";
  sourceSha256: string;
  baseXmlSha256: string;
  reviewedXmlSha256: string;
  partId: string;
  measureCount: number;
  operations: AssistedPolyphonicRepairOperation[];
  reviewedXml: string;
  review: {
    mode: "ai_agent_assisted";
    humanEditorialApproval: false;
    accuracyVerified: false;
    trainingEligible: false;
    requiresReview: true;
  };
};

export type AssistedPolyphonicRepairResult = {
  musicXml: string;
  history: AssistedPolyphonicRepairOperation[];
  provenance: {
    sourceSha256: string;
    baseXmlSha256: string;
    reviewedXmlSha256: string;
    outputXmlSha256: string;
    mode: "explicit_assisted_review";
  };
  inventory: { before: AssistedMeasureInventory; after: AssistedMeasureInventory };
  humanEditorialApproval: false;
  accuracyVerified: false;
  trainingEligible: false;
  requiresReview: true;
};

type ParsedScore = { document: Document; part: Element; partId: string; measures: Element[]; metadataSha256: string };

function parseScore(xml: string, allowExternalDoctype = false): ParsedScore {
  if (typeof xml !== "string" || !xml.length || Buffer.byteLength(xml, "utf8") > MAX_XML_BYTES
    || /<!ENTITY\b/i.test(xml) || /<!DOCTYPE\b[^>]*\[/i.test(xml)) throw new Error("MusicXML inválido ou inseguro.");
  // Audiveris emits a harmless external MusicXML DTD declaration. Strip it
  // before XML parsing, so the parser never sees an external resource URI.
  const externalDoctype = /<!DOCTYPE\s+score-partwise\s+(?:PUBLIC\s+"[^"<>]{1,256}"\s+"[^"<>]{1,1024}"|SYSTEM\s+"[^"<>]{1,1024}")\s*>/i;
  const parseXml = allowExternalDoctype ? xml.replace(externalDoctype, "") : xml;
  if (/<!DOCTYPE\b/i.test(parseXml)) throw new Error("MusicXML com DTD não suportado.");
  const errors: string[] = [];
  const document = new DOMParser({ errorHandler: {
    warning: (message) => errors.push(String(message)),
    error: (message) => errors.push(String(message)),
    fatalError: (message) => errors.push(String(message))
  } }).parseFromString(parseXml, "application/xml");
  if (errors.length || !document.documentElement || nameOf(document.documentElement) !== "score-partwise"
    || document.getElementsByTagName("parsererror").length) throw new Error("MusicXML não pôde ser analisado.");
  const parts = children(document.documentElement, "part");
  const partList = first(document.documentElement, "part-list");
  const declared = partList ? children(partList, "score-part") : [];
  if (parts.length !== 1 || declared.length !== 1) throw new Error("A revisão exige exatamente uma parte declarada.");
  const part = parts[0];
  const partId = part.getAttribute("id") ?? "";
  if (!partId || declared[0].getAttribute("id") !== partId) throw new Error("Identificador de parte inconsistente.");
  const measures = children(part, "measure");
  if (!measures.length || measures.length > 200 || new Set(measures.map((item) => item.getAttribute("number"))).size !== measures.length
    || measures.some((item) => !/^\d{1,5}$/.test(item.getAttribute("number") ?? ""))) {
    throw new Error("Numeração de compassos ausente ou ambígua.");
  }
  const metadata = document.documentElement.cloneNode(true) as Element;
  const metadataPart = children(metadata, "part")[0];
  for (const measure of children(metadataPart, "measure")) metadataPart.removeChild(measure);
  return { document, part, partId, measures, metadataSha256: sha256(new XMLSerializer().serializeToString(metadata)) };
}

function integer(raw: string | undefined, label: string, allowZero = false): number {
  if (!raw || !/^[0-9]{1,9}$/.test(raw)) throw new Error(`${label} inválido na revisão.`);
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number < (allowZero ? 0 : 1) || number > 100000) {
    throw new Error(`${label} inválido na revisão.`);
  }
  return number;
}

function inventory(measure: Element): AssistedMeasureInventory {
  const notes = children(measure, "note");
  return {
    events: notes.length,
    pitched: notes.filter((note) => Boolean(first(note, "pitch"))).length,
    rests: notes.filter((note) => Boolean(first(note, "rest"))).length,
    graces: notes.filter((note) => Boolean(first(note, "grace"))).length,
    chords: notes.filter((note) => Boolean(first(note, "chord"))).length,
    voices: [...new Set(notes.map((note) => value(note, "voice") ?? "1"))].sort()
  };
}

function aggregate(measures: Element[]): AssistedMeasureInventory {
  const items = measures.map(inventory);
  return {
    events: items.reduce((sum, item) => sum + item.events, 0),
    pitched: items.reduce((sum, item) => sum + item.pitched, 0),
    rests: items.reduce((sum, item) => sum + item.rests, 0),
    graces: items.reduce((sum, item) => sum + item.graces, 0),
    chords: items.reduce((sum, item) => sum + item.chords, 0),
    voices: [...new Set(items.flatMap((item) => item.voices))].sort()
  };
}

/** Refuse malformed review notation; the baseline is only an exact-byte precondition. */
function validateReviewedScore(score: ParsedScore): void {
  let divisions: number | undefined;
  let meter: { beats: number; beatType: number } | undefined;
  let expectedTicks: number | undefined;
  for (const measure of score.measures) {
    let cursor = 0;
    let segmentVoice: string | undefined;
    let lastBase: { voice: string; grace: boolean; pitched: boolean; duration: number } | undefined;
    for (const item of children(measure)) {
      const tag = nameOf(item);
      if (tag === "attributes") {
        if (first(item, "divisions")) {
          if (cursor !== 0) throw new Error("Divisions mudam durante o compasso revisado.");
          divisions = integer(value(item, "divisions"), "Divisions");
        }
        if (first(item, "staves") && value(item, "staves") !== "1") throw new Error("Revisão com múltiplas pautas não suportada.");
        const time = first(item, "time");
        if (time) {
          const beats = integer(value(time, "beats"), "Numerador da métrica");
          const beatType = integer(value(time, "beat-type"), "Denominador da métrica");
          if (cursor !== 0) throw new Error("Métrica muda durante o compasso revisado.");
          meter = { beats, beatType };
        }
        if (meter && divisions) {
          if ((meter.beats * divisions * 4) % meter.beatType !== 0) throw new Error("Métrica não integral na revisão.");
          expectedTicks = meter.beats * divisions * 4 / meter.beatType;
        }
        continue;
      }
      if (tag === "backup" || tag === "forward") {
        const duration = integer(value(item, "duration"), "Movimento de cursor");
        if (tag === "backup" && expectedTicks !== undefined && cursor !== expectedTicks) {
          throw new Error("Backup antes do fechamento da voz revisada.");
        }
        if (tag === "backup" && duration !== cursor) throw new Error("Backup não retorna ao início do compasso revisado.");
        cursor += tag === "backup" ? -duration : duration;
        if (cursor < 0 || cursor > 100000) throw new Error("Backup/forward sai do compasso revisado.");
        if (tag === "backup") segmentVoice = undefined;
        lastBase = undefined;
        continue;
      }
      if (tag !== "note") continue;
      if (!divisions) throw new Error("Revisão sem divisions antes das notas.");
      const pitch = first(item, "pitch");
      const rest = first(item, "rest");
      if (Boolean(pitch) === Boolean(rest) || first(item, "unpitched")) throw new Error("Nota ou pausa ambígua na revisão.");
      if (pitch) {
        const step = value(pitch, "step");
        const octave = integer(value(pitch, "octave"), "Oitava", true);
        const alter = value(pitch, "alter");
        if (!step || !/^[A-G]$/.test(step) || octave > 9 || alter !== undefined && (!/^-?[0-2]$/.test(alter))) {
          throw new Error("Altura inválida na revisão.");
        }
      }
      const voice = value(item, "voice") ?? "1";
      if (!/^[1-9][0-9]{0,2}$/.test(voice) || value(item, "staff") && value(item, "staff") !== "1") {
        throw new Error("Voz ou pauta inválida na revisão.");
      }
      if (segmentVoice !== undefined && segmentVoice !== voice) throw new Error("Voz muda sem backup no compasso revisado.");
      segmentVoice = voice;
      const grace = Boolean(first(item, "grace"));
      const chord = Boolean(first(item, "chord"));
      if (grace && rest) throw new Error("Pausa de graça inválida na revisão.");
      if (chord && rest) throw new Error("Pausa em acorde inválida na revisão.");
      if (chord && (!lastBase || !lastBase.pitched || lastBase.voice !== voice || lastBase.grace !== grace)) {
        throw new Error("Acorde sem nota-base contígua da mesma voz na revisão.");
      }
      const rawDuration = value(item, "duration");
      const duration = grace ? (rawDuration === undefined ? 0 : integer(rawDuration, "Duração de graça", true))
        : integer(rawDuration, "Duração da nota");
      if (grace && duration !== 0) throw new Error("Graça métrica não suportada na revisão.");
      if (chord && lastBase?.duration !== duration) throw new Error("Membro do acorde com duração diferente da nota-base.");
      if (!chord) {
        lastBase = { voice, grace, pitched: Boolean(pitch), duration };
        if (!grace) cursor += duration;
      }
      if (cursor > 100000 || expectedTicks !== undefined && cursor > expectedTicks) {
        throw new Error("Evento ultrapassa a métrica do compasso revisado.");
      }
    }
    if (expectedTicks === undefined || cursor !== expectedTicks) {
      throw new Error(`Compasso revisado ${measure.getAttribute("number")} não fecha na métrica.`);
    }
  }
}

function measureOperations(base: ParsedScore, reviewed: ParsedScore): AssistedPolyphonicRepairOperation[] {
  const serializer = new XMLSerializer();
  const operations: AssistedPolyphonicRepairOperation[] = [];
  if (base.metadataSha256 !== reviewed.metadataSha256) operations.push({
    kind: "replace_score_metadata", beforeSha256: base.metadataSha256, afterSha256: reviewed.metadataSha256
  });
  for (const [measureIndex, before] of base.measures.entries()) {
    const after = reviewed.measures[measureIndex];
    const beforeSha256 = sha256(serializer.serializeToString(before));
    const afterSha256 = sha256(serializer.serializeToString(after));
    if (beforeSha256 !== afterSha256) operations.push({
      kind: "replace_measure", measureIndex, measure: before.getAttribute("number")!, beforeSha256, afterSha256,
      before: inventory(before), after: inventory(after)
    });
  }
  return operations;
}

export function createAssistedPolyphonicRepairPlan(input: {
  sourceBytes: Buffer; baseXml: string; reviewedXml: string;
}): AssistedPolyphonicRepairPlan {
  const { sourceBytes, baseXml, reviewedXml } = input;
  if (!Buffer.isBuffer(sourceBytes) || !sourceBytes.length || sourceBytes.length > 32 * 1024 * 1024) {
    throw new Error("Fonte ausente ou acima do limite.");
  }
  const base = parseScore(baseXml, true);
  const reviewed = parseScore(reviewedXml);
  if (base.partId !== reviewed.partId || base.measures.length !== reviewed.measures.length
    || base.measures.some((measure, index) => measure.getAttribute("number") !== reviewed.measures[index].getAttribute("number"))) {
    throw new Error("Parte ou compassos da revisão não correspondem à conversão base.");
  }
  validateReviewedScore(reviewed);
  const operations = measureOperations(base, reviewed);
  if (!operations.length) throw new Error("A revisão não altera a conversão base.");
  return {
    version: 1, mode: "explicit_assisted_review", sourceSha256: sha256(sourceBytes),
    baseXmlSha256: sha256(baseXml), reviewedXmlSha256: sha256(reviewedXml), partId: base.partId,
    measureCount: base.measures.length, operations, reviewedXml,
    review: { mode: "ai_agent_assisted", humanEditorialApproval: false,
      accuracyVerified: false, trainingEligible: false, requiresReview: true }
  };
}

export function applyAssistedPolyphonicRepairPlan(input: {
  sourceBytes: Buffer; baseXml: string; plan: AssistedPolyphonicRepairPlan;
}): AssistedPolyphonicRepairResult {
  const { sourceBytes, baseXml, plan } = input;
  if (!plan || typeof plan !== "object" || plan.version !== 1 || plan.mode !== "explicit_assisted_review"
    || typeof plan.reviewedXml !== "string" || typeof plan.reviewedXmlSha256 !== "string"
    || !Array.isArray(plan.operations)) throw new Error("Plano assistido inválido.");
  if (sha256(sourceBytes) !== plan.sourceSha256 || sha256(baseXml) !== plan.baseXmlSha256
    || sha256(plan.reviewedXml) !== plan.reviewedXmlSha256) {
    throw new Error("Hash da fonte, da conversão base ou da revisão mudou; plano rejeitado.");
  }
  const regenerated = createAssistedPolyphonicRepairPlan({ sourceBytes, baseXml, reviewedXml: plan.reviewedXml });
  if (JSON.stringify(regenerated) !== JSON.stringify(plan)) throw new Error("Operações ou estado editorial do plano foram alterados.");
  const before = parseScore(baseXml, true);
  const after = parseScore(plan.reviewedXml);
  return {
    musicXml: plan.reviewedXml, history: plan.operations,
    provenance: { sourceSha256: plan.sourceSha256, baseXmlSha256: plan.baseXmlSha256,
      reviewedXmlSha256: plan.reviewedXmlSha256, outputXmlSha256: plan.reviewedXmlSha256,
      mode: "explicit_assisted_review" },
    inventory: { before: aggregate(before.measures), after: aggregate(after.measures) },
    humanEditorialApproval: false, accuracyVerified: false, trainingEligible: false, requiresReview: true
  };
}
