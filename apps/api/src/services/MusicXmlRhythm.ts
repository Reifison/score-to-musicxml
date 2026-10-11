import { DOMParser } from "@xmldom/xmldom";

export type RhythmIssue = {
  partId: string;
  partName: string;
  measure: string;
  kind: "short" | "long" | "invalid-position";
  expectedQuarterBeats: number | null;
  actualQuarterBeats: number;
};

export type RhythmInspection = {
  checkedMeasures: number;
  skippedMeasures: number;
  issues: RhythmIssue[];
  warnings: string[];
};

const elements = (parent: Node): Element[] => Array.from(parent.childNodes).filter((node): node is Element => node.nodeType === 1);
const named = (parent: Node, name: string): Element[] => elements(parent).filter((node) => (node.localName || node.nodeName) === name);
const textOf = (parent: Node, name: string): string => named(parent, name)[0]?.textContent?.trim() ?? "";
const positive = (value: string): number | null => {
  const number = Number(value);
  return value && Number.isFinite(number) && number > 0 ? number : null;
};
const EPSILON = 1e-7;

function meterLength(time: Element): number | null {
  if (named(time, "senza-misura").length) return null;
  const beats = named(time, "beats");
  const units = named(time, "beat-type");
  if (!beats.length || beats.length !== units.length) return null;
  let total = 0;
  for (let index = 0; index < beats.length; index++) {
    const groups = (beats[index].textContent ?? "").split("+").map((group) => positive(group.trim()));
    const unit = positive(units[index].textContent?.trim() ?? "");
    if (!unit || groups.some((group) => group === null)) return null;
    total += groups.reduce<number>((sum, group) => sum + group!, 0) * 4 / unit;
  }
  return total;
}

const display = (number: number): string => Number(number.toFixed(4)).toLocaleString("pt-BR");

/** Advisory check of the part timeline, not a comparison against the source score.
 * Durations already include tuplets; chord members share an onset and do not advance
 * the cursor. Short individual voices are legitimate, so only the full part span
 * is compared with its meter. Ambiguous/unmetered measures remain unchecked.
 */
export function inspectMusicXmlRhythm(xml: string): RhythmInspection {
  const report: RhythmInspection = { checkedMeasures: 0, skippedMeasures: 0, issues: [], warnings: [] };
  const errors: string[] = [];
  let document: Document | undefined;
  try {
    document = new DOMParser({ errorHandler: {
      warning: (message) => errors.push(String(message)),
      error: (message) => errors.push(String(message)),
      fatalError: (message) => errors.push(String(message))
    } }).parseFromString(xml, "application/xml");
  } catch { errors.push("parse-failed"); }
  const root = document?.documentElement;
  if (errors.length || !root || (root.localName || root.nodeName) !== "score-partwise") {
    report.warnings.push("Não foi possível verificar a duração dos compassos deste MusicXML. Revise o ritmo na partitura original.");
    return report;
  }
  const names = new Map(named(named(root, "part-list")[0] ?? root, "score-part").map((part) => [part.getAttribute("id") ?? "", textOf(part, "part-name")]));
  for (const part of named(root, "part")) {
    const partId = part.getAttribute("id") ?? "";
    const partName = names.get(partId) || partId || "Parte instrumental";
    let divisions: number | null = null;
    let meter: number | null = null;
    for (const measure of named(part, "measure")) {
      let cursor = 0;
      let end = 0;
      let previousOnset: number | null = null;
      let minimum = 0;
      let timedEvents = 0;
      let verifiable = measure.getAttribute("implicit") !== "yes" && measure.getAttribute("non-controlling") !== "yes";
      for (const element of elements(measure)) {
        const name = element.localName || element.nodeName;
        if (name === "attributes") {
          if (named(element, "divisions").length) divisions = positive(textOf(element, "divisions"));
          const times = named(element, "time");
          if (times.length) {
            const lengths = times.map(meterLength);
            // Different staff meters and changes inside a bar need a richer model.
            meter = times.every((time) => !time.hasAttribute("number")) && lengths.every((length) => length !== null && Math.abs(length - lengths[0]!) < EPSILON) ? lengths[0] : null;
            if (timedEvents) verifiable = false;
          }
          continue;
        }
        if (!["note", "backup", "forward"].includes(name)) continue;
        if (name === "note" && named(element, "grace").length) continue;
        const duration = positive(textOf(element, "duration"));
        if (!duration || !divisions) { verifiable = false; continue; }
        timedEvents++;
        const beats = duration / divisions;
        if (name === "backup") {
          cursor -= beats;
          minimum = Math.min(minimum, cursor);
          previousOnset = null;
        } else if (name === "forward") {
          cursor += beats;
          end = Math.max(end, cursor);
          previousOnset = null;
        } else if (named(element, "chord").length) {
          if (previousOnset === null) verifiable = false;
          else end = Math.max(end, previousOnset + beats);
        } else {
          previousOnset = cursor;
          cursor += beats;
          end = Math.max(end, cursor);
        }
      }
      if (!verifiable || !meter || !timedEvents) { report.skippedMeasures++; continue; }
      report.checkedMeasures++;
      const base = { partId, partName, measure: measure.getAttribute("number") || "?", expectedQuarterBeats: meter, actualQuarterBeats: end };
      if (minimum < -EPSILON) report.issues.push({ ...base, kind: "invalid-position" });
      else if (Math.abs(end - meter) > EPSILON) report.issues.push({ ...base, kind: end < meter ? "short" : "long" });
    }
  }
  report.warnings = report.issues.slice(0, 20).map((issue) => issue.kind === "invalid-position"
    ? `Revisão rítmica: compasso ${issue.measure} (${issue.partName}) tem vozes posicionadas antes do início do compasso. Confira o original.`
    : `Revisão rítmica: compasso ${issue.measure} (${issue.partName}) ocupa ${display(issue.actualQuarterBeats)} de ${display(issue.expectedQuarterBeats!)} tempos de semínima previstos. Confira notas, pausas e vozes no original.`);
  if (report.issues.length > 20) report.warnings.push(`Há mais ${report.issues.length - 20} compassos com duração a revisar.`);
  return report;
}
