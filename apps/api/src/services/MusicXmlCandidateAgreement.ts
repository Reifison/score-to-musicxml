import { DOMParser } from "@xmldom/xmldom";

export type MusicXmlCandidateAgreementInput = {
  candidateIds: number[];
  xml: string;
};

export type MusicXmlCandidateAgreementIssue = {
  code: "CANDIDATE_EVENT_DIVERGENCE" | "CANDIDATE_AGREEMENT_UNCHECKED";
  severity: "warning";
  message: string;
  partId?: string;
  partName?: string;
  measure?: string;
  page: number;
  staff?: number;
  voice?: string;
  differences: string[];
  candidateIds: number[];
};

type SemanticEvent = {
  category: "note" | "tempo" | "dynamics";
  onset: number;
  voice?: string;
  staff?: number;
  kind?: "pitch" | "rest" | "unpitched";
  pitch?: string;
  duration?: number | null;
  chord?: boolean;
  grace?: boolean;
  printedType?: string | null;
  dots?: number;
  accidental?: string | null;
  slurs?: string[];
  ties?: string[];
  tuplets?: string[];
  tupletRatio?: string | null;
  beams?: string[];
  value?: string;
};

type ParsedMeasure = {
  label: string;
  events: SemanticEvent[];
  unchecked: string[];
  keySignatures: Array<{ scope: string; value: string }>;
  transpositions: Array<{ scope: string; value: string }>;
  navigation: string[];
};

type PartMetadata = {
  instrumentNames: string[];
  midiPrograms: string[];
  unchecked: string[];
};

type ParsedPart = {
  id: string;
  name?: string;
  measures: ParsedMeasure[];
  metadata: PartMetadata;
};

type ParsedScore = {
  parts: ParsedPart[];
  unchecked: string[];
};

const localName = (element: Element): string => element.localName || element.nodeName.split(":").at(-1) || element.nodeName;
const childElements = (parent: Node, name?: string): Element[] => Array.from(parent.childNodes)
  .filter((node): node is Element => node.nodeType === 1 && (!name || localName(node as Element) === name));
const child = (parent: Node, name: string): Element | undefined => childElements(parent, name)[0];
const descendants = (parent: Element, name: string): Element[] => Array.from(parent.getElementsByTagName("*"))
  .filter((node): node is Element => node.nodeType === 1 && localName(node as Element) === name);
const text = (element: Element | undefined): string | undefined => {
  const value = element?.textContent?.trim().replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").slice(0, 160);
  return value || undefined;
};
const numeric = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};
const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;
const safeLabel = (value: string | null | undefined, limit: number): string | undefined => value?.trim()
  .replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").slice(0, limit) || undefined;
const normalizedToken = (value: string | undefined): string | undefined => safeLabel(value, 160)?.toLowerCase();
const safePartName = (value: string | undefined): string | undefined => safeLabel(value, 120);
const scoreKey = (event: SemanticEvent): string => JSON.stringify(event);
const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort();
const yes = (value: string | null): boolean => value === "yes" || value === "true" || value === "1";
const navigationTarget = (value: string | null): string | undefined => value && value.toLowerCase() !== "no" ? normalizedToken(value) : undefined;
const navigationWords = (value: string | undefined): string[] => {
  const normalized = normalizedToken(value) ?? "";
  const markers: string[] = [];
  if (/\b(?:d\.?\s*c\.?|da\s+capo)\b/.test(normalized)) markers.push("da_capo");
  if (/\bfine\b/.test(normalized)) markers.push("fine");
  if (/\b(?:d\.?\s*s\.?|dal\s+segno)\b/.test(normalized)) markers.push("dal_segno");
  if (/\bto\s+coda\b/.test(normalized)) markers.push("to_coda");
  return markers;
};

const emptyPartMetadata = (): PartMetadata => ({ instrumentNames: [], midiPrograms: [], unchecked: [] });

function parsePartMetadata(scorePart: Element): PartMetadata {
  const metadata = emptyPartMetadata();
  const scoreInstruments = childElements(scorePart, "score-instrument");
  for (const instrument of scoreInstruments) {
    const name = normalizedToken(text(child(instrument, "instrument-name")));
    if (name) metadata.instrumentNames.push(name);
  }
  for (const midi of childElements(scorePart, "midi-instrument")) {
    const programElement = child(midi, "midi-program");
    if (!programElement) continue;
    const program = numeric(text(programElement));
    if (program === undefined || !Number.isSafeInteger(program) || program < 1 || program > 128) metadata.unchecked.push("program_context");
    else metadata.midiPrograms.push(String(program));
  }
  metadata.instrumentNames = uniqueSorted(metadata.instrumentNames);
  metadata.midiPrograms = uniqueSorted(metadata.midiPrograms);
  metadata.unchecked = uniqueSorted(metadata.unchecked);
  return metadata;
}

