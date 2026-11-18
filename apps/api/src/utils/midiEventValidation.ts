import { DOMParser } from "@xmldom/xmldom";

export interface MidiValidationIssue { [key: string]: string; code: string; message: string }
export interface MidiValidation {
  [key: string]: string | number | MidiValidationIssue[] | string[] | MidiSourceEventCoverage | undefined;
  status: "passed" | "failed" | "unverified";
  checkedNotes: number;
  checkedDurations?: number;
  issues: MidiValidationIssue[];
  limitations: string[];
  xmlSHA256: string;
  sourceEventCoverage?: MidiSourceEventCoverage;
}

export interface PerformedEvent {
  measureOn?: string;
  on?: string[];
  off?: string[];
  restsOn?: string[];
  restsOff?: string[];
  qstamp?: number;
  qfrac?: [number, number];
}

export class UnsupportedMidiEventValidationError extends Error {
  constructor(message: string) { super(message); this.name = "UnsupportedMidiEventValidationError"; }
}
export class MidiEventMismatchError extends Error {
  constructor(message: string) { super(message); this.name = "MidiEventMismatchError"; }
}

type NoteEvent = { tick: number; channel: number; pitch: number; velocity: number; off: boolean; track: number; index: number };
type TrackEvent = { tick: number; bytes: Uint8Array; order: number };
type ParsedTrack = { events: TrackEvent[]; notes: NoteEvent[] };

export interface MidiSourceEventCoverage {
  version: 1;
  scope: "performed_pitch_and_onset";
  status: "verified" | "partial" | "unverified";
  totalSourcePitchedNotes: number;
  mappedSourcePitchedNotes: number;
  expectedPerformedAttacks: number;
  checkedPitches: number;
  checkedOnsets: number;
  checkedGraceEvents: number;
  checkedDurations: 0;
  durationStatus: "not_checked";
  skippedSourceNotes: number;
  skippedPerformedEvents: number;
  skippedReasons: Array<{ code: string; count: number; message: string }>;
}

type SourcePitchNote = {
  id?: string;
  part: number;
  measure: number;
  staff: string;
  voice: string;
  grace: boolean;
  chord: boolean;
  pitch: number;
  onsetQ?: number;
  durationQ?: number;
};

type MeiStructuralNote = {
  id: string;
  measure: number;
  staff: string;
  voice: string;
  grace: boolean;
  chord: boolean;
  onsetQ?: number;
  durationQ?: number;
};

type SkippedReason = { code: string; count: number; message: string };

/** The engine can serialize a rational onset on either side of an integer tick. */
function eventMidiTick(event: PerformedEvent, ppq: number): number {
  if (!event.qfrac) {
    if (typeof event.qstamp !== "number" || !Number.isFinite(event.qstamp)) {
      throw new UnsupportedMidiEventValidationError("O timemap não informa um início verificável.");
    }
    return Math.floor(event.qstamp * ppq);
  }
  const [numerator, denominator] = event.qfrac;
  if (!Number.isSafeInteger(numerator) || numerator < 0 || !Number.isSafeInteger(denominator) || denominator <= 0 ||
      typeof event.qstamp !== "number" || !Number.isFinite(event.qstamp)) {
    throw new UnsupportedMidiEventValidationError("A fração temporal do timemap é inválida.");
  }
  const exact = BigInt(numerator) * BigInt(ppq);
  const tick = exact / BigInt(denominator);
  if (tick > BigInt(Number.MAX_SAFE_INTEGER)) throw new UnsupportedMidiEventValidationError("O início não cabe no MIDI.");
  const rational = numerator / denominator;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(rational)) * 8;
  if (Math.abs(event.qstamp - rational) > tolerance) {
    throw new UnsupportedMidiEventValidationError("Os tempos decimal e racional do timemap divergem.");
  }
  return Number(tick);
}

function isIntegerTickBoundary(event: PerformedEvent, ppq: number, canonicalTick: number): boolean {
  if (!event.qfrac || typeof event.qstamp !== "number") return false;
  const [numerator, denominator] = event.qfrac;
  // Integer and dyadic quarter positions have exact binary representation.
  // They do not establish the floating-point boundary error seen at thirds
  // and sixths, even if a supplied MIDI attack happens to be one tick early.
  let a = BigInt(numerator);
  let b = BigInt(denominator);
  while (b !== 0n) [a, b] = [b, a % b];
  const reducedDenominator = BigInt(denominator) / a;
  if ((reducedDenominator & (reducedDenominator - 1n)) === 0n) return false;
  if ((BigInt(numerator) * BigInt(ppq)) % BigInt(denominator) !== 0n) return false;
  const scaled = event.qstamp * ppq;
  return Math.abs(scaled - canonicalTick) <= Number.EPSILON * Math.max(1, Math.abs(canonicalTick)) * 16;
}

/**
 * Checks performed attacks against the written MusicXML pitches without using
 * pitch as part of source-to-MEI identity. Preserved source IDs are preferred;
 * a single-part fallback requires matching measure/staff/voice position,
 * written duration, onset, and grace/chord structure. An ID match proves the
 * audible event identity, not its visual staff or voice placement.
 */
