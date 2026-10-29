import { createHash } from "node:crypto";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { AudiverisSourceAnchor } from "./AudiverisSourceAnchors.js";
import { inspectMusicXmlValidation } from "./MusicXmlValidation.js";

/** Native boxes must already have been projected into the byte-identified source raster. */
export type AutomaticCandidate = {
  id: string;
  xml: string;
  sourceImageSha256: string;
  anchors: AudiverisSourceAnchor[];
};

/** A source-first reader, never a variant of the Audiveris candidate XML. */
export type IndependentNotation = { id: string; xml: string };
export type LeadingEighthRestEvidence = {
  measureIndex: number;
  sourceImageSha256: string;
  rectangle: { left: number; top: number; width: number; height: number };
  kind: "leading-eighth-rest";
  score: number;
  templateCount: number;
  margin: number;
};
export type ContradictedNativeEighthRestEvidence = {
  measureIndex: number;
  sourceImageSha256: string;
  rectangle: { left: number; top: number; width: number; height: number };
  kind: "contradicted-native-eighth-rest";
  nativeRestOrdinal: number;
  score: number;
  staffOffsetInterlines: number;
  templateCount: number;
};
export type EighthRestImageEvidence = LeadingEighthRestEvidence | ContradictedNativeEighthRestEvidence;

export type AutomaticReconciliationChange = {
  kind: "insert_measure" | "insert_event" | "remove_rest" | "set_initial_key" | "set_key_pitch" | "replace_pause_mark";
  measureIndex: number;
  measure: string;
  donorId: string;
  independentId: string;
  detail: string;
};

export type AutomaticReconciliationRejection = { code: string; measureIndex?: number; detail: string };

export type AutomaticReconciliationResult = {
  musicXml: string;
  history: AutomaticReconciliationChange[];
  rejected: AutomaticReconciliationRejection[];
  provenance: { baseXmlSha256: string; outputXmlSha256: string; sourceImageSha256: string; independentXmlSha256?: string };
  accuracyVerified: false;
  trainingEligible: false;
  requiresReview: true;
};

type Event = {
  node: Element;
  kind: "note" | "rest";
  step?: string;
  alter?: number;
  octave?: number;
  duration: number;
  onset: number;
  explicitAccidental: boolean;
  fermata: boolean;
  staccato: boolean;
};
type Measure = {
  node: Element;
  index: number;
  label: string;
  events: Event[];
  total: number;
  expected?: number;
  key: number;
  explicitKey?: number;
  divisions?: number;
  simple: boolean;
};
type Score = { document: Document; part: Element; measures: Measure[] };
type Paired = { donor: AutomaticCandidate; score: Score; mapping: number[]; insertion?: number };

const maxXmlBytes = 16 * 1024 * 1024;
const epsilon = 0.000001;
const nameOf = (node: Node): string => (node as Element).localName || node.nodeName.split(":").at(-1) || node.nodeName;
const children = (parent: Node, name?: string): Element[] => Array.from(parent.childNodes)
  .filter((node): node is Element => node.nodeType === 1 && (!name || nameOf(node) === name));
const first = (parent: Node, name: string): Element | undefined => children(parent, name)[0];
const value = (parent: Node, name: string): string | undefined => first(parent, name)?.textContent?.trim() || undefined;
const hash = (text: string): string => createHash("sha256").update(text).digest("hex");
const near = (a: number, b: number): boolean => Math.abs(a - b) < epsilon;
const validId = (id: string): boolean => /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(id);