function metadataDifferences(left: PartMetadata, right: PartMetadata): { differences: string[]; unchecked: string[] } {
  const differences: string[] = [];
  const unchecked: string[] = uniqueSorted([...left.unchecked, ...right.unchecked]);
  if (left.instrumentNames.length && right.instrumentNames.length) {
    if (JSON.stringify(left.instrumentNames) !== JSON.stringify(right.instrumentNames)) differences.push("instrument");
  } else if (left.instrumentNames.length !== right.instrumentNames.length) unchecked.push("instrument_context");
  if (left.midiPrograms.length && right.midiPrograms.length) {
    if (JSON.stringify(left.midiPrograms) !== JSON.stringify(right.midiPrograms)) differences.push("program");
  } else if (left.midiPrograms.length !== right.midiPrograms.length) unchecked.push("program_context");
  return { differences: uniqueSorted(differences), unchecked: uniqueSorted(unchecked) };
}

function parseScore(xml: string): ParsedScore | null {
  const parseErrors: string[] = [];
  let document: Document;
  try {
    document = new DOMParser({ errorHandler: {
      warning: (message) => parseErrors.push(String(message)),
      error: (message) => parseErrors.push(String(message)),
      fatalError: (message) => parseErrors.push(String(message))
    } }).parseFromString(xml, "application/xml");
  } catch { return null; }
  const root = document.documentElement;
  if (parseErrors.length || !root || localName(root) !== "score-partwise") return null;

  const listedNames = new Map<string, string>();
  const listedMetadata = new Map<string, PartMetadata>();
  const partList = child(root, "part-list");
  for (const scorePart of partList ? childElements(partList, "score-part") : []) {
    const id = scorePart.getAttribute("id");
    const name = safePartName(text(child(scorePart, "part-name")));
    if (id && name) listedNames.set(id, name);
    if (id) listedMetadata.set(id, parsePartMetadata(scorePart));
  }

  const parts: ParsedPart[] = [];
  for (const part of childElements(root, "part")) {
    const id = safeLabel(part.getAttribute("id"), 64);
    if (!id) return null;
    let divisions: number | undefined;
    let partKeySignature = "0:major";
    const staffKeySignatures = new Map<number, string>();
    let partTranspose = "0:0:0";
    const staffTransposes = new Map<number, string>();
    const measures: ParsedMeasure[] = [];
    for (const [measureIndex, measure] of childElements(part, "measure").entries()) {
      const label = safeLabel(measure.getAttribute("number"), 32) || String(measureIndex + 1);
      const events: SemanticEvent[] = [];
      const unchecked = new Set<string>();
      const navigation = new Set<string>();
      let cursor = 0;
      let previousNote: { onset: number; voice: string; staff: number } | null = null;
      let hasTimedContent = false;

      for (const item of childElements(measure)) {
        const itemName = localName(item);
        if (itemName === "attributes") {
          const nextDivisions = numeric(text(child(item, "divisions")));
          if (child(item, "divisions")) {
            if (!nextDivisions || nextDivisions <= 0) {
              divisions = undefined;
              unchecked.add("divisions_context");
            } else divisions = nextDivisions;
          }
          const keys = childElements(item, "key");
          const keyScopes = new Set<string>();
          for (const keyElement of keys) {
            const numberAttribute = keyElement.hasAttribute("number") ? keyElement.getAttribute("number") : null;
            let scope = "part";
            if (numberAttribute !== null) {
              const staffValue = numeric(numberAttribute);
              if (staffValue === undefined || !Number.isSafeInteger(staffValue) || staffValue <= 0) {
                unchecked.add("key_context");
                continue;
              }
              scope = `staff:${staffValue}`;
            }
            if (keyScopes.has(scope)) unchecked.add("key_context");
            keyScopes.add(scope);
            const fifths = numeric(text(child(keyElement, "fifths")));
            const mode = normalizedToken(text(child(keyElement, "mode"))) ?? "major";
            if (fifths === undefined || !Number.isSafeInteger(fifths) || fifths < -7 || fifths > 7 || !/^[a-z][a-z-]*$/.test(mode)) {
              unchecked.add("key_context");
            } else {
              if (hasTimedContent) unchecked.add("key_position_context");
              if (scope === "part") {
                partKeySignature = `${fifths}:${mode}`;
              } else {
                staffKeySignatures.set(Number(scope.slice("staff:".length)), `${fifths}:${mode}`);
              }
            }
          }
          const transposes = childElements(item, "transpose");
          const transposeScopes = new Set<string>();
          for (const transpose of transposes) {
            const diatonicElement = child(transpose, "diatonic");
            const chromaticElement = child(transpose, "chromatic");
            const octaveChangeElement = child(transpose, "octave-change");
            const diatonic = diatonicElement ? numeric(text(diatonicElement)) : 0;
            const chromatic = chromaticElement ? numeric(text(chromaticElement)) : 0;
            const octaveChange = octaveChangeElement ? numeric(text(octaveChangeElement)) : 0;
            const numberAttribute = transpose.hasAttribute("number") ? transpose.getAttribute("number") : null;
            let scope = "part";
            let staffValue: number | undefined;
            if (numberAttribute !== null) {
              staffValue = numeric(numberAttribute);
              if (staffValue === undefined || !Number.isSafeInteger(staffValue) || staffValue <= 0) {
                unchecked.add("transpose_context");
                continue;
              }
              scope = `staff:${staffValue}`;
            }
            if (child(transpose, "staff")) unchecked.add("transpose_context");
            if (transposeScopes.has(scope)) unchecked.add("transpose_context");
            transposeScopes.add(scope);
            const validTranspose = [diatonic, chromatic, octaveChange].every((value) => Number.isSafeInteger(value));
            if (!validTranspose) unchecked.add("transpose_context");
            else if (hasTimedContent) unchecked.add("transpose_position_context");
            const value = `${diatonic}:${chromatic}:${octaveChange}`;
            if (!validTranspose) continue;
            if (scope === "part") partTranspose = value;
            else staffTransposes.set(staffValue!, value);
          }
          continue;
        }

        if (itemName === "barline") {
          const location = normalizedToken(item.getAttribute("location") ?? undefined) ?? "right";
          for (const repeat of childElements(item, "repeat")) {
            const direction = normalizedToken(repeat.getAttribute("direction") ?? undefined);
            if (!direction || !["forward", "backward"].includes(direction)) unchecked.add("navigation_context");
            else if (direction === "backward") {
              const times = numeric(repeat.getAttribute("times") ?? undefined);
              if (times !== undefined && (!Number.isSafeInteger(times) || times < 2)) unchecked.add("navigation_context");
              else navigation.add(`repeat:${direction}:${location}:${times ?? 2}`);
            } else navigation.add(`repeat:${direction}:${location}`);
          }
          for (const ending of childElements(item, "ending")) {
            const type = normalizedToken(ending.getAttribute("type") ?? undefined);
            const number = normalizedToken(ending.getAttribute("number") ?? undefined);
            if (!type || !number) unchecked.add("navigation_context");
            else navigation.add(`ending:${number}:${type}`);
          }
          continue;
        }

        if (itemName === "backup" || itemName === "forward") {
          hasTimedContent = true;
          const amount = numeric(text(child(item, "duration")));
          if (!divisions || !amount || amount < 0) unchecked.add("cursor_context");
          else {
            cursor += (itemName === "backup" ? -1 : 1) * amount / divisions;
            if (cursor < -0.000001) unchecked.add("cursor_context");
          }
          previousNote = null;
          continue;
        }

        if (itemName === "direction") {
          hasTimedContent = true;
          const offsetElement = child(item, "offset");
          let onset = cursor;
          if (offsetElement) {
            const offset = numeric(text(offsetElement));
            if (!divisions || offset === undefined) unchecked.add("direction_position");
            else onset += offset / divisions;
          }
          const soundElement = child(item, "sound");
          if (soundElement) {
            if (yes(soundElement.getAttribute("dacapo"))) navigation.add("da_capo");
            if (yes(soundElement.getAttribute("fine"))) navigation.add("fine");
            const dalSegno = navigationTarget(soundElement.getAttribute("dalsegno"));
            const toCoda = navigationTarget(soundElement.getAttribute("tocoda"));
            if (dalSegno) navigation.add(`dal_segno:${dalSegno}`);
            if (toCoda) navigation.add(`to_coda:${toCoda}`);
          }
          for (const words of descendants(item, "words")) navigationWords(text(words)).forEach((marker) => navigation.add(marker));
          if (descendants(item, "segno").length) navigation.add("segno");
          if (descendants(item, "coda").length) navigation.add("coda");
          const soundTempo = soundElement?.hasAttribute("tempo") ? soundElement.getAttribute("tempo") : null;
          if (soundTempo !== null && soundTempo !== undefined) {
            const value = numeric(soundTempo);
            if (value === undefined) unchecked.add("tempo_context");
            else events.push({ category: "tempo", onset: round(onset), value: `sound:${round(value)}` });
          }
          for (const directionType of childElements(item, "direction-type")) {
            for (const metronome of childElements(directionType, "metronome")) {
              const beatUnit = normalizedToken(text(child(metronome, "beat-unit")));
              const perMinute = numeric(text(child(metronome, "per-minute")));
              const dots = childElements(metronome, "beat-unit-dot").length;
              if (!beatUnit || perMinute === undefined) unchecked.add("tempo_context");
              else events.push({ category: "tempo", onset: round(onset), value: `metronome:${beatUnit}${".".repeat(dots)}=${round(perMinute)}` });
            }
            for (const dynamics of childElements(directionType, "dynamics")) {
              const marks = childElements(dynamics).map((mark) => `${localName(mark).toLowerCase()}:${text(mark) ?? ""}`).sort();
              if (marks.length) events.push({ category: "dynamics", onset: round(onset), value: marks.join("+") });
            }
          }
          continue;
        }

        if (itemName !== "note") continue;
        hasTimedContent = true;
        const grace = Boolean(child(item, "grace"));
        const chord = Boolean(child(item, "chord"));
        const voiceElement = child(item, "voice");
        const voiceValue = text(voiceElement);
        const voice = voiceValue ?? "1";
        if (voiceElement && !voiceValue) unchecked.add("voice_context");
        const staffElement = child(item, "staff");
        const staffValue = numeric(text(staffElement));
        const staff = staffValue ?? 1;
        if (staffElement && (staffValue === undefined || !Number.isSafeInteger(staffValue) || staffValue <= 0)) unchecked.add("staff_context");
        const noteOnset: number | undefined = chord
          ? previousNote && previousNote.voice === voice && previousNote.staff === staff
            ? previousNote.onset
            : undefined
          : cursor;
        if (noteOnset === undefined) unchecked.add("chord_context");

        const pitchElement = child(item, "pitch");
        const restElement = child(item, "rest");
        const unpitchedElement = child(item, "unpitched");
        let kind: SemanticEvent["kind"];
        let pitch: string | undefined;
        if (restElement && !pitchElement && !unpitchedElement) kind = "rest";
        else if (pitchElement && !restElement && !unpitchedElement) {
          const step = normalizedToken(text(child(pitchElement, "step")));
          const octave = numeric(text(child(pitchElement, "octave")));
          const alterElement = child(pitchElement, "alter");
          const alter = alterElement ? numeric(text(alterElement)) : 0;
          if (!step || !/^[a-g]$/.test(step) || octave === undefined || !Number.isInteger(octave) || octave < 0 || octave > 9 || alter === undefined) unchecked.add("pitch_context");
          else { kind = "pitch"; pitch = `${step}:${round(alter)}:${octave}`; }
        } else if (unpitchedElement && !pitchElement && !restElement) {
          const step = normalizedToken(text(child(unpitchedElement, "display-step")));
          const octave = numeric(text(child(unpitchedElement, "display-octave")));
          if (!step || !/^[a-g]$/.test(step) || octave === undefined || !Number.isInteger(octave) || octave < 0 || octave > 9) unchecked.add("unpitched_context");
          else { kind = "unpitched"; pitch = `${step}:${octave}`; }
        } else unchecked.add("note_context");

        const rawDuration = numeric(text(child(item, "duration")));
        let duration: number | null = null;
        if (!grace) {
          if (!divisions || rawDuration === undefined || rawDuration <= 0) unchecked.add("duration_context");
          else duration = round(rawDuration / divisions);
        } else if (rawDuration !== undefined && divisions) duration = round(rawDuration / divisions);

        const notations = child(item, "notations");
        const slurs = descendants(notations ?? item, "slur")
          .map((mark) => `${normalizedToken(mark.getAttribute("type") ?? undefined) ?? "?"}:${mark.getAttribute("number") || "1"}`).sort();
        const ties = [...childElements(item, "tie"), ...descendants(notations ?? item, "tied")]
          .map((mark) => normalizedToken(mark.getAttribute("type") ?? undefined) ?? "?").filter((type, index, list) => list.indexOf(type) === index).sort();
        const tuplets = descendants(notations ?? item, "tuplet")
          .map((mark) => `${normalizedToken(mark.getAttribute("type") ?? undefined) ?? "?"}:${mark.getAttribute("number") || "1"}`).sort();
        const beams = childElements(item, "beam")
          .map((mark) => `${mark.getAttribute("number") || "1"}:${normalizedToken(text(mark)) ?? "?"}`).sort();
        const timeModification = child(item, "time-modification");
        const actualNotes = numeric(text(child(timeModification ?? item, "actual-notes")));
        const normalNotes = numeric(text(child(timeModification ?? item, "normal-notes")));
        const tupletRatio = timeModification
          ? actualNotes && normalNotes ? `${actualNotes}:${normalNotes}` : "unknown"
          : null;
        if (timeModification && tupletRatio === "unknown") unchecked.add("tuplet_ratio_context");
        const type = normalizedToken(text(child(item, "type"))) ?? null;
        const accidental = normalizedToken(text(child(item, "accidental"))) ?? null;
        const event: SemanticEvent = {
          category: "note",
          onset: round(noteOnset ?? cursor),
          voice,
          staff,
          kind,
          ...(pitch === undefined ? {} : { pitch }),
          duration,
          chord,
          grace,
          printedType: type,
          dots: childElements(item, "dot").length,
          accidental,
          slurs,
          ties,
          tuplets,
          tupletRatio,
          beams
        };
        events.push(event);
        if (noteOnset !== undefined && !chord && !grace && duration !== null) cursor += duration;
        if (noteOnset !== undefined) previousNote = { onset: noteOnset, voice, staff };
      }
      const chordGroups = new Map<string, SemanticEvent[]>();
      for (const event of events) {
        if (event.category !== "note") continue;
        const key = JSON.stringify([event.onset, event.voice, event.staff, event.grace]);
        chordGroups.set(key, [...(chordGroups.get(key) ?? []), event]);
      }
      for (const group of chordGroups.values()) {
        if (group.some((event) => event.chord)) group.forEach((event) => { event.chord = true; });
      }
      const keySignatures = [{ scope: "part", value: partKeySignature },
        ...[...staffKeySignatures.entries()].map(([staff, value]) => ({ scope: `staff:${staff}`, value }))]
        .sort((left, right) => left.scope.localeCompare(right.scope));
      const transpositions = [{ scope: "part", value: partTranspose },
        ...[...staffTransposes.entries()].map(([staff, value]) => ({ scope: `staff:${staff}`, value }))]
        .sort((left, right) => left.scope.localeCompare(right.scope));
      measures.push({ label, events, unchecked: [...unchecked].sort(), keySignatures,
        transpositions, navigation: [...navigation].sort() });
    }
    parts.push({ id, name: listedNames.get(id), measures, metadata: listedMetadata.get(id) ?? emptyPartMetadata() });
  }
  return parts.length ? { parts, unchecked: [] } : null;
}

