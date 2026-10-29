import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
// @ts-expect-error -- Verovio publishes JavaScript ESM entrypoints without declarations
import { VerovioToolkit } from "verovio/esm";
// @ts-expect-error -- Verovio publishes JavaScript ESM entrypoints without declarations
import createVerovioModule from "verovio/wasm";
import { MidiExportService } from "../services/MidiExportService.js";
import { MidiObservabilityService, type MidiMetric } from "../services/MidiObservabilityService.js";
import { applyDefaultTempo } from "../utils/musicXmlTempo.js";

const midiBytes = Buffer.from("4d546864000000060000000100604d54726b0000000400ff2f00", "hex");

function countNoteOns(buffer: Buffer, [status, pitch]: number[]): number {
  let count = 0;
  for (let index = 0; index <= buffer.length - 3; index += 1) {
    if (buffer[index] === status && buffer[index + 1] === pitch && buffer[index + 2] > 0) count += 1;
  }
  return count;
}

function firstTempoBpm(buffer: Buffer): number | undefined {
  for (let index = 0; index <= buffer.length - 6; index += 1) {
    if (buffer[index] !== 0xff || buffer[index + 1] !== 0x51 || buffer[index + 2] !== 0x03) continue;
    return Math.round(60_000_000 / buffer.readUIntBE(index + 3, 3));
  }
  return undefined;
}

function readVariableLength(buffer: Buffer, start: number): { value: number; next: number } {
  let value = 0;
  let next = start;
  for (let index = 0; index < 4; index += 1) {
    const byte = buffer[next++];
    if (byte === undefined) throw new Error("MIDI truncado");
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, next };
  }
  throw new Error("Valor MIDI de comprimento variável inválido");
}

function readMeterAndNotes(buffer: Buffer): { meters: Array<{ numerator: number; denominator: number }>; noteOns: number } {
  const meters: Array<{ numerator: number; denominator: number }> = [];
  let noteOns = 0;
  let position = 14;
  const tracks = buffer.readUInt16BE(10);
  for (let track = 0; track < tracks; track += 1) {
    if (buffer.toString("ascii", position, position + 4) !== "MTrk") throw new Error("Trilha MIDI inválida");
    const end = position + 8 + buffer.readUInt32BE(position + 4);
    position += 8;
    let runningStatus = 0;
    while (position < end) {
      position = readVariableLength(buffer, position).next;
      let status = buffer[position];
      if (status & 0x80) {
        position += 1;
        if (status < 0xf0) runningStatus = status;
      } else {
        status = runningStatus;
        if (!status) throw new Error("Running status MIDI inválido");
      }
      if (status === 0xff) {
        const type = buffer[position++];
        const length = readVariableLength(buffer, position);
        position = length.next;
        if (type === 0x58 && length.value === 4) meters.push({ numerator: buffer[position], denominator: 2 ** buffer[position + 1] });
        position += length.value;
      } else if (status === 0xf0 || status === 0xf7) {
        const length = readVariableLength(buffer, position);
        position = length.next + length.value;
      } else {
        const kind = status & 0xf0;
        if (kind === 0x90 && buffer[position + 1] > 0) noteOns += 1;
        position += kind === 0xc0 || kind === 0xd0 ? 1 : 2;
      }
    }
    if (position !== end) throw new Error("Comprimento de trilha MIDI inválido");
  }
  return { meters, noteOns };
}

