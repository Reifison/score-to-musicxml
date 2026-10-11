/** A tempo marking at a performed position, measured in quarter notes. */
export interface PerformedTempoChange {
  quarter: number;
  bpm: number;
}

export interface TempoTimelineEvent {
  measureOn?: string;
  qstamp?: number;
  tempo?: number;
  tstamp?: number;
}

export type TempoExpansionMap = Record<string, string[]>;

export interface TempoClock {
  millisecondsAtQuarter(quarter: number): number;
  quarterAtMilliseconds(milliseconds: number): number;
  tempoAtQuarter(quarter: number): number;
}

export class UnsupportedTempoTimelineError extends Error {
  public constructor(message = "The score tempo timeline cannot be mapped safely.") {
    super(message);
    this.name = "UnsupportedTempoTimelineError";
  }
}

const STANDARD_MIDI_DEFAULT_BPM = 120;

interface MeiTempoMark {
  measureId?: string;
  localQuarter?: number;
  bpm?: number;
}

interface MeiMeasureContext {
  id?: string;
  globalMeterUnit?: number;
  staffMeterUnits: Map<string, number | undefined>;
  staffNumbers: Set<string>;
}

interface MidiEvent {
  absoluteTick: number;
  message: Uint8Array;
  order: number;
  tempo?: { microsecondsPerQuarter: number };
  endOfTrack?: boolean;
}

interface MidiTrack {
  bytes: Uint8Array;
  events: MidiEvent[];
  endTick: number;
}

/**
 * Maps Verovio-imported MEI tempo markings onto performed measure occurrences.
 * Keep this implementation in sync with apps/web/src/score/midiTempoTimeline.ts;
 * the shared parity fixture is exercised by both workspace test suites.
 */
export function getPerformedTempoTimeline(
  mei: string,
  timemap: TempoTimelineEvent[],
  expansionMap: TempoExpansionMap
): { changes: PerformedTempoChange[]; hasIntraMeasureTempo: boolean } {
  const parsedMarks = readMeiTempoMarks(mei);
  if (parsedMarks.hasUnknownPosition) {
    throw new UnsupportedTempoTimelineError("A tempo marking has no proven written-measure position.");
  }
  if (!parsedMarks.hasIntraMeasureTempo) return { changes: [], hasIntraMeasureTempo: false };
  const marks = parsedMarks.marks;
  if (marks.some((mark) => !mark.measureId || mark.localQuarter === undefined || mark.bpm === undefined)) {
    throw new UnsupportedTempoTimelineError("A tempo marking cannot be mapped to a written measure and BPM.");
  }

  const measureStarts = new Map<string, number[]>();
  for (const event of timemap) {
    const measureId = event.measureOn;
    if (typeof measureId !== "string" || !measureId) continue;
    if (typeof event.qstamp !== "number" || !Number.isFinite(event.qstamp) || event.qstamp < 0) {
      throw new UnsupportedTempoTimelineError("A performed measure has no valid quarter-note position.");
    }
    const occurrences = measureStarts.get(measureId) ?? [];
    occurrences.push(event.qstamp);
    measureStarts.set(measureId, occurrences);
  }

  const changes: PerformedTempoChange[] = [];
  for (const mark of marks) {
    const measureId = mark.measureId as string;
    const localQuarter = mark.localQuarter as number;
    const bpm = mark.bpm as number;
    const expandedIds = expansionMap[measureId];
    const occurrenceIds = Array.isArray(expandedIds) && expandedIds.length > 0
      ? [...new Set(expandedIds)]
      : measureStarts.has(measureId)
        ? [measureId]
        : undefined;

    if (!occurrenceIds?.length) {
      throw new UnsupportedTempoTimelineError("A tempo marking has no proven performed measure occurrence.");
    }

    let occurrenceCount = 0;
    for (const occurrenceId of occurrenceIds) {
      const starts = measureStarts.get(occurrenceId);
      if (!starts?.length) {
        throw new UnsupportedTempoTimelineError("An expanded tempo measure is missing from the performed timemap.");
      }
      for (const startQuarter of starts) {
        const quarter = cleanQuarter(startQuarter + localQuarter);
        changes.push({ quarter, bpm });
        occurrenceCount += 1;
      }
    }
    if (occurrenceCount === 0) {
      throw new UnsupportedTempoTimelineError("A tempo marking has no performed measure occurrence.");
    }
  }

  changes.sort((left, right) => left.quarter - right.quarter);
  const normalized: PerformedTempoChange[] = [];
  for (const change of changes) {
    const previous = normalized.at(-1);
    if (previous && Math.abs(previous.quarter - change.quarter) < 1e-8) {
      if (Math.abs(previous.bpm - change.bpm) > 1e-8) {
        throw new UnsupportedTempoTimelineError("Conflicting tempo markings share a performed position.");
      }
      continue;
    }
    normalized.push(change);
  }

  if (!normalized.some((change) => Math.abs(change.quarter) < 1e-8)) {
    normalized.unshift({ quarter: 0, bpm: STANDARD_MIDI_DEFAULT_BPM });
  }

  const stateChanges: PerformedTempoChange[] = [];
  for (const change of normalized) {
    const previous = stateChanges.at(-1);
    if (previous && Math.abs(previous.bpm - change.bpm) < 1e-8) continue;
    stateChanges.push(change);
  }

  return {
    changes: stateChanges,
    hasIntraMeasureTempo: parsedMarks.hasIntraMeasureTempo
  };
}