function matchParts(left: ParsedScore, right: ParsedScore): Array<[ParsedPart, ParsedPart]> {
  if (left.parts.length === 1 && right.parts.length === 1) return [[left.parts[0], right.parts[0]]];
  const pairs: Array<[ParsedPart, ParsedPart]> = [];
  const usedLeft = new Set<ParsedPart>();
  const usedRight = new Set<ParsedPart>();
  const leftByName = new Map<string, ParsedPart[]>();
  const rightByName = new Map<string, ParsedPart[]>();
  for (const part of left.parts) {
    const name = normalizedToken(part.name);
    if (name) leftByName.set(name, [...(leftByName.get(name) ?? []), part]);
  }
  for (const part of right.parts) {
    const name = normalizedToken(part.name);
    if (name) rightByName.set(name, [...(rightByName.get(name) ?? []), part]);
  }
  for (const [name, leftParts] of leftByName) {
    const rightParts = rightByName.get(name) ?? [];
    if (leftParts.length === 1 && rightParts.length === 1) {
      pairs.push([leftParts[0], rightParts[0]]);
      usedLeft.add(leftParts[0]);
      usedRight.add(rightParts[0]);
    }
  }

  const rightById = new Map<string, ParsedPart[]>();
  for (const part of right.parts.filter((item) => !usedRight.has(item))) rightById.set(part.id, [...(rightById.get(part.id) ?? []), part]);
  for (const part of left.parts.filter((item) => !usedLeft.has(item))) {
    const matches = rightById.get(part.id) ?? [];
    if (matches.length === 1 && !usedRight.has(matches[0])) {
      pairs.push([part, matches[0]]);
      usedLeft.add(part);
      usedRight.add(matches[0]);
    }
  }
  return pairs;
}

