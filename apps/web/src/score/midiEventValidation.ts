export interface PerformedMidiEvent {
  measureOn?: string;
  on?: string[];
  off?: string[];
  qstamp?: number;
}

export class UnsupportedMidiEventValidationError extends Error {
  constructor(message: string) { super(message); this.name = "UnsupportedMidiEventValidationError"; }
}

type MidiEvent = { tick: number; bytes: Uint8Array; order: number };
type NoteEvent = { tick: number; track: number; index: number; channel: number; pitch: number; off: boolean };
type MidiTrack = { events: MidiEvent[]; notes: NoteEvent[] };

/** Ends a tie at its written boundary when repeat navigation skips its destination. */
export function repairSkippedTieDestinations(
  midi: Uint8Array,
  mei: string,
  timemap: PerformedMidiEvent[],
  expansionMap: Record<string, string[]>
): Uint8Array {
  if (!/<tie\b/.test(mei)) return midi;
  const document = new DOMParser().parseFromString(mei, "application/xml");
  const sourceMeasureByRendered = new Map<string, string>();
  const noteMeasure = new Map<string, string>();
  for (const measure of Array.from(document.getElementsByTagName("measure"))) {
    const id = measure.getAttribute("xml:id");
    if (!id) continue;
    for (const rendered of expansionMap[id]?.length ? expansionMap[id] : [id]) sourceMeasureByRendered.set(rendered, id);
    for (const note of Array.from(measure.getElementsByTagName("note"))) {
      const noteId = note.getAttribute("xml:id");
      if (noteId) noteMeasure.set(noteId, id);
    }
  }
  const played = timemap.filter((event): event is PerformedMidiEvent & { measureOn: string; qstamp: number } =>
    typeof event.measureOn === "string" && typeof event.qstamp === "number" && Number.isFinite(event.qstamp));
  const onsets = new Map<string, number>();
  const offsets = new Map<string, number>();
  for (const event of timemap) {
    if (typeof event.qstamp !== "number" || !Number.isFinite(event.qstamp)) continue;
    for (const id of event.on ?? []) onsets.set(id, event.qstamp);
    for (const id of event.off ?? []) offsets.set(id, event.qstamp);
  }
  const orphaned: Array<{ onset: number; nominalEnd: number }> = [];
  for (const tie of Array.from(document.getElementsByTagName("tie"))) {
    const startId = tie.getAttribute("startid")?.replace(/^#/, "");
    const endId = tie.getAttribute("endid")?.replace(/^#/, "");
    if (!startId || !endId) continue;
    const startMeasure = noteMeasure.get(startId);
    const endMeasure = noteMeasure.get(endId);
    if (!startMeasure || !endMeasure || startMeasure === endMeasure) continue;
    for (const renderedStart of expansionMap[startId]?.length ? expansionMap[startId] : [startId]) {
      const onset = onsets.get(renderedStart);
      const nominalEnd = offsets.get(renderedStart);
      if (onset === undefined) continue;
      if (nominalEnd === undefined) throw new UnsupportedMidiEventValidationError("A ligadura não tem fim temporal verificável.");
      const playedIndex = played.findIndex((event, index) => sourceMeasureByRendered.get(event.measureOn) === startMeasure &&
        event.qstamp <= onset && (played[index + 1]?.qstamp ?? Infinity) > onset);
      if (playedIndex < 0) throw new UnsupportedMidiEventValidationError("A ligadura não consta da navegação executada.");
      const next = played[playedIndex + 1];
      // The destination is played normally: its tied duration need not end
      // at the next measure boundary. Only skipped destinations need repair.
      if (next && sourceMeasureByRendered.get(next.measureOn) === endMeasure) continue;
      if (!next || Math.abs(next.qstamp - nominalEnd) > 1e-6) {
        throw new UnsupportedMidiEventValidationError("A posição da ligadura entre compassos é ambígua.");
      }
      if (sourceMeasureByRendered.get(next.measureOn) !== endMeasure) orphaned.push({ onset, nominalEnd });
    }
  }
  if (!orphaned.length) return midi;
  const ppq = read16(midi, 12);
  const tracks = parseMidi(midi);
  const notes = tracks.flatMap((track) => track.notes);
  const repairs = new Map<string, number>();
  for (const orphan of orphaned) {
    const startTick = Math.round(orphan.onset * ppq);
    const endTick = Math.round(orphan.nominalEnd * ppq);
    if (Math.abs(startTick / ppq - orphan.onset) > 1e-6 || Math.abs(endTick / ppq - orphan.nominalEnd) > 1e-6) {
      throw new UnsupportedMidiEventValidationError("A duração da ligadura não cabe na resolução do MIDI.");
    }
    const candidates = notes.filter((note) => !note.off && note.tick === startTick);
    if (candidates.length !== 1) throw new UnsupportedMidiEventValidationError("Há vozes simultâneas na nota ligada.");
    const candidate = candidates[0];
    const samePitch = notes.filter((note) => note.track === candidate.track && note.channel === candidate.channel && note.pitch === candidate.pitch);
    let active = 0;
    for (const note of samePitch) {
      if (note.tick >= startTick) break;
      active += note.off ? -1 : 1;
    }
    if (active !== 0 || samePitch.some((note) => !note.off && note.tick > startTick && note.tick < endTick)) {
      throw new UnsupportedMidiEventValidationError("Há notas iguais sobrepostas na ligadura.");
    }
    const firstOff = samePitch.find((note) => note.off && note.tick > startTick);
    if (!firstOff || firstOff.tick < endTick - 1) throw new UnsupportedMidiEventValidationError("A duração MIDI da ligadura é inconsistente.");
    if (firstOff.tick > endTick) repairs.set(`${firstOff.track}:${firstOff.index}`, Math.max(startTick + 1, endTick - 1));
  }
  return repairs.size ? serializeMidi(midi, tracks, repairs) : midi;
}

function parseMidi(midi: Uint8Array): MidiTrack[] {
  if (midi.length < 14 || ascii(midi, 0, 4) !== "MThd" || read32(midi, 4) !== 6 || (read16(midi, 12) & 0x8000)) {
    throw new UnsupportedMidiEventValidationError("Cabeçalho MIDI inválido.");
  }
  const tracks: MidiTrack[] = [];
  let position = 14;
  for (let trackIndex = 0; trackIndex < read16(midi, 10); trackIndex++) {
    if (ascii(midi, position, position + 4) !== "MTrk") throw new UnsupportedMidiEventValidationError("Trilha MIDI inválida.");
    const end = position + 8 + read32(midi, position + 4);
    if (end > midi.length) throw new UnsupportedMidiEventValidationError("Trilha MIDI truncada.");
    let cursor = position + 8;
    let tick = 0;
    let runningStatus = 0;
    const events: MidiEvent[] = [];
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
          notes.push({ tick, track: trackIndex, index: events.length, channel: status & 0x0f, pitch, off: (status & 0xf0) === 0x80 || velocity === 0 });
        }
        cursor += size;
      }
      if (cursor > end) throw new UnsupportedMidiEventValidationError("Evento MIDI truncado.");
      const bytes = midi.subarray(start, cursor);
      events.push({ tick, bytes: bytes[0] >= 0x80 ? bytes : concat([Uint8Array.of(status), bytes]), order: events.length });
    }
    tracks.push({ events, notes });
    position = end;
  }
  if (position !== midi.length) throw new UnsupportedMidiEventValidationError("Dados extras após o MIDI.");
  return tracks;
}

