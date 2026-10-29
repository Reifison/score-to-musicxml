import { createHash } from "node:crypto";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

export type AssistedPitch = { step: string; alter?: number; octave: number };
/** duration is in raw MusicXML division ticks, not quarter-note beats. */
export type AssistedEvent = { kind: "note" | "rest"; duration: number; pitch?: AssistedPitch };

export type AssistedRepairOperation =
  | { kind: "setInitialKey"; measure: string; expectedFifths: number | null; fifths: number }
  | { kind: "setPitch"; measure: string; noteIndex: number; expected: AssistedEvent; pitch: AssistedPitch }
  | { kind: "insertEvent"; measure: string; atIndex: number; expectedEventCount: number; eventXml: string }
  | { kind: "removeEvent"; measure: string; atIndex: number; expected: AssistedEvent }
  | { kind: "replaceArticulation"; measure: string; noteIndex: number; expected: string; replacement: string }
  | { kind: "insertMeasure"; beforeMeasure: string; newMeasure: string; expectedPreviousMeasure: string;
      expectedDivisions: number; expectedDurationTicks: number; measureXml: string };

export type AssistedNotationRepairPlan = {
  version: 1;
  sourceSha256: string;
  baseXmlSha256: string;
  partId: string;
  expectedBaseMeasureCount: number;
  operations: AssistedRepairOperation[];
  review: { mode: "ai_agent_assisted"; editoriallyVerified: false; sourceFullyVerified: false };
  evidence?: string;
};

export type AssistedNotationRepairResult = {
  musicXml: string;
  history: Array<{ operation: AssistedRepairOperation["kind"]; measure: string; detail: string }>;
  provenance: { sourceSha256: string; baseXmlSha256: string; outputXmlSha256: string; evidence?: string };
  accuracyVerified: false;
  trainingEligible: false;
  requiresReview: true;
};

const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");
const MAX_XML_BYTES = 16 * 1024 * 1024;
const MAX_FRAGMENT_BYTES = 128 * 1024;
const nameOf = (node: Node): string => (node as Element).localName || node.nodeName;
const direct = (parent: Node, name: string): Element[] => Array.from(parent.childNodes)
  .filter((node): node is Element => node.nodeType === 1 && nameOf(node) === name);
