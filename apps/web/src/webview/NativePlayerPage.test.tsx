import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PLAYER_BRIDGE_CHANNEL,
  PLAYER_BRIDGE_VERSION,
  type PlayerToHostMessage
} from "./playerBridgeContract.js";
import { NativePlayerPage } from "./NativePlayerPage.js";

const scorePlayerSpy = vi.fn();
const scorePlayerMountSpy = vi.fn();
const scorePlayerUnmountSpy = vi.fn();

vi.mock("../components/ScorePlayer.js", () => ({
  ScorePlayer: (props: {
    musicXml: string;
    scoreName: string;
    language?: "pt" | "en";
    command?: { id: number; action: string };
    onStatusChange: (state: string) => void;
    onPlaybackChange?: (snapshot: { state: "paused"; positionMs: number; durationMs: number; tempo: number; rate: number; positionBeat: number; durationBeats: number }) => void;
    onReadingChange?: (snapshot: { page: number; scrollRatio: number; anchorMeasureId: string; anchorViewportRatio: number }) => void;
  }) => {
    scorePlayerSpy(props);
    useEffect(() => {
      scorePlayerMountSpy();
      props.onStatusChange("ready");
      props.onPlaybackChange?.({ state: "paused", positionMs: 2_400, durationMs: 9_000, tempo: 88, rate: 1, positionBeat: 4, durationBeats: 15 });
      props.onReadingChange?.({ page: 2, scrollRatio: 0.35, anchorMeasureId: "measure-8", anchorViewportRatio: 0.15 });
      return () => scorePlayerUnmountSpy();
    }, [props.onPlaybackChange, props.onReadingChange, props.onStatusChange]);
    return <div aria-label="Player reutilizado">{props.scoreName}</div>;
  }
}));

