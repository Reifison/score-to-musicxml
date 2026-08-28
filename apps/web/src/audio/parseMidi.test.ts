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

    expect(parsed.tracks.map(({ trackIndex, channel, program, noteCount, events }) => ({
      trackIndex, channel, program, noteCount, events: events.length
    }))).toEqual([
      { trackIndex: 0, channel: 1, program: 0, noteCount: 1, events: 1 },
      { trackIndex: 1, channel: 2, program: 24, noteCount: 1, events: 1 }
    ]);
  });

  it("expõe nome da trilha e distingue programa explicitamente declarado", () => {
    const midi = new Midi();
    const named = midi.addTrack();
    named.name = "Flauta";
    named.channel = 4;
    named.instrument.number = 73;
    named.addNote({ midi: 72, time: 0, duration: 0.25 });

    const parsed = parseMidiPlayback(midi.toArray());

    expect(parsed.tracks[0]).toMatchObject({
      trackIndex: 0,
      name: "Flauta",
      channel: 4,
      program: 73,
      channelObserved: true,
      programExplicit: true,
      noteCount: 1
    });
  });

  it("mantém presença de programa como falsa quando não há program-change", () => {
    const midi = new Midi();
    const track = midi.addTrack();
    track.addNote({ midi: 60, time: 0, duration: 0.5 });

    const parsed = parseMidiPlayback(midi.toArray());

    expect(parsed.tracks[0]).toMatchObject({ channel: 0, program: 0, channelObserved: true, programExplicit: true });
  });

  it("não cria eventos nem voz reproduzível para trilhas MIDI vazias", () => {
    const midi = new Midi();
    midi.addTrack(); // M15: trilha de metadados sem notas
    const sounding = midi.addTrack();
    sounding.channel = 3;
    sounding.addNote({ midi: 72, time: 0, duration: 0.25 });

    const parsed = parseMidiPlayback(midi.toArray());

    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]).toMatchObject({ pitch: 72, trackIndex: 1, channel: 3, program: 0 });
    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0]).toMatchObject({ trackIndex: 1, channel: 3, channelObserved: true, programExplicit: true });
  });

  it("preserva uma trilha SMF sem program-change e expõe defaults 0/0, sem inferir declaração MusicXML", () => {
    const midi = new Midi();
    const track = midi.addTrack();
    track.addNote({ midi: 60, time: 0, duration: 0.5 });
    const bytes = midi.toArray();
    const parsed = parseMidiPlayback(bytes);

    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]).toMatchObject({ pitch: 60, channel: 0, program: 0 });
    // @tonejs/midi serializes an omitted channel/program as its runtime defaults;
    // the MusicXML mapper must not treat 0/0 as proof of an explicit 1/1 pair.
    expect(parsed.events[0].voiceId).toBe("track:0:channel:0:program:0");
  });
});