function serializeMidi(original: Uint8Array, tracks: MidiTrack[], repairs: Map<string, number>): Uint8Array {
  const chunks: Uint8Array[] = [original.subarray(0, 14)];
  tracks.forEach((track, trackIndex) => {
    const body: Uint8Array[] = [];
    let previous = 0;
    const ordered = track.events.map((event) => ({ ...event, tick: repairs.get(`${trackIndex}:${event.order}`) ?? event.tick }));
    ordered.sort((a, b) => a.tick - b.tick || a.order - b.order);
    for (const event of ordered) { body.push(writeVlq(event.tick - previous), event.bytes); previous = event.tick; }
    const bytes = concat(body);
    const header = new Uint8Array(8); header.set([77, 84, 114, 107]); write32(header, 4, bytes.length);
    chunks.push(header, bytes);
  });
  return concat(chunks);
}
function readVlq(bytes: Uint8Array, start: number): { value: number; next: number } {
  let value = 0;
  for (let cursor = start; cursor < Math.min(start + 4, bytes.length); cursor++) {
    const byte = bytes[cursor]; value = (value << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) return { value, next: cursor + 1 };
  }
  throw new UnsupportedMidiEventValidationError("Delta MIDI inválido.");
}
function writeVlq(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0x0fffffff) throw new UnsupportedMidiEventValidationError("Delta MIDI inválido.");
  const bytes = [value & 0x7f];
  for (value >>= 7; value; value >>= 7) bytes.unshift((value & 0x7f) | 0x80);
  return Uint8Array.from(bytes);
}
function read16(bytes: Uint8Array, offset: number): number { return (bytes[offset] << 8) | bytes[offset + 1]; }
function read32(bytes: Uint8Array, offset: number): number { return (bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0; }
function write32(bytes: Uint8Array, offset: number, value: number): void { bytes.set([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff], offset); }
function ascii(bytes: Uint8Array, start: number, end: number): string { return String.fromCharCode(...bytes.subarray(start, end)); }
function concat(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
