import { beforeEach, describe, expect, it, vi } from "vitest";
import { VerovioRenderError, VerovioScoreRenderer } from "./VerovioScoreRenderer.js";
import { loadVerovioModule } from "./verovioLoader.js";

const toolkit = vi.hoisted(() => ({
  destroy: vi.fn(),
  getElementsAtTime: vi.fn(),
  getMEI: vi.fn(),
  getMIDIValuesForElement: vi.fn(),
  getPageCount: vi.fn(),
  getPageWithElement: vi.fn(),
  getTimeForElement: vi.fn(),
  getTimesForElement: vi.fn(),
  loadData: vi.fn(),
  renderToExpansionMap: vi.fn(),
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
    toolkit.getPageWithElement.mockReturnValue(undefined);
    toolkit.getMEI.mockReturnValue("<mei />");
    toolkit.renderToExpansionMap.mockReturnValue({});
    toolkit.renderToMIDI.mockReturnValue("TVRoZA==");
  });

  async function loadedRenderer(musicXml = "<score-partwise />"): Promise<VerovioScoreRenderer> {
    const renderer = await VerovioScoreRenderer.create();
    renderer.loadMusicXml(musicXml);
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

  it("mapeia números impressos a cada execução e conserva o silêncio final do compasso", async () => {
    toolkit.getMEI.mockReturnValue('<mei xmlns="http://www.music-encoding.org/ns/mei" xmlns:xml="http://www.w3.org/XML/1998/namespace"><measure xml:id="pickup" n="0"/><measure xml:id="main" n="1"/></mei>');
    toolkit.renderToExpansionMap.mockReturnValue({ main: ["main-a", "main-b"] });
    toolkit.renderToTimemap.mockReturnValue([
      { measureOn: "pickup", tstamp: 0 },
      { measureOff: "pickup", tstamp: 250 },
      { measureOn: "main-a", tstamp: 250 },
      { measureOff: "main-a", tstamp: 750 },
      { measureOn: "main-b", tstamp: 750 },
      { measureOff: "main-b", tstamp: 1_250 }
    ]);
    const renderer = await loadedRenderer();

    expect(renderer.getMeasureOccurrences()).toEqual([
      { id: "pickup", sourceId: "pickup", number: "0", occurrence: 1, occurrenceCount: 1, startMs: 0, endMs: 250 },
      { id: "main-a", sourceId: "main", number: "1", occurrence: 1, occurrenceCount: 2, startMs: 250, endMs: 750 },
      { id: "main-b", sourceId: "main", number: "1", occurrence: 2, occurrenceCount: 2, startMs: 750, endMs: 1_250 }
    ]);
    renderer.destroy();
  });

  it("não inventa o limite final quando o timemap não informa o fim do compasso", async () => {
    toolkit.getMEI.mockReturnValue('<mei><measure xml:id="m1" n="1"/></mei>');
    toolkit.renderToTimemap.mockReturnValue([{ measureOn: "m1", tstamp: 0 }, { off: ["last-note"], tstamp: 400 }]);
    const renderer = await loadedRenderer();

    expect(() => renderer.getMeasureOccurrences()).toThrowError(
      expect.objectContaining<Partial<VerovioRenderError>>({ code: "TIMELINE_FAILED" })
    );
    renderer.destroy();
  });

  it("usa a duração mais longa entre as partes, inclusive quando o limite contém apenas pausa", async () => {
    toolkit.getMEI.mockReturnValue('<mei xmlns:xml="http://www.w3.org/XML/1998/namespace"><measure xml:id="m1" n="1"/></mei>');
    toolkit.renderToTimemap.mockReturnValue([
      { measureOn: "m1", qstamp: 0, tempo: 120, tstamp: 0 },
      { off: ["final-event"], qstamp: 2, tstamp: 1_000 }
    ]);
    const renderer = await loadedRenderer(`<score-partwise>
      <part id="P1"><measure number="1"><attributes><divisions>2</divisions></attributes><note><rest/><duration>2</duration></note></measure></part>
      <part id="P2"><measure number="1"><attributes><divisions>4</divisions></attributes><note><rest/><duration>8</duration></note></measure></part>
    </score-partwise>`);

    expect(renderer.getMeasureOccurrences().map(({ startMs, endMs }) => ({ startMs, endMs }))).toEqual([
      { startMs: 0, endMs: 1_000 }
    ]);
    expect(renderer.getDurationMs()).toBe(1_000);
    renderer.destroy();
  });

  it("lê a mesma duração final no MusicXML organizado por compasso", async () => {
    toolkit.getMEI.mockReturnValue('<mei xmlns:xml="http://www.w3.org/XML/1998/namespace"><measure xml:id="m1" n="1"/></mei>');
    toolkit.renderToTimemap.mockReturnValue([
      { measureOn: "m1", qstamp: 0, tempo: 120, tstamp: 0 },
      { off: ["final-event"], qstamp: 2, tstamp: 1_000 }
    ]);
    const renderer = await loadedRenderer(`<score-timewise>
      <measure number="1">
        <part id="P1"><attributes><divisions>2</divisions></attributes><note><rest/><duration>2</duration></note></part>
        <part id="P2"><attributes><divisions>4</divisions></attributes><note><rest/><duration>8</duration></note></part>
      </measure>
    </score-timewise>`);

    expect(renderer.getMeasureOccurrences().at(-1)?.endMs).toBe(1_000);
    renderer.destroy();
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

  it("corrige a página temporal desatualizada usando a localização do compasso", async () => {
    toolkit.getElementsAtTime.mockReturnValue({ measure: "measure-page-2", notes: [], rests: ["rest-page-2"], page: 1 });
    toolkit.getPageWithElement.mockReturnValue(2);
    const renderer = await loadedRenderer();
    expect(renderer.getElementsAtTime(1500)).toMatchObject({ page: 2, measure: "measure-page-2", rests: ["rest-page-2"] });
    expect(renderer.getElementsAtTime(1600).page).toBe(2);
    expect(toolkit.getPageWithElement).toHaveBeenCalledOnce();
    expect(toolkit.getPageWithElement).toHaveBeenCalledWith("measure-page-2");
    renderer.destroy();
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