function eventDifferences(left: SemanticEvent, right: SemanticEvent): string[] {
  const differences: string[] = [];
  if (left.category !== right.category) differences.push("event_kind");
  if (left.onset !== right.onset) differences.push("onset");
  if (left.voice !== right.voice) differences.push("voice");
  if (left.staff !== right.staff) differences.push("staff");
  if (left.kind !== right.kind) differences.push("note_or_rest");
  if (left.kind === right.kind && left.pitch !== right.pitch) differences.push(left.kind === "unpitched" ? "unpitched_pitch" : "pitch");
  if (left.duration !== right.duration) differences.push("duration");
  if (left.chord !== right.chord) differences.push("chord");
  if (left.grace !== right.grace) differences.push("grace");
  if (left.printedType !== right.printedType) differences.push("printed_type");
  if (left.dots !== right.dots) differences.push("dots");
  if (left.accidental !== right.accidental) differences.push("accidental");
  if (JSON.stringify(left.slurs ?? []) !== JSON.stringify(right.slurs ?? [])) differences.push("slur");
  if (JSON.stringify(left.ties ?? []) !== JSON.stringify(right.ties ?? [])) differences.push("tie");
  if (JSON.stringify(left.tuplets ?? []) !== JSON.stringify(right.tuplets ?? [])) differences.push("tuplet");
  if (left.tupletRatio !== right.tupletRatio) differences.push("tuplet_ratio");
  if (JSON.stringify(left.beams ?? []) !== JSON.stringify(right.beams ?? [])) differences.push("beam");
  if (left.value !== right.value) differences.push(left.category === "tempo" ? "tempo" : left.category === "dynamics" ? "dynamics" : "event_value");
  return differences;
}

