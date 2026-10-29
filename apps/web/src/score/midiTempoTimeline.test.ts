import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createTempoClock,
  getPerformedTempoTimeline,
  UnsupportedTempoTimelineError
} from "./midiTempoTimeline.js";

type ParityFixture = {
  mei: string;
  timemap: Array<{ measureOn: string; qstamp: number; tstamp: number }>;
  expansionMap: Record<string, string[]>;
  expectedChanges: Array<{ quarter: number; bpm: number }>;
};

describe("midiTempoTimeline mirror parity", () => {
  it("maps the same expanded repeat tempo fixture as the API helper", async () => {
    const fixturePath = path.join(process.cwd(), "../api/src/tests/fixtures/midi/tempo-map-parity.json");
    const fixture = JSON.parse(await fs.readFile(fixturePath, "utf8")) as ParityFixture;

    expect(getPerformedTempoTimeline(fixture.mei, fixture.timemap, fixture.expansionMap)).toEqual({
      changes: fixture.expectedChanges,
      hasIntraMeasureTempo: true
    });
  });

  it("uses the same quarter-to-time inversion and inherited tempo", () => {
    const clock = createTempoClock([
      { quarter: 0, bpm: 80 },
      { quarter: 1, bpm: 120 },
      { quarter: 4, bpm: 80 },
      { quarter: 5, bpm: 120 }
    ], 100);

    expect(clock.millisecondsAtQuarter(5)).toBe(3_000);
    expect(clock.quarterAtMilliseconds(3_000)).toBe(5);
    expect(clock.tempoAtQuarter(7)).toBe(120);
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
});