const first = (parent: Node, name: string): Element | undefined => direct(parent, name)[0];
const text = (parent: Node, name: string): string => first(parent, name)?.textContent?.trim() ?? "";
const parse = (xml: string, fragment = false): Document => {
  if (Buffer.byteLength(xml, "utf8") > (fragment ? MAX_FRAGMENT_BYTES : MAX_XML_BYTES)) throw new Error("XML excede o limite de tamanho.");
  if (/<!ENTITY\b/i.test(xml) || /<!DOCTYPE\b[^>]*\[/i.test(xml) || (fragment && /<!DOCTYPE\b/i.test(xml))) {
    throw new Error("Entidades e subconjuntos DTD não são permitidos.");
  }
  const errors: string[] = [];
  const document = new DOMParser({ errorHandler: { warning: (e) => errors.push(e), error: (e) => errors.push(e), fatalError: (e) => errors.push(e) } }).parseFromString(xml, "application/xml");
  if (errors.length || !document.documentElement || document.getElementsByTagName("parsererror").length) {
    throw new Error(`MusicXML inválido: ${errors[0] ?? "erro de análise"}`);
  }
  return document;
};
const serialize = (element: Node): string => new XMLSerializer().serializeToString(element);

function getPart(document: Document, partId: string): Element {
  if (nameOf(document.documentElement) !== "score-partwise") throw new Error("A correção exige score-partwise.");
  const parts = direct(document.documentElement, "part");
  if (parts.length !== 1 || parts[0].getAttribute("id") !== partId) throw new Error("Parte ambígua ou diferente do plano.");
  return parts[0];
}

function assertSingleVoice(measure: Element): void {
  const children = Array.from(measure.childNodes).filter((node): node is Element => node.nodeType === 1);
  const backups = direct(measure, "backup");
  // Audiveris sometimes emits an unused final cursor reset. It creates no second voice.
  if (direct(measure, "forward").length || backups.length > 1
    || (backups.length === 1 && children.at(-1) !== backups[0])) {
    throw new Error("Compasso multivoz não pode ser reparado automaticamente.");
  }
  for (const note of direct(measure, "note")) {
    if (first(note, "chord") || first(note, "grace") || (text(note, "voice") && text(note, "voice") !== "1")
      || (text(note, "staff") && text(note, "staff") !== "1")) {
      throw new Error("Compasso com voz, acorde, graça ou pauta ambígua.");
    }
  }
}

function refreshTrailingBackup(measure: Element): void {
  const backup = direct(measure, "backup")[0];
  if (!backup) return;
  const duration = first(backup, "duration");
  if (!duration) throw new Error("Backup final sem duração.");
  duration.textContent = String(direct(measure, "note").reduce((sum, note) => sum + eventOf(note).duration, 0));
}

function eventOf(note: Element): AssistedEvent {
  const duration = Number(text(note, "duration"));
  if (!Number.isInteger(duration) || duration <= 0 || duration > 100000) throw new Error("Duração XML inválida.");
  if (first(note, "rest")) return { kind: "rest", duration };
  const pitch = first(note, "pitch");
  if (!pitch) throw new Error("Nota sem altura.");
  const step = text(pitch, "step");
  const octave = Number(text(pitch, "octave"));
  const alter = text(pitch, "alter");
  if (!/^[A-G]$/.test(step) || !Number.isInteger(octave) || octave < 0 || octave > 9
    || (alter && (!Number.isInteger(Number(alter)) || Math.abs(Number(alter)) > 2))) throw new Error("Altura XML inválida.");
  return { kind: "note", duration, pitch: { step, octave, ...(alter ? { alter: Number(alter) } : {}) } };
}

function assertExpected(note: Element, expected: AssistedEvent): void {
  const actual = eventOf(note);
  if (actual.kind !== expected.kind || actual.duration !== expected.duration
    || (expected.kind === "note" && (!expected.pitch || actual.pitch?.step !== expected.pitch.step
      || actual.pitch.octave !== expected.pitch.octave || (actual.pitch.alter ?? 0) !== (expected.pitch.alter ?? 0)))) {
    throw new Error(`Evento de precondição diferente: ${JSON.stringify(actual)}.`);
  }
}

function validFragment(xml: string, tag: "note" | "measure"): Element {
  if (typeof xml !== "string") throw new Error("Fragmento ausente.");
  const element = parse(xml, true).documentElement;
  if (nameOf(element) !== tag) throw new Error(`Fragmento deve ser <${tag}>.`);
  if (tag === "note") { validateDonorNote(element); }
  if (tag === "measure") {
    assertSingleVoice(element);
    if (Array.from(element.childNodes).some((node) => node.nodeType === 1 && nameOf(node) !== "note")) {
      throw new Error("Compasso doador deve conter apenas notas e pausas.");
    }
    for (const note of direct(element, "note")) validateDonorNote(note);
  }
  return element;
}

function assertSingleVoiceForNote(note: Element): void {
  if (first(note, "chord") || first(note, "grace") || (text(note, "voice") && text(note, "voice") !== "1"))
    throw new Error("Evento doador ambíguo.");
}

function validateDonorNote(note: Element): void {
  eventOf(note);
  assertSingleVoiceForNote(note);
  if (direct(note, "duration").length !== 1 || Number(!!first(note, "pitch")) + Number(!!first(note, "rest")) !== 1) {
    throw new Error("Evento doador sem nota ou pausa inequívoca.");
  }
  const allowed: Record<string, string[]> = {
    note: ["pitch", "rest", "duration", "voice", "type", "dot", "stem", "beam", "notations", "accidental", "staff"],
    pitch: ["step", "alter", "octave"], rest: ["display-step", "display-octave"],
    notations: ["slur", "fermata", "articulations"], articulations: ["staccato"]
  };
  const visit = (element: Element): void => {
    const permitted = allowed[nameOf(element)] ?? [];
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType !== 1) continue;
      const nested = child as Element;
      if (!permitted.includes(nameOf(nested))) throw new Error("Evento doador contém elemento não autorizado.");
      visit(nested);
    }
  };
  visit(note);
}

function measureByNumber(part: Element, number: string): Element {
  const matches = direct(part, "measure").filter((measure) => measure.getAttribute("number") === number);
  if (matches.length !== 1) throw new Error(`Compasso ${number} ausente ou ambíguo.`);
  assertSingleVoice(matches[0]);
  return matches[0];
}