/** Creates a reversible score-quarter/millisecond map from quarter-note BPM changes. */
export function createTempoClock(changes: PerformedTempoChange[], initialBpm: number): TempoClock {
  if (!Number.isFinite(initialBpm) || initialBpm <= 0) {
    throw new UnsupportedTempoTimelineError("The initial MIDI tempo is invalid.");
  }
  const points: Array<{ quarter: number; bpm: number; milliseconds: number }> = [
    { quarter: 0, bpm: initialBpm, milliseconds: 0 }
  ];
  const sorted = [...changes].sort((left, right) => left.quarter - right.quarter);
  for (const change of sorted) {
    if (!Number.isFinite(change.quarter) || change.quarter < 0 || !Number.isFinite(change.bpm) || change.bpm <= 0) {
      throw new UnsupportedTempoTimelineError("A tempo change has invalid position or BPM.");
    }
    const previous = points.at(-1);
    if (previous && Math.abs(previous.quarter - change.quarter) < 1e-8) {
      if (change.quarter === 0) {
        previous.bpm = change.bpm;
        continue;
      }
      if (Math.abs(previous.bpm - change.bpm) > 1e-8) {
        throw new UnsupportedTempoTimelineError("Conflicting tempo markings share a performed position.");
      }
      continue;
    }
    const start = points.at(-1) as { quarter: number; bpm: number; milliseconds: number };
    const milliseconds = start.milliseconds + (change.quarter - start.quarter) * (60_000 / start.bpm);
    points.push({ quarter: change.quarter, bpm: change.bpm, milliseconds });
  }

  const pointAtQuarter = (quarter: number) => {
    if (!Number.isFinite(quarter) || quarter < 0) throw new UnsupportedTempoTimelineError("A score quarter position is invalid.");
    let selected = points[0];
    for (const point of points) {
      if (point.quarter > quarter) break;
      selected = point;
    }
    return selected;
  };
  const pointAtMilliseconds = (milliseconds: number) => {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new UnsupportedTempoTimelineError("A playback time is invalid.");
    let selected = points[0];
    for (let index = 1; index < points.length; index += 1) {
      if (points[index].milliseconds > milliseconds) break;
      selected = points[index];
    }
    return selected;
  };

  return {
    millisecondsAtQuarter(quarter) {
      const point = pointAtQuarter(quarter);
      return point.milliseconds + (quarter - point.quarter) * (60_000 / point.bpm);
    },
    quarterAtMilliseconds(milliseconds) {
      const point = pointAtMilliseconds(milliseconds);
      return point.quarter + (milliseconds - point.milliseconds) * (point.bpm / 60_000);
    },
    tempoAtQuarter(quarter) {
      return pointAtQuarter(quarter).bpm;
    }
  };
}

