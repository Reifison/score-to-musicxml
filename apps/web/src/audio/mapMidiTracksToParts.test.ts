import { describe, expect, it } from "vitest";
import { mapMidiTracksToParts } from "./mapMidiTracksToParts.js";
import type { MidiPlaybackTrack } from "./types.js";
import type { MusicXmlPart } from "../score/parseMusicXmlParts.js";

const part = (overrides: Partial<MusicXmlPart>): MusicXmlPart => ({
  partId: "P1", order: 0, label: "Piano", hasPlayableNotes: true, ...overrides
});

const track = (overrides: Partial<MidiPlaybackTrack>): MidiPlaybackTrack => ({
  trackIndex: 0, channel: 0, program: 0, noteCount: 1, durationMs: 500,
  programExplicit: true,
  events: [{ pitch: 60, startMs: 0, durationMs: 500, trackIndex: 0 }],
  voiceId: "track:0:channel:0:program:0", ...overrides
});

async function fixture(name: string): Promise<string> {
  return fs.readFile(path.join(process.cwd(), "../api/src/tests/fixtures/midi", name), "utf8");
}

describe("mapMidiTracksToParts", () => {
  it("faz match exato por canal e programa, preservando a ordem MusicXML", () => {
    const result = mapMidiTracksToParts([
      part({ partId: "P1", order: 0, label: "Piano", midiChannel: 0, midiProgram: 0 }),
      part({ partId: "P2", order: 1, label: "Flauta", midiChannel: 1, midiProgram: 73 })
    ], [
      track({ trackIndex: 1, channel: 1, program: 73 }), track({ trackIndex: 0 })
    ]);
    expect(result.voices.map(({ partId, label, mappingConfidence }) => ({ partId, label, mappingConfidence })))
      .toEqual([
        { partId: "P1", label: "Piano", mappingConfidence: "exact" },
        { partId: "P2", label: "Flauta", mappingConfidence: "exact" }
      ]);
    expect(result.voices.flatMap((voice) => voice.trackIndexes).sort()).toEqual([0, 1]);
  });

  it("não funde a mesma combinação ambígua e mantém faixas neutras", () => {
    const result = mapMidiTracksToParts([
      part({ partId: "P1", midiChannel: 0, midiProgram: 0 }),
      part({ partId: "P2", order: 1, label: "Flauta", midiChannel: 0, midiProgram: 0 })
    ], [track({ trackIndex: 0 }), track({ trackIndex: 1 })]);
    expect(result.voices.map(({ partId, label, mappingConfidence }) => ({ partId, label, mappingConfidence })))
      .toEqual([
        { partId: undefined, label: "Faixa 1", mappingConfidence: "fallback" },
        { partId: undefined, label: "Faixa 2", mappingConfidence: "fallback" }
      ]);
    expect(result.unmatchedPartIds).toEqual(["P1", "P2"]);
  });

  it("trata 0/0 sem declaração como ambíguo e não inventa nome", () => {
    const result = mapMidiTracksToParts([
      part({ partId: "P1", label: "Piano" }), part({ partId: "P2", order: 1, label: "Flauta" })
    ], [track({ trackIndex: 0, programExplicit: false }), track({ trackIndex: 1, programExplicit: false })]);
    expect(result.voices.every((voice) => voice.partId === undefined)).toBe(true);
    expect(result.voices.map((voice) => voice.label)).toEqual(["Faixa 1", "Faixa 2"]);
  });

  it("não promove XML 1/1 a match exato para trilha 0/0 sem program-change", () => {
    const result = mapMidiTracksToParts([
      part({ partId: "P1", label: "Piano", midiChannel: 0, midiProgram: 0 })
    ], [track({ channel: 0, program: 0, programExplicit: false })]);
    expect(result.voices[0].partId).toBeUndefined();
    expect(result.voices[0]).toMatchObject({ label: "Faixa 1", mappingConfidence: "fallback" });
    expect(result.unmatchedPartIds).toEqual(["P1"]);
  });

  it("remove partes sem notas, mas não perde eventos das trilhas", () => {
    const result = mapMidiTracksToParts([
      part({ partId: "P1", midiChannel: 0, midiProgram: 0 }),
      part({ partId: "P2", order: 1, label: "Silêncio", hasPlayableNotes: false })
    ], [track({ trackIndex: 0 }), track({ trackIndex: 1, channel: 4, program: 40 })]);
    expect(result.unmatchedPartIds).toEqual([]);
    expect(result.voices.reduce((sum, voice) => sum + voice.eventCount, 0)).toBe(2);
    expect(result.voices.map((voice) => voice.partId)).toEqual(["P1", undefined]);
  });

  it("usa rótulo neutro quando a parte não tem nome", () => {
    const result = mapMidiTracksToParts([
      part({ partId: "P1", label: "Faixa 1", midiChannel: 2, midiProgram: 40 })
    ], [track({ channel: 2, program: 40 })]);
    expect(result.voices[0]).toMatchObject({ label: "Faixa 1", mappingConfidence: "exact" });
  });

  it("integra partes e MIDI de Piano/Flauta com associação determinística", async () => {
    const xml = await fixture("multiple-parts.musicxml");
    const renderer = await createVerovioScoreRenderer(applyDefaultTempo(xml));
    try {
      const parts = parseMusicXmlParts(xml);
      const parsed = (await import("./parseMidi.js")).parseMidiPlayback(renderer.renderMidiBytes());
      const result = mapMidiTracksToParts(parts, parsed.tracks);
      expect(result.voices.map((voice) => [voice.label, voice.mappingConfidence])).toEqual([
        ["Piano", "exact"], ["Flauta", "exact"]
      ]);
    } finally {
      renderer.destroy();
    }
  });

  it("integra mesma combinação canal/programa sem fundir as partes", async () => {
    const xml = await fixture("same-channel-program.musicxml");
    const renderer = await createVerovioScoreRenderer(applyDefaultTempo(xml));
    try {
      const parts = parseMusicXmlParts(xml);
      const parsed = (await import("./parseMidi.js")).parseMidiPlayback(renderer.renderMidiBytes());
      const result = mapMidiTracksToParts(parts, parsed.tracks);
      expect(result.voices).toHaveLength(2);
      expect(result.voices.every((voice) => voice.partId === undefined)).toBe(true);
      expect(result.voices.map((voice) => voice.label)).toEqual(["Faixa 1", "Faixa 2"]);
    } finally {
      renderer.destroy();
    }
  });
});
import fs from "node:fs/promises";
import path from "node:path";
import { applyDefaultTempo } from "../score/musicXmlTempo.js";
import { createVerovioScoreRenderer } from "../score/VerovioScoreRenderer.js";
import { parseMusicXmlParts } from "../score/parseMusicXmlParts.js";