function eventAt(measure: Element, index: number): Element {
  if (!Number.isInteger(index) || index < 0) throw new Error("Índice de evento inválido.");
  const note = direct(measure, "note")[index];
  if (!note) throw new Error("Índice de evento fora do compasso.");
  return note;
}

function writePitch(note: Element, pitchValue: AssistedPitch): void {
  if (!/^[A-G]$/.test(pitchValue.step) || !Number.isInteger(pitchValue.octave)
    || pitchValue.octave < 0 || pitchValue.octave > 9
    || (pitchValue.alter !== undefined && (!Number.isInteger(pitchValue.alter) || Math.abs(pitchValue.alter) > 2))) throw new Error("Nova altura inválida.");
  const pitch = first(note, "pitch");
  if (!pitch) throw new Error("Não é possível mudar a altura de uma pausa.");
  if (first(note, "accidental")) throw new Error("Correção de altura com acidente explícito exige substituição editorial própria.");
  const owner = note.ownerDocument;
  const step = first(pitch, "step");
  const octave = first(pitch, "octave");
  if (!step || !octave) throw new Error("Nota sem altura completa.");
  step.textContent = pitchValue.step;
  octave.textContent = String(pitchValue.octave);
  const alter = first(pitch, "alter");
  if (pitchValue.alter === undefined) { if (alter) pitch.removeChild(alter); }
  else if (alter) alter.textContent = String(pitchValue.alter);
  else {
    const created = owner.createElement("alter"); created.textContent = String(pitchValue.alter);
    pitch.insertBefore(created, octave);
  }
}

function setInitialKey(measure: Element, expectedFifths: number | null, fifths: number): void {
  if (!Number.isInteger(fifths) || fifths < -7 || fifths > 7) throw new Error("Armadura inválida.");
  const attributes = first(measure, "attributes");
  if (!attributes) throw new Error("Compasso inicial sem atributos.");
  const key = first(attributes, "key");
  const existing = key ? Number(text(key, "fifths")) : null;
  if (existing !== expectedFifths) throw new Error("Armadura inicial difere da precondição.");
  if (key) first(key, "fifths")!.textContent = String(fifths);
  else {
    const created = measure.ownerDocument.createElement("key");
    const value = measure.ownerDocument.createElement("fifths"); value.textContent = String(fifths); created.appendChild(value);
    attributes.insertBefore(created, first(attributes, "time") ?? first(attributes, "clef") ?? null);
  }
}

function replaceArticulation(note: Element, expected: string, replacement: string): void {
  if (!/^(staccato|fermata)$/.test(expected) || !/^(staccato|fermata)$/.test(replacement) || expected === replacement) {
    throw new Error("Substituição de articulação não autorizada.");
  }
  const notations = first(note, "notations");
  if (!notations) throw new Error("Nota sem sinais para substituir.");
  const old = expected === "fermata" ? first(notations, "fermata") : first(first(notations, "articulations") ?? notations, "staccato");
  if (!old) throw new Error("Articulação esperada ausente.");
  old.parentNode?.removeChild(old);
  if (replacement === "fermata") {
    const newElement = note.ownerDocument.createElement("fermata"); newElement.setAttribute("type", "upright");
    notations.insertBefore(newElement, notations.firstChild);
  } else {
    let articulations = first(notations, "articulations");
    if (!articulations) { articulations = note.ownerDocument.createElement("articulations"); notations.appendChild(articulations); }
    articulations.appendChild(note.ownerDocument.createElement("staccato"));
  }
}

function replaceMeasureText(xml: string, oldMeasure: string, newMeasure: string): string {
  const index = xml.indexOf(oldMeasure);
  if (index < 0 || xml.indexOf(oldMeasure, index + oldMeasure.length) >= 0) throw new Error("Trecho de compasso ambíguo no XML base.");
  return xml.slice(0, index) + newMeasure + xml.slice(index + oldMeasure.length);
}

