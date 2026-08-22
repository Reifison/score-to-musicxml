import { beforeEach, describe, expect, it, vi } from "vitest";
import { VerovioRenderError, VerovioScoreRenderer } from "./VerovioScoreRenderer.js";
import { loadVerovioModule } from "./verovioLoader.js";

const toolkit = vi.hoisted(() => ({
  destroy: vi.fn(),
  getElementsAtTime: vi.fn(),
  getMIDIValuesForElement: vi.fn(),
  getPageCount: vi.fn(),
  getPageWithElement: vi.fn(),
  getTimeForElement: vi.fn(),
  getTimesForElement: vi.fn(),
  loadData: vi.fn(),
  renderToMIDI: vi.fn(),
  renderToTimemap: vi.fn(),
  setOptions: vi.fn()
}));

vi.mock("verovio/esm", () => ({ VerovioToolkit: vi.fn(() => toolkit) }));
vi.mock("./verovioLoader.js", () => ({ loadVerovioModule: vi.fn() }));

describe("VerovioScoreRenderer playback API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadVerovioModule).mockResolvedValue({} as never);
    toolkit.loadData.mockReturnValue(true);
    toolkit.getPageCount.mockReturnValue(2);
    toolkit.renderToMIDI.mockReturnValue("TVRoZA==");
  });

  async function loadedRenderer(): Promise<VerovioScoreRenderer> {
    const renderer = await VerovioScoreRenderer.create();
    renderer.loadMusicXml("<score-partwise />");
    return renderer;
  }

  it("preserva quebras de página codificadas no MusicXML", async () => {
    const renderer = await VerovioScoreRenderer.create();

    renderer.loadMusicXml('<score-partwise><part><measure><print new-page="yes" /></measure></part></score-partwise>');

    expect(toolkit.setOptions).toHaveBeenLastCalledWith({ breaks: "encoded" });
    renderer.destroy();
  });

  it("deriva a duração do último evento do timemap nativo", async () => {
    toolkit.renderToTimemap.mockReturnValue([
      { on: ["note-1"], tempo: 120, tstamp: 0 },
      { off: ["note-1"], tstamp: 2450.5 }
    ]);
    const renderer = await loadedRenderer();

    expect(renderer.durationMs).toBe(2450.5);
    expect(renderer.getDurationMs()).toBe(2450.5);
    expect(toolkit.renderToTimemap).toHaveBeenCalledWith({ includeMeasures: true, includeRests: true });
  });

  it("normaliza elementos e página consultados em milissegundos", async () => {
    toolkit.getElementsAtTime.mockReturnValue({
      chords: ["chord-1"],
      measure: "measure-1",
      notes: ["note-1", "note-2"],
      page: 2,
      rests: []
    });
    const renderer = await loadedRenderer();

    expect(renderer.getElementsAtTime(101.6)).toEqual({
      chords: ["chord-1"],
      measure: "measure-1",
      notes: ["note-1", "note-2"],
      page: 2,
      rests: []
    });
    expect(toolkit.getElementsAtTime).toHaveBeenCalledWith(102);
  });

  it("retorna coleções vazias fora do conteúdo executado", async () => {
    toolkit.getElementsAtTime.mockReturnValue({});
    const renderer = await loadedRenderer();

    expect(renderer.getElementsAtTime(9999)).toEqual({
      chords: [],
      measure: undefined,
      notes: [],
      page: undefined,
      rests: []
    });
  });

  it("preserva todos os intervalos gerados por repetições e ligaduras", async () => {
    toolkit.renderToTimemap.mockReturnValue([
      { on: ["note-1"], tstamp: 0 },
      { off: ["note-1"], tstamp: 800 },
      { on: ["note-1"], tstamp: 1600 },
      { off: ["note-1"], tstamp: 2400 }
    ]);
    toolkit.getPageWithElement.mockReturnValue(2);
    const renderer = await loadedRenderer();

    expect(renderer.getTimesForElement(" note-1 ")).toEqual({
      startsMs: [0, 1600],
      endsMs: [800, 2400]
    });
    expect(renderer.getPageForElement("note-1")).toBe(2);
  });

  it("cria eventos de notas repetidas com pitch e duração nativos", async () => {
    toolkit.renderToMIDI.mockReturnValue("TVRoZA==");
    toolkit.renderToTimemap.mockReturnValue([
      { on: ["note-1"], tempo: 90, tstamp: 0 },
      { off: ["note-1"], tstamp: 500 },
      { on: ["note-1"], tempo: 140, tstamp: 1000 },
      { off: ["note-1"], tstamp: 1250 }
    ]);
    toolkit.getMIDIValuesForElement.mockReturnValue({ duration: 500, pitch: 64, time: 0 });
    const renderer = await loadedRenderer();

    expect(renderer.getNoteEvents()).toEqual([
      { id: "note-1", pitch: 64, startMs: 0, durationMs: 500 },
      { id: "note-1", pitch: 64, startMs: 1000, durationMs: 250 }
    ]);
    expect(renderer.getTempoAtTime(1100)).toBe(140);
    expect(renderer.getTempoAtTime(0, 100)).toBe(90);
  });

  it("expõe o MIDI nativo como base64 e bytes", async () => {
    toolkit.renderToMIDI.mockReturnValue("TVRoZA==");
    const renderer = await loadedRenderer();

    expect(renderer.renderMidiBase64()).toBe("TVRoZA==");
    expect([...renderer.renderMidiBytes()]).toEqual([77, 84, 104, 100]);
    expect(toolkit.renderToMIDI).toHaveBeenCalledTimes(1);
  });

  it("rejeita tempo, elemento e saída MIDI inválidos com códigos estáveis", async () => {
    toolkit.renderToMIDI.mockReturnValue("");
    const renderer = await loadedRenderer();

    expect(() => renderer.getElementsAtTime(-1)).toThrowError(
      expect.objectContaining<Partial<VerovioRenderError>>({ code: "INVALID_TIME" })
    );
    expect(() => renderer.getPageForElement(" ")).toThrowError(
      expect.objectContaining<Partial<VerovioRenderError>>({ code: "INVALID_ELEMENT" })
    );
    expect(() => renderer.renderMidiBase64()).toThrowError(
      expect.objectContaining<Partial<VerovioRenderError>>({ code: "MIDI_RENDER_FAILED" })
    );
  });
});
