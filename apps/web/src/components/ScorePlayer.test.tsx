import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Midi } from "@tonejs/midi";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMusicXml } from "../api/client.js";
import { createVerovioScoreRenderer } from "../score/index.js";
import { ScorePlayer } from "./ScorePlayer.js";

vi.mock("../api/client.js", () => ({ fetchMusicXml: vi.fn() }));
vi.mock("../score/index.js", () => ({ createVerovioScoreRenderer: vi.fn() }));

const svg = (page: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140"><g id="measure-${page}" class="measure"><g id="note-${page}" class="note"><path d="M0 0h10v10z" /></g><g id="rest-${page}" class="rest"><path d="M20 0h10v10z" /></g></g></svg>`;
const twoMeasureSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140"><g id="measure-1" class="measure"><g id="note-1" class="note" /></g><g id="measure-2" class="measure"><g id="note-2" class="note" /></g></svg>';

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  disconnect = vi.fn();
  observe = vi.fn();

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  notify() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

class FakeAudioParam {
  value = 0;
  cancelScheduledValues = vi.fn();
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

class FakeAudioNode {
  connect = vi.fn(() => this);
  disconnect = vi.fn();
}

class FakeOscillator extends FakeAudioNode {
  frequency = new FakeAudioParam();
  type: OscillatorType = "sine";
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

class FakeGain extends FakeAudioNode {
  gain = new FakeAudioParam();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  currentTime = 0;
  state: AudioContextState = "suspended";
  destination = new FakeAudioNode();
  resume = vi.fn(async () => { this.state = "running"; });
  close = vi.fn(async () => { this.state = "closed"; });
  createOscillator = vi.fn(() => new FakeOscillator());
  createGain = vi.fn(() => new FakeGain());

  constructor() {
    FakeAudioContext.instances.push(this);
  }
}

function renderer(pageCount = 2) {
  const midi = new Midi();
  midi.header.setTempo(120);
  midi.addTrack().addNote({ midi: 60, time: 0, duration: 1 });
  return {
    pageCount,
    renderPage: vi.fn((page: number) => svg(page)),
    renderMidiBytes: vi.fn(() => midi.toArray()),
    getDurationMs: vi.fn(() => 1_000),
    getPageForElement: vi.fn((elementId: string) => Number(elementId.match(/(\d+)$/)?.[1] ?? 1)),
    getMeasureForElement: vi.fn((_elementId: string) => undefined as string | undefined),
    getMeasureOccurrences: vi.fn(() => [] as Array<{ id: string; sourceId: string; number: string; occurrence: number; occurrenceCount: number; startMs: number; endMs: number }>),
    getElementsAtTime: vi.fn((_positionMs: number) => ({
      notes: [] as string[],
      chords: [] as string[],
      rests: [] as string[],
      page: 1,
      measure: undefined as string | undefined
    })),
    destroy: vi.fn()
  };
}

describe("ScorePlayer", () => {
  beforeEach(() => {
    vi.mocked(fetchMusicXml).mockReset();
    vi.mocked(createVerovioScoreRenderer).mockReset();
    FakeAudioContext.instances = [];
    FakeResizeObserver.instances = [];
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  });

  it("mostra carregamento enquanto MusicXML e motor são preparados", () => {
    vi.mocked(fetchMusicXml).mockReturnValue(new Promise(() => undefined));

    render(<ScorePlayer scoreId="score-1" scoreName="Estudo.musicxml" />);

    expect(screen.getByRole("status")).toHaveTextContent("Preparando a partitura digital");
  });

  it("busca MusicXML em modo de prévia enquanto a revisão não foi aprovada", () => {
    vi.mocked(fetchMusicXml).mockReturnValue(new Promise(() => undefined));

    render(<ScorePlayer scoreId="score-review" scoreName="Estudo.musicxml" previewOnly />);

    expect(fetchMusicXml).toHaveBeenCalledWith("score-review", true);
  });

  it("mostra erro recuperável sem derrubar a interface", async () => {
    vi.mocked(fetchMusicXml).mockRejectedValue(new Error("MusicXML indisponível."));

    render(<ScorePlayer scoreId="score-1" scoreName="Estudo.musicxml" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("MusicXML indisponível.");
    expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeEnabled();
  });

  it("mostra um estado vazio sem iniciar o motor de partitura", async () => {
    vi.mocked(fetchMusicXml).mockResolvedValue("   ");

    render(<ScorePlayer scoreId="score-1" scoreName="Estudo.musicxml" />);

    expect(await screen.findByText("Partitura digital indisponível")).toBeInTheDocument();
    expect(createVerovioScoreRenderer).not.toHaveBeenCalled();
  });

  it("renderiza SVG responsivo e navega entre páginas", async () => {
    const engine = renderer(2);
    vi.mocked(fetchMusicXml).mockResolvedValue("<score-partwise />");
    vi.mocked(createVerovioScoreRenderer).mockResolvedValue(engine as never);

    const { container } = render(<ScorePlayer scoreId="score-1" scoreName="Estudo.musicxml" />);

    expect(await screen.findByText("Página 1 de 2")).toBeInTheDocument();
    expect(container.querySelector('svg[viewBox="0 0 100 140"]')).not.toBeNull();
    expect(container.querySelector("#note-1.note")).not.toBeNull();
    expect(container.querySelector(".score-player")).toHaveAttribute("tabindex", "0");
    expect(container.querySelector(".score-player")).toContainElement(container.querySelector(".score-sheet"));
    expect(container.querySelector(".score-player")).toContainElement(container.querySelector(".score-pagination"));
    expect(container.querySelector(".score-sheet")).not.toContainElement(container.querySelector(".score-pagination"));
    expect(screen.getByRole("region", { name: "Partitura rolável" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));

    expect(await screen.findByText("Página 2 de 2")).toBeInTheDocument();
    expect(container.querySelector("#note-2.note")).not.toBeNull();
    expect(engine.renderPage).toHaveBeenLastCalledWith(2);

    fireEvent.click(screen.getByRole("button", { name: "Página anterior" }));

    expect(await screen.findByText("Página 1 de 2")).toBeInTheDocument();
    expect(engine.renderPage).toHaveBeenCalledTimes(2);
  });

  it("troca o idioma dos controles e rótulos acessíveis sem recriar a partitura", async () => {
    const engine = renderer(2);
    vi.mocked(fetchMusicXml).mockResolvedValue("<score-partwise />");
    vi.mocked(createVerovioScoreRenderer).mockResolvedValue(engine as never);

    const view = render(<ScorePlayer scoreId="score-1" scoreName="Estudo.musicxml" language="en" />);

    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play score" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Scrollable score" })).toBeInTheDocument();
    expect(screen.getByText("Follow the highlighted notes and rests during playback.")).toBeInTheDocument();
    expect(view.container.querySelector('svg[aria-label="Digital score: Estudo.musicxml"]')).not.toBeNull();
    expect(screen.getByRole("slider", { name: "Tempo" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();
    const sheet = view.container.querySelector(".score-sheet") as HTMLDivElement;
    Object.defineProperty(sheet, "scrollHeight", { configurable: true, value: 1_000 });
    Object.defineProperty(sheet, "clientHeight", { configurable: true, value: 400 });
    sheet.scrollTop = 120;

    view.rerender(<ScorePlayer scoreId="score-1" scoreName="Estudo.musicxml" language="pt" />);

    expect(await screen.findByText("Página 2 de 2")).toBeInTheDocument();
    expect(sheet.scrollTop).toBe(120);
    expect(screen.getByRole("button", { name: "Reproduzir partitura" })).toBeInTheDocument();
    const scoreSvg = view.container.querySelector('svg[aria-label="Partitura digital: Estudo.musicxml"]');
    expect(scoreSvg).not.toBeNull();
    engine.getElementsAtTime.mockReturnValue({
      notes: [],
      chords: [],
      rests: [],
      page: 2,
      measure: undefined
    });
    fireEvent.click(screen.getByRole("button", { name: "Reproduzir partitura" }));
    expect(await screen.findByRole("button", { name: "Pausar partitura" })).toBeInTheDocument();
    FakeAudioContext.instances[0].currentTime = 0.6;
    await waitFor(() => expect(screen.getByRole("slider", { name: "Posição da reprodução" })).toHaveValue("600"));
    expect(view.container.querySelector('svg[aria-label="Partitura digital: Estudo.musicxml"]')).toBe(scoreSvg);
    expect(sheet.scrollTop).toBe(120);
    expect(createVerovioScoreRenderer).toHaveBeenCalledOnce();
    expect(engine.renderMidiBytes).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Pausar partitura" }));
    expect(await screen.findByRole("button", { name: "Continuar partitura" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Página anterior" }));
    expect(await screen.findByText("Página 1 de 2")).toBeInTheDocument();
    expect(view.container.querySelector('svg[aria-label="Partitura digital: Estudo.musicxml"]')).not.toBeNull();
  });

  it("renderiza MusicXML parcial sem importar MIDI, criar áudio ou mostrar controles", async () => {
    const engine = renderer(1);
    vi.mocked(fetchMusicXml).mockResolvedValue("<score-partwise />");
    vi.mocked(createVerovioScoreRenderer).mockResolvedValue(engine as never);

    const view = render(<ScorePlayer scoreId="partial-score" scoreName="Estudo parcial.musicxml" allowPlayback={false} />);

    expect(await screen.findByRole("region", { name: "Partitura rolável" })).toBeInTheDocument();
    expect(view.container.querySelector("svg")).not.toBeNull();
    expect(screen.getByText(/A reprodução não está disponível para este resultado/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reproduzir partitura/i })).not.toBeInTheDocument();
    expect(engine.renderMidiBytes).not.toHaveBeenCalled();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it("assume 70 BPM quando o MusicXML não informa andamento", async () => {
    const engine = renderer(1);
    vi.mocked(fetchMusicXml).mockResolvedValue('<score-partwise><part><measure number="1"><note/></measure></part></score-partwise>');
    vi.mocked(createVerovioScoreRenderer).mockResolvedValue(engine as never);

    render(<ScorePlayer scoreId="score-1" scoreName="Estudo.musicxml" />);

    expect(await screen.findByText("70 BPM · assumido")).toBeInTheDocument();
    expect(createVerovioScoreRenderer).toHaveBeenCalledWith(expect.stringContaining('<sound tempo="70"/>'));
  });

  it("clears measure selection when the score revision changes", async () => {
    const engine = renderer(2);
    engine.getMeasureOccurrences.mockReturnValue([
      { id: "measure-1", sourceId: "measure-1", number: "0", occurrence: 1, occurrenceCount: 1, startMs: 0, endMs: 500 },
      { id: "measure-2", sourceId: "measure-2", number: "1", occurrence: 1, occurrenceCount: 1, startMs: 500, endMs: 1_000 }
    ]);
    vi.mocked(createVerovioScoreRenderer).mockResolvedValue(engine as never);
    const view = render(<ScorePlayer musicXml="<score-partwise />" scoreName="Estudo.musicxml" scoreRevision="revision-a" />);

    const repeatButton = await screen.findByRole("button", { name: "Repetir trecho" });
    fireEvent.click(repeatButton);
    expect(screen.getByRole("combobox", { name: "Compasso inicial" })).toHaveValue("measure-1:0:0");
    expect(screen.getByRole("combobox", { name: "Compasso final" })).toHaveValue("measure-2:1:500");

    view.rerender(<ScorePlayer musicXml="<score-partwise />" scoreName="Estudo.musicxml" scoreRevision="revision-b" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Repetir trecho" })).toHaveAttribute("aria-pressed", "false"));
    expect(screen.queryByRole("combobox", { name: "Compasso inicial" })).not.toBeInTheDocument();
  });

  it("does not resume playback automatically after a score revision", async () => {
    const engine = renderer(2);
    engine.getMeasureOccurrences.mockReturnValue([
      { id: "measure-1", sourceId: "measure-1", number: "1", occurrence: 1, occurrenceCount: 1, startMs: 0, endMs: 500 },
      { id: "measure-2", sourceId: "measure-2", number: "2", occurrence: 1, occurrenceCount: 1, startMs: 500, endMs: 1_000 }
    ]);
    vi.mocked(createVerovioScoreRenderer).mockResolvedValue(engine as never);
    const view = render(<ScorePlayer musicXml="<score-partwise />" scoreName="Estudo.musicxml" scoreRevision="revision-a" />);

    fireEvent.click(await screen.findByRole("button", { name: "Repetir trecho" }));
    fireEvent.click(screen.getByRole("button", { name: "Reproduzir partitura" }));
    expect(await screen.findByRole("button", { name: "Pausar partitura" })).toBeInTheDocument();
    expect(FakeAudioContext.instances).toHaveLength(1);

    view.rerender(<ScorePlayer musicXml="<score-partwise />" scoreName="Estudo.musicxml" scoreRevision="revision-b" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Reproduzir partitura" })).toBeInTheDocument());
    await waitFor(() => expect(FakeAudioContext.instances[0].close).toHaveBeenCalledOnce());
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it("cancels a pending score load without activating audio after unmount", async () => {
    const engine = renderer(1);
    let resolveRenderer!: (value: unknown) => void;
    vi.mocked(fetchMusicXml).mockResolvedValue("<score-partwise />");
    vi.mocked(createVerovioScoreRenderer).mockReturnValue(new Promise((resolve) => { resolveRenderer = resolve; }) as never);
    const view = render(<ScorePlayer scoreId="late-score" scoreName="Estudo.musicxml" />);
    await waitFor(() => expect(createVerovioScoreRenderer).toHaveBeenCalledOnce());
    view.unmount();
    resolveRenderer(engine);

    await waitFor(() => expect(engine.destroy).toHaveBeenCalledOnce());
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it("opens a contextual review target on its measure and highlights it", async () => {
    const engine = renderer(2);
    engine.getMeasureForElement.mockReturnValue("measure-2");
    engine.getPageForElement.mockReturnValue(2);
    vi.mocked(createVerovioScoreRenderer).mockResolvedValue(engine as never);
    const view = render(
      <ScorePlayer
        musicXml="<score-partwise />"
        scoreName="Estudo.musicxml"
        readingTarget={{ id: "note-2", measure: "2" }}
      />
    );

    expect(await screen.findByText("Página 2 de 2")).toBeInTheDocument();
    expect(engine.getMeasureForElement).toHaveBeenCalledWith("note-2");
    await waitFor(() => expect(view.container.querySelector("#measure-2")).toHaveAttribute("aria-current", "true"));
  });

  it("descarta o toolkit quando o player sai da tela", async () => {
    const engine = renderer(1);
    vi.mocked(fetchMusicXml).mockResolvedValue("<score-partwise />");
    vi.mocked(createVerovioScoreRenderer).mockResolvedValue(engine as never);

    const view = render(<ScorePlayer scoreId="score-1" scoreName="Estudo.musicxml" />);
    await waitFor(() => expect(engine.renderPage).toHaveBeenCalledWith(1));
    view.unmount();

    expect(engine.destroy).toHaveBeenCalledOnce();
  });

  it("mantém a notação disponível quando a preparação MIDI falha", async () => {
    const engine = renderer(2);
    engine.renderMidiBytes.mockImplementation(() => { throw new Error("Andamento não sincronizado."); });
    vi.mocked(createVerovioScoreRenderer).mockResolvedValue(engine as never);
    render(<ScorePlayer musicXml="<score-partwise />" scoreName="Prévia.musicxml" previewOnly />);

    expect(await screen.findByRole("region", { name: "Partitura rolável" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Andamento não sincronizado.");
    expect(screen.getByRole("button", { name: "Reproduzir partitura" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(await screen.findByText("Página 2 de 2")).toBeInTheDocument();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it("acompanha página, notas e pausas ao tocar, pausar, avançar e reiniciar", async () => {
    const engine = renderer(2);
    engine.getElementsAtTime.mockImplementation((...args: unknown[]) => Number(args[0]) >= 500
      ? { notes: [], chords: [], rests: ["rest-2"], page: 2, measure: "measure-2" }
      : { notes: ["note-1"], chords: [], rests: [], page: 1, measure: "measure-1" });
    vi.mocked(createVerovioScoreRenderer).mockResolvedValue(engine as never);
    const view = render(<ScorePlayer musicXml='<score-partwise><sound tempo="120"/></score-partwise>' scoreName="Prévia.musicxml" previewOnly />);

    fireEvent.click(await screen.findByRole("button", { name: "Reproduzir partitura" }));
    await screen.findByRole("button", { name: "Pausar partitura" });
    expect(view.container.querySelector("#note-1")).toHaveClass("is-playing");
    expect(view.container.querySelector("#measure-1")).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Próxima página" })).toBeDisabled();

    FakeAudioContext.instances[0].currentTime = 0.6;
    await waitFor(() => expect(screen.getByText("Página 2 de 2")).toBeInTheDocument());
    expect(view.container.querySelector("#rest-2")).toHaveClass("is-playing");
    expect(view.container.querySelector("#measure-2")).toHaveClass("is-current-measure");

    fireEvent.click(screen.getByRole("button", { name: "Pausar partitura" }));
    await screen.findByRole("button", { name: "Continuar partitura" });
    fireEvent.change(screen.getByRole("slider", { name: "Posição da reprodução" }), { target: { value: "0" } });
    await waitFor(() => expect(view.container.querySelector("#note-1")).toHaveClass("is-playing"));
    fireEvent.click(screen.getByRole("button", { name: "Continuar partitura" }));
    await screen.findByRole("button", { name: "Pausar partitura" });
    fireEvent.click(screen.getByRole("button", { name: "Reiniciar partitura" }));
    await screen.findByRole("button", { name: "Reproduzir partitura" });
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
    expect(view.container.querySelector("#note-1")).toHaveClass("is-playing");
    view.unmount();
  });

  it("limpa a indicação visual quando a reprodução termina", async () => {
    const engine = renderer(1);
    engine.getElementsAtTime.mockReturnValue({ notes: ["note-1"], chords: [], rests: [], page: 1, measure: "measure-1" });
    vi.mocked(createVerovioScoreRenderer).mockResolvedValue(engine as never);
    const view = render(<ScorePlayer musicXml="<score-partwise />" scoreName="Prévia.musicxml" />);
    fireEvent.click(await screen.findByRole("button", { name: "Reproduzir partitura" }));
    await screen.findByRole("button", { name: "Pausar partitura" });
    expect(view.container.querySelector("#note-1")).toHaveClass("is-playing");
    FakeAudioContext.instances[0].currentTime = 2;
    await screen.findByRole("button", { name: "Reproduzir partitura" });
    expect(view.container.querySelector(".is-playing")).toBeNull();
    expect(view.container.querySelector("[aria-current]")).toBeNull();
    view.unmount();
  });

  it("reutiliza o player com MusicXML fornecido pela WebView e aceita parada externa", async () => {
    const engine = renderer(1);
    const onStatusChange = vi.fn();
    vi.mocked(createVerovioScoreRenderer).mockResolvedValue(engine as never);

    const view = render(
      <ScorePlayer
        musicXml={'<score-partwise><sound tempo="120" /></score-partwise>'}
        scoreName="Estudo.musicxml"
        onStatusChange={onStatusChange}
      />
    );

    const play = await screen.findByRole("button", { name: "Reproduzir partitura" });
    expect(fetchMusicXml).not.toHaveBeenCalled();
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith("ready", undefined));

    fireEvent.click(play);
    expect(await screen.findByRole("button", { name: "Pausar partitura" })).toBeInTheDocument();

    view.rerender(
      <ScorePlayer
        musicXml={'<score-partwise><sound tempo="120" /></score-partwise>'}
        scoreName="Estudo.musicxml"
        command={{ id: 1, action: "stop" }}
        onStatusChange={onStatusChange}
      />
    );

    expect(await screen.findByRole("button", { name: "Reproduzir partitura" })).toBeInTheDocument();
  });

  it("restaura andamento, posição e âncora de página sem iniciar áudio automaticamente", async () => {
    const engine = renderer(3);
    vi.mocked(createVerovioScoreRenderer).mockResolvedValue(engine as never);
    const onPlaybackChange = vi.fn();
    const onReadingChange = vi.fn();
    const initialSnapshot = {
      playback: { state: "playing" as const, positionMs: 650, durationMs: 1_000, tempo: 88 },
      reading: { page: 1, scrollRatio: 0.6, anchorMeasureId: "measure-2", anchorViewportRatio: 0.15 }
    };
    const view = render(
      <ScorePlayer
        musicXml={'<score-partwise><sound tempo="120" /></score-partwise>'}
        scoreName="Estudo.musicxml"
        initialSnapshot={initialSnapshot}
        onPlaybackChange={onPlaybackChange}
        onReadingChange={onReadingChange}
      />
    );

    expect(await screen.findByText("Página 2 de 3")).toBeInTheDocument();
    expect(engine.getPageForElement).toHaveBeenCalledWith("measure-2");
    expect(screen.getByRole("button", { name: "Continuar partitura" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Posição da reprodução" })).toHaveValue("650");
    expect(screen.getByText("88 BPM")).toBeInTheDocument();
    expect(FakeAudioContext.instances).toHaveLength(0);
    await waitFor(() => expect(onPlaybackChange).toHaveBeenCalledWith(expect.objectContaining({
      state: "paused",
      positionMs: 650,
      tempo: 88
    })));
    await waitFor(() => expect(onReadingChange).toHaveBeenCalledWith(expect.objectContaining({
      page: 2
    })));

    fireEvent.click(screen.getByRole("button", { name: "Continuar partitura" }));
    expect(await screen.findByRole("button", { name: "Pausar partitura" })).toBeInTheDocument();
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(createVerovioScoreRenderer).toHaveBeenCalledOnce();
    view.unmount();
  });

  it("preserva a âncora musical ao redimensionar pausado sem recarregar o score", async () => {
    const engine = renderer(1);
    engine.renderPage.mockReturnValue(twoMeasureSvg);
    vi.mocked(fetchMusicXml).mockResolvedValue("<score-partwise />");
    vi.mocked(createVerovioScoreRenderer).mockResolvedValue(engine as never);
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);

    const view = render(<ScorePlayer scoreId="resize-paused" scoreName="Estudo.musicxml" />);
    expect(await screen.findByRole("region", { name: "Partitura rolável" })).toBeInTheDocument();
    const sheet = view.container.querySelector<HTMLElement>(".score-sheet")!;
    const measure1 = view.container.querySelector<HTMLElement>("#measure-1")!;
    const measure2 = view.container.querySelector<HTMLElement>("#measure-2")!;
    let viewportHeight = 100;
    let viewportWidth = 400;
    let scrollTop = 100;
    Object.defineProperties(sheet, {
      clientHeight: { configurable: true, get: () => viewportHeight },
      clientWidth: { configurable: true, get: () => viewportWidth },
      scrollHeight: { configurable: true, get: () => 600 },
      scrollTop: { configurable: true, get: () => scrollTop, set: (value: number) => { scrollTop = value; } }
    });
    vi.spyOn(sheet, "getBoundingClientRect").mockImplementation(() => ({ top: 10, width: viewportWidth, height: viewportHeight } as DOMRect));
    vi.spyOn(measure1, "getBoundingClientRect").mockImplementation(() => {
      const top = 10 + 30 - scrollTop;
      return { top, bottom: top + 20, height: 20 } as DOMRect;
    });
    vi.spyOn(measure2, "getBoundingClientRect").mockImplementation(() => {
      const top = 10 + 130 - scrollTop;
      return { top, bottom: top + 20, height: 20 } as DOMRect;
    });
    fireEvent.scroll(sheet);
    const observer = FakeResizeObserver.instances.at(-1)!;

    observer.notify();
    expect(scrollTop).toBe(100);
    observer.notify();
    expect(scrollTop).toBe(100);

    viewportHeight = 200;
    observer.notify();

    expect(scrollTop).toBe(70);
    expect(fetchMusicXml).toHaveBeenCalledOnce();
    expect(createVerovioScoreRenderer).toHaveBeenCalledOnce();
    expect(engine.renderPage).toHaveBeenCalledOnce();
    view.unmount();
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });

  it("acompanha o relógio de reprodução ao redimensionar, sem restaurar uma âncora antiga", async () => {
    const engine = renderer(1);
    engine.renderPage.mockReturnValue(twoMeasureSvg);
    engine.getElementsAtTime.mockImplementation((...args: unknown[]) => ({
      notes: [],
      chords: [],
      rests: [],
      page: 1,
      measure: Number(args[0]) >= 500 ? "measure-2" : "measure-1"
    }));
    vi.mocked(fetchMusicXml).mockResolvedValue("<score-partwise><sound tempo=\"120\" /></score-partwise>");
    vi.mocked(createVerovioScoreRenderer).mockResolvedValue(engine as never);
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);

    const view = render(<ScorePlayer scoreId="resize-playing" scoreName="Estudo.musicxml" />);
    const sheet = await screen.findByRole("region", { name: "Partitura rolável" }) as HTMLDivElement;
    const measure1 = view.container.querySelector<HTMLElement>("#measure-1")!;
    const measure2 = view.container.querySelector<HTMLElement>("#measure-2")!;
    let viewportHeight = 100;
    const viewportWidth = 400;
    let scrollTop = 20;
    Object.defineProperties(sheet, {
      clientHeight: { configurable: true, get: () => viewportHeight },
      clientWidth: { configurable: true, get: () => viewportWidth },
      scrollHeight: { configurable: true, get: () => 600 },
      scrollTop: { configurable: true, get: () => scrollTop, set: (value: number) => { scrollTop = value; } }
    });
    vi.spyOn(sheet, "getBoundingClientRect").mockImplementation(() => ({ top: 10, width: viewportWidth, height: viewportHeight } as DOMRect));
    vi.spyOn(measure1, "getBoundingClientRect").mockImplementation(() => {
      const top = 10 + 30 - scrollTop;
      return { top, bottom: top + 20, height: 20 } as DOMRect;
    });
    vi.spyOn(measure2, "getBoundingClientRect").mockImplementation(() => {
      const top = 10 + 130 - scrollTop;
      return { top, bottom: top + 20, height: 20 } as DOMRect;
    });
    const scrollTo = vi.fn();
    Object.defineProperty(sheet, "scrollTo", { configurable: true, value: scrollTo });
    fireEvent.scroll(sheet);
    await waitFor(() => expect(FakeResizeObserver.instances.length).toBeGreaterThan(0));
    const observer = FakeResizeObserver.instances.at(-1)!;
    observer.notify();

    fireEvent.click(screen.getByRole("button", { name: "Reproduzir partitura" }));
    expect(await screen.findByRole("button", { name: "Pausar partitura" })).toBeInTheDocument();
    scrollTo.mockClear();
    FakeAudioContext.instances[0].currentTime = 0.6;
    viewportHeight = 200;
    observer.notify();

    const clockReads = engine.getElementsAtTime.mock.calls.map(([position]) => Number(position));
    expect(clockReads.at(-1)).toBeGreaterThanOrEqual(500);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
    expect(view.container.querySelector("#measure-2")).toHaveClass("is-current-measure");
    expect(fetchMusicXml).toHaveBeenCalledOnce();
    expect(createVerovioScoreRenderer).toHaveBeenCalledOnce();
    view.unmount();
  });

  it("só inicia o áudio após o comando do usuário e destaca a nota ativa", async () => {
    const engine = renderer(1);
    vi.mocked(fetchMusicXml).mockResolvedValue("<score-partwise><sound tempo=\"120\" /></score-partwise>");
    vi.mocked(createVerovioScoreRenderer).mockResolvedValue(engine as never);

    const view = render(<ScorePlayer scoreId="score-1" scoreName="Estudo.musicxml" />);
    const play = await screen.findByRole("button", { name: "Reproduzir partitura" });
    const sheet = view.container.querySelector<HTMLElement>(".score-sheet");
    const measure = view.container.querySelector<HTMLElement>("#measure-1");
    expect(sheet).not.toBeNull();
    expect(measure).not.toBeNull();
    Object.defineProperty(sheet, "clientHeight", { configurable: true, value: 300 });
    Object.defineProperty(sheet, "scrollTop", { configurable: true, value: 20, writable: true });
    vi.spyOn(sheet!, "getBoundingClientRect").mockReturnValue({ top: 100, height: 300 } as DOMRect);
    vi.spyOn(measure!, "getBoundingClientRect").mockReturnValue({ top: 500, height: 40 } as DOMRect);
    const scrollTo = vi.fn();
    const scrollIntoView = vi.fn();
    const windowScrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    Object.defineProperty(sheet, "scrollTo", { configurable: true, value: scrollTo });
    Object.defineProperty(measure, "scrollIntoView", { configurable: true, value: scrollIntoView });
    engine.getElementsAtTime.mockReturnValue({ notes: ["note-1"], chords: [], rests: [], page: 1, measure: "measure-1" });

    expect(FakeAudioContext.instances).toHaveLength(0);
    fireEvent.click(play);

    expect(await screen.findByRole("button", { name: "Pausar partitura" })).toBeInTheDocument();
    await waitFor(() => expect(view.container.querySelector("#note-1")).toHaveClass("is-playing"));
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 290, behavior: "auto" }));
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(windowScrollTo).not.toHaveBeenCalled();
    expect(FakeAudioContext.instances).toHaveLength(1);

    view.unmount();
    await waitFor(() => expect(FakeAudioContext.instances[0].close).toHaveBeenCalledOnce());
  });

  it("desativa movimento suave no autoacompanhamento quando o sistema pede menos movimento", async () => {
    const engine = renderer(1);
    vi.mocked(fetchMusicXml).mockResolvedValue("<score-partwise />");
    vi.mocked(createVerovioScoreRenderer).mockResolvedValue(engine as never);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));

    const view = render(<ScorePlayer scoreId="score-1" scoreName="Estudo.musicxml" />);
    const play = await screen.findByRole("button", { name: "Reproduzir partitura" });
    const sheet = view.container.querySelector<HTMLElement>(".score-sheet")!;
    const measure = view.container.querySelector<HTMLElement>("#measure-1")!;
    Object.defineProperty(sheet, "clientHeight", { configurable: true, value: 300 });
    Object.defineProperty(sheet, "scrollTop", { configurable: true, value: 0, writable: true });
    vi.spyOn(sheet, "getBoundingClientRect").mockReturnValue({ top: 0, height: 300 } as DOMRect);
    vi.spyOn(measure, "getBoundingClientRect").mockReturnValue({ top: 340, height: 40 } as DOMRect);
    const scrollTo = vi.fn();
    Object.defineProperty(sheet, "scrollTo", { configurable: true, value: scrollTo });
    engine.getElementsAtTime.mockReturnValue({ notes: ["note-1"], chords: [], rests: [], page: 1, measure: "measure-1" });

    fireEvent.click(play);

    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 210, behavior: "auto" }));
  });
});