function validatePlan(plan: AssistedNotationRepairPlan): void {
  if (!plan || typeof plan !== "object" || plan.version !== 1
    || !/^[a-f0-9]{64}$/.test(plan.sourceSha256) || !/^[a-f0-9]{64}$/.test(plan.baseXmlSha256)
    || !/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(plan.partId)
    || !Number.isInteger(plan.expectedBaseMeasureCount) || plan.expectedBaseMeasureCount < 1
    || plan.expectedBaseMeasureCount > 10000 || !Array.isArray(plan.operations)
    || plan.operations.length < 1 || plan.operations.length > 500
    || plan.review?.mode !== "ai_agent_assisted" || plan.review.editoriallyVerified !== false
    || plan.review.sourceFullyVerified !== false
    || (plan.evidence !== undefined && (typeof plan.evidence !== "string" || plan.evidence.length > 500))) {
    throw new Error("Plano ou hashes inválidos.");
  }
  for (const operation of plan.operations) {
    if (!operation || typeof operation !== "object" || typeof operation.kind !== "string") throw new Error("Operação inválida.");
    const measure = operation.kind === "insertMeasure" ? operation.beforeMeasure : operation.measure;
    if (typeof measure !== "string" || !/^\d{1,5}$/.test(measure)) throw new Error("Índice de compasso inválido.");
    if (operation.kind === "insertMeasure") {
      if (typeof operation.newMeasure !== "string" || typeof operation.expectedPreviousMeasure !== "string"
        || typeof operation.measureXml !== "string" || !Number.isInteger(operation.expectedDivisions)
        || operation.expectedDivisions < 1 || operation.expectedDivisions > 100000
        || !Number.isInteger(operation.expectedDurationTicks) || operation.expectedDurationTicks < 1
        || operation.expectedDurationTicks > 100000) throw new Error("Inserção de compasso inválida.");
    } else if (operation.kind === "setInitialKey") {
      if ((operation.expectedFifths !== null && !Number.isInteger(operation.expectedFifths)) || !Number.isInteger(operation.fifths))
        throw new Error("Operação de armadura inválida.");
    } else if (operation.kind === "setPitch") {
      if (!Number.isInteger(operation.noteIndex) || !operation.expected || !operation.pitch) throw new Error("Operação de altura inválida.");
    } else if (operation.kind === "insertEvent") {
      if (!Number.isInteger(operation.atIndex) || !Number.isInteger(operation.expectedEventCount)
        || operation.expectedEventCount < 0 || typeof operation.eventXml !== "string") throw new Error("Inserção de evento inválida.");
    } else if (operation.kind === "removeEvent") {
      if (!Number.isInteger(operation.atIndex) || !operation.expected) throw new Error("Remoção de evento inválida.");
    } else if (operation.kind === "replaceArticulation") {
      if (!Number.isInteger(operation.noteIndex) || typeof operation.expected !== "string"
        || typeof operation.replacement !== "string") throw new Error("Articulação inválida.");
    } else throw new Error("Operação não reconhecida.");
  }
}

