import fs from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { MidiExportService } from "../services/MidiExportService.js";
import { MidiObservabilityService, type MidiMetric } from "../services/MidiObservabilityService.js";

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

const toolkit = (overrides: Partial<{
  destroy: () => void;
  loadData: (data: string) => boolean;
  renderToMIDI: () => string;
  setOptions: (options: Record<string, unknown>) => boolean;
}> = {}) => ({
  destroy: vi.fn(),
  loadData: vi.fn(() => true),
  renderToMIDI: vi.fn(() => midiBytes.toString("base64")),
  setOptions: vi.fn(() => true),
  ...overrides
});

describe("MidiExportService", () => {
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