describe("NativePlayerPage", () => {
  const postMessage = vi.fn();

  beforeEach(() => {
    scorePlayerSpy.mockClear();
    scorePlayerMountSpy.mockClear();
    scorePlayerUnmountSpy.mockClear();
    postMessage.mockClear();
    Object.assign(window, { ReactNativeWebView: { postMessage } });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "ReactNativeWebView");
  });

  it("avisa que o contrato está pronto sem buscar partitura ou autenticação", () => {
    render(<NativePlayerPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Aguardando a partitura enviada pelo app");
    expect(messages(postMessage)[0]).toEqual({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "bridge.ready",
      payload: { commands: ["pause", "stop", "dispose"] }
    });
    expect(messages(postMessage)[1]).toEqual({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "bridge.capabilities",
      payload: { capabilities: ["session.snapshot", "session.restore"] }
    });
    expect(messages(postMessage)[2]).toEqual({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "bridge.capabilities",
      payload: { capabilities: ["session.snapshot", "session.restore", "score.focus"] }
    });
    expect(scorePlayerSpy).not.toHaveBeenCalled();
  });

  it("entrega o MusicXML recebido ao player existente e informa que está pronto", async () => {
    render(<NativePlayerPage />);

    dispatchHostMessage({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "score.load",
      requestId: "load-1",
      payload: {
        musicXml: "<score-partwise />",
        scoreName: "Estudo.musicxml"
      }
    });

    expect(await screen.findByRole("generic", { name: "Player reutilizado" })).toHaveTextContent("Estudo.musicxml");
    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      musicXml: "<score-partwise />",
      scoreName: "Estudo.musicxml",
      language: "pt"
    }));
    expect(messages(postMessage)).toContainEqual({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "score.status",
      requestId: "load-1",
      payload: { state: "ready" }
    });
  });

  it("altera o idioma em tempo real sem desmontar o player", async () => {
    render(<NativePlayerPage />);
    dispatchHostMessage({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "score.load",
      requestId: "load-en",
      payload: {
        musicXml: "<score-partwise />",
        scoreName: "Study.musicxml",
        language: "en"
      }
    });

    expect(await screen.findByLabelText("Player reutilizado")).toBeInTheDocument();
    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({ language: "en" }));
    expect(document.querySelector(".native-player-page")).toHaveAttribute("lang", "en-US");
    expect(scorePlayerMountSpy).toHaveBeenCalledOnce();

    dispatchHostMessage({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "player.language",
      requestId: "load-en",
      payload: { language: "pt" }
    });

    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({ language: "pt" }));
    expect(document.querySelector(".native-player-page")).toHaveAttribute("lang", "pt-BR");
    expect(scorePlayerMountSpy).toHaveBeenCalledOnce();
    expect(scorePlayerUnmountSpy).not.toHaveBeenCalled();
  });

  it("desativa reprodução somente quando a sessão parcial inclui a extensão", async () => {
    render(<NativePlayerPage />);
    dispatchHostMessage({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "score.load",
      requestId: "load-partial",
      payload: {
        musicXml: "<score-partwise />",
        scoreName: "Estudo parcial.musicxml",
        allowPlayback: false
      }
    });

    await screen.findByLabelText("Player reutilizado");
    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({ allowPlayback: false }));
    expect(messages(postMessage)[0]).toMatchObject({ type: "bridge.ready", payload: { commands: ["pause", "stop", "dispose"] } });
  });

  it("restaura a sessão aprovada, publica posição e leitura e mantém o mesmo player em rerenders", async () => {
    const view = render(<NativePlayerPage />);
    const restoreSnapshot = {
      playback: { state: "paused" as const, positionMs: 2_400, durationMs: 9_000, tempo: 88 },
      reading: { page: 2, scrollRatio: 0.35, anchorMeasureId: "measure-8", anchorViewportRatio: 0.15 }
    };
    dispatchHostMessage({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "score.load",
      requestId: "load-restore",
      payload: {
        musicXml: "<score-partwise />",
        scoreName: "Estudo.musicxml",
        restoreSnapshot
      }
    });

    expect(await screen.findByLabelText("Player reutilizado")).toBeInTheDocument();
    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({ initialSnapshot: restoreSnapshot }));
    expect(messages(postMessage)).toContainEqual(expect.objectContaining({
      type: "playback.state",
      requestId: "load-restore",
      payload: expect.objectContaining({ state: "paused", positionMs: 2_400, tempo: 88 })
    }));
    expect(messages(postMessage)).toContainEqual(expect.objectContaining({
      type: "reading.state",
      requestId: "load-restore",
      payload: restoreSnapshot.reading
    }));

    expect(scorePlayerMountSpy).toHaveBeenCalledOnce();
    view.rerender(<NativePlayerPage />);
    expect(scorePlayerMountSpy).toHaveBeenCalledOnce();
    expect(scorePlayerUnmountSpy).not.toHaveBeenCalled();
  });

  it("encaminha comandos limitados e desmonta o player ao descartar", async () => {
    render(<NativePlayerPage />);
    dispatchHostMessage({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "score.load",
      requestId: "load-2",
      payload: {
        musicXml: "<score-partwise />",
        scoreName: "Prelúdio.musicxml"
      }
    });
    expect(await screen.findByLabelText("Player reutilizado")).toBeInTheDocument();

    dispatchHostMessage({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "player.command",
      requestId: "pause-1",
      payload: { command: "pause" }
    });
    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      command: { id: 1, action: "pause" }
    }));

    dispatchHostMessage({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "player.command",
      requestId: "dispose-1",
      payload: { command: "dispose" }
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Aguardando a partitura");
    expect(messages(postMessage)).toContainEqual({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "score.status",
      requestId: "load-2",
      payload: { state: "disposed" }
    });
  });

  it("locates only within the current loaded score without remounting it", async () => {
    render(<NativePlayerPage />);
    dispatchHostMessage({ channel: PLAYER_BRIDGE_CHANNEL, version: PLAYER_BRIDGE_VERSION, type: "score.load", requestId: "load-1", payload: { musicXml: "<score-partwise />", scoreName: "Study" } });
    await screen.findByRole("generic", { name: "Player reutilizado" });
    const mounts = scorePlayerMountSpy.mock.calls.length;
    dispatchHostMessage({ channel: PLAYER_BRIDGE_CHANNEL, version: PLAYER_BRIDGE_VERSION, type: "score.focus", requestId: "old-score", payload: { target: { id: "target-old", measure: "2" } } });
    expect(scorePlayerSpy.mock.lastCall?.[0].readingTarget).toBeUndefined();
    dispatchHostMessage({ channel: PLAYER_BRIDGE_CHANNEL, version: PLAYER_BRIDGE_VERSION, type: "score.focus", requestId: "load-1", payload: { target: { id: "target-1", measure: "8" } } });
    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({ readingTarget: { id: "target-1", measure: "8" } }));
    expect(scorePlayerMountSpy.mock.calls.length).toBe(mounts);
  });

  it("recusa mensagens inválidas e comandos antes da partitura", () => {
    render(<NativePlayerPage />);

    act(() => window.dispatchEvent(new MessageEvent("message", { data: "não é JSON" })));
    dispatchHostMessage({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "player.command",
      requestId: "stop-before-load",
      payload: { command: "stop" }
    });

    expect(messages(postMessage)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "bridge.error",
        payload: expect.objectContaining({ code: "invalid-json" })
      }),
      expect.objectContaining({
        type: "bridge.error",
        requestId: "stop-before-load",
        payload: expect.objectContaining({ code: "score-not-loaded" })
      })
    ]));
  });
});

function dispatchHostMessage(message: object) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", {
      data: JSON.stringify(message)
    }));
  });
}

function messages(mock: ReturnType<typeof vi.fn>): PlayerToHostMessage[] {
  return mock.mock.calls.map(([message]) => JSON.parse(String(message)) as PlayerToHostMessage);
}
