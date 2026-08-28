import fs from "node:fs/promises";
import path from "node:path";
import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { createVerovioScoreRenderer } from "../score/VerovioScoreRenderer.js";
import { sanitizeScoreSvg } from "../score/sanitizeScoreSvg.js";
import { applyDefaultTempo } from "../score/musicXmlTempo.js";
import { parseMidiPlayback } from "./parseMidi.js";

type ExpectedEvent = { pitch: number; startMs: number; durationMs: number };

const cases: Array<{
  filename: string;
  tempo: number;
  events: ExpectedEvent[];
}> = [
  {
    filename: "simple-melody.musicxml",
    tempo: 90,
    events: [
      { pitch: 60, startMs: 0, durationMs: 667 },
      { pitch: 62, startMs: 667, durationMs: 667 },
      { pitch: 64, startMs: 1_333, durationMs: 667 },
      { pitch: 65, startMs: 2_000, durationMs: 667 }
    ]
  },
  {
    filename: "piano-chords-rests-accidentals-ties.musicxml",
    tempo: 70,
    events: [
      { pitch: 60, startMs: 0, durationMs: 1_714 },
      { pitch: 64, startMs: 0, durationMs: 1_714 },
      { pitch: 67, startMs: 0, durationMs: 1_714 },
      { pitch: 66, startMs: 2_571, durationMs: 1_714 },
      { pitch: 70, startMs: 4_286, durationMs: 857 }
    ]
  },
  {
    filename: "multiple-parts.musicxml",
    tempo: 70,
    events: [
      { pitch: 60, startMs: 0, durationMs: 3_429 },
      { pitch: 67, startMs: 0, durationMs: 3_429 }
    ]
  },
  {
    filename: "multiple-pages.musicxml",
    tempo: 70,
    events: [60, 62, 64, 65, 67, 69, 71, 72].map((pitch, index) => ({
      pitch,
      startMs: index * (240_000 / 70),
      durationMs: 240_000 / 70
    }))
  }
];

async function loadFixture(filename: string): Promise<string> {
  return fs.readFile(path.join(process.cwd(), `../api/src/tests/fixtures/midi/${filename}`), "utf8");
}

