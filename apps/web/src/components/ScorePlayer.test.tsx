import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Midi } from "@tonejs/midi";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMusicXml } from "../api/client.js";
import { createVerovioScoreRenderer } from "../score/index.js";
import { ScorePlayer } from "./ScorePlayer.js";

vi.mock("../api/client.js", () => ({ fetchMusicXml: vi.fn() }));
vi.mock("../score/index.js", () => ({ createVerovioScoreRenderer: vi.fn() }));

const svg = (page: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140"><g id="measure-${page}" class="measure"><g id="note-${page}" class="note"><path d="M0 0h10v10z" /></g></g></svg>`;

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
    getElementsAtTime: vi.fn(() => ({
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
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  });

  it("mostra carregamento enquanto MusicXML e motor são preparados", () => {
    vi.mocked(fetchMusicXml).mockReturnValue(new Promise(() => undefined));

    render(<ScorePlayer scoreId="score-1" scoreName="Estudo.musicxml" />);

    expect(screen.getByRole("status")).toHaveTextContent("Preparando a partitura digital");
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

  it("assume 70 BPM quando o MusicXML não informa andamento", async () => {
    const engine = renderer(1);
    vi.mocked(fetchMusicXml).mockResolvedValue('<score-partwise><part><measure number="1"><note/></measure></part></score-partwise>');
    vi.mocked(createVerovioScoreRenderer).mockResolvedValue(engine as never);

    render(<ScorePlayer scoreId="score-1" scoreName="Estudo.musicxml" />);

    expect(await screen.findByText("70 BPM · assumido")).toBeInTheDocument();
    expect(createVerovioScoreRenderer).toHaveBeenCalledWith(expect.stringContaining('<sound tempo="70"/>'));
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
