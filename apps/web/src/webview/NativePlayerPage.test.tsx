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

vi.mock("../components/ScorePlayer.js", () => ({
  ScorePlayer: (props: {
    musicXml: string;
    scoreName: string;
    command?: { id: number; action: string };
    onStatusChange: (state: string) => void;
  }) => {
    scorePlayerSpy(props);
    useEffect(() => props.onStatusChange("ready"), [props.onStatusChange]);
    return <div aria-label="Player reutilizado">{props.scoreName}</div>;
  }
}));

describe("NativePlayerPage", () => {
  const postMessage = vi.fn();

  beforeEach(() => {
    scorePlayerSpy.mockClear();
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
      scoreName: "Estudo.musicxml"
    }));
    expect(messages(postMessage)).toContainEqual({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "score.status",
      requestId: "load-1",
      payload: { state: "ready" }
    });
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