/** Rewrites only tempo metadata in the first SMF track; note tracks remain byte-identical. */
export function rewriteMidiTempoEvents(
  midi: Uint8Array,
  changes: PerformedTempoChange[]
): Uint8Array {
  const header = readMidiHeader(midi);
  if (header.format !== 0 && header.format !== 1) {
    throw new UnsupportedTempoTimelineError("Only MIDI format 0 or 1 can be synchronized safely.");
  }
  if (changes.length === 0) return midi;

  const trackRecords: Array<{ start: number; end: number }> = [];
  let cursor = header.trackStart;
  const parsedTracks: MidiTrack[] = [];
  for (let trackIndex = 0; trackIndex < header.trackCount; trackIndex += 1) {
    if (!matchesAscii(midi, cursor, "MTrk")) {
      throw new UnsupportedTempoTimelineError("The MIDI track layout is not supported.");
    }
    const length = readUint32(midi, cursor + 4);
    const start = cursor + 8;
    const end = start + length;
    if (end > midi.length) throw new UnsupportedTempoTimelineError("The MIDI file contains a truncated track.");
    trackRecords.push({ start: cursor, end });
    parsedTracks.push(parseMidiTrack(midi.subarray(start, end)));
    cursor = end;
  }
  if (cursor !== midi.length) throw new UnsupportedTempoTimelineError("The MIDI file has trailing unsupported data.");

  for (let index = 1; index < parsedTracks.length; index += 1) {
    if (parsedTracks[index].events.some((event) => event.tempo)) {
      throw new UnsupportedTempoTimelineError("Tempo metadata appears outside the conductor track.");
    }
  }

  const ppq = header.division;
  const renderedEndTick = Math.max(...parsedTracks.map((track) => track.endTick));
  const targetEvents = changes.map((change) => {
    if (!Number.isFinite(change.quarter) || change.quarter < 0 || !Number.isFinite(change.bpm) || change.bpm <= 0) {
      throw new UnsupportedTempoTimelineError("A tempo change has invalid position or BPM.");
    }
    const tick = Math.round(change.quarter * ppq);
    if (Math.abs(tick / ppq - change.quarter) > 1e-7 || tick > 0x0fffffff) {
      throw new UnsupportedTempoTimelineError("A tempo position is not representable at this MIDI resolution.");
    }
    const microsecondsPerQuarter = Math.round(60_000_000 / change.bpm);
    if (microsecondsPerQuarter < 1 || microsecondsPerQuarter > 0xffffff) {
      throw new UnsupportedTempoTimelineError("A tempo BPM is outside the MIDI representation range.");
    }
    return { tick, microsecondsPerQuarter };
  });
  for (let index = 1; index < targetEvents.length; index += 1) {
    const previous = targetEvents[index - 1];
    const current = targetEvents[index];
    if (previous.tick === current.tick && previous.microsecondsPerQuarter !== current.microsecondsPerQuarter) {
      throw new UnsupportedTempoTimelineError("Distinct tempo changes collapse to the same MIDI tick.");
    }
  }
  const conductor = parsedTracks[0];
  if (targetEvents.some((event) => event.tick > renderedEndTick)) {
    throw new UnsupportedTempoTimelineError("A tempo marking falls after the rendered MIDI track ends.");
  }

  const rebuiltConductor = serializeMidiTrack(
    conductor.events.filter((event) => !event.tempo).map((event) => event.endOfTrack
      ? { ...event, absoluteTick: renderedEndTick }
      : event),
    targetEvents
  );
  const outputChunks: Uint8Array[] = [midi.subarray(0, header.trackStart)];
  for (let index = 0; index < trackRecords.length; index += 1) {
    const record = trackRecords[index];
    if (index === 0) {
      outputChunks.push(ascii("MTrk"), uint32Bytes(rebuiltConductor.length), rebuiltConductor);
    } else {
      outputChunks.push(midi.subarray(record.start, record.end));
    }
  }
  return concatBytes(outputChunks);
}