function expectEventsClose(actual: ExpectedEvent[], expected: ExpectedEvent[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((event, index) => {
    expect(actual[index].pitch).toBe(event.pitch);
    expect(actual[index].startMs).toBeCloseTo(event.startMs, 0);
    // Verovio emits note-off events a few milliseconds before the metric boundary.
    expect(actual[index].durationMs).toBeGreaterThanOrEqual(event.durationMs - 10);
    expect(actual[index].durationMs).toBeLessThanOrEqual(event.durationMs);
  });
}

describe("homologacao musical MusicXML -> Verovio -> MIDI", () => {
  it.each(cases)(
    "preserva notas, pitch, inicio, duracao e tempo de $filename",
    async ({ filename, tempo, events }) => {
      const renderer = await createVerovioScoreRenderer(applyDefaultTempo(await loadFixture(filename)));

      try {
        const parsed = parseMidiPlayback(renderer.renderMidiBytes());
        expect(parsed.initialTempoBpm).toBe(tempo);
        expectEventsClose(parsed.events, events);
      } finally {
        renderer.destroy();
      }
    }
  );

  it("preserva acorde, acidente e une a ligadura em uma unica nota MIDI", async () => {
    const renderer = await createVerovioScoreRenderer(
      applyDefaultTempo(await loadFixture("piano-chords-rests-accidentals-ties.musicxml"))
    );

    try {
      const midiEvents = parseMidiPlayback(renderer.renderMidiBytes()).events;
      expect(midiEvents.filter((event) => event.startMs === 0).map((event) => event.pitch)).toEqual([
        60, 64, 67
      ]);
      expect(midiEvents.filter((event) => event.pitch === 66)).toHaveLength(1);
      expect(midiEvents.find((event) => event.pitch === 66)?.durationMs).toBeGreaterThanOrEqual(1_704);
      expect(midiEvents.find((event) => event.pitch === 70)?.pitch).toBe(70);

      // A timeline visual mantém os dois noteheads ligados para poder destacá-los,
      // enquanto o MIDI corretamente sustenta um único F#4.
      const visualTieSegments = renderer.getNoteEvents().filter((event) => event.pitch === 66);
      expect(visualTieSegments[0].startMs).toBeCloseTo(2_571, 0);
      expect(visualTieSegments[1].startMs).toBeCloseTo(3_429, 0);
    } finally {
      renderer.destroy();
    }
  });

  it("mantem duas partes simultaneas em trilhas e canais MIDI distintos", async () => {
    const renderer = await createVerovioScoreRenderer(applyDefaultTempo(await loadFixture("multiple-parts.musicxml")));

    try {
      const midi = new Midi(renderer.renderMidiBytes());
      const soundingTracks = midi.tracks.filter((track) => track.notes.length > 0);
      expect(soundingTracks).toHaveLength(2);
      expect(soundingTracks.map((track) => track.notes.map((note) => note.midi))).toEqual([[60], [67]]);
      expect(new Set(soundingTracks.map((track) => track.channel)).size).toBe(2);
    } finally {
      renderer.destroy();
    }
  });

  it("registra a matriz base de associação sem fundir canais repetidos", async () => {
    const renderer = await createVerovioScoreRenderer(
      applyDefaultTempo(await loadFixture("association-edge-cases.musicxml"))
    );

    try {
      const midi = new Midi(renderer.renderMidiBytes());
      const soundingTracks = midi.tracks.filter((track) => track.notes.length > 0);
      const metadata = soundingTracks.map((track, trackIndex) => ({
        trackIndex,
        channel: track.channel,
        program: track.instrument.number,
        notes: track.notes.length,
        firstMs: Math.round((track.notes[0]?.time ?? 0) * 1_000),
        lastMs: Math.round(((track.notes.at(-1)?.time ?? 0) + (track.notes.at(-1)?.duration ?? 0)) * 1_000)
      }));

      // P3 contains only a rest and therefore must not become an audio voice.
      expect(soundingTracks).toHaveLength(5);
      expect(metadata.map(({ channel }) => channel)).toEqual([0, 0, 3, 4, 5]);
      expect(metadata.map(({ program }) => program)).toEqual([0, 73, 68, 40, 40]);
      expect(metadata.every(({ notes, firstMs, lastMs }) => notes > 0 && firstMs === 0 && lastMs > 0)).toBe(true);
      expect(metadata.filter(({ channel }) => channel === 0)).toHaveLength(2); // M02: mesmo canal, programas distintos
    } finally {
      renderer.destroy();
    }
  });

  it("preserva três partes na ordem do part-list com canais e programas únicos", async () => {
    const musicXml = await loadFixture("three-parts-distinct.musicxml");
    const renderer = await createVerovioScoreRenderer(applyDefaultTempo(musicXml));

    try {
      const midi = new Midi(renderer.renderMidiBytes());
      const tracks = midi.tracks.filter((track) => track.notes.length > 0);
      expect(tracks).toHaveLength(3); // M13
      expect(tracks.map((track) => track.notes[0]?.midi)).toEqual([60, 64, 67]);
      expect(tracks.map((track) => track.channel)).toEqual([0, 1, 2]);
      expect(tracks.map((track) => track.instrument.number)).toEqual([0, 40, 73]);
    } finally {
      renderer.destroy();
    }
  });

  it("preserva e renderiza as páginas codificadas no MusicXML", async () => {
    const renderer = await createVerovioScoreRenderer(applyDefaultTempo(await loadFixture("multiple-pages.musicxml")));

    try {
      expect(renderer.pageCount).toBeGreaterThan(1);
      expect(sanitizeScoreSvg(renderer.renderPage(1), "Página 1")).toContain("<svg");
      expect(sanitizeScoreSvg(renderer.renderPage(2), "Página 2")).toContain("<svg");
    } finally {
      renderer.destroy();
    }
  });

  it("aceita MusicXML local com warning de conversao sem depender do Audiveris", async () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
      <score-partwise version="4.0">
        <identification><miscellaneous>
          <miscellaneous-field name="conversion-warning">Baixa confiança: revise acidentes.</miscellaneous-field>
        </miscellaneous></identification>
        <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
        <part id="P1"><measure number="1">
          <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
        </measure></part>
      </score-partwise>`;
    const renderer = await createVerovioScoreRenderer(applyDefaultTempo(musicXml));

    try {
      const parsed = parseMidiPlayback(renderer.renderMidiBytes());
      expect(musicXml).toContain("Baixa confiança: revise acidentes.");
      expect(parsed.events.map((event) => event.pitch)).toEqual([60]);
      expect(parsed.initialTempoBpm).toBe(70);
    } finally {
      renderer.destroy();
    }
  });
});
