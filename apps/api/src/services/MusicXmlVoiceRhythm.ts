import { DOMParser } from "@xmldom/xmldom";

export type VoiceCheck = {
  partId: string;
  measure: string;
  staff: number;
  voice: string;
  start: number;
  end: number;
  durationsTotal: number;
  implicitGaps: Array<{ start: number; end: number }>;
};

export type VoiceRhythmIssue = {
  code: "VOICE_EARLY_END" | "WRITTEN_DURATION_MISMATCH";
  severity: "warning";
  message: string;
  partId: string;
  measure: string;
};

export type VoiceRhythmInspection = {
  voiceChecks: VoiceCheck[];
  issues: VoiceRhythmIssue[];
  checkedMeasures: number;
  skippedMeasures: number;
};

type VoiceState = {
  staff: number;
  voice: string;
  intervals: Array<{ start: number; end: number }>;
  durationsTotal: number;
  lastNoteOnset: number | null;
  lastEventKind: "note" | "rest" | "forward" | null;
  noteCount: number;
};

const EPSILON = 1e-7;
const elements = (parent: Node): Element[] => Array.from(parent.childNodes).filter((node): node is Element => node.nodeType === 1);
const named = (parent: Node, name: string): Element[] => elements(parent).filter((element) => (element.localName || element.nodeName) === name);
const textOf = (parent: Node, name: string): string => named(parent, name)[0]?.textContent?.trim() ?? "";
const positive = (text: string): number | null => {
  const value = Number(text);
  return text && Number.isFinite(value) && value > 0 ? value : null;
};

const noteLengths: Record<string, number> = {
  maxima: 32, long: 16, breve: 8, whole: 4, half: 2, quarter: 1,
  eighth: 0.5, "16th": 0.25, "32nd": 0.125, "64th": 0.0625,
  "128th": 0.03125, "256th": 0.015625, "512th": 0.0078125, "1024th": 0.00390625
};

function meterLength(time: Element): number | null {
  if (named(time, "senza-misura").length || time.hasAttribute("number")) return null;
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

function writtenDurationUnits(note: Element, divisions: number): number | null {
  const base = noteLengths[textOf(note, "type")];
  if (!base) return null;
  const dots = named(note, "dot").length;
  const dotted = base * (2 - 2 ** -dots);
  const modification = named(note, "time-modification")[0];
  if (!modification) return dotted * divisions;
  const actual = positive(textOf(modification, "actual-notes"));
  const normal = positive(textOf(modification, "normal-notes"));
  return actual && normal ? dotted * normal / actual * divisions : null;
}

function gaps(intervals: VoiceState["intervals"], meter: number | null): Array<{ start: number; end: number }> {
  const ordered = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  const result: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const interval of ordered) {
    if (interval.start > cursor + EPSILON) result.push({ start: cursor, end: interval.start });
    cursor = Math.max(cursor, interval.end);
  }
  if (meter !== null && meter > cursor + EPSILON) result.push({ start: cursor, end: meter });
  return result;
}