function eventDistance(left: SemanticEvent, right: SemanticEvent): number {
  if (left.category !== right.category) return Number.POSITIVE_INFINITY;
  const differences = eventDifferences(left, right);
  if (!differences.length) return 0;
  let cost = 0;
  for (const difference of differences) {
    cost += ({
      event_kind: 50, event_value: 3, tempo: 3, dynamics: 3, note_or_rest: 3,
      pitch: 3, unpitched_pitch: 3, onset: 2, duration: 2, voice: 2, staff: 2,
      chord: 1, grace: 4, printed_type: 1, dots: 1, accidental: 1,
      slur: 1, tie: 1, tuplet: 1, tuplet_ratio: 1, beam: 1
    } as Record<string, number>)[difference] ?? 1;
  }
  return cost;
}

function compareEvents(left: SemanticEvent[], right: SemanticEvent[]): { differences: string[]; contexts: Array<{ voice?: string; staff?: number }> } {
  const leftRemaining = new Map<string, SemanticEvent[]>();
  const rightRemaining = new Map<string, SemanticEvent[]>();
  const collect = (map: Map<string, SemanticEvent[]>, event: SemanticEvent): void => {
    map.set(scoreKey(event), [...(map.get(scoreKey(event)) ?? []), event]);
  };
  left.forEach((event) => collect(leftRemaining, event));
  right.forEach((event) => collect(rightRemaining, event));
  for (const [key, leftEvents] of leftRemaining) {
    const rightEvents = rightRemaining.get(key) ?? [];
    const matched = Math.min(leftEvents.length, rightEvents.length);
    if (matched) {
      leftRemaining.set(key, leftEvents.slice(matched));
      rightRemaining.set(key, rightEvents.slice(matched));
    }
  }
  const leftRest = [...leftRemaining.values()].flat();
  const rightRest = [...rightRemaining.values()].flat();
  const pairs: Array<[SemanticEvent, SemanticEvent, number]> = [];
  for (let leftIndex = 0; leftIndex < leftRest.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < rightRest.length; rightIndex += 1) {
      const cost = eventDistance(leftRest[leftIndex], rightRest[rightIndex]);
      if (Number.isFinite(cost)) pairs.push([leftRest[leftIndex], rightRest[rightIndex], cost]);
    }
  }
  pairs.sort((a, b) => a[2] - b[2]);
  const usedLeft = new Set<SemanticEvent>();
  const usedRight = new Set<SemanticEvent>();
  const differences = new Set<string>();
  const contexts: Array<{ voice?: string; staff?: number }> = [];
  for (const [leftEvent, rightEvent, cost] of pairs) {
    if (cost > 7 || usedLeft.has(leftEvent) || usedRight.has(rightEvent)) continue;
    usedLeft.add(leftEvent);
    usedRight.add(rightEvent);
    eventDifferences(leftEvent, rightEvent).forEach((difference) => differences.add(difference));
    contexts.push({ ...(leftEvent.voice ? { voice: leftEvent.voice } : {}), ...(leftEvent.staff ? { staff: leftEvent.staff } : {}) });
  }
  if (leftRest.some((event) => !usedLeft.has(event)) || rightRest.some((event) => !usedRight.has(event))) {
    differences.add("event_presence");
    contexts.push(...leftRest.filter((event) => !usedLeft.has(event)).map((event) => ({ ...(event.voice ? { voice: event.voice } : {}), ...(event.staff ? { staff: event.staff } : {}) })));
    contexts.push(...rightRest.filter((event) => !usedRight.has(event)).map((event) => ({ ...(event.voice ? { voice: event.voice } : {}), ...(event.staff ? { staff: event.staff } : {}) })));
  }
  return { differences: [...differences].sort(), contexts };
}