export function inspectMidiSourceEvents(
  midi: Buffer,
  musicXml: string,
  mei: string,
  timemap: PerformedEvent[],
  expansionMap: Record<string, string[]>
): MidiSourceEventCoverage {
  const sourceParsed = parseXml(musicXml);
  const meiParsed = parseXml(mei);
  const sourceDocument = sourceParsed.document;
  const meiDocument = meiParsed.document;
  const parsed = parseMidi(midi);
  const ppq = midi.readUInt16BE(12);
  const actualNotes = parsed.flatMap((track) => track.notes).filter((event) => !event.off);
  const reasons = new Map<string, SkippedReason>();
  const addReason = (code: string, count: number, message: string) => {
    if (count <= 0) return;
    const current = reasons.get(code);
    reasons.set(code, { code, count: (current?.count ?? 0) + count, message });
  };
  const empty = (totalSourcePitchedNotes: number): MidiSourceEventCoverage => ({
    version: 1,
    scope: "performed_pitch_and_onset",
    status: "unverified",
    totalSourcePitchedNotes,
    mappedSourcePitchedNotes: 0,
    expectedPerformedAttacks: 0,
    checkedPitches: 0,
    checkedOnsets: 0,
    checkedGraceEvents: 0,
    checkedDurations: 0,
    durationStatus: "not_checked",
    skippedSourceNotes: totalSourcePitchedNotes,
    skippedPerformedEvents: 0,
    skippedReasons: [...reasons.values()]
  });

  if (!sourceParsed.valid || !meiParsed.valid) {
    addReason("XML_PARSE_ERROR", 1, "MusicXML ou MEI não é XML bem formado.");
    return empty(0);
  }
  if (localName(sourceDocument.documentElement) !== "score-partwise") {
    addReason("SOURCE_FORMAT_UNSUPPORTED", 1, "A associação estrutural requer MusicXML score-partwise.");
    return empty(0);
  }
  const sourceParts = directChildren(sourceDocument.documentElement, "part");
  const totalSourcePitchedNotes = Array.from(sourceDocument.getElementsByTagName("note"))
    .filter((note) => directChild(note, "pitch") !== undefined).length;
  if (sourceDocument.getElementsByTagName("unpitched").length > 0 || sourceDocument.getElementsByTagName("cue").length > 0 ||
      sourceDocument.getElementsByTagName("octave-shift").length > 0 || sourceDocument.getElementsByTagName("concert-score").length > 0 ||
      sourceDocument.getElementsByTagName("for-part").length > 0) {
    addReason("SOURCE_PLAYBACK_SEMANTICS_UNSUPPORTED", totalSourcePitchedNotes || 1,
      "Cue, percussão, oitava ou concert score/for-part impedem provar os ataques executados.");
    return empty(totalSourcePitchedNotes);
  }
  const hasClefOctave = sourceDocument.getElementsByTagName("clef-octave-change").length > 0;
  const hasExplicitTranspose = sourceDocument.getElementsByTagName("transpose").length > 0;
  if (hasClefOctave && !hasExplicitTranspose) {
    addReason("CLEF_OCTAVE_SEMANTICS_UNRESOLVED", totalSourcePitchedNotes || 1,
      "A clave oitavada sem transposição explícita não prova a convenção de altura sonora.");
    return empty(totalSourcePitchedNotes);
  }
  if (sourceParts.length === 0) {
    addReason("SOURCE_PART_MISSING", totalSourcePitchedNotes || 1, "O MusicXML não contém parte musical verificável.");
    return empty(totalSourcePitchedNotes);
  }

  const parsedParts = sourceParts.map((part, index) => parseSourcePitchNotes(part, index, addReason));
  const sourceMeasureCount = parsedParts[0].measureCount;
  const source = { notes: parsedParts.flatMap((part) => part.notes), measureCount: sourceMeasureCount };
  const meiMeasures = Array.from(meiDocument.getElementsByTagName("measure"));
  if (parsedParts.some((part) => part.measureCount !== sourceMeasureCount) || source.measureCount !== meiMeasures.length) {
    addReason("MEASURE_MAPPING_AMBIGUOUS", totalSourcePitchedNotes || 1,
      "A quantidade de compassos da fonte e da interpretação MEI diverge.");
    return empty(totalSourcePitchedNotes);
  }
  const meiNotes = parseMeiStructuralNotes(meiMeasures);
  const meiByGroup = groupBy(meiNotes, structuralGroupKey);
  const sourceByGroup = groupBy(source.notes, structuralGroupKey);
  const mapping = new Map<SourcePitchNote, MeiStructuralNote>();
  const mappedMeiIds = new Set<string>();
  const sourceIds = source.notes.map((note) => note.id).filter((id): id is string => Boolean(id));
  const uniqueSourceIds = new Set(sourceIds);
  const meiById = new Map(meiNotes.map((note) => [note.id, note]));
  const hasCompletePreservedIds = sourceIds.length === source.notes.length && uniqueSourceIds.size === source.notes.length &&
    sourceIds.every((id) => meiById.has(id));
  if (hasCompletePreservedIds) {
    for (const note of source.notes) {
      const interpreted = meiById.get(note.id as string) as MeiStructuralNote;
      if (!sameStructuralFingerprint(note, interpreted)) {
        addReason("NOTE_TIMING_FINGERPRINT_MISMATCH", 1,
          "Uma nota identificada não preservou posição, duração ou estrutura de graça/acorde no MEI.");
        continue;
      }
      mapping.set(note, interpreted);
      mappedMeiIds.add(interpreted.id);
    }
  } else {
    if (sourceParts.length > 1) {
      addReason("MULTIPART_MAPPING_AMBIGUOUS", totalSourcePitchedNotes || 1,
        "Sem IDs preservados, a relação entre partes MusicXML e pautas MEI não é demonstrável.");
      return empty(totalSourcePitchedNotes);
    }
    for (const [key, sourceGroup] of sourceByGroup) {
      const meiGroup = meiByGroup.get(key) ?? [];
      const structurallyEqual = sourceGroup.length === meiGroup.length && sourceGroup.every((note, index) =>
        sameStructuralFingerprint(note, meiGroup[index]));
      if (!structurallyEqual) {
        addReason("NOTE_MAPPING_AMBIGUOUS", sourceGroup.length,
          "Uma voz não preservou posição, duração e estrutura de graças/acordes entre MusicXML e MEI.");
        continue;
      }
      sourceGroup.forEach((note, index) => {
        mapping.set(note, meiGroup[index]);
        mappedMeiIds.add(meiGroup[index].id);
      });
    }
    for (const [key, meiGroup] of meiByGroup) {
      if (!sourceByGroup.has(key)) {
        addReason("UNMAPPED_MEI_VOICE", meiGroup.length,
          "Uma voz MEI não possui correspondência estrutural inequívoca no MusicXML.");
      }
    }
  }

  const onsets = new Map<string, number>();
  const onsetTicks = new Map<string, number>();
  const offsets = new Map<string, number>();
  for (const event of timemap) {
    if (typeof event.qstamp !== "number" || !Number.isFinite(event.qstamp)) continue;
    for (const id of event.on ?? []) {
      onsets.set(id, event.qstamp);
      onsetTicks.set(id, eventMidiTick(event, ppq));
    }
    for (const id of event.off ?? []) offsets.set(id, event.qstamp);
  }
  const tiedDestinations = new Set<string>();
  for (const tie of Array.from(meiDocument.getElementsByTagName("tie"))) {
    const startId = tie.getAttribute("startid")?.replace(/^#/, "");
    const endId = tie.getAttribute("endid")?.replace(/^#/, "");
    if (!startId || !endId) continue;
    const starts = expandedIds(startId, expansionMap);
    const ends = expandedIds(endId, expansionMap);
    for (const end of ends) {
      const endOnset = onsets.get(end);
      if (endOnset === undefined || starts.some((start) => {
        const startOffset = offsets.get(start);
        return startOffset !== undefined && Math.abs(startOffset - endOnset) < 1e-6;
      })) tiedDestinations.add(end);
    }
  }

  // If an unmapped rendered note shares a tick with a mapped note, event
  // multiplicity cannot establish which source note produced the MIDI attack.
  const ambiguousTicks = new Set<number>();
  for (const note of meiNotes) {
    if (mappedMeiIds.has(note.id)) continue;
    for (const id of expandedIds(note.id, expansionMap)) {
      const tick = onsetTicks.get(id);
      if (tick !== undefined) ambiguousTicks.add(tick);
    }
  }

  const expected = new Map<string, number>();
  const expectedRegular = new Map<string, number>();
  const expectedGrace = new Map<string, number>();
  let expectedPerformedAttacks = 0;
  let mappedSourcePitchedNotes = 0;
  let eventlessMappedNotes = 0;
  let ambiguousPerformedEvents = 0;
  for (const sourceNote of source.notes) {
    const meiNote = mapping.get(sourceNote);
    if (!meiNote) continue;
    mappedSourcePitchedNotes += 1;
    for (const id of expandedIds(meiNote.id, expansionMap)) {
      if (tiedDestinations.has(id)) continue;
      const onset = onsets.get(id);
      if (onset === undefined) {
        eventlessMappedNotes += 1;
        continue;
      }
      // Direct validation always requires the canonical tick. The export
      // service may first repair a proven non-dyadic renderer boundary using
      // the rational timemap and complete source-event identity; raw MIDI at
      // either 16099 or 30739 still fails here against canonical 16100/30740.
      const tick = onsetTicks.get(id);
      if (tick === undefined) {
        eventlessMappedNotes += 1;
        continue;
      }
      if (ambiguousTicks.has(tick)) {
        ambiguousPerformedEvents += 1;
        addReason("EVENT_IDENTITY_AMBIGUOUS", 1,
          "Uma nota mapeada coincide com evento de uma voz sem associação demonstrável.");
        continue;
      }
      const key = `${tick}:${sourceNote.pitch}`;
      expected.set(key, (expected.get(key) ?? 0) + 1);
      const classified = sourceNote.grace ? expectedGrace : expectedRegular;
      classified.set(key, (classified.get(key) ?? 0) + 1);
      expectedPerformedAttacks += 1;
    }
  }
  addReason("TIMEMAP_EVENT_MISSING", eventlessMappedNotes,
    "Uma nota estruturalmente mapeada não possui início executado nem destino de ligadura comprovado.");

  const actual = new Map<string, number>();
  for (const note of actualNotes) {
    const key = `${note.tick}:${note.pitch}`;
    actual.set(key, (actual.get(key) ?? 0) + 1);
  }
  let checkedGraceEvents = 0;
  let unmatchedGraceEvents = 0;
  for (const [key, count] of expected) {
    const actualCount = actual.get(key) ?? 0;
    const regularCount = expectedRegular.get(key) ?? 0;
    const graceCount = expectedGrace.get(key) ?? 0;
    if (actualCount < regularCount) {
      const [tick, pitch] = key.split(":");
      const heard = actualNotes.filter((note) => note.tick === Number(tick)).map((note) => note.pitch).join(", ") || "nenhuma";
      const nearby = actualNotes.filter((note) => Math.abs(note.tick - Number(tick)) <= 8).map((note) => `${note.tick}:${note.pitch}`).join(", ") || "nenhum";
      throw new MidiEventMismatchError(`A altura executada diverge do MusicXML no tick ${tick}: esperada MIDI ${pitch}, recebida ${heard}; eventos próximos ${nearby}.`);
    }
    const matchedGrace = Math.min(graceCount, Math.max(0, actualCount - regularCount));
    checkedGraceEvents += matchedGrace;
    unmatchedGraceEvents += graceCount - matchedGrace;
  }
  addReason("GRACE_EVENT_UNPROVEN", unmatchedGraceEvents,
    "Uma graça não coincidiu exatamente com o tick derivado do timemap e permaneceu sem verificação, sem busca por proximidade ou altura.");

  const allSourceMapped = mappedSourcePitchedNotes === totalSourcePitchedNotes;
  const allMeiMapped = mappedMeiIds.size === meiNotes.length;
  const noSkippedReasons = reasons.size === 0;
  const exactEventSet = expectedPerformedAttacks === actualNotes.length && expected.size === actual.size &&
    [...expected].every(([key, count]) => actual.get(key) === count);
  if (allSourceMapped && allMeiMapped && noSkippedReasons && !exactEventSet) {
    throw new MidiEventMismatchError("O conjunto de alturas e inícios do MIDI diverge da execução derivada do MusicXML.");
  }
  const verified = allSourceMapped && allMeiMapped && noSkippedReasons && exactEventSet && expectedPerformedAttacks > 0;
  const checked = [...expectedRegular].reduce((sum, [, count]) => sum + count, 0) + checkedGraceEvents;
  const skippedSourceNotes = Math.max(0, totalSourcePitchedNotes - mappedSourcePitchedNotes);
  return {
    version: 1,
    scope: "performed_pitch_and_onset",
    status: verified ? "verified" : checked > 0 ? "partial" : "unverified",
    totalSourcePitchedNotes,
    mappedSourcePitchedNotes,
    expectedPerformedAttacks,
    checkedPitches: checked,
    checkedOnsets: checked,
    checkedGraceEvents,
    checkedDurations: 0,
    durationStatus: "not_checked",
    skippedSourceNotes,
    skippedPerformedEvents: eventlessMappedNotes + ambiguousPerformedEvents + unmatchedGraceEvents,
    skippedReasons: [...reasons.values()]
  };
}

function localName(node: Node | null | undefined): string {
  if (!node) return "";
  return (node as Node & { localName?: string | null }).localName || node.nodeName.replace(/^.*:/, "");
}

function parseXml(xml: string): { document: Document; valid: boolean } {
  let valid = true;
  const document = new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: () => { valid = false; },
      fatalError: () => { valid = false; }
    }
  }).parseFromString(xml, "application/xml");
  return { document, valid: valid && Boolean(document.documentElement) };
}