/** Advisory voice timelines and written-duration consistency; no PDF comparison or XML mutation. */
export function inspectMusicXmlVoiceRhythm(xml: string): VoiceRhythmInspection {
  const report: VoiceRhythmInspection = { voiceChecks: [], issues: [], checkedMeasures: 0, skippedMeasures: 0 };
  let root: Element | null = null;
  try { root = new DOMParser().parseFromString(xml, "application/xml").documentElement; } catch { return report; }
  if (!root || (root.localName || root.nodeName) !== "score-partwise") return report;

  for (const part of named(root, "part")) {
    const partId = part.getAttribute("id") ?? "";
    let divisions: number | null = null;
    let meter: number | null = null;
    for (const measure of named(part, "measure")) {
      const measureNumber = measure.getAttribute("number") || "?";
      const voices = new Map<string, VoiceState>();
      let cursor = 0;
      let previousOnset: number | null = null;
      let timedEvents = 0;
      let ambiguous = measure.getAttribute("implicit") === "yes" || measure.getAttribute("non-controlling") === "yes";
      let unvoicedForward = false;
      const getVoice = (staff: number, voice: string): VoiceState => {
        const key = `${staff}\0${voice}`;
        let state = voices.get(key);
        if (!state) {
          state = { staff, voice, intervals: [], durationsTotal: 0, lastNoteOnset: null, lastEventKind: null, noteCount: 0 };
          voices.set(key, state);
        }
        return state;
      };
      for (const element of elements(measure)) {
        const name = element.localName || element.nodeName;
        if (name === "attributes") {
          if (named(element, "divisions").length) divisions = positive(textOf(element, "divisions"));
          const times = named(element, "time");
          if (times.length) {
            const lengths = times.map(meterLength);
            meter = times.length === 1 && lengths[0] !== null ? lengths[0] : null;
            if (timedEvents) ambiguous = true;
          }
          continue;
        }
        if (!["note", "backup", "forward"].includes(name)) continue;
        if (name === "note" && named(element, "grace").length) continue;
        const units = positive(textOf(element, "duration"));
        if (!units || !divisions) { ambiguous = true; continue; }
        timedEvents++;
        const beats = units / divisions;
        if (name === "backup") {
          cursor -= beats;
          if (cursor < -EPSILON) ambiguous = true;
          previousOnset = null;
          continue;
        }
        const voice = textOf(element, "voice") || "1";
        const staff = Number(textOf(element, "staff") || "1");
        if (!Number.isInteger(staff) || staff < 1) { ambiguous = true; continue; }
        if (name === "forward") {
          const explicitVoice = textOf(element, "voice");
          if (explicitVoice) {
            const state = getVoice(staff, voice);
            state.intervals.push({ start: cursor, end: cursor + beats });
            state.lastEventKind = "forward";
          } else unvoicedForward = true;
          cursor += beats;
          previousOnset = null;
          continue;
        }
        const chord = named(element, "chord").length > 0;
        const onset: number | null = chord ? previousOnset : cursor;
        if (onset === null) { ambiguous = true; continue; }
        const state = getVoice(staff, voice);
        state.intervals.push({ start: onset, end: onset + beats });
        const rest = named(element, "rest").length > 0;
        if (!chord) {
          state.durationsTotal += beats;
          state.lastEventKind = rest ? "rest" : "note";
          if (!rest) { state.lastNoteOnset = onset; state.noteCount++; }
          cursor += beats;
          previousOnset = onset;
        }
        const writtenUnits = writtenDurationUnits(element, divisions);
        if (writtenUnits !== null && Math.abs(writtenUnits - units) > 0.5 + EPSILON) report.issues.push({
          code: "WRITTEN_DURATION_MISMATCH", severity: "warning", partId, measure: measureNumber,
          message: `Compasso ${measureNumber}, voz ${voice}: duração MusicXML ${units}/${divisions} difere da figura escrita ${textOf(element, "type")}; confira a fonte.`
        });
      }
      if (!meter || ambiguous || !timedEvents) report.skippedMeasures++;
      else report.checkedMeasures++;
      const checks = [...voices.values()].filter((state) => state.intervals.length).map((state) => {
        const start = Math.min(...state.intervals.map((interval) => interval.start));
        const end = Math.max(...state.intervals.map((interval) => interval.end));
        return { state, check: { partId, measure: measureNumber, staff: state.staff, voice: state.voice,
          start, end, durationsTotal: state.durationsTotal, implicitGaps: gaps(state.intervals, meter) } satisfies VoiceCheck };
      });
      report.voiceChecks.push(...checks.map(({ check }) => check));
      if (!meter || ambiguous || unvoicedForward || checks.length < 2) continue;
      for (const { state, check } of checks) {
        const sameStaffReachesEnd = checks.some((other) => other.state !== state && other.state.staff === state.staff && other.check.end >= meter! - EPSILON);
        if (sameStaffReachesEnd && state.noteCount >= 2 && state.lastEventKind === "note"
          && check.start <= EPSILON && state.lastNoteOnset !== null && state.lastNoteOnset >= meter / 2 - EPSILON
          && check.end < meter - EPSILON && meter - check.end >= 1 / divisions! - EPSILON) {
          report.issues.push({ code: "VOICE_EARLY_END", severity: "warning", partId, measure: measureNumber,
            message: `Compasso ${measureNumber}, pauta ${state.staff}, voz ${state.voice}: termina antes do compasso enquanto outra voz continua; confira pausas e notas no original.` });
        }
      }
    }
  }
  return report;
}
