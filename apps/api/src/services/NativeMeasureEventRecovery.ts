import { createHash } from "node:crypto";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { inspectMusicXmlValidation } from "./MusicXmlValidation.js";

type Box = { left: number; top: number; width: number; height: number };
export type NativeHeadEvidence = { id: string; rectangle: Box; grade: number; sourceInkRatio: number };
export type NativeMeasureEvidence = {
  measureIndex: number; systemIndex: number; rectangle: Box; sourceWidth: number; sourceHeight: number;
  abnormal: boolean; heads: NativeHeadEvidence[];
};
export type NativeEventCandidate = {
  id: string; xml: string; sourceImageSha256: string; measures: NativeMeasureEvidence[];
};
export type NativeEventRecoveryReport = {
  version: 1; experimental: true; accuracyVerified: false; trainingEligible: false; requiresReview: true;
  baseId: string; sourceImageSha256: string; baseXmlSha256: string; outputXmlSha256: string;
  changes: Array<{ measureIndex: number; measure: string; donorId: string; sourceRectangle: Box;
    nativeHeads: NativeHeadEvidence[]; nativeHeadIds: string[]; baseEvents: number; outputEvents: number;
    basePitchedNotes: number; recoveredPitchedNotes: number; omittedDonorNotationTags: string[] }>;
  rejected: Array<{ code: string; measureIndex?: number; donorId?: string }>;
};
type Event = { node: Element; key: string; pitched: boolean; grace: boolean; duration: number };
type Parsed = { document: Document; part: Element; measures: Element[]; labels: string[]; divisions: number;
  events: Event[][]; contexts: string[]; partId: string };

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const name = (element: Node): string => (element as Element).localName || element.nodeName.split(":").at(-1) || element.nodeName;
const children = (element: Node, tag?: string): Element[] => Array.from(element.childNodes)
  .filter((node): node is Element => node.nodeType === 1 && (!tag || name(node) === tag));
const first = (element: Node, tag: string): Element | undefined => children(element, tag)[0];
const value = (element: Node, tag: string): string => first(element, tag)?.textContent?.trim() ?? "";
const validHash = (text: string): boolean => /^[a-f0-9]{64}$/.test(text);
const hardIssue = new Set(["RHYTHM_LONG", "RHYTHM_SHORT", "RHYTHM_INVALID_POSITION", "VOICE_EARLY_END"]);
const contextTags = new Set(["key", "time", "clef", "staves", "transpose"]);
const structural = (element: Element): unknown => [name(element),
  Array.from({ length: element.attributes.length }, (_, index) => element.attributes.item(index)!)
    .map((attribute) => [attribute.name, attribute.value]).sort(([left], [right]) => left.localeCompare(right)),
  children(element).length ? children(element).map(structural) : element.textContent?.trim() ?? ""];

