import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createTempoClock,
  getPerformedTempoTimeline,
  readMidiTempoChanges,
  rewriteMidiTempoEvents,
  UnsupportedTempoTimelineError
} from "../utils/midiTempoTimeline.js";

type ParityFixture = {
  mei: string;
  timemap: Array<{ measureOn: string; qstamp: number; tstamp: number }>;
  expansionMap: Record<string, string[]>;
  expectedChanges: Array<{ quarter: number; bpm: number }>;
};

const fixturePath = new URL("./fixtures/midi/tempo-map-parity.json", import.meta.url);

function makeMidi(): Uint8Array {
  const conductor = Uint8Array.of(
    0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
    0x87, 0x40, 0xff, 0x2f, 0x00
  );
  const notes = Uint8Array.of(
    0x00, 0x90, 0x3c, 0x64,
    0x83, 0x60, 0x80, 0x3c, 0x00,
    0x00, 0xff, 0x2f, 0x00
  );
  return concat([
    Uint8Array.of(0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2, 0, 120),
    track(conductor),
    track(notes)
  ]);
}

function track(data: Uint8Array): Uint8Array {
  return concat([Uint8Array.of(0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, data.length), data]);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function midiTrackBytes(midi: Uint8Array, trackIndex: number): Uint8Array {
  let cursor = 14;
  for (let index = 0; index < midi[11]; index += 1) {
    const length = ((midi[cursor + 4] << 24) | (midi[cursor + 5] << 16) | (midi[cursor + 6] << 8) | midi[cursor + 7]) >>> 0;
    const start = cursor + 8;
    if (index === trackIndex) return midi.slice(start, start + length);
    cursor = start + length;
  }
  throw new Error("MIDI track not found");
}

describe("midiTempoTimeline", () => {
  it("maps a within-measure marking into every expanded repeat occurrence", async () => {
    const fixture = JSON.parse(await fs.readFile(fixturePath, "utf8")) as ParityFixture;

    expect(getPerformedTempoTimeline(fixture.mei, fixture.timemap, fixture.expansionMap)).toEqual({
      changes: fixture.expectedChanges,
      hasIntraMeasureTempo: true
    });
  });

  it("groups equal-position tempo markings and leaves bar-start-only scores on the native path", () => {
    const repeatedAtSamePosition = '<mei><scoreDef><meterSig count="2" unit="4"/></scoreDef><measure xml:id="m1"><tempo tstamp="2" midi.bpm="120"/><tempo tstamp="2" midi.bpm="120"/></measure></mei>';
    const starts = [{ measureOn: "m1", qstamp: 0, tstamp: 0 }];
    expect(getPerformedTempoTimeline(repeatedAtSamePosition, starts, { m1: ["m1"] })).toEqual({
      changes: [{ quarter: 0, bpm: 120 }],
      hasIntraMeasureTempo: true
    });

    const barStartOnly = '<mei><measure><tempo midi.bpm="90"/></measure></mei>';
    expect(getPerformedTempoTimeline(barStartOnly, [], {})).toEqual({ changes: [], hasIntraMeasureTempo: false });
  });

  it("rejects conflicting tempo markings at one performed qstamp", () => {
    const mei = '<mei><scoreDef><meterSig count="2" unit="4"/></scoreDef><measure xml:id="m1"><tempo tstamp="2" midi.bpm="90"/><tempo tstamp="2" midi.bpm="120"/></measure></mei>';
    expect(() => getPerformedTempoTimeline(mei, [{ measureOn: "m1", qstamp: 0, tstamp: 0 }], { m1: ["m1"] }))
      .toThrow(UnsupportedTempoTimelineError);
  });

  it("rewrites tempo messages while leaving the note track byte-identical", async () => {
    const fixture = JSON.parse(await fs.readFile(fixturePath, "utf8")) as ParityFixture;
    const original = makeMidi();
    const rewritten = rewriteMidiTempoEvents(original, fixture.expectedChanges);

    expect(readMidiTempoChanges(rewritten)).toEqual(fixture.expectedChanges);
    expect(midiTrackBytes(rewritten, 1)).toEqual(midiTrackBytes(original, 1));
  });

  it("inverts the corrected tempo clock and carries the tempo through an unmarked measure", () => {
    const changes = [
      { quarter: 0, bpm: 80 },
      { quarter: 1, bpm: 120 },
      { quarter: 4, bpm: 80 },
      { quarter: 5, bpm: 120 }
    ];
    const clock = createTempoClock(changes, 100);

    expect(clock.millisecondsAtQuarter(1)).toBe(750);
    expect(clock.millisecondsAtQuarter(4)).toBe(2_250);
    expect(clock.millisecondsAtQuarter(5)).toBe(3_000);
    expect(clock.quarterAtMilliseconds(3_000)).toBe(5);
    expect(clock.tempoAtQuarter(7)).toBe(120);
  });

  it("fails closed when an intra-measure tempo has no readable meter or performed occurrence", () => {
    const badMeter = '<mei><measure xml:id="m1"><tempo tstamp="2" midi.bpm="120"/></measure></mei>';
    const starts = [{ measureOn: "m1", qstamp: 0, tstamp: 0 }];
    expect(() => getPerformedTempoTimeline(badMeter, starts, { m1: ["m1"] })).toThrow(UnsupportedTempoTimelineError);
    expect(() => getPerformedTempoTimeline(
      '<mei><scoreDef><meterSig count="2" unit="4"/></scoreDef><measure xml:id="m1"><tempo tstamp="2" midi.bpm="120"/></measure></mei>',
      starts,
      { m1: ["m1", "m1-rend2"] }
    )).toThrow(UnsupportedTempoTimelineError);
  });

  it("rejects ambiguous polymeter positions and resolves an explicitly assigned staff", () => {
    const starts = [{ measureOn: "m1", qstamp: 0, tstamp: 0 }];
    const polymeter = '<mei><scoreDef><staffGrp><staffDef n="1"><meterSig count="2" unit="4"/></staffDef><staffDef n="2"><meterSig count="3" unit="8"/></staffDef></staffGrp></scoreDef><measure xml:id="m1"><tempo tstamp="2" midi.bpm="120"/></measure></mei>';

    expect(() => getPerformedTempoTimeline(polymeter, starts, { m1: ["m1"] }))
      .toThrow(UnsupportedTempoTimelineError);
    expect(getPerformedTempoTimeline(
      polymeter.replace('tstamp="2"', 'staff="1" tstamp="2"'),
      starts,
      { m1: ["m1"] }
    )).toEqual({ changes: [{ quarter: 0, bpm: 120 }], hasIntraMeasureTempo: true });
    expect(() => getPerformedTempoTimeline(
      polymeter.replace('tstamp="2"', 'staff="1 2" tstamp="2"'),
      starts,
      { m1: ["m1"] }
    )).toThrow(UnsupportedTempoTimelineError);
  });

  it("fails closed when distinct tempo markings collapse to the same MIDI tick", () => {
    const original = makeMidi();
    expect(() => rewriteMidiTempoEvents(original, [
      { quarter: 1.001, bpm: 100 },
      { quarter: 1.002, bpm: 120 }
    ])).toThrow(UnsupportedTempoTimelineError);
  });
});