/** Reads the tempo timeline Verovio actually wrote, in quarter-note positions. */
export function readMidiTempoChanges(midi: Uint8Array): PerformedTempoChange[] {
  const header = readMidiHeader(midi);
  if (header.format !== 0 && header.format !== 1) {
    throw new UnsupportedTempoTimelineError("Only MIDI format 0 or 1 can be synchronized safely.");
  }
  const changes: PerformedTempoChange[] = [];
  let cursor = header.trackStart;
  for (let trackIndex = 0; trackIndex < header.trackCount; trackIndex += 1) {
    if (!matchesAscii(midi, cursor, "MTrk")) throw new UnsupportedTempoTimelineError("The MIDI track layout is not supported.");
    const length = readUint32(midi, cursor + 4);
    const start = cursor + 8;
    const end = start + length;
    if (end > midi.length) throw new UnsupportedTempoTimelineError("The MIDI file contains a truncated track.");
    const parsed = parseMidiTrack(midi.subarray(start, end));
    for (const event of parsed.events) {
      if (event.tempo) {
        if (trackIndex !== 0) throw new UnsupportedTempoTimelineError("Tempo metadata appears outside the conductor track.");
        changes.push({
          quarter: event.absoluteTick / header.division,
          bpm: 60_000_000 / event.tempo.microsecondsPerQuarter
        });
      }
    }
    cursor = end;
  }
  if (cursor !== midi.length) throw new UnsupportedTempoTimelineError("The MIDI file has trailing unsupported data.");
  return changes.sort((left, right) => left.quarter - right.quarter);
}

