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

  it("preserva a identidade de voz de cada trilha, canal e programa", () => {
    const midi = new Midi();
    midi.header.setTempo(70);
    const piano = midi.addTrack();
    piano.channel = 1;
    piano.instrument.number = 0;
    piano.addNote({ midi: 60, time: 0, duration: 0.5 });
    const guitar = midi.addTrack();
    guitar.channel = 2;
    guitar.instrument.number = 24;
    guitar.addNote({ midi: 67, time: 0, duration: 0.5 });

    const parsed = parseMidiPlayback(midi.toArray());

    expect(parsed.events.map(({ pitch, trackIndex, channel, program }) => ({
      pitch,
      trackIndex,
      channel,
      program
    }))).toEqual([
      { pitch: 60, trackIndex: 0, channel: 1, program: 0 },
      { pitch: 67, trackIndex: 1, channel: 2, program: 24 }
    ]);
    expect(parsed.events[0].voiceId).toBe("track:0:channel:1:program:0");
    expect(parsed.events[1].voiceId).toBe("track:1:channel:2:program:24");
  });
});
