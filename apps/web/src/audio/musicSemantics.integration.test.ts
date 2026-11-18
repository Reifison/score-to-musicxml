import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { createVerovioScoreRenderer } from "../score/VerovioScoreRenderer.js";
import { sanitizeScoreSvg } from "../score/sanitizeScoreSvg.js";
import { applyDefaultTempo } from "../score/musicXmlTempo.js";
import { parseMidiPlayback } from "./parseMidi.js";

type ExpectedEvent = { pitch: number; startMs: number; durationMs: number };

const purcellCorpusPath = path.resolve(process.cwd(), "../../output/omr/acervo-review-2026-10-07/purcell/v1/abdelazer-suite-ii.musicxml");

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
  it("mapeia as execuções repetidas e voltas pela ocorrência tocada", async () => {
    const renderer = await createVerovioScoreRenderer(
      applyDefaultTempo(await loadFixture("learned-skipped-first-ending.musicxml"))
    );
    try {
      const measures = renderer.getMeasureOccurrences();
      expect(measures.map((measure) => measure.number)).toEqual(["1", "2", "3", "4", "2", "3", "5", "6"]);
      expect(measures.filter((measure) => measure.number === "2").map((measure) => measure.occurrence)).toEqual([1, 2]);
      expect(measures.every((measure) => measure.endMs > measure.startMs)).toBe(true);
      expect(measures.slice(0, -1).every((measure, index) => measure.endMs === measures[index + 1]?.startMs)).toBe(true);
    } finally {
      renderer.destroy();
    }
  });

  it("keeps the trailing rest in the final measure boundary", async () => {
    const renderer = await createVerovioScoreRenderer(
      applyDefaultTempo(await loadFixture("learned-tuplet-without-notations.musicxml"))
    );
    try {
      const measures = renderer.getMeasureOccurrences();
      const finalNoteEnd = Math.max(...renderer.getNoteEvents().map((event) => event.startMs + event.durationMs));
      const lastMeasure = measures.at(-1);
      expect(lastMeasure).toBeDefined();
      expect(lastMeasure!.endMs).toBeGreaterThan(finalNoteEnd);
    } finally {
      renderer.destroy();
    }
  });

  it("encerra a ligadura na segunda passagem quando a primeira casa é pulada", async () => {
    const renderer = await createVerovioScoreRenderer(
      applyDefaultTempo(await loadFixture("learned-skipped-first-ending.musicxml"))
    );
    try {
      const midiBytes = renderer.renderMidiBytes();
      const midi = new Midi(midiBytes.buffer.slice(midiBytes.byteOffset, midiBytes.byteOffset + midiBytes.byteLength) as ArrayBuffer);
      const notes = midi.tracks.flatMap((track) => track.notes).filter((note) => note.midi === 65);
      expect(midi.header.ppq).toBe(120);
      expect(notes.map((note) => [note.ticks, note.durationTicks])).toEqual([
        [4 * 120, 3 * 120 - 1],
        [10 * 120, 2 * 120 - 1]
      ]);
      expect(midi.tracks.flatMap((track) => track.notes)).toHaveLength(8);
    } finally {
      renderer.destroy();
    }
  });

  const carinhosoPath = path.join(process.cwd(),
    "../../output/omr/selected-homologation-2026-10-07/carinhoso/carinhoso-source-reference.musicxml");
  it.skipIf(!existsSync(carinhosoPath))("preserva os 181 ataques de Carinhoso e corrige a duração da nota na primeira casa", async () => {
    const xml = await fs.readFile(carinhosoPath, "utf8");
    const renderer = await createVerovioScoreRenderer(xml);
    try {
      const bytes = renderer.renderMidiBytes();
      const midi = new Midi(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      const notes = midi.tracks.flatMap((track) => track.notes);
      expect(notes).toHaveLength(181);
      expect(notes.filter((note) => note.midi === 65 && note.ticks >= 62 * 120 && note.ticks <= 67 * 120)
        .map((note) => [note.ticks, note.durationTicks])).toEqual([
        [62 * 120, 2 * 120 - 1],
        [64 * 120, 3 * 120 - 1]
      ]);
    } finally {
      renderer.destroy();
    }
  });
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

  it("preserva e renderiza as páginas codificadas no MusicXML", async () => {
    const renderer = await createVerovioScoreRenderer(applyDefaultTempo(await loadFixture("multiple-pages.musicxml")));

    try {
      expect(renderer.pageCount).toBeGreaterThan(1);
      const laterElements = renderer.getElementsAtTime(4 * 240_000 / 70 + 100);
      expect(laterElements.page).toBe(2);
      expect(laterElements.notes.length).toBeGreaterThan(0);
      const laterPage = renderer.renderPage(2);
      expect(laterPage).toContain(`id="${laterElements.notes[0]}"`);
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

  it.skipIf(!existsSync(purcellCorpusPath))("sincroniza Purcell no MIDI e no cursor nas quatro posições de andamento", async () => {
    const musicXml = await fs.readFile(purcellCorpusPath, "utf8");
    const renderer = await createVerovioScoreRenderer(musicXml);

    try {
      const midiBytes = renderer.renderMidiBytes();
      const parsed = parseMidiPlayback(midiBytes);
      const midi = new Midi(midiBytes);
      expect(midi.header.tempos.map(({ ticks, bpm }) => ({ quarter: ticks / midi.header.ppq, bpm: Math.round(bpm) }))).toEqual([
        { quarter: 0, bpm: 180 },
        { quarter: 370, bpm: 120 },
        { quarter: 378, bpm: 80 },
        { quarter: 382, bpm: 20 }
      ]);
      expect(parsed.events).toHaveLength(162);
      expect(parsed.events[0].pitch).toBe(50);
      expect(renderer.getTempoAtTime(123_400)).toBe(120);
      expect(renderer.getTempoAtTime(127_400)).toBe(80);
      expect(renderer.getTempoAtTime(130_400)).toBe(20);
      expect(renderer.durationMs).toBeCloseTo(136_333.333, 0);
    } finally {
      renderer.destroy();
    }
  });

  it("sincroniza o MIDI e o cursor quando a primeira marca de andamento está dentro do primeiro compasso", async () => {
    const musicXml = await loadFixture("first-intra-measure-tempo.musicxml");
    const renderer = await createVerovioScoreRenderer(musicXml);

    try {
      const midiBytes = renderer.renderMidiBytes();
      const midi = new Midi(midiBytes);
      expect(midi.header.tempos.map(({ ticks, bpm }) => ({ quarter: ticks / midi.header.ppq, bpm: Math.round(bpm) }))).toEqual([
        { quarter: 0, bpm: 120 },
        { quarter: 1, bpm: 90 },
        { quarter: 3, bpm: 60 }
      ]);
      expectEventsClose(renderer.getNoteEvents().map(({ pitch, startMs, durationMs }) => ({ pitch, startMs, durationMs })), [
        { pitch: 60, startMs: 0, durationMs: 500 },
        { pitch: 62, startMs: 500, durationMs: 667 },
        { pitch: 64, startMs: 1_167, durationMs: 667 },
        { pitch: 65, startMs: 1_833, durationMs: 1_000 }
      ]);
      expect(renderer.getTempoAtTime(200)).toBe(120);
      expect(renderer.getTempoAtTime(600)).toBe(90);

      const secondNote = renderer.getNoteEvents().find((event) => event.pitch === 62);
      expect(secondNote).toBeDefined();
      expect(renderer.getElementsAtTime(600).notes).toContain(secondNote?.id);
    } finally {
      renderer.destroy();
    }
  });

  it("mantém cursor e duração dos segmentos ligados ao corrigir tempos dentro de repetição", async () => {
    const musicXml = await loadFixture("intra-measure-tempo-repeat-tie.musicxml");
    const renderer = await createVerovioScoreRenderer(musicXml);

    try {
      const midi = new Midi(renderer.renderMidiBytes());
      const tiedMidiNotes = midi.tracks.flatMap((track) => track.notes).sort((left, right) => left.time - right.time);
      expect(midi.header.tempos.map(({ ticks, bpm }) => ({ quarter: ticks / midi.header.ppq, bpm: Math.round(bpm) }))).toEqual([
        { quarter: 0, bpm: 80 },
        { quarter: 1, bpm: 120 },
        { quarter: 2, bpm: 80 },
        { quarter: 3, bpm: 120 }
      ]);
      expect(tiedMidiNotes).toHaveLength(2);
      expect(tiedMidiNotes.map((note) => note.midi)).toEqual([60, 60]);
      expect(tiedMidiNotes[0].time * 1_000).toBeCloseTo(0, 0);
      expect(tiedMidiNotes[0].duration * 1_000).toBeGreaterThanOrEqual(1_240);
      expect(tiedMidiNotes[1].time * 1_000).toBeCloseTo(1_250, 0);
      expect(tiedMidiNotes[1].duration * 1_000).toBeGreaterThanOrEqual(1_240);

      const visualSegments = renderer.getNoteEvents();
      expect(visualSegments.map(({ startMs, durationMs }) => ({ startMs, durationMs }))).toEqual([
        { startMs: 0, durationMs: 750 },
        { startMs: 750, durationMs: 500 },
        { startMs: 1_250, durationMs: 750 },
        { startMs: 2_000, durationMs: 500 }
      ]);
      expect(renderer.getTempoAtTime(1_000)).toBe(120);
      expect(renderer.getTempoAtTime(1_500)).toBe(80);
      const tiedContinuation = visualSegments[1];
      expect(renderer.getElementsAtTime(1_000).notes).toContain(tiedContinuation.id);
      expect(renderer.getTimesForElement(tiedContinuation.id)).toEqual({ startsMs: [750], endsMs: [1_250] });
      expect(renderer.durationMs).toBe(2_500);
    } finally {
      renderer.destroy();
    }
  });

  it("mantém o andamento herdado ao repetir a partir de um compasso sem marcação", async () => {
    const musicXml = await loadFixture("repeat-unmarked-start-late-tempo.musicxml");
    const renderer = await createVerovioScoreRenderer(musicXml);

    try {
      const midi = new Midi(renderer.renderMidiBytes());
      expect(midi.header.tempos.map(({ ticks, bpm }) => ({ quarter: ticks / midi.header.ppq, bpm: Math.round(bpm) }))).toEqual([
        { quarter: 0, bpm: 120 },
        { quarter: 3, bpm: 60 }
      ]);
      expectEventsClose(renderer.getNoteEvents().map(({ pitch, startMs, durationMs }) => ({ pitch, startMs, durationMs })), [
        { pitch: 60, startMs: 0, durationMs: 500 },
        { pitch: 62, startMs: 500, durationMs: 500 },
        { pitch: 64, startMs: 1_000, durationMs: 500 },
        { pitch: 65, startMs: 1_500, durationMs: 1_000 },
        { pitch: 60, startMs: 2_500, durationMs: 1_000 },
        { pitch: 62, startMs: 3_500, durationMs: 1_000 },
        { pitch: 64, startMs: 4_500, durationMs: 1_000 },
        { pitch: 65, startMs: 5_500, durationMs: 1_000 }
      ]);
      expect(renderer.getTempoAtTime(2_600)).toBe(60);

      const repeatedFirstNote = renderer.getNoteEvents().filter((event) => event.pitch === 60)[1];
      expect(repeatedFirstNote).toBeDefined();
      expect(renderer.getElementsAtTime(2_600).notes).toContain(repeatedFirstNote?.id);
      expect(renderer.durationMs).toBe(6_500);
    } finally {
      renderer.destroy();
    }
  });
});