function parse(xml: string): Parsed | null {
  if (Buffer.byteLength(xml, "utf8") > 8 * 1024 * 1024 || /<!ENTITY\b|<!DOCTYPE\b[^>]*\[/i.test(xml)) return null;
  const errors: string[] = [];
  try {
    const document = new DOMParser({ errorHandler: {
      warning: (message) => errors.push(String(message)), error: (message) => errors.push(String(message)),
      fatalError: (message) => errors.push(String(message))
    } }).parseFromString(xml, "application/xml");
    const root = document.documentElement;
    if (errors.length || !root || name(root) !== "score-partwise") return null;
    const parts = children(root, "part");
    const declarations = children(first(root, "part-list") ?? root, "score-part");
    if (parts.length !== 1 || declarations.length !== 1 || !parts[0].getAttribute("id")
      || parts[0].getAttribute("id") !== declarations[0].getAttribute("id")) return null;
    const measures = children(parts[0], "measure");
    if (!measures.length || measures.length > 200) return null;
    const labels: string[] = [];
    const events: Event[][] = [];
    let divisions: number | undefined;
    const contexts: string[] = [];
    const effectiveContext = new Map<string, unknown>();
    for (const measure of measures) {
      const label = measure.getAttribute("number") ?? "";
      if (!label || labels.includes(label)) return null;
      labels.push(label);
      contexts.push(JSON.stringify([...effectiveContext].sort(([left], [right]) => left.localeCompare(right))));
      const local: Event[] = [];
      for (const item of children(measure)) {
        const tag = name(item);
        if (tag === "attributes") {
          const declared = first(item, "divisions") ? Number(value(item, "divisions")) : undefined;
          if (declared !== undefined) {
            if (!Number.isSafeInteger(declared) || declared < 1 || declared > 100000
              || divisions !== undefined && divisions !== declared) return null;
            divisions = declared;
          }
          for (const child of children(item)) if (contextTags.has(name(child)))
            effectiveContext.set(name(child), structural(child));
          continue;
        }
        if (tag === "backup" || tag === "forward") {
          if (!divisions || !Number.isSafeInteger(Number(value(item, "duration"))) || Number(value(item, "duration")) < 1) return null;
          continue;
        }
        if (tag !== "note") continue;
        const pitch = first(item, "pitch");
        const rest = first(item, "rest");
        const grace = Boolean(first(item, "grace"));
        if (Boolean(pitch) === Boolean(rest) || first(item, "staff") && value(item, "staff") !== "1") return null;
        const duration = grace ? 0 : Number(value(item, "duration"));
        if (!divisions || !Number.isSafeInteger(duration) || duration < 0 || !grace && duration === 0) return null;
        const voice = value(item, "voice") || "1";
        if (!/^\d{1,3}$/.test(voice)) return null;
        const key = pitch ? `N:${voice}:${value(pitch, "step")}:${value(pitch, "alter") || "0"}:${value(pitch, "octave")}:${grace}`
          : `R:${voice}:${grace}`;
        if (pitch && (!/^[A-G]$/.test(value(pitch, "step")) || !/^-?[012]$/.test(value(pitch, "alter") || "0")
          || !/^[0-9]$/.test(value(pitch, "octave")))) return null;
        local.push({ node: item, key, pitched: Boolean(pitch), grace, duration });
      }
      events.push(local);
    }
    if (!divisions) return null;
    return { document, part: parts[0], measures, labels, divisions, events, contexts,
      partId: parts[0].getAttribute("id")! };
  } catch { return null; }
}

function overlap(a: Box, b: Box): number {
  const width = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  return width * height / Math.min(a.width * a.height, b.width * b.height);
}
function multisetSubset(base: Event[], donor: Event[]): boolean {
  const remaining = donor.map((event) => event.key);
  return base.every((event) => { const index = remaining.indexOf(event.key);
    if (index < 0) return false;
    remaining.splice(index, 1); return true; });
}
function protectedContent(measure: Element): string {
  return children(measure).filter((element) => !["note", "backup", "forward"].includes(name(element)))
    .map((element) => JSON.stringify(name(element) === "attributes"
      ? ["attributes", children(element).filter((child) => name(child) !== "divisions").map(structural)]
      : structural(element))).join("\u0000");
}
function validBox(rectangle: Box, native: NativeMeasureEvidence): boolean {
  return [rectangle.left, rectangle.top, rectangle.width, rectangle.height, native.sourceWidth, native.sourceHeight].every(Number.isFinite)
    && rectangle.width > 0 && rectangle.height > 0 && rectangle.left >= 0 && rectangle.top >= 0
    && rectangle.left + rectangle.width <= native.sourceWidth + 1
    && rectangle.top + rectangle.height <= native.sourceHeight + 1;
}
function safeNative(native: NativeMeasureEvidence, index: number, pitchedNotes: number): boolean {
  if (native.measureIndex !== index || native.systemIndex < 0 || !Number.isSafeInteger(native.systemIndex)
    || !Number.isSafeInteger(native.sourceWidth) || !Number.isSafeInteger(native.sourceHeight)
    || native.sourceWidth < 1 || native.sourceHeight < 1 || !validBox(native.rectangle, native)
    || native.heads.length !== pitchedNotes || !native.heads.length || native.heads.length > 128) return false;
  const ids = new Set(native.heads.map((head) => head.id));
  return ids.size === native.heads.length && native.heads.every((head) => /^\d+$/.test(head.id)
    && head.grade >= 0.35 && head.grade <= 1 && head.sourceInkRatio >= 0.06 && head.sourceInkRatio <= 1
    && validBox(head.rectangle, native)
    && head.rectangle.left >= native.rectangle.left - 2
    && head.rectangle.left + head.rectangle.width <= native.rectangle.left + native.rectangle.width + 2
    && head.rectangle.top >= native.rectangle.top - native.rectangle.height * 3
    && head.rectangle.top + head.rectangle.height <= native.rectangle.top + native.rectangle.height * 4);
}
function headPositionsMatchExport(native: NativeMeasureEvidence, events: Event[]): boolean {
  const pitched = events.filter((event) => event.pitched);
  if (pitched.some((event) => !event.node.hasAttribute("default-x"))) return false;
  const exported = pitched.map((event) => Number(event.node.getAttribute("default-x")));
  if (exported.length !== native.heads.length || exported.some((position) => !Number.isFinite(position))) return false;
  const observed = native.heads.map((head) => head.rectangle.left + head.rectangle.width / 2).sort((a, b) => a - b);
  exported.sort((a, b) => a - b);
  const observedSpan = observed.at(-1)! - observed[0];
  const exportedSpan = exported.at(-1)! - exported[0];
  if (observedSpan < 4 || exportedSpan < 4) return false;
  return observed.every((position, index) => Math.abs(
    (position - observed[0]) / observedSpan - (exported[index] - exported[0]) / exportedSpan
  ) <= 0.16);
}
function safeMarks(note: Element): boolean {
  const preservedOrReplaceable = new Set(["chord", "grace", "pitch", "rest", "duration", "voice", "type", "dot", "accidental", "stem", "beam", "staff", "notations", "lyric"]);
  return children(note).every((child) => preservedOrReplaceable.has(name(child)))
    && !children(note, "tie").length && !Array.from(note.getElementsByTagName("tied")).length
    && !Array.from(note.getElementsByTagName("slur")).length
    && !children(note, "time-modification").length && !children(note, "cue").length;
}
function safeDonorNote(note: Element): boolean {
  const allowed = new Set(["chord", "grace", "pitch", "rest", "duration", "voice", "type", "dot", "accidental", "stem", "beam", "staff"]);
  if (children(note).some((child) => !allowed.has(name(child)) && !["notations", "lyric"].includes(name(child)))) return false;
  const safeNotation = new Set(["slur", "articulations", "technical", "ornaments", "dynamics", "fermata", "arpeggiate", "non-arpeggiate", "accidental-mark", "other-notation"]);
  return children(note, "notations").every((notations) => children(notations).every((child) => safeNotation.has(name(child))))
    && !Array.from(note.getElementsByTagName("tied")).length
    && !Array.from(note.getElementsByTagName("tuplet")).length
    && !Array.from(note.getElementsByTagName("tremolo")).length;
}
function stripDonorMarks(note: Element, tags: Set<string>): void {
  for (const child of children(note)) if (["notations", "lyric"].includes(name(child))) {
    tags.add(name(child)); note.removeChild(child);
  }
}
function hasInterleavedSemantics(measure: Element): boolean {
  const all = children(measure);
  const eventIndexes = all.flatMap((element, index) => ["note", "backup", "forward"].includes(name(element)) ? [index] : []);
  if (!eventIndexes.length) return true;
  return all.slice(eventIndexes[0], eventIndexes.at(-1)! + 1)
    .some((element) => !["note", "backup", "forward"].includes(name(element)));
}
function changeEvents(base: Parsed, donor: Parsed, index: number): { xml: string; omitted: string[] } | null {
  const baseMeasure = base.measures[index];
  const donorMeasure = donor.measures[index];
  if (protectedContent(baseMeasure) !== protectedContent(donorMeasure)
    || children(donorMeasure, "forward").length || children(baseMeasure, "forward").length
    || hasInterleavedSemantics(baseMeasure) || hasInterleavedSemantics(donorMeasure)) return null;
  const donorKeys = donor.events[index].map((event) => event.key);
  if (new Set(donorKeys).size !== donorKeys.length || donor.events[index].some((event) => !safeDonorNote(event.node))) return null;
  const matched = new Map<string, Element>();
  for (const event of base.events[index]) {
    if (!safeMarks(event.node) || matched.has(event.key)) return null;
    matched.set(event.key, event.node);
  }
  const omitted = new Set<string>();
  const replacements: Element[] = [];
  for (const item of children(donorMeasure).filter((element) => ["note", "backup"].includes(name(element)))) {
    const cloned = base.document.importNode(item, true) as Element;
    const duration = first(cloned, "duration");
    if (duration) {
      const ticks = Number(duration.textContent?.trim());
      const scaled = ticks * base.divisions / donor.divisions;
      if (!Number.isSafeInteger(scaled) || scaled < 1) return null;
      duration.textContent = String(scaled);
    }
    if (name(cloned) === "note") {
      const sourceEvent = donor.events[index].find((event) => event.node === item);
      if (!sourceEvent) return null;
      stripDonorMarks(cloned, omitted);
      const original = matched.get(sourceEvent.key);
      if (original) {
        if (children(original, "notations").length || children(original, "lyric").length) {
          const previousX = Number(original.getAttribute("default-x"));
          const nextX = Number(cloned.getAttribute("default-x"));
          if (!original.hasAttribute("default-x") || !cloned.hasAttribute("default-x")
            || !Number.isFinite(previousX) || !Number.isFinite(nextX) || Math.abs(previousX - nextX) > 6) return null;
        }
        for (const tag of ["notations", "lyric"]) for (const child of children(original, tag)) cloned.appendChild(base.document.importNode(child, true));
        matched.delete(sourceEvent.key);
      }
    }
    replacements.push(cloned);
  }
  if (matched.size) return null;
  const old = children(baseMeasure).filter((element) => ["note", "backup"].includes(name(element)));
  if (!old.length) return null;
  const anchor = old[0];
  for (const replacement of replacements) baseMeasure.insertBefore(replacement, anchor);
  for (const item of old) baseMeasure.removeChild(item);
  return { xml: new XMLSerializer().serializeToString(base.document), omitted: [...omitted].sort() };
}

/** Experimental event-layer recovery. It never reads the reviewed score or an expected note count. */
export function recoverNativeMeasureEvents(input: { base: NativeEventCandidate; donors: NativeEventCandidate[] }): {
  musicXml: string; report: NativeEventRecoveryReport;
} {
  const base = parse(input.base.xml);
  const rejected: NativeEventRecoveryReport["rejected"] = [];
  const options: Array<{ index: number; donor: NativeEventCandidate; parsed: Parsed; baseNative: NativeMeasureEvidence; donorNative: NativeMeasureEvidence }> = [];
  if (base && validHash(input.base.sourceImageSha256) && input.base.measures.length === base.measures.length) {
    for (const donor of input.donors) {
      const parsed = parse(donor.xml);
      if (!parsed || donor.sourceImageSha256 !== input.base.sourceImageSha256
        || donor.measures.length !== base.measures.length || parsed.measures.length !== base.measures.length
        || parsed.partId !== base.partId || JSON.stringify(parsed.labels) !== JSON.stringify(base.labels)) {
        rejected.push({ code: "SOURCE_OR_METADATA_MISMATCH", donorId: donor.id }); continue;
      }
      for (let index = 0; index < base.measures.length; index++) {
        const original = input.base.measures[index]; const alternative = donor.measures[index];
        if (!original?.abnormal || alternative?.abnormal) continue;
        if (base.contexts[index] !== parsed.contexts[index]) {
          rejected.push({ code: "SOURCE_OR_METADATA_MISMATCH", donorId: donor.id, measureIndex: index }); continue;
        }
        const baseEvents = base.events[index]; const donorEvents = parsed.events[index];
        const basePitched = baseEvents.filter((event) => event.pitched).length;
        const donorPitched = donorEvents.filter((event) => event.pitched).length;
        if (donorPitched <= basePitched || !multisetSubset(baseEvents, donorEvents)
          || donorEvents.filter((event) => !event.pitched).length > baseEvents.filter((event) => !event.pitched).length
          || original.measureIndex !== index || original.systemIndex !== alternative.systemIndex
          || original.sourceWidth !== alternative.sourceWidth || original.sourceHeight !== alternative.sourceHeight
          || !Number.isSafeInteger(original.sourceWidth) || !Number.isSafeInteger(original.sourceHeight)
          || original.sourceWidth < 1 || original.sourceHeight < 1
          || !validBox(original.rectangle, original) || !validBox(alternative.rectangle, alternative)
          || new Set(original.heads.map((head) => head.id)).size !== original.heads.length
          || original.heads.some((head) => !/^\d+$/.test(head.id) || !validBox(head.rectangle, original)
            || !Number.isFinite(head.grade) || head.grade < 0 || head.grade > 1
            || !Number.isFinite(head.sourceInkRatio) || head.sourceInkRatio < 0 || head.sourceInkRatio > 1)
          || overlap(original.rectangle, alternative.rectangle) < 0.8
          || !safeNative(alternative, index, donorPitched)
          || !headPositionsMatchExport(alternative, donorEvents)
          || original.heads.length < basePitched) {
          rejected.push({ code: "EVENT_OR_SOURCE_GUARD", donorId: donor.id, measureIndex: index }); continue;
        }
        const donorValidation = inspectMusicXmlValidation(donor.xml, { scope: "page" });
        if (donorValidation.issues.some((issue) => hardIssue.has(issue.code) && issue.measure === parsed.labels[index])) {
          rejected.push({ code: "DONOR_RHYTHM_INVALID", donorId: donor.id, measureIndex: index }); continue;
        }
        options.push({ index, donor, parsed, baseNative: original, donorNative: alternative });
      }
    }
  } else rejected.push({ code: "BASE_INVALID" });
  let musicXml = input.base.xml;
  const changes: NativeEventRecoveryReport["changes"] = [];
  if (base && options.length === 1) {
    const option = options[0];
    const changed = changeEvents(base, option.parsed, option.index);
    if (changed) {
      const beforeIssues = inspectMusicXmlValidation(input.base.xml, { scope: "page" }).issues;
      const afterIssues = inspectMusicXmlValidation(changed.xml, { scope: "page" }).issues;
      const tracked = (issue: typeof beforeIssues[number]): boolean => issue.severity === "error" || hardIssue.has(issue.code);
      const issueKey = (issue: typeof beforeIssues[number]): string => `${issue.code}:${issue.partId ?? ""}:${issue.measure ?? ""}`;
      const existing = new Map<string, number>();
      for (const issue of beforeIssues.filter(tracked)) existing.set(issueKey(issue), (existing.get(issueKey(issue)) ?? 0) + 1);
      const introduced = afterIssues.filter(tracked).some((issue) => {
        const key = issueKey(issue); const count = existing.get(key) ?? 0;
        if (count <= 0) return true;
        existing.set(key, count - 1); return false;
      });
      if (!introduced) {
        musicXml = changed.xml;
        changes.push({ measureIndex: option.index, measure: base.labels[option.index], donorId: option.donor.id,
          sourceRectangle: option.donorNative.rectangle, nativeHeads: option.donorNative.heads,
          nativeHeadIds: option.donorNative.heads.map((head) => head.id),
          baseEvents: base.events[option.index].length, outputEvents: option.parsed.events[option.index].length,
          basePitchedNotes: base.events[option.index].filter((event) => event.pitched).length,
          recoveredPitchedNotes: option.parsed.events[option.index].filter((event) => event.pitched).length - base.events[option.index].filter((event) => event.pitched).length,
          omittedDonorNotationTags: changed.omitted });
      } else rejected.push({ code: "OUTPUT_VALIDATION_REGRESSION", donorId: option.donor.id, measureIndex: option.index });
    } else rejected.push({ code: "UNSAFE_NOTATIONS_OR_TIMING", donorId: option.donor.id, measureIndex: option.index });
  } else if (options.length > 1) rejected.push({ code: "MULTIPLE_ELIGIBLE_MEASURES" });
  const report: NativeEventRecoveryReport = { version: 1, experimental: true, accuracyVerified: false, trainingEligible: false,
    requiresReview: true, baseId: input.base.id, sourceImageSha256: input.base.sourceImageSha256,
    baseXmlSha256: sha256(input.base.xml), outputXmlSha256: sha256(musicXml), changes, rejected };
  return { musicXml, report };
}