function directChildren(parent: Node | null | undefined, name?: string): Element[] {
  if (!parent) return [];
  const children: Element[] = [];
  for (let index = 0; index < parent.childNodes.length; index += 1) {
    const child = parent.childNodes.item(index);
    if (child?.nodeType === 1 && (!name || localName(child) === name)) children.push(child as Element);
  }
  return children;
}

function directChild(parent: Node | null | undefined, name: string): Element | undefined {
  return directChildren(parent, name)[0];
}

function directText(parent: Node | null | undefined, name: string): string | undefined {
  const text = directChild(parent, name)?.textContent?.trim();
  return text || undefined;
}

function expandedIds(id: string, expansionMap: Record<string, string[]>): string[] {
  const expanded = expansionMap[id];
  return expanded?.length ? [...new Set(expanded)] : [id];
}

function structuralGroupKey(note: Pick<SourcePitchNote, "measure" | "staff" | "voice">): string {
  return `${note.measure}\u0000${note.staff}\u0000${note.voice}`;
}

function sameStructuralFingerprint(source: SourcePitchNote, interpreted: MeiStructuralNote): boolean {
  return source.grace === interpreted.grace && source.chord === interpreted.chord &&
    source.onsetQ !== undefined && interpreted.onsetQ !== undefined && Math.abs(source.onsetQ - interpreted.onsetQ) < 1e-6 &&
    (source.grace || (source.durationQ !== undefined && interpreted.durationQ !== undefined &&
      Math.abs(source.durationQ - interpreted.durationQ) < 1e-6));
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    const group = grouped.get(value) ?? [];
    group.push(item);
    grouped.set(value, group);
  }
  return grouped;
}

