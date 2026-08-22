import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { parseMidiPlayback } from "./parseMidi.js";

describe("parseMidiPlayback", () => {
  it("preserva tempos, acordes, afinação e duração do MIDI", () => {
    const midi = new Midi();
    midi.header.setTempo(90);
    const track = midi.addTrack();
    track.addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.75 });
    track.addNote({ midi: 64, time: 0, duration: 1, velocity: 0.5 });

    const parsed = parseMidiPlayback(midi.toArray());

    expect(parsed.initialTempoBpm).toBe(90);
    expect(parsed.durationMs).toBeCloseTo(1_000);
    expect(parsed.events.map((event) => event.pitch)).toEqual([60, 64]);
    expect(parsed.events[0].startMs).toBe(0);
    expect(parsed.events[0].durationMs).toBeCloseTo(500);
    expect(parsed.events[1].durationMs).toBeCloseTo(1_000);
  });
});