function readMeiTempoMarks(mei: string): {
  marks: MeiTempoMark[];
  hasIntraMeasureTempo: boolean;
  hasUnknownPosition: boolean;
} {
  if (typeof mei !== "string" || !/<mei\b/.test(mei)) {
    throw new UnsupportedTempoTimelineError("Verovio did not return a recognizable MEI score.");
  }

  const marks: MeiTempoMark[] = [];
  let activeMeasure: MeiMeasureContext | undefined;
  let globalMeterUnit: number | undefined;
  const staffMeterUnits = new Map<string, number | undefined>();
  const knownStaffNumbers = new Set<string>();
  const elementStack: Array<{ name: string; staffNumber?: string }> = [];
  let hasIntraMeasureTempo = false;
  let hasUnknownPosition = false;
  const tagPattern = /<\/?([A-Za-z_][\w:.-]*)(\s[^<>]*?)?\s*\/?>/g;
  for (const match of mei.matchAll(tagPattern)) {
    const raw = match[0];
    const tagName = (match[1] ?? "").split(":").at(-1) ?? "";
    const isClosing = raw.startsWith("</");
    if (isClosing) {
      if (tagName === "measure") activeMeasure = undefined;
      if (elementStack.at(-1)?.name === tagName) elementStack.pop();
      continue;
    }

    const attributes = parseAttributes(match[2] ?? "");
    const isSelfClosing = /\/\s*>$/.test(raw);
    const containingStaffNumber = [...elementStack].reverse().find((element) =>
      element.name === "staffDef" || element.name === "staff"
    )?.staffNumber;
    if (tagName === "measure") {
      const id = attributes["xml:id"] ?? attributes.id;
      if (activeMeasure) {
        throw new UnsupportedTempoTimelineError("MEI measure boundaries or IDs are ambiguous.");
      }
      activeMeasure = {
        id,
        globalMeterUnit,
        staffMeterUnits: new Map(staffMeterUnits),
        staffNumbers: new Set(knownStaffNumbers)
      };
      if (isSelfClosing) activeMeasure = undefined;
      else elementStack.push({ name: tagName });
      continue;
    }
    if (tagName === "meterSig") {
      const unit = Number(attributes.unit);
      const meterUnit = Number.isInteger(unit) && unit > 0 ? unit : undefined;
      const declaredStaffNumbers = parseStaffNumbers(attributes.staff);
      const targetStaffNumbers = declaredStaffNumbers.length > 0
        ? declaredStaffNumbers
        : containingStaffNumber
          ? [containingStaffNumber]
          : [];
      if (activeMeasure) {
        if (targetStaffNumbers.length > 0) {
          for (const staffNumber of targetStaffNumbers) {
            activeMeasure.staffMeterUnits.set(staffNumber, meterUnit);
            activeMeasure.staffNumbers.add(staffNumber);
          }
        } else {
          activeMeasure.globalMeterUnit = meterUnit;
        }
      } else if (targetStaffNumbers.length > 0) {
        for (const staffNumber of targetStaffNumbers) {
          staffMeterUnits.set(staffNumber, meterUnit);
          knownStaffNumbers.add(staffNumber);
        }
      } else {
        globalMeterUnit = meterUnit;
      }
      if (!isSelfClosing) elementStack.push({ name: tagName });
      continue;
    }
    if (tagName === "staffDef" || tagName === "staff") {
      const staffNumber = nonEmptyString(attributes.n);
      if (staffNumber) knownStaffNumbers.add(staffNumber);
      if (activeMeasure && staffNumber) activeMeasure.staffNumbers.add(staffNumber);
      if (!isSelfClosing) elementStack.push({ name: tagName, staffNumber });
      continue;
    }

    if (tagName === "tempo") {
      if (!activeMeasure) {
        hasUnknownPosition = true;
        continue;
      }

      const rawTimestamp = attributes.tstamp ?? "1";
      const timestamp = Number(rawTimestamp);
      const bpm = parsePositiveNumber(attributes["midi.bpm"]);
      if (!Number.isFinite(timestamp) || timestamp < 1) {
        hasUnknownPosition = true;
        marks.push({ measureId: activeMeasure.id, bpm });
        continue;
      }
      let localQuarter = 0;
      if (Math.abs(timestamp - 1) > 1e-8) {
        hasIntraMeasureTempo = true;
        const meterUnit = resolveTempoMeterUnit(activeMeasure, attributes.staff);
        localQuarter = (timestamp - 1) * (4 / meterUnit);
        if (!Number.isFinite(localQuarter) || localQuarter <= 0) {
          throw new UnsupportedTempoTimelineError("An intra-measure tempo position is invalid.");
        }
      }
      marks.push({ measureId: activeMeasure.id, localQuarter: cleanQuarter(localQuarter), bpm });
    }

    if (!isSelfClosing) elementStack.push({ name: tagName });
  }

  return { marks, hasIntraMeasureTempo, hasUnknownPosition };
}

function resolveTempoMeterUnit(measure: MeiMeasureContext, tempoStaffAttribute: string | undefined): number {
  const tempoStaffNumbers = parseStaffNumbers(tempoStaffAttribute);
  const resolvedUnits = new Set<number>();
  let hasMissingUnit = false;

  if (tempoStaffNumbers.length > 0) {
    for (const staffNumber of tempoStaffNumbers) {
      const unit = measure.staffMeterUnits.has(staffNumber)
        ? measure.staffMeterUnits.get(staffNumber)
        : measure.globalMeterUnit;
      if (unit === undefined) hasMissingUnit = true;
      else resolvedUnits.add(unit);
    }
  } else if (measure.staffNumbers.size > 0) {
    for (const staffNumber of measure.staffNumbers) {
      const unit = measure.staffMeterUnits.has(staffNumber)
        ? measure.staffMeterUnits.get(staffNumber)
        : measure.globalMeterUnit;
      if (unit === undefined) hasMissingUnit = true;
      else resolvedUnits.add(unit);
    }
  } else {
    if (measure.globalMeterUnit !== undefined) resolvedUnits.add(measure.globalMeterUnit);
    for (const unit of measure.staffMeterUnits.values()) {
      if (unit !== undefined) resolvedUnits.add(unit);
    }
  }

  if (hasMissingUnit || resolvedUnits.size !== 1) {
    throw new UnsupportedTempoTimelineError(
      "An intra-measure tempo has an unknown or ambiguous metric unit across the score's staves."
    );
  }
  return resolvedUnits.values().next().value as number;
}