function compareMeasureContext(left: ParsedMeasure, right: ParsedMeasure): { differences: string[]; contexts: Array<{ staff?: number }> } {
  const differences = new Set<string>();
  const contexts: Array<{ staff?: number }> = [];

  const leftKeys = new Map(left.keySignatures.map((item) => [item.scope, item.value]));
  const rightKeys = new Map(right.keySignatures.map((item) => [item.scope, item.value]));
  const leftTranspose = new Map(left.transpositions.map((item) => [item.scope, item.value]));
  const rightTranspose = new Map(right.transpositions.map((item) => [item.scope, item.value]));
  const staffs = new Set<number>([1]);
  for (const event of [...left.events, ...right.events]) if (event.staff !== undefined) staffs.add(event.staff);
  for (const scope of [...leftKeys.keys(), ...rightKeys.keys()]) {
    if (!scope.startsWith("staff:")) continue;
    const staff = numeric(scope.slice("staff:".length));
    if (staff !== undefined) staffs.add(staff);
  }
  for (const scope of [...leftTranspose.keys(), ...rightTranspose.keys()]) {
    if (!scope.startsWith("staff:")) continue;
    const staff = numeric(scope.slice("staff:".length));
    if (staff !== undefined) staffs.add(staff);
  }
  for (const staff of staffs) {
    const leftKey = leftKeys.get(`staff:${staff}`) ?? leftKeys.get("part") ?? "0:major";
    const rightKey = rightKeys.get(`staff:${staff}`) ?? rightKeys.get("part") ?? "0:major";
    if (leftKey !== rightKey) {
      differences.add("key_signature");
      contexts.push({ staff });
    }
    const leftValue = leftTranspose.get(`staff:${staff}`) ?? leftTranspose.get("part") ?? "0:0:0";
    const rightValue = rightTranspose.get(`staff:${staff}`) ?? rightTranspose.get("part") ?? "0:0:0";
    if (leftValue === rightValue) continue;
    differences.add("transpose");
    contexts.push({ staff });
  }

  const leftNavigation = new Set(left.navigation);
  const rightNavigation = new Set(right.navigation);
  const navigationDifferences = new Set([...leftNavigation].filter((marker) => !rightNavigation.has(marker))
    .concat([...rightNavigation].filter((marker) => !leftNavigation.has(marker))));
  if (navigationDifferences.size) {
    differences.add("navigation");
    for (const marker of navigationDifferences) {
      if (marker.startsWith("repeat:")) differences.add("repeat");
      else if (marker === "da_capo") differences.add("da_capo");
      else if (marker === "fine") differences.add("fine");
    }
  }
  return { differences: [...differences].sort(), contexts };
}