function readTempoEvents(buffer: Buffer): Array<{ quarter: number; bpm: number }> {
  const events: Array<{ tick: number; bpm: number }> = [];
  const ppq = buffer.readUInt16BE(12);
  let position = 14;
  const end = position + 8 + buffer.readUInt32BE(position + 4);
  position += 8;
  let runningStatus = 0;
  let tick = 0;
  while (position < end) {
    const delta = readVariableLength(buffer, position);
    tick += delta.value;
    position = delta.next;
    let status = buffer[position];
    if (status >= 0x80) {
      position += 1;
      if (status < 0xf0) runningStatus = status;
      else runningStatus = 0;
    } else {
      status = runningStatus;
    }
    if (status === 0xff) {
      const type = buffer[position++];
      const length = readVariableLength(buffer, position);
      position = length.next;
      if (type === 0x51 && length.value === 3) {
        const micros = buffer.readUIntBE(position, 3);
        events.push({ tick, bpm: 60_000_000 / micros });
      }
      position += length.value;
    } else if (status === 0xf0 || status === 0xf7) {
      const length = readVariableLength(buffer, position);
      position = length.next + length.value;
    } else {
      const kind = status & 0xf0;
      position += kind === 0xc0 || kind === 0xd0 ? 1 : 2;
    }
  }
  return events.map(({ tick, bpm }) => ({ quarter: tick / ppq, bpm }));
}

function midiTrackData(buffer: Buffer, trackIndex: number): Buffer {
  let position = 14;
  for (let index = 0; index < buffer.readUInt16BE(10); index += 1) {
    const start = position + 8;
    const end = start + buffer.readUInt32BE(position + 4);
    if (index === trackIndex) return buffer.subarray(start, end);
    position = end;
  }
  throw new Error("MIDI track not found");
}

function noteTransitions(buffer: Buffer, pitch: number): Array<{ quarter: number; on: boolean }> {
  const result: Array<{ quarter: number; on: boolean }> = [];
  const ppq = buffer.readUInt16BE(12);
  let position = 14;
  for (let track = 0; track < buffer.readUInt16BE(10); track++) {
    const end = position + 8 + buffer.readUInt32BE(position + 4);
    position += 8;
    let tick = 0;
    let runningStatus = 0;
    while (position < end) {
      const delta = readVariableLength(buffer, position);
      tick += delta.value;
      position = delta.next;
      let status = buffer[position];
      if (status >= 0x80) { position++; runningStatus = status < 0xf0 ? status : 0; }
      else status = runningStatus;
      if (status === 0xff) {
        position++;
        const size = readVariableLength(buffer, position);
        position = size.next + size.value;
      } else if (status === 0xf0 || status === 0xf7) {
        const size = readVariableLength(buffer, position);
        position = size.next + size.value;
      } else {
        const kind = status & 0xf0;
        if ((kind === 0x80 || kind === 0x90) && buffer[position] === pitch) {
          result.push({ quarter: tick / ppq, on: kind === 0x90 && buffer[position + 1] > 0 });
        }
        position += kind === 0xc0 || kind === 0xd0 ? 1 : 2;
      }
    }
  }
  return result;
}