export function applyAssistedNotationRepair(input: {
  sourceBytes: Buffer;
  baseXml: string;
  plan: AssistedNotationRepairPlan;
}): AssistedNotationRepairResult {
  const { sourceBytes, baseXml, plan } = input;
  if (!Buffer.isBuffer(sourceBytes) || typeof baseXml !== "string") throw new Error("Fonte ou XML base inválidos.");
  validatePlan(plan);
  if (sha256(sourceBytes) !== plan.sourceSha256 || sha256(baseXml) !== plan.baseXmlSha256) {
    throw new Error("Hash da fonte ou do MusicXML base mudou; plano rejeitado.");
  }
  const document = parse(baseXml);
  const part = getPart(document, plan.partId);
  if (direct(part, "measure").length !== plan.expectedBaseMeasureCount) throw new Error("Contagem de compassos base diferente.");
  if (!plan.operations.length) throw new Error("Plano sem operações.");
  let output = baseXml;
  const history: AssistedNotationRepairResult["history"] = [];
  const touched = new Set<Element>();
  let inserted = false;
  for (const operation of plan.operations) {
    if (inserted) throw new Error("Inserção de compasso deve ser a última operação.");
    if (operation.kind === "insertMeasure") {
      const before = measureByNumber(part, operation.beforeMeasure);
      const measures = direct(part, "measure");
      const index = measures.indexOf(before);
      if (index < 1 || measures[index - 1].getAttribute("number") !== operation.expectedPreviousMeasure
        || operation.newMeasure !== operation.beforeMeasure) throw new Error("Âncora de inserção de compasso inválida.");
      const donor = validFragment(operation.measureXml, "measure");
      if (donor.getAttribute("number") !== operation.newMeasure) throw new Error("Número do compasso doador incorreto.");
      let divisions: number | null = null;
      for (const preceding of measures.slice(0, index + 1)) {
        for (const attributes of direct(preceding, "attributes")) {
          const value = text(attributes, "divisions");
          if (value) divisions = Number(value);
        }
      }
      const duration = direct(donor, "note").reduce((sum, note) => sum + eventOf(note).duration, 0);
      if (divisions !== operation.expectedDivisions || duration !== operation.expectedDurationTicks) {
        throw new Error("Divisões ou duração do compasso doador diferem do plano.");
      }
      part.insertBefore(document.importNode(donor, true), before);
      for (const measure of measures.slice(index)) {
        const current = measure.getAttribute("number");
        if (!current || !/^\d+$/.test(current)) throw new Error("Renúmeração ambígua.");
        measure.setAttribute("number", String(Number(current) + 1));
        touched.add(measure);
      }
      history.push({ operation: operation.kind, measure: operation.newMeasure, detail: `inserido antes do compasso base ${operation.beforeMeasure}; seguintes renumerados` });
      inserted = true;
      continue;
    }
    const measure = measureByNumber(part, operation.measure);
    touched.add(measure);
    if (operation.kind === "setInitialKey") {
      if (direct(part, "measure")[0] !== measure) throw new Error("Armadura inicial deve apontar para o primeiro compasso.");
      setInitialKey(measure, operation.expectedFifths, operation.fifths);
    } else if (operation.kind === "setPitch") {
      const note = eventAt(measure, operation.noteIndex); assertExpected(note, operation.expected); writePitch(note, operation.pitch);
    } else if (operation.kind === "insertEvent") {
      const notes = direct(measure, "note");
      if (notes.length !== operation.expectedEventCount || !Number.isInteger(operation.atIndex)
        || operation.atIndex < 0 || operation.atIndex > notes.length) throw new Error("Âncora de evento diferente.");
      const donor = validFragment(operation.eventXml, "note");
      measure.insertBefore(document.importNode(donor, true), notes[operation.atIndex] ?? direct(measure, "backup")[0] ?? null);
      refreshTrailingBackup(measure);
    } else if (operation.kind === "removeEvent") {
      const note = eventAt(measure, operation.atIndex); assertExpected(note, operation.expected); measure.removeChild(note);
      refreshTrailingBackup(measure);
    } else if (operation.kind === "replaceArticulation") {
      replaceArticulation(eventAt(measure, operation.noteIndex), operation.expected, operation.replacement);
    } else throw new Error("Operação não reconhecida.");
    history.push({ operation: operation.kind, measure: operation.measure, detail: JSON.stringify(operation) });
  }
  // Replace original measure spans only. Untouched baseline XML, including directions and metadata, stays byte-identical.
  const originals = [...baseXml.matchAll(/<measure(?=[\s>])[\s\S]*?<\/measure>/g)].map((match) => match[0]);
  if (originals.length !== plan.expectedBaseMeasureCount) throw new Error("Trechos de medida do XML base ambíguos.");
  const updated = direct(part, "measure");
  for (let index = originals.length - 1; index >= 0; index--) {
    const newMeasure = inserted && index >= updated.findIndex((m) => m.getAttribute("number") === history.at(-1)?.measure)
      ? updated[index + 1] : updated[index];
    if (touched.has(newMeasure)) output = replaceMeasureText(output, originals[index], serialize(newMeasure));
  }
  if (inserted) {
    const insertedNumber = history.at(-1)!.measure;
    const insertedMeasure = updated.find((measure) => measure.getAttribute("number") === insertedNumber);
    if (!insertedMeasure) throw new Error("Compasso inserido não encontrado.");
    const anchor = updated[updated.indexOf(insertedMeasure) + 1];
    const anchorText = serialize(anchor);
    const index = output.indexOf(anchorText);
    if (index < 0) throw new Error("Âncora de inserção serializada ausente.");
    output = output.slice(0, index) + serialize(insertedMeasure) + "\n" + output.slice(index);
  }
  const verified = parse(output);
  if (direct(getPart(verified, plan.partId), "measure").length !== plan.expectedBaseMeasureCount + (inserted ? 1 : 0)) {
    throw new Error("Contagem de saída inesperada.");
  }
  return { musicXml: output, history, provenance: { sourceSha256: plan.sourceSha256, baseXmlSha256: plan.baseXmlSha256,
    outputXmlSha256: sha256(output), ...(plan.evidence ? { evidence: plan.evidence } : {}) },
  accuracyVerified: false, trainingEligible: false, requiresReview: true };
}