function messageFor(issue: Pick<MusicXmlCandidateAgreementIssue, "code" | "candidateIds" | "measure" | "page" | "differences">): string {
  const candidates = issue.candidateIds.map((candidate) => `#${candidate}`).join(" e ");
  if (issue.code === "CANDIDATE_AGREEMENT_UNCHECKED") {
    return `Não foi possível comparar com segurança as leituras ${candidates}${issue.measure ? ` no compasso ${issue.measure}` : ""} da página ${issue.page}; faltam informações suficientes sobre a estrutura ou a posição dos eventos. confira a partitura original.`;
  }
  const labels: Record<string, string> = {
    event_kind: "tipo de evento", event_presence: "eventos presentes ou ausentes", measure_presence: "compassos presentes ou ausentes",
    onset: "posição no compasso", voice: "voz", staff: "pauta", note_or_rest: "nota ou pausa", pitch: "altura da nota",
    unpitched_pitch: "posição da nota", duration: "duração", chord: "acorde", grace: "ornamento", printed_type: "figura rítmica",
    dots: "pontos de aumento", accidental: "acidente", slur: "ligadura de expressão", tie: "ligadura de duração",
    tuplet: "grupo rítmico", tuplet_ratio: "proporção do grupo rítmico", beam: "agrupamento das hastes", tempo: "andamento",
    dynamics: "dinâmica", event_value: "indicação musical", key_signature: "armadura efetiva", transpose: "transposição efetiva",
    navigation: "navegação", repeat: "repetição", da_capo: "Da Capo", fine: "Fine", instrument: "instrumento", program: "programa MIDI",
    dal_segno: "Dal Segno", to_coda: "To Coda"
  };
  const differences = issue.differences.map((difference) => labels[difference] ?? "indicação musical").join(", ");
  return `As leituras ${candidates} divergem em ${differences}, no compasso ${issue.measure ?? "?"} desta página ${issue.page}; confira a partitura original.`;
}