function parseDocument(xml: string): Document | null {
  if (Buffer.byteLength(xml, "utf8") > maxXmlBytes || /<!ENTITY\b/i.test(xml) || /<!DOCTYPE\b[^>]*\[/i.test(xml)) return null;
  const errors: string[] = [];
  try {
    const document = new DOMParser({ errorHandler: {
      warning: (message) => errors.push(String(message)),
      error: (message) => errors.push(String(message)),
      fatalError: (message) => errors.push(String(message))
    } }).parseFromString(xml, "application/xml");
    return !errors.length && document.documentElement && nameOf(document.documentElement) === "score-partwise" ? document : null;
  } catch { return null; }
}

function integer(text: string | undefined, low: number, high: number): number | undefined {
  const number = text === undefined ? NaN : Number(text);
  return Number.isSafeInteger(number) && number >= low && number <= high ? number : undefined;
}

function parseScore(xml: string): Score | null {
  const document = parseDocument(xml);
  if (!document) return null;
  const parts = children(document.documentElement, "part");
  const declarations = children(first(document.documentElement, "part-list") ?? document.documentElement, "score-part");
  if (parts.length !== 1 || declarations.length !== 1 || !parts[0].getAttribute("id")
    || parts[0].getAttribute("id") !== declarations[0].getAttribute("id")) return null;
  const part = parts[0];
  const measureNodes = children(part, "measure");
  if (!measureNodes.length || measureNodes.length > 1000 || part.getElementsByTagName("transpose").length) return null;
  if (Array.from(part.getElementsByTagName("staves")).some((item) => value(item.parentNode ?? item, "staves") !== "1")
    || Array.from(part.getElementsByTagName("note")).some((item) => first(item, "chord") || first(item, "grace")
      || value(item, "staff") && value(item, "staff") !== "1"
      || value(item, "voice") && value(item, "voice") !== "1")) return null;
  let divisions: number | undefined;
  let expected: number | undefined;
  let key = 0;
  const measures: Measure[] = [];
  for (const [index, node] of measureNodes.entries()) {
    const label = node.getAttribute("number") ?? "";
    if (!label || label.length > 32) return null;
    const events: Event[] = [];
    let cursor = 0;
    let simple = true;
    let explicitKey: number | undefined;
    const items = children(node);
    for (const [itemIndex, item] of items.entries()) {
      const tag = nameOf(item);
      if (tag === "attributes") {
        if (events.length) simple = false;
        if (first(item, "staves") && value(item, "staves") !== "1") simple = false;
        if (first(item, "transpose")) simple = false;
        if (first(item, "divisions")) divisions = integer(value(item, "divisions"), 1, 100000);
        if (first(item, "divisions") && divisions === undefined) return null;
        for (const keyNode of children(item, "key")) {
          if (keyNode.hasAttribute("number")) simple = false;
          const next = integer(value(keyNode, "fifths"), -7, 7);
          if (next === undefined || explicitKey !== undefined) { simple = false; continue; }
          key = next;
          explicitKey = next;
        }
        for (const time of children(item, "time")) {
          const beats = integer(value(time, "beats"), 1, 32);
          const beatType = integer(value(time, "beat-type"), 1, 128);
          if (!beats || !beatType || expected !== undefined && children(item, "time").length > 1) { simple = false; continue; }
          expected = beats * 4 / beatType;
        }
        continue;
      }
      if (tag === "backup") {
        // Audiveris sometimes leaves an unused final cursor reset. No subsequent event may follow it.
        if (itemIndex !== items.length - 1 || children(node, "backup").length !== 1
          || !near(Number(value(item, "duration")) / (divisions ?? NaN), cursor)) simple = false;
        continue;
      }
      if (tag === "forward") { simple = false; continue; }
      if (tag !== "note") continue;
      const durationTicks = integer(value(item, "duration"), 1, 100000);
      if (!divisions || !durationTicks || first(item, "chord") || first(item, "grace")
        || first(item, "time-modification") || (value(item, "voice") && value(item, "voice") !== "1")
        || (value(item, "staff") && value(item, "staff") !== "1")) { simple = false; continue; }
      const rest = first(item, "rest");
      const pitch = first(item, "pitch");
      if (Boolean(rest) === Boolean(pitch)) { simple = false; continue; }
      const event: Event = { node: item, kind: rest ? "rest" : "note", duration: durationTicks / divisions,
        onset: cursor, explicitAccidental: Boolean(first(item, "accidental")),
        fermata: Boolean(first(first(item, "notations") ?? item, "fermata")),
        staccato: Boolean(first(first(first(item, "notations") ?? item, "articulations") ?? item, "staccato")) };
      if (pitch) {
        const step = value(pitch, "step");
        const octave = integer(value(pitch, "octave"), 0, 9);
        const alter = first(pitch, "alter") ? integer(value(pitch, "alter"), -2, 2) : 0;
        if (!step || !/^[A-G]$/.test(step) || octave === undefined || alter === undefined) { simple = false; continue; }
        event.step = step; event.octave = octave; event.alter = alter;
      }
      events.push(event);
      cursor += event.duration;
    }
    measures.push({ node, index, label, events, total: cursor, expected, key, explicitKey, divisions, simple });
  }
  return { document, part, measures };
}

function anchorMap(candidate: AutomaticCandidate, measureCount: number): AudiverisSourceAnchor[] | null {
  if (!/^[a-f0-9]{64}$/.test(candidate.sourceImageSha256) || candidate.anchors.length !== measureCount) return null;
  const ordered = [...candidate.anchors].sort((a, b) => a.measureIndex - b.measureIndex);
  for (const [index, anchor] of ordered.entries()) {
    const box = anchor.rectangle;
    if (anchor.partIndex !== 0 || anchor.measureIndex !== index || ![box.left, box.top, box.width, box.height].every(Number.isFinite)
      || box.left < 0 || box.top < 0 || box.width <= 0 || box.height <= 0) return null;
    const prior = ordered[index - 1];
    if (prior && anchor.systemIndex !== undefined && prior.systemIndex !== undefined) {
      if (anchor.systemIndex < prior.systemIndex
        || anchor.systemIndex === prior.systemIndex && box.left <= prior.rectangle.left) return null;
    }
  }
  return ordered;
}

function overlap(a: AudiverisSourceAnchor, b: AudiverisSourceAnchor): number {
  if (a.systemIndex !== undefined && b.systemIndex !== undefined && a.systemIndex !== b.systemIndex) return 0;
  const ar = a.rectangle; const br = b.rectangle;
  const iw = Math.max(0, Math.min(ar.left + ar.width, br.left + br.width) - Math.max(ar.left, br.left));
  const ih = Math.max(0, Math.min(ar.top + ar.height, br.top + br.height) - Math.max(ar.top, br.top));
  return Math.min(iw / Math.min(ar.width, br.width), ih / Math.min(ar.height, br.height));
}

function protectedMeasureContent(measure: Element): string {
  const serializer = new XMLSerializer();
  return children(measure).filter((item) => !["note", "backup", "attributes"].includes(nameOf(item)))
    .map((item) => serializer.serializeToString(item)).join("\u0000");
}
function measureWithoutNumber(measure: Element): string {
  return new XMLSerializer().serializeToString(measure).replace(/^(<measure\b[^>]*\bnumber=")[^"]+("[^>]*>)/, "$1#$2");
}

function sameEvent(a: Event, b: Event): boolean {
  return a.kind === b.kind && near(a.duration, b.duration) && a.step === b.step && (a.alter ?? 0) === (b.alter ?? 0)
    && a.octave === b.octave;
}
function sameExceptAlter(a: Event, b: Event): boolean {
  return a.kind === b.kind && near(a.duration, b.duration) && a.step === b.step && a.octave === b.octave;
}
function sameNotes(a: Measure, b: Measure): boolean {
  return a.events.length === b.events.length && a.events.every((event, index) => sameEvent(event, b.events[index]));
}
function eventSimilarity(a: Measure, b: Measure): number {
  const left = a.events; const right = b.events;
  if (!left.length || !right.length) return left.length === right.length ? 1 : 0;
  const dp = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));
  for (let i = 1; i <= left.length; i++) for (let j = 1; j <= right.length; j++) {
    dp[i][j] = sameExceptAlter(left[i - 1], right[j - 1]) ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  }
  return dp[left.length][right.length] / Math.max(left.length, right.length);
}

function pairCandidate(base: AutomaticCandidate, baseScore: Score, donor: AutomaticCandidate, donorScore: Score): Paired | null {
  const baseAnchors = anchorMap(base, baseScore.measures.length);
  const donorAnchors = anchorMap(donor, donorScore.measures.length);
  if (!baseAnchors || !donorAnchors || base.sourceImageSha256 !== donor.sourceImageSha256) return null;
  const difference = donorScore.measures.length - baseScore.measures.length;
  if (difference < 0 || difference > 1) return null;
  if (difference === 0) {
    const mapping = baseScore.measures.map((_, index) => index);
    const spatiallyMatched = mapping.filter((index) => overlap(baseAnchors[index], donorAnchors[index]) >= 0.42).length;
    if (spatiallyMatched < Math.max(1, Math.ceil(mapping.length * 0.9))) return null;
    return { donor, score: donorScore, mapping };
  }
  const alternatives: Array<{ insertion: number; score: number; mapping: number[] }> = [];
  for (let inserted = 1; inserted < donorScore.measures.length - 1; inserted++) {
    const mapping = baseScore.measures.map((_, index) => index < inserted ? index : index + 1);
    let score = 0;
    let valid = true;
    for (const [baseIndex, donorIndex] of mapping.entries()) {
      const geometry = overlap(baseAnchors[baseIndex], donorAnchors[donorIndex]);
      if (geometry < 0.22) { valid = false; break; }
      score += geometry * 3 + eventSimilarity(baseScore.measures[baseIndex], donorScore.measures[donorIndex]) * 2;
    }
    // The donor's extra bar must be visible in a source span occupied by an adjacent native stack.
    const missingGeometry = overlap(baseAnchors[inserted - 1], donorAnchors[inserted]);
    if (!valid || missingGeometry < 0.35 || eventSimilarity(baseScore.measures[inserted - 1], donorScore.measures[inserted - 1]) < 0.8
      || eventSimilarity(baseScore.measures[inserted], donorScore.measures[inserted + 1]) < 0.65) continue;
    score += missingGeometry;
    alternatives.push({ insertion: inserted, score, mapping });
  }
  alternatives.sort((a, b) => b.score - a.score);
  if (!alternatives.length || alternatives[1] && alternatives[0].score - alternatives[1].score < 1.5) return null;
  return { donor, score: donorScore, mapping: alternatives[0].mapping, insertion: alternatives[0].insertion };
}

function independentMatches(candidate: Score, independent: Score): boolean {
  if (candidate.measures.length !== independent.measures.length) return false;
  const directMatches = candidate.measures.filter((measure, index) => sameNotes(measure, independent.measures[index])).length;
  if (directMatches < Math.max(2, Math.ceil(candidate.measures.length * 0.65))) return false;
  // A repeated phrase must not make a one-measure shift equally plausible.
  const shifted = [-1, 1].map((shift) => candidate.measures.filter((measure, index) => {
    const other = independent.measures[index + shift];
    return other && sameNotes(measure, other);
  }).length);
  return directMatches >= Math.max(...shifted) + 2 || candidate.measures.length < 5 && directMatches > Math.max(...shifted);
}

function uniqueSingleInsertion(shorter: Event[], longer: Event[]): number | undefined {
  if (longer.length !== shorter.length + 1) return undefined;
  const possibilities: number[] = [];
  for (let at = 0; at < longer.length; at++) {
    if (shorter.every((event, index) => sameEvent(event, longer[index < at ? index : index + 1]))) possibilities.push(at);
  }
  return possibilities.length === 1 ? possibilities[0] : undefined;
}

function durationClosed(measure: Measure): boolean {
  return measure.expected !== undefined && near(measure.total, measure.expected);
}
function safeDonorNote(event: Event, allowSlur = false): boolean {
  const permitted = new Set(["pitch", "rest", "duration", "voice", "type", "dot", "stem", "beam", "notations", "staff"]);
  const notations = first(event.node, "notations");
  const notationSafe = !notations || children(notations).every((item) => {
    const name = nameOf(item);
    if (name === "fermata") return !children(item).length;
    if (name === "slur") return allowSlur && !children(item).length && ["start", "stop"].includes(item.getAttribute("type") ?? "");
    return name === "articulations" && children(item).every((mark) => nameOf(mark) === "staccato" && !children(mark).length);
  });
  return notationSafe && children(event.node).every((item) => permitted.has(nameOf(item))) && !event.explicitAccidental
    && !children(event.node, "tie").length && !children(event.node, "time-modification").length
    && !Array.from(event.node.getElementsByTagName("*")).some((item) => ["tied", "tuplet", "ornaments", "technical", "accidental-mark"].includes(nameOf(item)))
    && (allowSlur || !event.node.getElementsByTagName("slur").length);
}
function stripUncorroboratedMarks(note: Element, witness: Event): void {
  const notations = first(note, "notations");
  if (!notations) return;
  for (const mark of children(notations)) {
    const name = nameOf(mark);
    if (name === "fermata" && witness.fermata) continue;
    if (name === "articulations" && witness.staccato) continue;
    notations.removeChild(mark);
  }
  if (!children(notations).length) note.removeChild(notations);
}
function containedSlurs(measure: Measure): boolean {
  const open = new Set<string>();
  for (const event of measure.events) for (const slur of Array.from(event.node.getElementsByTagName("slur"))) {
    const number = slur.getAttribute("number") ?? "1";
    const type = slur.getAttribute("type");
    if (type === "start" && !open.has(number)) open.add(number);
    else if (type === "stop" && open.has(number)) open.delete(number);
    else return false;
  }
  return open.size === 0;
}
function appendNoteAt(measure: Measure, at: number, donorEvent: Event, witnessEvent: Event): boolean {
  if (!safeDonorNote(donorEvent) || !measure.divisions) return false;
  const ticks = donorEvent.duration * measure.divisions;
  if (!Number.isSafeInteger(ticks) || ticks < 1 || ticks > 100000) return false;
  const notes = children(measure.node, "note");
  const backup = children(measure.node, "backup")[0];
  const backupDuration = backup && first(backup, "duration");
  if (backup && !backupDuration) return false;
  const imported = measure.node.ownerDocument.importNode(donorEvent.node, true);
  stripUncorroboratedMarks(imported, witnessEvent);
  const duration = first(imported, "duration");
  if (!duration) return false;
  duration.textContent = String(ticks);
  measure.node.insertBefore(imported, notes[at] ?? children(measure.node, "backup")[0] ?? null);
  if (backupDuration) backupDuration.textContent = String(Math.round((measure.total + donorEvent.duration) * measure.divisions));
  return true;
}
function removeRest(measure: Measure, at: number): boolean {
  const event = measure.events[at];
  if (!event || event.kind !== "rest" || !safeDonorNote(event)) return false;
  const backup = children(measure.node, "backup")[0];
  const duration = backup && first(backup, "duration");
  if (backup && (!duration || !measure.divisions)) return false;
  measure.node.removeChild(event.node);
  if (duration && measure.divisions) duration.textContent = String(Math.round((measure.total - event.duration) * measure.divisions));
  return true;
}
function keySteps(fifths: number): Set<string> {
  const order = fifths < 0 ? ["B", "E", "A", "D", "G", "C", "F"] : ["F", "C", "G", "D", "A", "E", "B"];
  return new Set(order.slice(0, Math.abs(fifths)));
}
function keyRegionAgrees(base: Score, donor: Score, witness: Score, mapping: number[], fifths: number): boolean {
  const affected = keySteps(fifths);
  for (let index = 0; index < base.measures.length; index++) {
    const current = base.measures[index];
    if (index > 0 && current.explicitKey !== undefined) break;
    const other = donor.measures[mapping[index]];
    const source = witness.measures[mapping[index]];
    if (!current.events.some((event) => event.kind === "note" && affected.has(event.step!))) continue;
    if (!current.simple || !other?.simple || !source?.simple || current.events.length !== other.events.length) return false;
    const extraRestAt = source.events.length === other.events.length + 1 ? uniqueSingleInsertion(other.events, source.events) : undefined;
    if (source.events.length !== other.events.length && (extraRestAt === undefined || source.events[extraRestAt].kind !== "rest")) return false;
    for (const [eventIndex, event] of current.events.entries()) {
      if (event.kind !== "note" || !affected.has(event.step!)) continue;
      const donorEvent = other.events[eventIndex];
      const sourceEvent = source.events[extraRestAt !== undefined && eventIndex >= extraRestAt ? eventIndex + 1 : eventIndex];
      if (!donorEvent || !sourceEvent || !sameExceptAlter(event, donorEvent) || !sameExceptAlter(donorEvent, sourceEvent)
        || donorEvent.alter !== sourceEvent.alter || (event.explicitAccidental && event.alter !== donorEvent.alter)) return false;
    }
  }
  return true;
}
function verifiedLeadingRestEvidence(evidence: EighthRestImageEvidence[] | undefined,
  sourceImageSha256: string, anchor: AudiverisSourceAnchor, measureIndex: number): boolean {
  if (!Array.isArray(evidence)) return false;
  const box = anchor.rectangle;
  return evidence.some((item) => {
    if (item?.kind !== "leading-eighth-rest" || item.measureIndex !== measureIndex
      || item.sourceImageSha256 !== sourceImageSha256 || !Number.isFinite(item.score)
      || item.score < 0.82 || item.score > 1 || !Number.isFinite(item.margin) || item.margin < 0.065 || item.margin > 1
      || !Number.isSafeInteger(item.templateCount) || item.templateCount < 2) return false;
    const roi = item.rectangle;
    if (!roi || ![roi.left, roi.top, roi.width, roi.height].every(Number.isFinite)
      || roi.width <= 0 || roi.height <= 0) return false;
    const tolerance = 5;
    return roi.left >= box.left - tolerance && roi.top >= box.top - tolerance
      && roi.left + roi.width <= box.left + box.width + tolerance
      && roi.top + roi.height <= box.top + box.height + tolerance;
  });
}
function verifiedContradictedRestEvidence(evidence: EighthRestImageEvidence[] | undefined,
  sourceImageSha256: string, anchor: AudiverisSourceAnchor, measureIndex: number, restIndex: number): boolean {
  if (!Array.isArray(evidence)) return false;
  const box = anchor.rectangle;
  return evidence.some((item) => {
    if (item?.kind !== "contradicted-native-eighth-rest" || item.measureIndex !== measureIndex
      || item.nativeRestOrdinal !== restIndex || item.sourceImageSha256 !== sourceImageSha256
      || !Number.isFinite(item.score) || item.score < 0 || item.score >= 0.75
      || !Number.isFinite(item.staffOffsetInterlines) || Math.abs(item.staffOffsetInterlines) <= 2
      || !Number.isSafeInteger(item.templateCount) || item.templateCount < 2) return false;
    const roi = item.rectangle;
    if (!roi || ![roi.left, roi.top, roi.width, roi.height].every(Number.isFinite)
      || roi.width <= 0 || roi.height <= 0) return false;
    return roi.left >= box.left - 5 && roi.left + roi.width <= box.left + box.width + 5
      && roi.top >= box.top - 2 * box.height && roi.top + roi.height <= box.top + 3 * box.height;
  });
}

function noNewValidationRegression(beforeXml: string, afterXml: string, history: AutomaticReconciliationChange[]): boolean {
  const before = inspectMusicXmlValidation(beforeXml, { scope: "page" });
  const after = inspectMusicXmlValidation(afterXml, { scope: "page" });
  const guarded = (issue: typeof before.issues[number]): boolean => issue.severity === "error"
    || ["RHYTHM_LONG", "RHYTHM_SHORT", "RHYTHM_INVALID_POSITION"].includes(issue.code);
  const counts = (issues: typeof before.issues): Map<string, number> => {
    const result = new Map<string, number>();
    for (const issue of issues) if (guarded(issue)) result.set(issue.code, (result.get(issue.code) ?? 0) + 1);
    return result;
  };
  const beforeCounts = counts(before.issues);
  for (const [code, count] of counts(after.issues)) if (count > (beforeCounts.get(code) ?? 0)) return false;
  return history.length > 0 && !after.issues.some((issue) => issue.code === "XML_UNREADABLE");
}

/**
 * Conservative page-local repairs. Neither Audiveris variant votes as an independent
 * reader; every accepted music edit needs the source-first transcription and a
 * local structural or spatial precondition. The result always remains unverified.
 */
export function reconcileAutomaticMusicXmlCandidates(input: {
  base: AutomaticCandidate;
  donors: AutomaticCandidate[];
  independent?: IndependentNotation;
  sourceRestEvidence?: EighthRestImageEvidence[];
}): AutomaticReconciliationResult {
  const { base, donors, independent } = input;
  const rejected: AutomaticReconciliationRejection[] = [];
  const history: AutomaticReconciliationChange[] = [];
  const provenance = { baseXmlSha256: hash(base.xml), outputXmlSha256: hash(base.xml), sourceImageSha256: base.sourceImageSha256,
    ...(independent ? { independentXmlSha256: hash(independent.xml) } : {}) };
  const finish = (musicXml: string): AutomaticReconciliationResult => ({ musicXml, history, rejected,
    provenance: { ...provenance, outputXmlSha256: hash(musicXml) }, accuracyVerified: false, trainingEligible: false, requiresReview: true });
  if (!validId(base.id) || !independent || !validId(independent.id) || independent.id === base.id
    || !Array.isArray(donors) || !donors.length || donors.length > 4) {
    rejected.push({ code: "INDEPENDENT_EVIDENCE_REQUIRED", detail: "Leitura fonte-primeiro e candidato alternativo identificados são obrigatórios." });
    return finish(base.xml);
  }
  const baseScore = parseScore(base.xml);
  const witnessScore = parseScore(independent.xml);
  if (!baseScore || !witnessScore || !anchorMap(base, baseScore.measures.length)) {
    rejected.push({ code: "UNSUPPORTED_BASE_OR_WITNESS", detail: "MusicXML ou âncoras de origem não verificáveis." });
    return finish(base.xml);
  }
  const originalMeasureText = baseScore.measures.map((measure) => measureWithoutNumber(measure.node));
  const originalProtectedContent = baseScore.measures.map((measure) => protectedMeasureContent(measure.node));
  const pairs: Paired[] = [];
  for (const donor of donors) {
    if (!validId(donor.id) || donor.id === base.id || donor.id === independent.id) continue;
    const score = parseScore(donor.xml);
    const pair = score && pairCandidate(base, baseScore, donor, score);
    if (pair && independentMatches(score!, witnessScore)) pairs.push(pair);
    else rejected.push({ code: "DONOR_ALIGNMENT_REJECTED", detail: `Candidato ${donor.id}: sem alinhamento espacial e leitura independente inequívocos.` });
  }
  if (pairs.length !== 1) {
    rejected.push({ code: "DONOR_AMBIGUOUS", detail: "A reconciliação requer exatamente um doador alinhado nesta página." });
    return finish(base.xml);
  }
  const pair = pairs[0];
  const { donor, score: donorScore, insertion } = pair;
  const baseAnchors = anchorMap(base, baseScore.measures.length)!;
  const donorAnchors = anchorMap(donor, donorScore.measures.length)!;
  const positionSafe = (baseIndex: number, donorIndex: number): boolean => {
    const quality = overlap(baseAnchors[baseIndex], donorAnchors[donorIndex]);
    const prior = baseIndex > 0 ? overlap(baseAnchors[baseIndex - 1], donorAnchors[donorIndex]) : 0;
    const next = baseIndex + 1 < baseAnchors.length ? overlap(baseAnchors[baseIndex + 1], donorAnchors[donorIndex]) : 0;
    return quality >= 0.42 && quality >= Math.max(prior, next) + 0.08;
  };

  if (insertion !== undefined) {
    const missing = donorScore.measures[insertion];
    const independentMissing = witnessScore.measures[insertion];
    const previous = baseScore.measures[insertion - 1];
    const next = baseScore.measures[insertion];
    const donorPrevious = donorScore.measures[insertion - 1];
    const donorNext = donorScore.measures[insertion + 1];
    const baseLabels = baseScore.measures.map((measure) => Number(measure.label));
    const donorLabels = donorScore.measures.map((measure) => Number(measure.label));
    const consecutive = baseLabels.every((number, index) => Number.isSafeInteger(number) && (index === 0 || number === baseLabels[index - 1] + 1))
      && donorLabels.every((number, index) => Number.isSafeInteger(number) && (index === 0 || number === donorLabels[index - 1] + 1))
      && baseLabels.every((number, index) => number === donorLabels[pair.mapping[index]] - (index >= insertion ? 1 : 0));
    const neighbours = previous.simple && next.simple && donorPrevious.simple && donorNext.simple
      && positionSafe(insertion - 1, insertion - 1) && positionSafe(insertion, insertion + 1)
      && eventSimilarity(previous, donorPrevious) >= 0.8 && eventSimilarity(next, donorNext) >= 0.65;
    const safe = consecutive && neighbours && missing.simple && independentMissing.simple && durationClosed(missing)
      && durationClosed(independentMissing) && near(missing.expected!, independentMissing.expected!)
      && sameNotes(missing, independentMissing) && missing.divisions === previous.divisions && missing.divisions === next.divisions
      && missing.events.every((event) => safeDonorNote(event, true)) && containedSlurs(missing)
      && !children(missing.node, "barline").length && !children(missing.node, "attributes").length;
    if (safe) {
      const inserted = baseScore.document.createElement("measure");
      inserted.setAttribute("number", missing.label);
      for (const [eventIndex, event] of missing.events.entries()) {
        const imported = baseScore.document.importNode(event.node, true);
        stripUncorroboratedMarks(imported, independentMissing.events[eventIndex]);
        inserted.appendChild(imported);
      }
      baseScore.part.insertBefore(inserted, next.node);
      for (let index = insertion; index < baseScore.measures.length; index++) {
        baseScore.measures[index].node.setAttribute("number", donorScore.measures[index + 1].label);
      }
      history.push({ kind: "insert_measure", measureIndex: insertion, measure: missing.label,
        donorId: donor.id, independentId: independent.id, detail: "Compasso fonte confirmado por caixa espacial, vizinhos monotônicos, métrica e eventos independentes; apenas notas/pausas importadas." });
    } else rejected.push({ code: "MEASURE_INSERTION_REJECTED", measureIndex: insertion, detail: "Compasso adicional não passou todas as guardas espaciais, musicais e de numeração." });
  }

  // Use the same page-local position map for all local edits. Never replace a whole donor measure.
  for (const [baseIndex, donorIndex] of pair.mapping.entries()) {
    const current = baseScore.measures[baseIndex];
    const alternate = donorScore.measures[donorIndex];
    const witness = witnessScore.measures[donorIndex];
    if (!current.simple || !alternate.simple || !witness.simple || !positionSafe(baseIndex, donorIndex)
      || !near(current.expected ?? NaN, alternate.expected ?? NaN)
      || !near(current.expected ?? NaN, witness.expected ?? NaN)) continue;

    // Establish an explicit initial key at its real source position, with two different readers.
    if (baseIndex === 0 && current.explicitKey !== alternate.explicitKey && alternate.explicitKey !== undefined
      && alternate.explicitKey === witness.explicitKey && alternate.explicitKey !== 0) {
      const conflictingEarlyKey = baseScore.measures.slice(1).find((measure) => measure.explicitKey !== undefined
        && measure.explicitKey !== alternate.explicitKey);
      if (!conflictingEarlyKey && current.node && keyRegionAgrees(baseScore, donorScore, witnessScore, pair.mapping, alternate.explicitKey)) {
        let attributes = children(current.node, "attributes")[0];
        if (attributes) {
          let keyNode = first(attributes, "key");
          if (!keyNode) {
            keyNode = baseScore.document.createElement("key");
            attributes.insertBefore(keyNode, first(attributes, "time") ?? first(attributes, "clef") ?? null);
          }
          let fifths = first(keyNode, "fifths");
          if (!fifths) { fifths = baseScore.document.createElement("fifths"); keyNode.appendChild(fifths); }
          fifths.textContent = String(alternate.explicitKey);
          history.push({ kind: "set_initial_key", measureIndex: 0, measure: current.label,
            donorId: donor.id, independentId: independent.id, detail: `Armadura inicial ${alternate.explicitKey} confirmada no mesmo compasso por dois leitores.` });
        }
      }
    }

    const sourceTarget = witness.events;
    const baseEvents = current.events;
    const donorEvents = alternate.events;
    const baseClosed = durationClosed(current);
    const witnessClosed = durationClosed(witness);
    // One event can fill a proven metric deficit, with all existing events unchanged.
    const witnessRestAgainstDonor = donorEvents.length === baseEvents.length
      && baseEvents.every((event, index) => sameExceptAlter(event, donorEvents[index]))
      ? uniqueSingleInsertion(donorEvents, sourceTarget) : undefined;
    const insertionAt = !baseClosed && witnessClosed && current.expected !== undefined
      ? uniqueSingleInsertion(baseEvents, sourceTarget) ?? witnessRestAgainstDonor : undefined;
    if (insertionAt !== undefined && near(current.total + sourceTarget[insertionAt].duration, current.expected!)) {
      const donorAt = uniqueSingleInsertion(baseEvents, donorEvents);
      const sourceEvent = sourceTarget[insertionAt];
      const donorAgrees = donorAt === insertionAt && sameEvent(donorEvents[donorAt], sourceEvent);
      const allowedIndependentRest = sourceEvent.kind === "rest" && insertionAt === 0 && near(sourceEvent.onset, 0)
        && near(sourceEvent.duration, 0.5) && verifiedLeadingRestEvidence(input.sourceRestEvidence,
          base.sourceImageSha256, baseAnchors[baseIndex], baseIndex);
      if (donorAgrees || allowedIndependentRest) {
        const evidenceEvent = donorAgrees ? donorEvents[donorAt!] : sourceEvent;
        if (appendNoteAt(current, insertionAt, evidenceEvent, sourceEvent)) history.push({ kind: "insert_event", measureIndex: baseIndex,
          measure: current.node.getAttribute("number") ?? current.label, donorId: donor.id, independentId: independent.id,
          detail: `${sourceEvent.kind === "rest" ? "Pausa" : "Nota"} de ${sourceEvent.duration} tempo(s) no índice ${insertionAt}; caixa espacial, sequência restante e métrica conferidos${donorAgrees ? " com doador" : "; pausa inicial corroborada por molde de pixels da própria página"}.` });
      } else if (sourceEvent.kind === "rest") rejected.push({ code: "SOURCE_REST_PIXEL_EVIDENCE_REQUIRED", measureIndex: baseIndex,
        detail: "Leitor independente e déficit rítmico indicam pausa, mas o doador e a prova positiva de pixels não a confirmam." });
    }
    // Remove only an excess rest; no pitched event may move or change.
    const removalAt = !baseClosed && witnessClosed && current.expected !== undefined
      ? uniqueSingleInsertion(sourceTarget, baseEvents) : undefined;
    if (removalAt !== undefined && baseEvents[removalAt].kind === "rest"
      && near(current.total - baseEvents[removalAt].duration, current.expected!)) {
      const donorAgrees = sameNotes(alternate, witness);
      const nativeRestOrdinal = baseEvents.slice(0, removalAt).filter((event) => event.kind === "rest").length;
      // A native rest ordinal is safe to associate with XML only when this
      // measure has one rest; otherwise their export orders may differ.
      const nativeRestContradicted = baseEvents.filter((event) => event.kind === "rest").length === 1
        && verifiedContradictedRestEvidence(input.sourceRestEvidence,
          base.sourceImageSha256, baseAnchors[baseIndex], baseIndex, nativeRestOrdinal);
      if ((donorAgrees || nativeRestContradicted) && removeRest(current, removalAt)) history.push({ kind: "remove_rest", measureIndex: baseIndex,
        measure: current.node.getAttribute("number") ?? current.label, donorId: donor.id, independentId: independent.id,
        detail: `Pausa excedente de ${baseEvents[removalAt].duration} tempo(s) no índice ${removalAt}; sequência restante coincide com a fonte, métrica fecha${donorAgrees ? " e doador concorda" : " e o glifo nativo é contradito pelos pixels"}.` });
      else rejected.push({ code: "REST_REMOVAL_UNCORROBORATED", measureIndex: baseIndex,
        detail: "Pausa excede a métrica e leitor independente a omite, mas o doador não concorda com a remoção." });
    }

    // A source-first reader may have supplied the rest just inserted above. Match
    // its remaining notes by order without borrowing its changed onsets.
    const sourceOnlyRestAt = baseEvents.length + 1 === sourceTarget.length
      ? uniqueSingleInsertion(baseEvents, sourceTarget) ?? witnessRestAgainstDonor : undefined;
    const sourceIndexFor = (index: number): number => sourceOnlyRestAt === undefined ? index : index < sourceOnlyRestAt ? index : index + 1;
    if (baseEvents.length !== donorEvents.length
      || (baseEvents.length !== sourceTarget.length && (sourceOnlyRestAt === undefined || sourceTarget[sourceOnlyRestAt].kind !== "rest"))) continue;
    for (const [eventIndex, event] of baseEvents.entries()) {
      const other = donorEvents[eventIndex];
      const source = sourceTarget[sourceIndexFor(eventIndex)];
      if (!event || !other || !source || event.kind !== "note" || other.kind !== "note" || source.kind !== "note"
        || event.step !== other.step || event.step !== source.step || event.octave !== other.octave
        || event.octave !== source.octave || !near(event.duration, other.duration) || !near(event.duration, source.duration)
        || !near(event.onset, other.onset) || (sourceOnlyRestAt === undefined && !near(event.onset, source.onset))) continue;
      if (event.alter !== other.alter && other.alter === source.alter && !event.explicitAccidental && !other.explicitAccidental
        && !source.explicitAccidental && alternate.key === witness.key && alternate.key !== 0
        && keySteps(alternate.key).has(event.step!) && other.alter === Math.sign(alternate.key)
        && (current.key === alternate.key || history.some((change) => change.kind === "set_initial_key"))) {
        const pitch = first(event.node, "pitch")!;
        let alterNode = first(pitch, "alter");
        if (!alterNode) {
          alterNode = baseScore.document.createElement("alter");
          pitch.insertBefore(alterNode, first(pitch, "octave") ?? null);
        }
        alterNode.textContent = String(other.alter);
        history.push({ kind: "set_key_pitch", measureIndex: baseIndex, measure: current.node.getAttribute("number") ?? current.label,
          donorId: donor.id, independentId: independent.id,
          detail: `Alteração da nota ${eventIndex} concorda com a armadura e a leitura independente; nenhum acidente local explícito foi sobrescrito.` });
      }
      if (event.staccato && !event.fermata && other.fermata && !other.staccato && source.fermata && !source.staccato) {
        const notations = first(event.node, "notations");
        const articulation = notations && first(notations, "articulations");
        const staccato = articulation && first(articulation, "staccato");
        if (notations && articulation && staccato) {
          articulation.removeChild(staccato);
          if (!children(articulation).length) notations.removeChild(articulation);
          const fermata = baseScore.document.createElement("fermata");
          fermata.setAttribute("type", "upright");
          notations.insertBefore(fermata, notations.firstChild);
          history.push({ kind: "replace_pause_mark", measureIndex: baseIndex,
            measure: current.node.getAttribute("number") ?? current.label, donorId: donor.id, independentId: independent.id,
            detail: `Staccato da nota ${eventIndex} substituído pela fermata lida por ambos os leitores.` });
        }
      }
    }
  }

  if (!history.length) return finish(base.xml);
  const output = new XMLSerializer().serializeToString(baseScore.document);
  const reparsed = parseScore(output);
  const insertedAt = history.find((change) => change.kind === "insert_measure")?.measureIndex;
  const touched = new Set(history.filter((change) => change.kind !== "insert_measure").map((change) => change.measureIndex));
  const structurePreserved = Boolean(reparsed) && baseScore.measures.every((_, index) => {
    const outputMeasure = reparsed!.measures[index + (insertedAt !== undefined && index >= insertedAt ? 1 : 0)];
    return outputMeasure && protectedMeasureContent(outputMeasure.node) === originalProtectedContent[index]
      && (touched.has(index) || measureWithoutNumber(outputMeasure.node) === originalMeasureText[index]);
  });
  if (!reparsed || reparsed.measures.length !== baseScore.measures.length + (insertedAt !== undefined ? 1 : 0)
    || !structurePreserved
    || !noNewValidationRegression(base.xml, output, history)) {
    rejected.push({ code: "POST_PATCH_VALIDATION_FAILED", detail: "A saída introduziu risco estrutural ou rítmico; todas as alterações foram revertidas." });
    history.length = 0;
    return finish(base.xml);
  }
  return finish(output);
}