function parseSourcePitchNotes(
  part: Element,
  partIndex: number,
  addReason: (code: string, count: number, message: string) => void
): { notes: SourcePitchNote[]; measureCount: number } {
  const measures = directChildren(part, "measure");
  const notes: SourcePitchNote[] = [];
  const transposeByStaff = new Map<string, number | undefined>();
  const semitones = new Map<string, number>([["C", 0], ["D", 2], ["E", 4], ["F", 5], ["G", 7], ["A", 9], ["B", 11]]);
  let divisions: number | undefined;

  measures.forEach((measure, measureIndex) => {
    const previousByVoice = new Map<string, SourcePitchNote>();
    let cursor = 0;
    for (const child of directChildren(measure)) {
      if (localName(child) === "attributes") {
        const divisionsText = directText(child, "divisions");
        if (divisionsText !== undefined) {
          const candidate = Number(divisionsText);
          divisions = Number.isInteger(candidate) && candidate > 0 ? candidate : undefined;
        }
        for (const transpose of directChildren(child, "transpose")) {
          const staff = transpose.getAttribute("number") || "*";
          const chromaticText = directText(transpose, "chromatic");
          const octaveText = directText(transpose, "octave-change") ?? "0";
          const chromatic = chromaticText === undefined ? NaN : Number(chromaticText);
          const octave = Number(octaveText);
          const unsupportedDouble = directChild(transpose, "double") !== undefined;
          transposeByStaff.set(staff,
            Number.isInteger(chromatic) && Number.isInteger(octave) && !unsupportedDouble ? chromatic + (12 * octave) : undefined);
        }
        continue;
      }
      if (localName(child) === "backup" || localName(child) === "forward") {
        const duration = Number(directText(child, "duration"));
        if (divisions !== undefined && Number.isFinite(duration)) cursor += localName(child) === "backup" ? -duration : duration;
        else divisions = undefined;
        continue;
      }
      if (localName(child) !== "note") continue;
      const grace = directChild(child, "grace") !== undefined;
      const isChordContinuation = directChild(child, "chord") !== undefined;
      const duration = Number(directText(child, "duration"));
      const pitch = directChild(child, "pitch");
      const staff = directText(child, "staff") ?? "1";
      const voice = directText(child, "voice") ?? "1";
      const previous = previousByVoice.get(voice);
      const onsetQ = divisions === undefined ? undefined : (isChordContinuation ? previous?.onsetQ : cursor / divisions);
      const durationQ = grace || divisions === undefined || !Number.isFinite(duration) || duration <= 0 ? undefined : duration / divisions;
      if (!isChordContinuation && !grace && Number.isFinite(duration) && duration > 0) cursor += duration;
      if (!pitch) continue;
      const step = directText(pitch, "step")?.toUpperCase();
      const octave = Number(directText(pitch, "octave"));
      const alter = Number(directText(pitch, "alter") ?? "0");
      const transpose = transposeByStaff.has(staff) ? transposeByStaff.get(staff) :
        transposeByStaff.has("*") ? transposeByStaff.get("*") : 0;
      const base = step ? semitones.get(step) : undefined;
      if (base === undefined || !Number.isInteger(octave) || !Number.isInteger(alter) || transpose === undefined) {
        addReason("SOURCE_PITCH_UNSUPPORTED", 1,
          "Uma altura ou transposição escrita não pôde ser reduzida inequivocamente a MIDI.");
        continue;
      }
      const midiPitch = (12 * (octave + 1)) + base + alter + transpose;
      if (!Number.isInteger(midiPitch) || midiPitch < 0 || midiPitch > 127) {
        addReason("SOURCE_PITCH_OUT_OF_RANGE", 1, "Uma altura escrita fica fora da faixa MIDI após a transposição.");
        continue;
      }
      const note: SourcePitchNote = {
        id: child.getAttribute("id") || child.getAttribute("xml:id") || undefined,
        part: partIndex,
        measure: measureIndex,
        staff,
        voice,
        grace,
        chord: isChordContinuation,
        pitch: midiPitch,
        onsetQ,
        durationQ
      };
      if (isChordContinuation) {
        const root = previous;
        if (!root) {
          addReason("CHORD_ROOT_AMBIGUOUS", 1, "Um membro de acorde não tem nota-raiz anterior na mesma voz e pauta.");
          continue;
        }
        root.chord = true;
      }
      notes.push(note);
      previousByVoice.set(voice, note);
    }
  });
  return { notes, measureCount: measures.length };
}

function parseMeiStructuralNotes(measures: Element[]): MeiStructuralNote[] {
  const notes: MeiStructuralNote[] = [];
  const owner = measures[0]?.ownerDocument;
  const ppqAtMeasure = new Map<Element, Map<string, number>>();
  const staffPpq = new Map<string, number>();
  for (const element of owner ? Array.from(owner.getElementsByTagName("*")) : []) {
    const name = localName(element);
    const ppq = Number(element.getAttribute("ppq"));
    if (name === "scoreDef" && Number.isFinite(ppq) && ppq > 0) {
      for (const staff of staffPpq.keys()) staffPpq.set(staff, ppq);
      staffPpq.set("*", ppq);
    } else if (name === "staffDef" && Number.isFinite(ppq) && ppq > 0) {
      staffPpq.set(element.getAttribute("n") || "1", ppq);
    } else if (name === "measure") {
      ppqAtMeasure.set(element, new Map(staffPpq));
    }
  }
  measures.forEach((measure, measureIndex) => {
    const staves = Array.from(measure.getElementsByTagName("staff"));
    for (const staff of staves) {
      const staffNumber = staff.getAttribute("n") || "1";
      for (const layer of Array.from(staff.getElementsByTagName("layer"))) {
        const voice = layer.getAttribute("n") || "1";
        const cursor = { q: 0 };
        collectMeiLayerNotes(layer, cursor, notes, {
          measure: measureIndex,
          staff: staffNumber,
          voice,
          ppqByStaff: ppqAtMeasure.get(measure) ?? new Map()
        });
      }
    }
  });
  return notes;
}

function meiDurationQ(element: Element, ppq?: number): number | undefined {
  const ppqDuration = Number(element.getAttribute("dur.ppq"));
  if (ppq !== undefined && Number.isFinite(ppqDuration) && ppqDuration > 0) return ppqDuration / ppq;
  const dur = Number(element.getAttribute("dur"));
  if (!Number.isFinite(dur) || dur <= 0) return undefined;
  const dots = Number(element.getAttribute("dots") || "0");
  if (!Number.isInteger(dots) || dots < 0) return undefined;
  return (4 / dur) * (2 - (1 / (2 ** dots)));
}

function collectMeiLayerNotes(
  parent: Element,
  cursor: { q: number },
  notes: MeiStructuralNote[],
  context: { measure: number; staff: string; voice: string; ppqByStaff: Map<string, number> }
): void {
  const ppqFor = (staff: string) => context.ppqByStaff.get(staff) ?? context.ppqByStaff.get("*");
  for (const child of directChildren(parent)) {
    const name = localName(child);
    if (name === "chord") {
      const chordStaff = child.getAttribute("staff") || context.staff;
      const durationQ = meiDurationQ(child, ppqFor(chordStaff));
      const grace = child.hasAttribute("grace");
      for (const note of Array.from(child.getElementsByTagName("note"))) {
        const id = note.getAttribute("xml:id");
        const noteStaff = note.getAttribute("staff") || chordStaff;
        const noteDurationQ = meiDurationQ(note, ppqFor(noteStaff));
        if (id) notes.push({ id, measure: context.measure, voice: context.voice,
          grace: grace || note.hasAttribute("grace"), chord: true, onsetQ: cursor.q,
          staff: noteStaff, durationQ: noteDurationQ ?? durationQ });
      }
      if (!grace && durationQ !== undefined) cursor.q += durationQ;
      else if (!grace) cursor.q = NaN;
      continue;
    }
    if (name === "note") {
      const id = child.getAttribute("xml:id");
      const grace = child.hasAttribute("grace");
      const noteStaff = child.getAttribute("staff") || context.staff;
      const durationQ = meiDurationQ(child, ppqFor(noteStaff));
      if (id) notes.push({ id, measure: context.measure, voice: context.voice,
        grace, chord: false, onsetQ: Number.isFinite(cursor.q) ? cursor.q : undefined,
        staff: noteStaff, durationQ });
      if (!grace && durationQ !== undefined) cursor.q += durationQ;
      else if (!grace) cursor.q = NaN;
      continue;
    }
    if (name === "rest" || name === "space" || name === "mRest" || name === "mSpace") {
      const eventStaff = child.getAttribute("staff") || context.staff;
      const durationQ = meiDurationQ(child, ppqFor(eventStaff));
      if (durationQ !== undefined) cursor.q += durationQ;
      else cursor.q = NaN;
      continue;
    }
    collectMeiLayerNotes(child, cursor, notes, context);
  }
}