function parseStaffNumbers(value: string | undefined): string[] {
  return typeof value === "string" ? value.trim().split(/\s+/).filter(Boolean) : [];
}

function nonEmptyString(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([A-Za-z_][\w:.-]*)\s*=\s*(["'])(.*?)\2/g;
  for (const match of source.matchAll(pattern)) attributes[match[1]] = match[3];
  return attributes;
}

function cleanQuarter(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

function readMidiHeader(midi: Uint8Array): { format: number; trackCount: number; division: number; trackStart: number } {
  if (midi.length < 14 || !matchesAscii(midi, 0, "MThd") || readUint32(midi, 4) !== 6) {
    throw new UnsupportedTempoTimelineError("The rendered MIDI header is not supported.");
  }
  const format = readUint16(midi, 8);
  const trackCount = readUint16(midi, 10);
  const division = readUint16(midi, 12);
  if (trackCount < 1 || division === 0 || (division & 0x8000) !== 0) {
    throw new UnsupportedTempoTimelineError("The MIDI resolution or track count is not supported.");
  }
  return { format, trackCount, division, trackStart: 14 };
}

function parseMidiTrack(bytes: Uint8Array): MidiTrack {
  const events: MidiEvent[] = [];
  let cursor = 0;
  let absoluteTick = 0;
  let runningStatus = 0;
  let endOfTrack = false;
  while (cursor < bytes.length) {
    const delta = readVariableLength(bytes, cursor);
    cursor = delta.next;
    absoluteTick += delta.value;
    if (!Number.isSafeInteger(absoluteTick)) throw new UnsupportedTempoTimelineError("A MIDI tick position is invalid.");
    if (cursor >= bytes.length) throw new UnsupportedTempoTimelineError("A MIDI event is truncated.");

    const eventStart = cursor;
    let status = bytes[cursor];
    if (status >= 0x80) {
      cursor += 1;
      if (status < 0xf0) runningStatus = status;
      else runningStatus = 0;
    } else {
      status = runningStatus;
      if (status < 0x80 || status >= 0xf0) throw new UnsupportedTempoTimelineError("MIDI running status is invalid.");
    }

    let message: Uint8Array;
    let tempo: MidiEvent["tempo"];
    let isEndOfTrack = false;
    if (status === 0xff) {
      if (cursor >= bytes.length) throw new UnsupportedTempoTimelineError("A MIDI meta event is truncated.");
      const type = bytes[cursor++];
      const size = readVariableLength(bytes, cursor);
      cursor = size.next;
      if (cursor + size.value > bytes.length) throw new UnsupportedTempoTimelineError("A MIDI meta event is truncated.");
      const payload = bytes.subarray(cursor, cursor + size.value);
      if (type === 0x51) {
        if (size.value !== 3) throw new UnsupportedTempoTimelineError("A MIDI tempo meta event has an invalid length.");
        tempo = { microsecondsPerQuarter: (payload[0] << 16) | (payload[1] << 8) | payload[2] };
        if (tempo.microsecondsPerQuarter === 0) throw new UnsupportedTempoTimelineError("A MIDI tempo meta event is invalid.");
      }
      isEndOfTrack = type === 0x2f;
      cursor += size.value;
      message = bytes.slice(eventStart, cursor);
    } else if (status === 0xf0 || status === 0xf7) {
      const size = readVariableLength(bytes, cursor);
      cursor = size.next;
      if (cursor + size.value > bytes.length) throw new UnsupportedTempoTimelineError("A MIDI system-exclusive event is truncated.");
      cursor += size.value;
      message = bytes.slice(eventStart, cursor);
    } else if (status >= 0x80 && status < 0xf0) {
      const length = (status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0 ? 1 : 2;
      const payloadStart = eventStart + (bytes[eventStart] >= 0x80 ? 1 : 0);
      if (payloadStart + length > bytes.length) throw new UnsupportedTempoTimelineError("A MIDI channel event is truncated.");
      if (bytes[eventStart] >= 0x80) {
        cursor = payloadStart + length;
        message = bytes.slice(eventStart, cursor);
      } else {
        cursor = payloadStart + length;
        message = concatBytes([Uint8Array.of(status), bytes.subarray(payloadStart, cursor)]);
      }
    } else {
      throw new UnsupportedTempoTimelineError("A MIDI event type is not supported.");
    }

    if (endOfTrack) throw new UnsupportedTempoTimelineError("A MIDI track contains events after end-of-track.");
    events.push({ absoluteTick, message, order: events.length, tempo, endOfTrack: isEndOfTrack });
    if (isEndOfTrack) endOfTrack = true;
  }
  if (!endOfTrack) throw new UnsupportedTempoTimelineError("A MIDI track has no end-of-track event.");
  const finalEvent = events.at(-1);
  if (!finalEvent?.endOfTrack) throw new UnsupportedTempoTimelineError("MIDI end-of-track is not the final event.");
  return { bytes, events, endTick: finalEvent.absoluteTick };
}

function serializeMidiTrack(
  originalEvents: MidiEvent[],
  targetEvents: Array<{ tick: number; microsecondsPerQuarter: number }>
): Uint8Array {
  const events: Array<{ tick: number; order: number; message: Uint8Array; injected: boolean }> = [];
  for (const event of originalEvents) {
    events.push({ tick: event.absoluteTick, order: event.order, message: event.message, injected: false });
  }
  for (const [index, event] of targetEvents.entries()) {
    events.push({
      tick: event.tick,
      order: index,
      message: Uint8Array.of(
        0xff,
        0x51,
        0x03,
        (event.microsecondsPerQuarter >> 16) & 0xff,
        (event.microsecondsPerQuarter >> 8) & 0xff,
        event.microsecondsPerQuarter & 0xff
      ),
      injected: true
    });
  }
  events.sort((left, right) => left.tick - right.tick || Number(right.injected) - Number(left.injected) || left.order - right.order);

  const output: Uint8Array[] = [];
  let previousTick = 0;
  for (const event of events) {
    const delta = event.tick - previousTick;
    if (delta < 0 || delta > 0x0fffffff) throw new UnsupportedTempoTimelineError("A MIDI event delta is outside the supported range.");
    output.push(encodeVariableLength(delta), event.message);
    previousTick = event.tick;
  }
  return concatBytes(output);
}

function readVariableLength(bytes: Uint8Array, start: number): { value: number; next: number } {
  let value = 0;
  let cursor = start;
  for (let index = 0; index < 4; index += 1) {
    if (cursor >= bytes.length) throw new UnsupportedTempoTimelineError("A MIDI variable-length value is truncated.");
    const byte = bytes[cursor++];
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, next: cursor };
  }
  throw new UnsupportedTempoTimelineError("A MIDI variable-length value is invalid.");
}

function encodeVariableLength(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0x0fffffff) {
    throw new UnsupportedTempoTimelineError("A MIDI variable-length value is outside the supported range.");
  }
  const bytes = [value & 0x7f];
  for (value >>= 7; value > 0; value >>= 7) bytes.unshift((value & 0x7f) | 0x80);
  return Uint8Array.from(bytes);
}

function readUint16(bytes: Uint8Array, offset: number): number {
  if (offset + 2 > bytes.length) throw new UnsupportedTempoTimelineError("The MIDI file is truncated.");
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) throw new UnsupportedTempoTimelineError("The MIDI file is truncated.");
  return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function uint32Bytes(value: number): Uint8Array {
  return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function matchesAscii(bytes: Uint8Array, offset: number, value: string): boolean {
  return value.split("").every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}

function ascii(value: string): Uint8Array {
  return Uint8Array.from(value.split("").map((character) => character.charCodeAt(0)));
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(size);
  let cursor = 0;
  for (const chunk of chunks) {
    result.set(chunk, cursor);
    cursor += chunk.length;
  }
  return result;
}