/** Compare encoded MusicXML events between OMR readings. Agreement never indicates source accuracy. */
export function compareMusicXmlCandidateAgreement(
  candidates: MusicXmlCandidateAgreementInput[],
  page: number
): MusicXmlCandidateAgreementIssue[] {
  const prepared = candidates.filter((candidate) => candidate.candidateIds.length > 0);
  if (prepared.length < 2) return [];
  const issues: MusicXmlCandidateAgreementIssue[] = [];
  const parsed = prepared.map((candidate) => parseScore(candidate.xml));

  for (let leftIndex = 0; leftIndex < prepared.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < prepared.length; rightIndex += 1) {
      const candidateIds = [...new Set([...prepared[leftIndex].candidateIds, ...prepared[rightIndex].candidateIds])].sort((a, b) => a - b);
      const left = parsed[leftIndex];
      const right = parsed[rightIndex];
      if (!left || !right) {
        const unchecked = { code: "CANDIDATE_AGREEMENT_UNCHECKED" as const, severity: "warning" as const, page,
          differences: ["xml_context"], candidateIds };
        issues.push({ ...unchecked, message: messageFor(unchecked) });
        continue;
      }

      const pairs = matchParts(left, right);
      const matchedLeft = new Set(pairs.map(([part]) => part));
      const matchedRight = new Set(pairs.map(([, part]) => part));
      if (matchedLeft.size !== left.parts.length || matchedRight.size !== right.parts.length) {
        const unchecked = { code: "CANDIDATE_AGREEMENT_UNCHECKED" as const, severity: "warning" as const, page,
          differences: ["part_mapping"], candidateIds };
        issues.push({ ...unchecked, message: messageFor(unchecked) });
      }

      for (const [leftPart, rightPart] of pairs) {
        const partMetadata = metadataDifferences(leftPart.metadata, rightPart.metadata);
        const metadataMeasure = leftPart.measures[0]?.label ?? rightPart.measures[0]?.label;
        if (partMetadata.unchecked.length) {
          const unchecked = { code: "CANDIDATE_AGREEMENT_UNCHECKED" as const, severity: "warning" as const, partId: leftPart.id,
            ...(leftPart.name ? { partName: leftPart.name } : {}), ...(metadataMeasure ? { measure: metadataMeasure } : {}), page,
            differences: partMetadata.unchecked, candidateIds };
          issues.push({ ...unchecked, message: messageFor(unchecked) });
        }
        if (partMetadata.differences.length) {
          const issue = { code: "CANDIDATE_EVENT_DIVERGENCE" as const, severity: "warning" as const, partId: leftPart.id,
            ...(leftPart.name ? { partName: leftPart.name } : {}), ...(metadataMeasure ? { measure: metadataMeasure } : {}), page,
            differences: partMetadata.differences, candidateIds };
          issues.push({ ...issue, message: messageFor(issue) });
        }
        const measureCount = Math.max(leftPart.measures.length, rightPart.measures.length);
        for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
          const leftMeasure = leftPart.measures[measureIndex];
          const rightMeasure = rightPart.measures[measureIndex];
          const measure = leftMeasure?.label ?? rightMeasure?.label;
          if (!leftMeasure || !rightMeasure) {
            const issue = { code: "CANDIDATE_EVENT_DIVERGENCE" as const, severity: "warning" as const, partId: leftPart.id,
              ...(leftPart.name ? { partName: leftPart.name } : {}), ...(measure ? { measure } : {}), page,
              differences: ["measure_presence"], candidateIds };
            issues.push({ ...issue, message: messageFor(issue) });
            continue;
          }
          const unknown = [...new Set([...leftMeasure.unchecked, ...rightMeasure.unchecked])].sort();
          if (unknown.length) {
            const issue = { code: "CANDIDATE_AGREEMENT_UNCHECKED" as const, severity: "warning" as const, partId: leftPart.id,
              ...(leftPart.name ? { partName: leftPart.name } : {}), measure: leftMeasure.label, page,
              differences: unknown, candidateIds };
            issues.push({ ...issue, message: messageFor(issue) });
            continue;
          }
          const compared = compareEvents(leftMeasure.events, rightMeasure.events);
          const contextCompared = compareMeasureContext(leftMeasure, rightMeasure);
          const differences = [...new Set([...compared.differences, ...contextCompared.differences])].sort();
          if (!differences.length) continue;
          const contexts = [...compared.contexts, ...contextCompared.contexts];
          const voices = new Set(contexts.map((context) => ("voice" in context ? context.voice : undefined)).filter((voice): voice is string => Boolean(voice)));
          const staves = new Set(contexts.map((context) => context.staff).filter((staff): staff is number => staff !== undefined));
          const issue = { code: "CANDIDATE_EVENT_DIVERGENCE" as const, severity: "warning" as const, partId: leftPart.id,
            ...(leftPart.name ? { partName: leftPart.name } : {}), measure: leftMeasure.label, page,
            ...(voices.size === 1 ? { voice: [...voices][0] } : {}), ...(staves.size === 1 ? { staff: [...staves][0] } : {}),
            differences, candidateIds };
          issues.push({ ...issue, message: messageFor(issue) });
        }
      }
    }
  }
  return issues;
}