function meteredScore(firstBeats: 2 | 3, secondBeats?: 2 | 3, repeat = false): string {
  const notes = (steps: string[]) => steps.map((step) => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>`).join("");
  const first = `<measure number="1"><attributes><divisions>4</divisions><time><beats>${firstBeats}</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${repeat ? '<barline location="left"><repeat direction="forward"/></barline>' : ""}${notes(["C", "D", "E"].slice(0, firstBeats))}</measure>`;
  const second = secondBeats ? `<measure number="2"><attributes><time><beats>${secondBeats}</beats><beat-type>4</beat-type></time></attributes>${notes(["F", "G", "A"].slice(0, secondBeats))}${repeat ? '<barline location="right"><repeat direction="backward" times="2"/></barline>' : ""}</measure>` : "";
  return `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Estudo</part-name></score-part></part-list><part id="P1">${first}${second}</part></score-partwise>`;
}

const toolkit = (overrides: Partial<{
  destroy: () => void;
  getMEI: () => string;
  loadData: (data: string) => boolean;
  renderToExpansionMap: () => Record<string, string[]>;
  renderToMIDI: () => string;
  renderToTimemap: (options?: Record<string, unknown>) => Array<{
    measureOn?: string;
    qstamp?: number;
    tempo?: number;
    tstamp: number;
  }>;
  setOptions: (options: Record<string, unknown>) => boolean;
}> = {}) => ({
  destroy: vi.fn(),
  getMEI: vi.fn(() => '<mei xmlns="http://www.music-encoding.org/ns/mei"></mei>'),
  loadData: vi.fn(() => true),
  renderToExpansionMap: vi.fn(() => ({})),
  renderToMIDI: vi.fn(() => midiBytes.toString("base64")),
  renderToTimemap: vi.fn(() => []),
  setOptions: vi.fn(() => true),
  ...overrides
});

describe("MidiExportService", () => {
  const selectedRoot = path.resolve(process.cwd(), "../../output/omr/selected-homologation-2026-10-07");
  const carcassiQualificationXml = path.resolve(
    process.cwd(),
    "../../tmp/omr-homologation-2026-10-17/run-20261017-03/carcassi-final.musicxml"
  );
  it.skipIf(!existsSync(carcassiQualificationXml))("valida os ataques do MusicXML Carcassi com o timemap racional", async () => {
    const musicXml = await fs.readFile(carcassiQualificationXml, "utf8");
    const report = await new MidiExportService().inspect(musicXml);

    expect(report).toMatchObject({
      status: "passed",
      checkedNotes: 1440,
      checkedDurations: 32,
      sourceEventCoverage: {
        status: "verified",
        totalSourcePitchedNotes: 720,
        mappedSourcePitchedNotes: 720,
        expectedPerformedAttacks: 1440,
        checkedPitches: 1440,
        checkedOnsets: 1440,
        checkedDurations: 0,
        durationStatus: "not_checked",
        skippedSourceNotes: 0,
        skippedPerformedEvents: 0
      }
    });
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MIDI_FLOAT_TIMING_CANONICALIZED", repairedAttacks: "1", repairedOffsets: "1" })
    ]));
  });

  const carcassiLinuxXml = path.resolve(process.cwd(), "../../tmp/omr-qualification-2026-10-17/linux/carcassi-final.musicxml");
  it.skipIf(!existsSync(carcassiLinuxXml))("confere o Carcassi Linux imutável incluindo a segunda passagem da repetição", async () => {
    const musicXml = await fs.readFile(carcassiLinuxXml, "utf8");
    const report = await new MidiExportService().inspect(musicXml);
    expect(report).toMatchObject({
      status: "passed",
      xmlSHA256: "4d9d941a96da868d8568a22b32aa0012115df5db0d202f0e125f4e7adba3b832",
      sourceEventCoverage: {
        status: "verified",
        totalSourcePitchedNotes: 727,
        mappedSourcePitchedNotes: 727,
        expectedPerformedAttacks: 1454,
        checkedPitches: 1454,
        checkedOnsets: 1454,
        skippedSourceNotes: 0,
        skippedPerformedEvents: 0,
        skippedReasons: []
      }
    });
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MIDI_FLOAT_TIMING_CANONICALIZED", repairedAttacks: "85", repairedOffsets: "85" })
    ]));
  });

  it("corrige a ligadura sem destino em uma partitura mínima com primeira e segunda casa", async () => {
    const musicXml = await fs.readFile(new URL("./fixtures/midi/learned-skipped-first-ending.musicxml", import.meta.url), "utf8");
    const service = new MidiExportService();
    const report = await service.inspect(musicXml);
    expect(report).toMatchObject({ status: "passed", checkedNotes: 8 });
    expect(report.xmlSHA256).toMatch(/^[a-f0-9]{64}$/);
    const transitions = noteTransitions(await service.generate(musicXml), 65);
    expect(transitions).toEqual([
      { quarter: 4, on: true },
      { quarter: (7 * 120 - 1) / 120, on: false },
      { quarter: 10, on: true },
      { quarter: (12 * 120 - 1) / 120, on: false }
    ]);
  });

  it("não adivinha qual nota corrigir quando outra voz soa no mesmo instante", async () => {
    const source = await fs.readFile(new URL("./fixtures/midi/learned-skipped-first-ending.musicxml", import.meta.url), "utf8");
    const musicXml = source.replace(
      '<measure number="3"><note><pitch><step>F</step><octave>4</octave></pitch><duration>24</duration><tie type="start"/><type>half</type><notations><tied type="start"/></notations></note></measure>',
      '<measure number="3"><note><pitch><step>F</step><octave>4</octave></pitch><duration>24</duration><tie type="start"/><type>half</type><notations><tied type="start"/></notations></note><note><chord/><pitch><step>A</step><octave>4</octave></pitch><duration>24</duration><type>half</type></note></measure>'
    );
    expect(musicXml).not.toBe(source);
    const service = new MidiExportService();
    expect(await service.inspect(musicXml)).toMatchObject({
      status: "unverified",
      issues: [{ code: "MIDI_EVENTS_UNVERIFIED" }]
    });
    await expect(service.generate(musicXml)).rejects.toMatchObject({ statusCode: 422, code: "MIDI_EVENTS_UNVERIFIED" });
  });

  it.skipIf(!existsSync(path.join(selectedRoot, "carinhoso/carinhoso-source-reference.musicxml")))("encerra a ligadura da segunda passagem quando a primeira casa é omitida", async () => {
    const musicXml = await fs.readFile(path.join(selectedRoot, "carinhoso/carinhoso-source-reference.musicxml"), "utf8");
    const service = new MidiExportService();
    const report = await service.inspect(musicXml);
    expect(report.status).toBe("passed");
    expect(report.checkedNotes).toBeGreaterThan(0);
    expect(report.issues.map((issue) => issue.code)).toContain("MIDI_SKIPPED_TIE_REPAIRED");
    const midi = await service.generate(musicXml);
    expect(readMeterAndNotes(midi).noteOns).toBe(181);
    const notes = noteTransitions(midi, 65).filter((event) => event.quarter >= 62 && event.quarter <= 67);
    expect(notes).toEqual([
      { quarter: 62, on: true },
      { quarter: 63 + 119 / 120, on: false },
      { quarter: 64, on: true },
      { quarter: 66 + 119 / 120, on: false }
    ]);
  });

  it.skipIf(!existsSync(path.join(selectedRoot, "rondo/little-rondo-source-reviewed.musicxml")) ||
    !existsSync(path.join(selectedRoot, "samba/source-aligned-candidate.musicxml"))).each([
    ["rondo/little-rondo-source-reviewed.musicxml", 252],
    ["samba/source-aligned-candidate.musicxml", 125]
  ])("confere os inícios executados de %s com o MIDI real", async (filename, expectedNotes) => {
    const musicXml = await fs.readFile(path.join(selectedRoot, filename), "utf8");
    const service = new MidiExportService();
    const report = await service.inspect(musicXml);
    expect(report.status).toBe("passed");
    expect(report.checkedNotes).toBe(expectedNotes);
    expect(report.limitations.join(" ")).toContain("imagem original");
    expect(readMeterAndNotes(await service.generate(musicXml)).noteOns).toBe(expectedNotes);
  });
  it.each([
    { firstBeats: 2 as const, expected: [{ numerator: 2, denominator: 4 }], noteOns: 2 },
    { firstBeats: 3 as const, expected: [{ numerator: 3, denominator: 4 }], noteOns: 3 }
  ])("preserva a fórmula $firstBeats/4 ao inserir o andamento padrão", async ({ firstBeats, expected, noteOns }) => {
    const midi = await new MidiExportService().generate(meteredScore(firstBeats));
    expect(readMeterAndNotes(midi)).toEqual({ meters: expected, noteOns });
    expect(firstTempoBpm(midi)).toBe(70);
  });

  it("preserva mudança de 2/4 para 3/4 e as cinco notas", async () => {
    const midi = await new MidiExportService().generate(meteredScore(2, 3));
    expect(readMeterAndNotes(midi)).toEqual({
      meters: [{ numerator: 2, denominator: 4 }, { numerator: 3, denominator: 4 }],
      noteOns: 5
    });
  });

  it("expande repetição sem transformar uma fórmula estável de 2/4 em 4/4", async () => {
    const midi = await new MidiExportService().generate(meteredScore(2, 2, true));
    const { meters, noteOns } = readMeterAndNotes(midi);
    expect(meters.length).toBeGreaterThanOrEqual(1);
    expect(meters.every((meter) => meter.numerator === 2 && meter.denominator === 4)).toBe(true);
    expect(noteOns).toBe(8);
  });

  it("não inventa 4/4 quando uma mudança de fórmula ocorre dentro de repetição", async () => {
    const midi = await new MidiExportService().generate(meteredScore(2, 3, true));
    const { meters, noteOns } = readMeterAndNotes(midi);
    expect(meters[0]).toEqual({ numerator: 2, denominator: 4 });
    expect(meters).toContainEqual({ numerator: 3, denominator: 4 });
    expect(meters.every((meter) => meter.denominator === 4 && (meter.numerator === 2 || meter.numerator === 3))).toBe(true);
    expect(noteOns).toBe(10);
  });

  it.each([
    {
      filename: "simple-melody.musicxml",
      tempo: 90,
      tracks: 2,
      noteOns: [[0x90, 60], [0x90, 62], [0x90, 64], [0x90, 65]]
    },
    {
      filename: "piano-chords-rests-accidentals-ties.musicxml",
      tempo: 70,
      tracks: 2,
      noteOns: [[0x90, 60], [0x90, 64], [0x90, 67], [0x90, 66], [0x90, 70]],
      singleNoteOn: [0x90, 66]
    },
    {
      filename: "multiple-parts.musicxml",
      tempo: 70,
      tracks: 3,
      noteOns: [[0x90, 60], [0x91, 67]]
    },
    {
      filename: "multiple-pages.musicxml",
      tempo: 70,
      tracks: 2,
      noteOns: [[0x90, 60], [0x90, 62], [0x90, 64], [0x90, 65], [0x90, 67], [0x90, 69], [0x90, 71], [0x90, 72]]
    }
  ])("gera MIDI real e preserva a semântica de $filename", async ({ filename, tempo, tracks, noteOns, singleNoteOn }) => {
    const musicXml = await fs.readFile(new URL(`./fixtures/midi/${filename}`, import.meta.url), "utf8");

    const result = await new MidiExportService().generate(musicXml);

    expect(result.subarray(0, 4).toString("ascii")).toBe("MThd");
    expect(result.readUInt16BE(10)).toBe(tracks);
    expect(result.length).toBeGreaterThan(32);
    expect(firstTempoBpm(result)).toBe(tempo);
    for (const noteOn of noteOns) expect(countNoteOns(result, noteOn)).toBeGreaterThanOrEqual(1);
    if (singleNoteOn) expect(countNoteOns(result, singleNoteOn)).toBe(1);
  });

  it.skipIf(!existsSync(path.resolve(process.cwd(), "../../output/omr/acervo-review-2026-10-07/purcell/v1/abdelazer-suite-ii.musicxml")))("reposiciona tempos intra-compasso do Purcell sem mudar notas ou a trilha de notas", async () => {
    const musicXml = await fs.readFile(path.resolve(
      process.cwd(),
      "../../output/omr/acervo-review-2026-10-07/purcell/v1/abdelazer-suite-ii.musicxml"
    ), "utf8");
    const module = await createVerovioModule();
    const rawToolkit = new VerovioToolkit(module);
    rawToolkit.setOptions({ breaks: "none", inputFrom: "xml" });
    expect(rawToolkit.loadData(applyDefaultTempo(musicXml))).toBeTruthy();
    const rawMidi = Buffer.from(rawToolkit.renderToMIDI(), "base64");
    rawToolkit.destroy();

    const midi = await new MidiExportService().generate(musicXml);

    expect(readTempoEvents(midi)).toEqual([
      { quarter: 0, bpm: expect.closeTo(180, 3) },
      { quarter: 370, bpm: 120 },
      { quarter: 378, bpm: 80 },
      { quarter: 382, bpm: 20 }
    ]);
    expect(readMeterAndNotes(midi).noteOns).toBe(162);
    expect(countNoteOns(midi, [0x90, 50])).toBeGreaterThan(0);
    expect(midiTrackData(midi, 1)).toEqual(midiTrackData(rawMidi, 1));
  });

  it("preserva o tempo MIDI padrão antes do primeiro andamento intra-compasso", async () => {
    const musicXml = await fs.readFile(new URL("./fixtures/midi/first-intra-measure-tempo.musicxml", import.meta.url), "utf8");
    const module = await createVerovioModule();
    const rawToolkit = new VerovioToolkit(module);
    rawToolkit.setOptions({ breaks: "none", inputFrom: "xml" });
    expect(rawToolkit.loadData(musicXml)).toBeTruthy();
    const rawMidi = Buffer.from(rawToolkit.renderToMIDI(), "base64");
    rawToolkit.destroy();

    const midi = await new MidiExportService().generate(musicXml);

    expect(readTempoEvents(rawMidi)).toEqual([
      { quarter: 0, bpm: expect.closeTo(90, 3) },
      { quarter: 2, bpm: expect.closeTo(60, 3) }
    ]);
    expect(readTempoEvents(midi)).toEqual([
      { quarter: 0, bpm: expect.closeTo(120, 3) },
      { quarter: 1, bpm: expect.closeTo(90, 3) },
      { quarter: 3, bpm: expect.closeTo(60, 3) }
    ]);
    expect(readMeterAndNotes(midi).noteOns).toBe(4);
    expect(midiTrackData(midi, 1)).toEqual(midiTrackData(rawMidi, 1));
  });

  it("restaura o andamento ao voltar ao início da repetição e mantém a ligadura", async () => {
    const musicXml = await fs.readFile(new URL("./fixtures/midi/intra-measure-tempo-repeat-tie.musicxml", import.meta.url), "utf8");
    const module = await createVerovioModule();
    const rawToolkit = new VerovioToolkit(module);
    rawToolkit.setOptions({ breaks: "none", inputFrom: "xml" });
    expect(rawToolkit.loadData(applyDefaultTempo(musicXml))).toBeTruthy();
    const rawMidi = Buffer.from(rawToolkit.renderToMIDI(), "base64");
    rawToolkit.destroy();

    const midi = await new MidiExportService().generate(musicXml);

    expect(readTempoEvents(midi)).toEqual([
      { quarter: 0, bpm: 80 },
      { quarter: 1, bpm: 120 },
      { quarter: 2, bpm: 80 },
      { quarter: 3, bpm: 120 }
    ]);
    expect(readMeterAndNotes(midi).noteOns).toBe(2);
    expect(midiTrackData(midi, 1)).toEqual(midiTrackData(rawMidi, 1));
  });

  it("mantém o andamento adquirido ao repetir desde um compasso sem marcação", async () => {
    const musicXml = await fs.readFile(new URL("./fixtures/midi/repeat-unmarked-start-late-tempo.musicxml", import.meta.url), "utf8");
    const module = await createVerovioModule();
    const rawToolkit = new VerovioToolkit(module);
    rawToolkit.setOptions({ breaks: "none", inputFrom: "xml" });
    expect(rawToolkit.loadData(musicXml)).toBeTruthy();
    const rawMidi = Buffer.from(rawToolkit.renderToMIDI(), "base64");
    rawToolkit.destroy();

    const midi = await new MidiExportService().generate(musicXml);

    expect(readTempoEvents(midi)).toEqual([
      { quarter: 0, bpm: expect.closeTo(120, 3) },
      { quarter: 3, bpm: expect.closeTo(60, 3) }
    ]);
    expect(readMeterAndNotes(midi).noteOns).toBe(8);
    expect(midiTrackData(midi, 1)).toEqual(midiTrackData(rawMidi, 1));
  });

  it("converte o MIDI base64 do Verovio em bytes e aplica opcoes sem layout", async () => {
    const engine = toolkit();
    const service = new MidiExportService(async () => engine);
    const musicXml = '<score-partwise version="4.0"><part-list/><part><measure number="1"/></part></score-partwise>';

    const result = await service.generate(musicXml);

    expect(result).toEqual(midiBytes);
    expect(result.subarray(0, 4).toString("ascii")).toBe("MThd");
    expect(engine.setOptions).toHaveBeenCalledWith({ breaks: "none", inputFrom: "xml" });
    expect(engine.loadData).toHaveBeenCalledWith(expect.stringContaining('<sound tempo="70"/>'));
    expect(engine.destroy).toHaveBeenCalledOnce();
  });

  it("preserva o BPM quando ele está informado no MusicXML", async () => {
    const engine = toolkit();
    const service = new MidiExportService(async () => engine);
    const musicXml = '<score-partwise><part><measure><direction><sound tempo="92"/></direction></measure></part></score-partwise>';

    await service.generate(musicXml);

    expect(engine.loadData).toHaveBeenCalledWith(musicXml);
  });

  it("rejeita MusicXML vazio sem inicializar o Verovio", async () => {
    const factory = vi.fn(async () => toolkit());
    const service = new MidiExportService(factory);

    await expect(service.generate("  ")).rejects.toMatchObject({
      statusCode: 422,
      code: "INVALID_MUSICXML",
      message: "MusicXML inválido para exportação MIDI."
    });
    expect(factory).not.toHaveBeenCalled();
  });

  it("retorna erro seguro quando o Verovio nao consegue carregar o MusicXML", async () => {
    const engine = toolkit({ loadData: vi.fn(() => false) });
    const service = new MidiExportService(async () => engine);

    await expect(service.generate("<xml-invalido>")).rejects.toMatchObject({
      statusCode: 422,
      code: "INVALID_MUSICXML"
    });
    expect(engine.destroy).toHaveBeenCalledOnce();
  });

  it("rejeita uma saida que nao tenha cabecalho MIDI padrao", async () => {
    const engine = toolkit({ renderToMIDI: vi.fn(() => Buffer.from("not-midi").toString("base64")) });
    const service = new MidiExportService(async () => engine);

    await expect(service.generate("<score-partwise/>")).rejects.toMatchObject({
      statusCode: 422,
      code: "MIDI_GENERATION_FAILED",
      message: "Não foi possível gerar um arquivo MIDI válido."
    });
    expect(engine.destroy).toHaveBeenCalledOnce();
  });

  it("detecta uma entrada de nota ausente no MIDI antes de entregá-lo", async () => {
    const mei = '<mei><music><body><measure xml:id="m1"><staff><layer><note xml:id="n1" dur="4" pname="c" oct="4"/></layer></staff></measure></body></music></mei>';
    const engine = toolkit({
      getMEI: vi.fn(() => mei),
      renderToTimemap: vi.fn(() => [{ measureOn: "m1", qstamp: 0, on: ["n1"], tstamp: 0 }])
    });
    const service = new MidiExportService(async () => engine);
    const xml = '<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list><part id="P1"><measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note></measure></part></score-partwise>';
    await expect(service.generate(xml)).rejects.toMatchObject({ statusCode: 422, code: "MIDI_EVENT_MISMATCH" });
    expect(await service.inspect(xml)).toMatchObject({ status: "failed", issues: [{ code: "MIDI_EVENT_MISMATCH" }] });
  });

  it("detecta uma nota escrita perdida durante a importação MusicXML", async () => {
    const mei = '<mei><music><body><measure xml:id="m1"><staff><layer><note xml:id="n1" dur="4" pname="c" oct="4"/></layer></staff></measure></body></music></mei>';
    const service = new MidiExportService(async () => toolkit({ getMEI: vi.fn(() => mei) }));
    await expect(service.generate(meteredScore(2))).rejects.toMatchObject({ statusCode: 422, code: "MIDI_EVENT_MISMATCH" });
  });

  it("barra tuplets cujo duration declarado é ignorado pelo motor sem notação completa", async () => {
    const xml = await fs.readFile(new URL("./fixtures/midi/learned-tuplet-without-notations.musicxml", import.meta.url), "utf8");
    const service = new MidiExportService();
    expect(await service.inspect(xml)).toMatchObject({ status: "failed", issues: [{ code: "MIDI_EVENT_MISMATCH" }] });
    await expect(service.generate(xml)).rejects.toMatchObject({ statusCode: 422, code: "MIDI_EVENT_MISMATCH" });
  });

  it("herda divisões atualizadas mesmo após um compasso de acorde fora da comparação simples", async () => {
    const xml = await fs.readFile(new URL("./fixtures/midi/learned-divisions-after-chord.musicxml", import.meta.url), "utf8");
    const service = new MidiExportService();
    const report = await service.inspect(xml);
    expect(report.status).toBe("passed");
    expect(report.sourceEventCoverage).toMatchObject({ status: "verified" });
    expect(report.checkedDurations).toBe(2);
    expect(report.issues).toEqual([]);
    expect(readMeterAndNotes(await service.generate(xml)).noteOns).toBe(4);
  });

  it("nao expoe detalhes internos quando o motor falha", async () => {
    const service = new MidiExportService(async () => {
      throw new Error("WASM failed at /private/internal/path");
    });

    await expect(service.generate("<score-partwise/>")).rejects.toMatchObject({
      statusCode: 422,
      code: "MIDI_GENERATION_FAILED",
      message: "Não foi possível converter esta partitura para MIDI."
    });
  });

  it("registra métricas allowlisted de sucesso sem conteúdo musical sensível", async () => {
    const metrics: MidiMetric[] = [];
    const observability = new MidiObservabilityService((metric) => metrics.push(metric));
    const clock = vi.fn()
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(126.4);
    const service = new MidiExportService(async () => toolkit(), observability, clock);
    const secretMusicXml = '<score-partwise><part><measure><note><pitch><step>C</step></pitch></note></measure></part></score-partwise>';

    await service.generate(secretMusicXml);

    expect(metrics).toEqual([{
      metric: "midi_export",
      phase: "generation",
      status: "success",
      durationMs: 26,
      sizeBytes: midiBytes.byteLength
    }]);
    expect(JSON.stringify(metrics)).not.toContain(secretMusicXml);
    expect(JSON.stringify(metrics)).not.toContain("MThd");
  });

  it("reduz falhas internas a um código seguro e não registra mensagem, caminho ou token", async () => {
    const metrics: MidiMetric[] = [];
    const observability = new MidiObservabilityService((metric) => metrics.push(metric));
    const clock = vi.fn()
      .mockReturnValueOnce(20)
      .mockReturnValueOnce(24);
    const service = new MidiExportService(async () => {
      throw new Error("Bearer secret-token failed at /private/internal/path with PHNjb3JlPg==");
    }, observability, clock);

    await expect(service.generate("<score-partwise/>")).rejects.toMatchObject({
      code: "MIDI_GENERATION_FAILED"
    });

    expect(metrics).toEqual([{
      metric: "midi_export",
      phase: "generation",
      status: "failure",
      durationMs: 4,
      errorCode: "UNEXPECTED_ERROR"
    }]);
    const serialized = JSON.stringify(metrics);
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("/private");
    expect(serialized).not.toContain("PHNjb3Jl");
  });
});