export interface MidiTimingCanonicalization {
  midi: Buffer;
  repairedAttacks: number;
  repairedOffsets: number;
  affectedGroupIds: string[];
}

/**
 * Verovio's MIDI writer casts a double onset to an integer tick, while its
 * fractional timemap retains the musical time. At exact rational tick
 * boundaries the cast can land one tick early. Only a complete source/MEI
 * identity map and a unique time-group/pitch multiset may authorize that
 * single-direction correction. The final source-event validator still checks
 * the resulting MIDI at the canonical tick with no proximity matching.
 */
export function canonicalizeVerovioMidiTiming(
  midi: Buffer,
  musicXml: string,
  mei: string,
  timemap: PerformedEvent[],
  expansionMap: Record<string, string[]>
): MidiTimingCanonicalization {
  const unchanged = (): MidiTimingCanonicalization => ({ midi, repairedAttacks: 0, repairedOffsets: 0, affectedGroupIds: [] });
  if (!timemap.length || timemap.every((event) => !event.qfrac)) return unchanged();
  if (timemap.some((event) => !event.qfrac)) {
    throw new UnsupportedMidiEventValidationError("O timemap racional está incompleto.");
  }
  const sourceParsed = parseXml(musicXml);
  const meiParsed = parseXml(mei);
  if (!sourceParsed.valid || !meiParsed.valid || localName(sourceParsed.document.documentElement) !== "score-partwise") {
    throw new UnsupportedMidiEventValidationError("A identidade das notas para corrigir o tempo MIDI não é verificável.");
  }
  const addReason = () => undefined;
  const sourceNotes = directChildren(sourceParsed.document.documentElement, "part")
    .flatMap((part, index) => parseSourcePitchNotes(part, index, addReason).notes);
  const meiNotes = parseMeiStructuralNotes(Array.from(meiParsed.document.getElementsByTagName("measure")));
  const sourceById = new Map<string, SourcePitchNote>();
  const meiById = new Map(meiNotes.map((note) => [note.id, note]));
  for (const note of sourceNotes) {
    if (!note.id || sourceById.has(note.id) || !meiById.has(note.id) ||
        !sameStructuralFingerprint(note, meiById.get(note.id) as MeiStructuralNote)) {
      throw new UnsupportedMidiEventValidationError("A identidade estrutural de uma nota MIDI é ambígua.");
    }
    sourceById.set(note.id, note);
  }
  if (sourceNotes.length === 0 || sourceById.size !== meiNotes.length) {
    throw new UnsupportedMidiEventValidationError("A cobertura de notas MusicXML/MEI para o MIDI está incompleta.");
  }
  const renderedToSource = new Map<string, SourcePitchNote>();
  for (const note of sourceNotes) {
    for (const renderedId of expandedIds(note.id as string, expansionMap)) {
      if (renderedToSource.has(renderedId)) {
        throw new UnsupportedMidiEventValidationError("A expansão MIDI possui identidade de nota duplicada.");
      }
      renderedToSource.set(renderedId, note);
    }
  }
  const ppq = midi.readUInt16BE(12);
  const onsetQ = new Map<string, number>();
  const offsetQ = new Map<string, number>();
  for (const event of timemap) {
    eventMidiTick(event, ppq);
    for (const id of event.on ?? []) onsetQ.set(id, event.qstamp as number);
    for (const id of event.off ?? []) offsetQ.set(id, event.qstamp as number);
  }
  const tiedDestinations = new Set<string>();
  for (const tie of Array.from(meiParsed.document.getElementsByTagName("tie"))) {
    const startId = tie.getAttribute("startid")?.replace(/^#/, "");
    const endId = tie.getAttribute("endid")?.replace(/^#/, "");
    if (!startId || !endId) continue;
    const starts = expandedIds(startId, expansionMap);
    for (const end of expandedIds(endId, expansionMap)) {
      const endOnset = onsetQ.get(end);
      if (endOnset === undefined || starts.some((start) => {
        const startOffset = offsetQ.get(start);
        return startOffset !== undefined && Math.abs(startOffset - endOnset) < 1e-6;
      })) tiedDestinations.add(end);
    }
  }
  type ExpectedGroup = { tick: number; repairable: boolean; pitches: Map<number, number>; ids: string[] };
  const groups = new Map<number, ExpectedGroup>();
  const addPitch = (counts: Map<number, number>, pitch: number) => counts.set(pitch, (counts.get(pitch) ?? 0) + 1);
  for (const event of timemap) {
    const tick = eventMidiTick(event, ppq);
    for (const id of event.on ?? []) {
      const source = renderedToSource.get(id);
      if (!source) throw new UnsupportedMidiEventValidationError("Um ataque não possui nota de origem identificada.");
      if (tiedDestinations.has(id)) continue;
      let group = groups.get(tick);
      if (!group) {
        group = { tick, repairable: true, pitches: new Map(), ids: [] };
        groups.set(tick, group);
      }
      group.repairable &&= isIntegerTickBoundary(event, ppq, tick);
      group.ids.push(id);
      addPitch(group.pitches, source.pitch);
    }
  }
  const parsed = parseMidi(midi);
  const attacks = parsed.flatMap((track) => track.notes).filter((note) => !note.off);
  const byTick = groupBy(attacks, (note) => String(note.tick));
  const samePitches = (notes: NoteEvent[], expected: Map<number, number>): boolean => {
    if (notes.length !== [...expected.values()].reduce((sum, count) => sum + count, 0)) return false;
    const actual = new Map<number, number>();
    for (const note of notes) addPitch(actual, note.pitch);
    return actual.size === expected.size && [...expected].every(([pitch, count]) => actual.get(pitch) === count);
  };
  if (attacks.length !== [...groups.values()].reduce((sum, group) => sum + group.ids.length, 0)) {
    throw new MidiEventMismatchError("A quantidade de ataques MIDI diverge das notas executadas.");
  }
  if ([...groups.values()].every((group) => samePitches(byTick.get(String(group.tick)) ?? [], group.pitches))) return unchanged();
  const candidateOwner = new Map<number, ExpectedGroup>();
  for (const group of groups.values()) {
    for (const tick of group.repairable ? [group.tick - 1, group.tick] : [group.tick]) {
      if (tick < 0) continue;
      if (candidateOwner.has(tick) && (byTick.get(String(tick))?.length ?? 0) > 0) {
        throw new UnsupportedMidiEventValidationError("Dois grupos de notas disputam o mesmo tick MIDI.");
      }
      candidateOwner.set(tick, group);
    }
  }
  const repairs = new Map<string, number>();
  const shifts = new Map<string, number>();
  const affectedGroupIds = new Set<string>();
  const claimed = new Set<string>();
  for (const group of groups.values()) {
    const raw = [
      ...(group.repairable && group.tick > 0 ? byTick.get(String(group.tick - 1)) ?? [] : []),
      ...(byTick.get(String(group.tick)) ?? [])
    ];
    if (!samePitches(raw, group.pitches)) {
      throw new MidiEventMismatchError("Altura, multiplicidade ou início de um grupo MIDI diverge do MusicXML.");
    }
    for (const note of raw) {
      const key = `${note.track}:${note.index}`;
      if (claimed.has(key)) throw new UnsupportedMidiEventValidationError("Um ataque MIDI foi associado duas vezes.");
      claimed.add(key);
      const shift = group.tick - note.tick;
      shifts.set(key, shift);
      if (shift) {
        repairs.set(key, group.tick);
        // A chord/unison group's sound is proven as a multiset; individual
        // same-pitch members cannot be attributed to distinct MIDI messages.
        for (const id of group.ids) affectedGroupIds.add(id);
      }
    }
  }
  if (claimed.size !== attacks.length) throw new MidiEventMismatchError("O MIDI contém ataques fora dos grupos de origem.");
  let repairedOffsets = 0;
  for (const [trackIndex, track] of parsed.entries()) {
    const active = new Map<string, number[]>();
    for (const note of track.notes) {
      const voiceKey = `${note.channel}:${note.pitch}`;
      const queue = active.get(voiceKey) ?? [];
      const eventKey = `${trackIndex}:${note.index}`;
      if (!note.off) {
        queue.push(shifts.get(eventKey) ?? 0);
        active.set(voiceKey, queue);
        continue;
      }
      if (!queue.length || queue.some((shift) => shift !== queue[0])) {
        throw new UnsupportedMidiEventValidationError("O par note-on/note-off de uma altura sobreposta é ambíguo.");
      }
      const shift = queue.shift() as number;
      if (shift) {
        repairs.set(eventKey, note.tick + shift);
        repairedOffsets += 1;
      }
    }
    if ([...active.values()].some((queue) => queue.length)) {
      throw new UnsupportedMidiEventValidationError("Uma nota MIDI não possui note-off correspondente.");
    }
  }
  const repairedAttacks = [...shifts.values()].filter(Boolean).length;
  if (repairedAttacks !== repairedOffsets) {
    throw new UnsupportedMidiEventValidationError("A correção temporal não preserva todos os pares de notas.");
  }
  return { midi: serializeMidi(midi, parsed, repairs), repairedAttacks, repairedOffsets, affectedGroupIds: [...affectedGroupIds] };
}

/** Repairs a tie only when the performed route skips its written destination and a unique MIDI note can be identified. */
export function validateAndRepairSkippedTieDestinations(
  midi: Buffer,
  musicXml: string,
  mei: string,
  timemap: PerformedEvent[],
  expansionMap: Record<string, string[]>
): { midi: Buffer; checkedNotes: number; checkedDurations: number; verified: boolean; issues: MidiValidationIssue[]; limitations: string[]; sourceEventCoverage: MidiSourceEventCoverage } {
  const document = new DOMParser({ errorHandler: () => undefined }).parseFromString(mei, "application/xml");
  const measures = Array.from(document.getElementsByTagName("measure"));
  const sourceDocument = new DOMParser({ errorHandler: () => undefined }).parseFromString(musicXml, "application/xml");
  const sourceNotes = Array.from(sourceDocument.getElementsByTagName("note"));
  const comparableSource = sourceDocument.documentElement?.tagName === "score-partwise" &&
    sourceNotes.length > 0 && measures.length > 0 &&
    sourceDocument.getElementsByTagName("grace").length === 0 &&
    sourceDocument.getElementsByTagName("cue").length === 0;
  if (comparableSource) {
    const pitchedSourceNotes = sourceNotes.filter((note) =>
      note.getElementsByTagName("pitch").length > 0 || note.getElementsByTagName("unpitched").length > 0).length;
    const importedNotes = document.getElementsByTagName("note").length;
    if (pitchedSourceNotes !== importedNotes) {
      throw new MidiEventMismatchError("O motor omitiu notas escritas do MusicXML ao interpretar a partitura.");
    }
  }
  const sourceMeasureByRendered = new Map<string, string>();
  const noteMeasure = new Map<string, string>();
  const renderedNoteIds = new Set<string>();
  for (const measure of measures) {
    const id = measure.getAttribute("xml:id");
    if (!id) continue;
    for (const rendered of expansionMap[id]?.length ? expansionMap[id] : [id]) sourceMeasureByRendered.set(rendered, id);
    for (const note of Array.from(measure.getElementsByTagName("note"))) {
      const noteId = note.getAttribute("xml:id");
      if (noteId) {
        noteMeasure.set(noteId, id);
        for (const rendered of expansionMap[noteId]?.length ? expansionMap[noteId] : [noteId]) renderedNoteIds.add(rendered);
      }
    }
  }
  const played = timemap.filter((event): event is PerformedEvent & { measureOn: string; qstamp: number } =>
    typeof event.measureOn === "string" && typeof event.qstamp === "number" && Number.isFinite(event.qstamp));
  const onsets = new Map<string, number>();
  const onsetTicks = new Map<string, number>();
  const offsets = new Map<string, number>();
  const restOnsets = new Map<string, number>();
  const restOffsets = new Map<string, number>();
  for (const event of timemap) {
    if (typeof event.qstamp !== "number" || !Number.isFinite(event.qstamp)) continue;
    for (const id of event.on ?? []) {
      onsets.set(id, event.qstamp);
      onsetTicks.set(id, eventMidiTick(event, midi.readUInt16BE(12)));
    }
    for (const id of event.off ?? []) offsets.set(id, event.qstamp);
    for (const id of event.restsOn ?? []) restOnsets.set(id, event.qstamp);
    for (const id of event.restsOff ?? []) restOffsets.set(id, event.qstamp);
  }
  const checkedDurations = compareSimpleWrittenDurations(sourceDocument, measures, expansionMap, onsets, offsets, restOnsets, restOffsets);
  const orphaned: Array<{ onset: number; nominalEnd: number }> = [];
  let checkedNotes = 0;
  for (const tie of Array.from(document.getElementsByTagName("tie"))) {
    const startId = tie.getAttribute("startid")?.replace(/^#/, "");
    const endId = tie.getAttribute("endid")?.replace(/^#/, "");
    if (!startId || !endId) continue;
    const startMeasure = noteMeasure.get(startId);
    const endMeasure = noteMeasure.get(endId);
    if (!startMeasure || !endMeasure || startMeasure === endMeasure) continue;
    const sourceStarts = expansionMap[startId]?.length ? expansionMap[startId] : [startId];
    for (const renderedStart of sourceStarts) {
      const onset = onsets.get(renderedStart);
      const nominalEnd = offsets.get(renderedStart);
      if (onset === undefined) continue;
      if (nominalEnd === undefined) throw new UnsupportedMidiEventValidationError("A ligadura não tem fim temporal verificável.");
      const playedIndex = played.findIndex((event) => sourceMeasureByRendered.get(event.measureOn) === startMeasure && event.qstamp <= onset &&
        (played[played.indexOf(event) + 1]?.qstamp ?? Infinity) > onset);
      if (playedIndex < 0) throw new UnsupportedMidiEventValidationError("A ocorrência da ligadura não consta da navegação executada.");
      const next = played[playedIndex + 1];
      // A normal destination can share its written measure with another event
      // before the tied note. Only a skipped destination needs the nominal
      // boundary check below; otherwise a valid tie can be rejected merely
      // because the next timemap event is not the tied note itself.
      if (next && sourceMeasureByRendered.get(next.measureOn) === endMeasure) {
        checkedNotes += 1;
        continue;
      }
      if (!next || Math.abs(next.qstamp - nominalEnd) > 1e-6) {
        throw new UnsupportedMidiEventValidationError("A posição da ligadura entre compassos é ambígua.");
      }
      checkedNotes += 1;
      orphaned.push({ onset, nominalEnd });
    }
  }
  const parsed = parseMidi(midi);
  const ppq = midi.readUInt16BE(12);
  const noteEvents = parsed.flatMap((track) => track.notes);
  const repairs = new Map<string, number>();
  for (const orphan of orphaned) {
    const startTick = Math.round(orphan.onset * ppq);
    const endTick = Math.round(orphan.nominalEnd * ppq);
    if (Math.abs(startTick / ppq - orphan.onset) > 1e-6 || Math.abs(endTick / ppq - orphan.nominalEnd) > 1e-6) {
      throw new UnsupportedMidiEventValidationError("A duração da ligadura não cabe na resolução do MIDI.");
    }
    const candidates = noteEvents.filter((event) => !event.off && event.tick === startTick);
    if (candidates.length !== 1) throw new UnsupportedMidiEventValidationError("A nota ligada coincide com outra voz e não pode ser identificada com segurança.");
    const candidate = candidates[0];
    const samePitch = noteEvents.filter((event) => event.track === candidate.track && event.channel === candidate.channel && event.pitch === candidate.pitch);
    let active = 0;
    for (const event of samePitch) {
      if (event.tick >= startTick) break;
      active += event.off ? -1 : 1;
    }
    if (active !== 0) throw new UnsupportedMidiEventValidationError("Há notas iguais sobrepostas antes da ligadura.");
    if (samePitch.some((event) => !event.off && event.tick > startTick && event.tick < endTick)) {
      throw new UnsupportedMidiEventValidationError("Há notas iguais sobrepostas dentro da ligadura.");
    }
    const firstOff = samePitch.find((event) => event.off && event.tick > startTick);
    if (!firstOff || firstOff.tick < endTick - 1) {
      throw new UnsupportedMidiEventValidationError("A duração MIDI da ligadura não corresponde ao compasso.");
    }
    if (firstOff.tick > endTick) repairs.set(`${firstOff.track}:${firstOff.index}`, Math.max(startTick + 1, endTick - 1));
  }
  const limitations = ["Esta conferência compara MusicXML, interpretação do motor e MIDI; não verifica a fidelidade à imagem original."];
  if (!comparableSource) limitations.push("A conferência legada de contagem não se aplica; a cobertura de alturas e inícios consta no relatório estrutural.");
  const canCompareOnsets = document.getElementsByTagName("chord").length === 0 &&
    document.getElementsByTagName("grace").length === 0 &&
    renderedNoteIds.size > 0 && [...renderedNoteIds].every((id) => onsets.has(id));
  if (canCompareOnsets) {
    const suppressed = new Set<string>();
    for (const tie of Array.from(document.getElementsByTagName("tie"))) {
      const startId = tie.getAttribute("startid")?.replace(/^#/, "");
      const endId = tie.getAttribute("endid")?.replace(/^#/, "");
      if (!startId || !endId) continue;
      for (const renderedEnd of expansionMap[endId]?.length ? expansionMap[endId] : [endId]) {
        const targetOnset = onsets.get(renderedEnd);
        if (targetOnset === undefined) continue;
        if ((expansionMap[startId]?.length ? expansionMap[startId] : [startId]).some((renderedStart) =>
          offsets.get(renderedStart) !== undefined && Math.abs((offsets.get(renderedStart) as number) - targetOnset) < 1e-6)) {
          suppressed.add(renderedEnd);
        }
      }
    }
    const expected = new Map<number, number>();
    for (const id of renderedNoteIds) {
      if (suppressed.has(id)) continue;
      const onset = onsets.get(id) as number;
      const nearestTick = Math.round(onset * ppq);
      if (Math.abs(nearestTick / ppq - onset) > 1e-6) throw new UnsupportedMidiEventValidationError("O início de uma nota não cabe na resolução do MIDI.");
      const tick = onsetTicks.get(id);
      if (tick === undefined) throw new UnsupportedMidiEventValidationError("O início da nota não possui tick verificável.");
      expected.set(tick, (expected.get(tick) ?? 0) + 1);
    }
    const actual = new Map<number, number>();
    for (const event of noteEvents) {
      if (event.off) continue;
      actual.set(event.tick, (actual.get(event.tick) ?? 0) + 1);
    }
    if (expected.size !== actual.size || [...expected].some(([tick, count]) => actual.get(tick) !== count)) {
      throw new MidiEventMismatchError("As entradas de notas do MIDI divergem da navegação executada do MusicXML.");
    }
    checkedNotes = [...expected.values()].reduce((sum, count) => sum + count, 0);
    limitations.push("A conferência legada de inícios e contagem foi concluída.");
  } else {
    limitations.push("A comparação de inícios não cobre acordes, ornamentos ou eventos sem posição comprovada.");
  }
  const sourceEventCoverage = inspectMidiSourceEvents(midi, musicXml, mei, timemap, expansionMap);
  checkedNotes = sourceEventCoverage.checkedPitches;
  if (sourceEventCoverage.status === "verified") {
    limitations.push(`Altura e início de ${sourceEventCoverage.checkedPitches} ataques, incluindo ${sourceEventCoverage.checkedGraceEvents} graças, foram conferidos contra o MusicXML.`);
  } else {
    limitations.push("A conferência de altura/início ficou parcial ou não verificada; o relatório estrutural preserva os motivos sem promover o resultado a aprovado.");
  }
  limitations.push("O relatório estrutural verifica alturas e inícios executados; articulações, dinâmica e fidelidade rítmica integral permanecem fora desse status.");
  limitations.push("O vínculo por ID não certifica o posicionamento visual da nota em pauta ou voz.");
  if (checkedDurations > 0) limitations.push(`Durações declaradas de ${checkedDurations} notas ou pausas foram conferidas com a execução do motor.`);
  else limitations.push("As durações individuais de notas e pausas não puderam ser conferidas neste arranjo.");
  if (!repairs.size) return {
    midi,
    checkedNotes,
    checkedDurations,
    verified: sourceEventCoverage.status === "verified",
    issues: [],
    limitations,
    sourceEventCoverage
  };
  return {
    midi: serializeMidi(midi, parsed, repairs), checkedNotes, checkedDurations,
    verified: sourceEventCoverage.status === "verified",
    issues: [{ code: "MIDI_SKIPPED_TIE_REPAIRED", message: "Ligadura sem destino na navegação repetida foi encerrada no fim do compasso." }],
    limitations,
    sourceEventCoverage
  };
}

function compareSimpleWrittenDurations(
  sourceDocument: Document,
  meiMeasures: Element[],
  expansionMap: Record<string, string[]>,
  onsets: Map<string, number>,
  offsets: Map<string, number>,
  restOnsets: Map<string, number>,
  restOffsets: Map<string, number>
): number {
  if (sourceDocument.documentElement?.tagName !== "score-partwise") return 0;
  const parts = Array.from(sourceDocument.getElementsByTagName("part"));
  if (parts.length !== 1) return 0;
  const sourceMeasures = Array.from(parts[0].getElementsByTagName("measure"));
  if (sourceMeasures.length !== meiMeasures.length) return 0;
  let divisions = 0;
  let checked = 0;
  for (let index = 0; index < sourceMeasures.length; index++) {
    const source = sourceMeasures[index];
    const mei = meiMeasures[index];
    const declaredDivisions = Array.from(source.getElementsByTagName("divisions"));
    if (declaredDivisions.length > 0) divisions = Number(declaredDivisions.at(-1)?.textContent);
    if (declaredDivisions.length > 1) continue;
    if (source.getElementsByTagName("backup").length || source.getElementsByTagName("forward").length ||
      source.getElementsByTagName("chord").length || source.getElementsByTagName("grace").length ||
      source.getElementsByTagName("cue").length || mei.getElementsByTagName("mRest").length) continue;
    if (!Number.isFinite(divisions) || divisions <= 0) continue;
    const written = Array.from(source.getElementsByTagName("note"));
    const imported = Array.from(mei.getElementsByTagName("*")).filter((element) =>
      element.tagName === "note" || element.tagName === "rest");
    if (written.length !== imported.length) {
      if (written.length > 0) throw new MidiEventMismatchError("O motor omitiu notas ou pausas escritas do MusicXML.");
      continue;
    }
    for (let noteIndex = 0; noteIndex < written.length; noteIndex++) {
      const sourceNote = written[noteIndex];
      const importedNote = imported[noteIndex];
      const isRest = sourceNote.getElementsByTagName("rest").length > 0;
      if (isRest !== (importedNote.tagName === "rest")) {
        throw new MidiEventMismatchError("A interpretação trocou uma nota e uma pausa escritas.");
      }
      const rawDuration = sourceNote.getElementsByTagName("duration")[0]?.textContent;
      const duration = rawDuration === undefined ? NaN : Number(rawDuration);
      const id = importedNote.getAttribute("xml:id");
      if (!Number.isFinite(duration) || duration <= 0 || !id) continue;
      const rendered = expansionMap[id]?.length ? expansionMap[id] : [id];
      const eventOnsets = isRest ? restOnsets : onsets;
      const eventOffsets = isRest ? restOffsets : offsets;
      const occurrence = rendered.find((renderedId) => eventOnsets.has(renderedId) && eventOffsets.has(renderedId));
      if (!occurrence) continue;
      const performed = (eventOffsets.get(occurrence) as number) - (eventOnsets.get(occurrence) as number);
      const declared = duration / divisions;
      if (Math.abs(performed - declared) > 1e-6) {
        throw new MidiEventMismatchError("A duração executada de nota ou pausa diverge da duração declarada no MusicXML.");
      }
      checked += 1;
    }
  }
  return checked;
}

function parseMidi(midi: Buffer): ParsedTrack[] {
  if (midi.length < 14 || midi.toString("ascii", 0, 4) !== "MThd" || midi.readUInt32BE(4) !== 6 || midi.readUInt16BE(12) & 0x8000) {
    throw new UnsupportedMidiEventValidationError("O cabeçalho MIDI não é compatível com a verificação de eventos.");
  }
  const tracks: ParsedTrack[] = [];
  let position = 14;
  for (let trackIndex = 0; trackIndex < midi.readUInt16BE(10); trackIndex += 1) {
    if (midi.toString("ascii", position, position + 4) !== "MTrk") throw new UnsupportedMidiEventValidationError("Trilha MIDI inválida.");
    const end = position + 8 + midi.readUInt32BE(position + 4);
    if (end > midi.length) throw new UnsupportedMidiEventValidationError("Trilha MIDI truncada.");
    let cursor = position + 8;
    let tick = 0;
    let runningStatus = 0;
    const events: TrackEvent[] = [];
    const notes: NoteEvent[] = [];
    while (cursor < end) {
      const delta = readVlq(midi, cursor); cursor = delta.next; tick += delta.value;
      const start = cursor;
      let status = midi[cursor];
      if (status >= 0x80) { cursor++; runningStatus = status < 0xf0 ? status : 0; }
      else status = runningStatus;
      if (!status) throw new UnsupportedMidiEventValidationError("Running status MIDI inválido.");
      if (status === 0xff || status === 0xf0 || status === 0xf7) {
        if (status === 0xff) cursor++;
        const length = readVlq(midi, cursor); cursor = length.next + length.value;
      } else {
        const size = (status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0 ? 1 : 2;
        if (cursor + size > end) throw new UnsupportedMidiEventValidationError("Evento MIDI truncado.");
        const pitch = midi[cursor]; const velocity = size === 2 ? midi[cursor + 1] : 0;
        if ((status & 0xf0) === 0x80 || (status & 0xf0) === 0x90) {
          notes.push({ tick, channel: status & 0x0f, pitch, velocity, off: (status & 0xf0) === 0x80 || velocity === 0, track: trackIndex, index: events.length });
        }
        cursor += size;
      }
      if (cursor > end) throw new UnsupportedMidiEventValidationError("Evento MIDI truncado.");
      const bytes = midi.subarray(start, cursor);
      events.push({ tick, bytes: bytes[0] >= 0x80 ? bytes : Buffer.concat([Buffer.from([status]), bytes]), order: events.length });
    }
    tracks.push({ events, notes });
    position = end;
  }
  if (position !== midi.length) throw new UnsupportedMidiEventValidationError("Dados extras após o MIDI.");
  return tracks;
}

function serializeMidi(original: Buffer, tracks: ParsedTrack[], repairs: Map<string, number>): Buffer {
  const chunks: Buffer[] = [original.subarray(0, 14)];
  tracks.forEach((track, trackIndex) => {
    const body: Buffer[] = [];
    let previous = 0;
    const ordered = track.events.map((event) => ({ ...event, tick: repairs.get(`${trackIndex}:${event.order}`) ?? event.tick }));
    const isEndOfTrack = (event: TrackEvent) => event.bytes.length >= 3 &&
      event.bytes[0] === 0xff && event.bytes[1] === 0x2f && event.bytes[2] === 0x00;
    const lastMusicalTick = ordered.filter((event) => !isEndOfTrack(event))
      .reduce((latest, event) => Math.max(latest, event.tick), 0);
    for (const event of ordered) if (isEndOfTrack(event)) event.tick = Math.max(event.tick, lastMusicalTick);
    ordered.sort((a, b) => a.tick - b.tick || Number(isEndOfTrack(a)) - Number(isEndOfTrack(b)) || a.order - b.order);
    for (const event of ordered) {
      body.push(writeVlq(event.tick - previous), Buffer.from(event.bytes));
      previous = event.tick;
    }
    const bytes = Buffer.concat(body);
    const header = Buffer.alloc(8); header.write("MTrk", 0, "ascii"); header.writeUInt32BE(bytes.length, 4);
    chunks.push(header, bytes);
  });
  return Buffer.concat(chunks);
}

function readVlq(bytes: Uint8Array, start: number): { value: number; next: number } {
  let value = 0;
  for (let cursor = start; cursor < Math.min(start + 4, bytes.length); cursor++) {
    const byte = bytes[cursor]; value = (value << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) return { value, next: cursor + 1 };
  }
  throw new UnsupportedMidiEventValidationError("Delta MIDI inválido.");
}
function writeVlq(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 0x0fffffff) throw new UnsupportedMidiEventValidationError("Delta MIDI não representável.");
  const bytes = [value & 0x7f];
  for (value >>= 7; value; value >>= 7) bytes.unshift((value & 0x7f) | 0x80);
  return Buffer.from(bytes);
}
