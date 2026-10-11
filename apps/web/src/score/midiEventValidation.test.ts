import { describe, expect, it } from "vitest";
import { repairSkippedTieDestinations, UnsupportedMidiEventValidationError } from "./midiEventValidation.js";

const midi = Uint8Array.from("4d546864000000060000000100784d54726b0000000d00903c408170803c0000ff2f00"
  .match(/../g)!.map((byte) => Number.parseInt(byte, 16)));
const mei = `<mei><music><body>
  <measure xml:id="m1"><note xml:id="start"/></measure>
  <measure xml:id="m2"><note xml:id="destination"/></measure>
  <measure xml:id="m3"/>
  <tie startid="#start" endid="#destination"/>
</body></music></mei>`;

describe("playback tie navigation", () => {
  it("preserves normal ties when the destination measure starts before the note offset", () => {
    const timemap = [
      { measureOn: "m1", qstamp: 0, on: ["start"] },
      { measureOn: "m2", qstamp: 1 },
      { qstamp: 2, off: ["start"], on: ["destination"] }
    ];
    expect(repairSkippedTieDestinations(midi, mei, timemap, {})).toEqual(midi);
  });

  it("still rejects uncertain boundaries when navigation skips the destination", () => {
    const timemap = [
      { measureOn: "m1", qstamp: 0, on: ["start"] },
      { measureOn: "m3", qstamp: 1 },
      { qstamp: 2, off: ["start"] }
    ];
    expect(() => repairSkippedTieDestinations(midi, mei, timemap, {}))
      .toThrow(UnsupportedMidiEventValidationError);
  });
});
