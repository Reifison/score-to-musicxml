import { describe, expect, it } from "vitest";
import {
  PLAYER_BRIDGE_CHANNEL,
  PLAYER_BRIDGE_VERSION,
  MAX_PLAYER_MUSICXML_BYTES,
  isPlayerWebViewPath,
  parseHostToPlayerMessage,
  serializePlayerToHostMessage
} from "./playerBridgeContract.js";

describe("playerBridgeContract", () => {
  it("aceita uma partitura somente no canal e versão esperados", () => {
    const result = parseHostToPlayerMessage(JSON.stringify({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "score.load",
      requestId: "load-1",
      payload: {
        musicXml: "<score-partwise />",
        scoreName: "  Estudo.musicxml  "
      }
    }));

    expect(result).toEqual({
      ok: true,
      message: {
        channel: PLAYER_BRIDGE_CHANNEL,
        version: PLAYER_BRIDGE_VERSION,
        type: "score.load",
        requestId: "load-1",
        payload: {
          musicXml: "<score-partwise />",
          scoreName: "Estudo.musicxml"
        }
      }
    });
  });

  it.each([
    ["pause"],
    ["stop"],
    ["dispose"]
  ])("aceita o comando %s", (command) => {
    const result = parseHostToPlayerMessage({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "player.command",
      requestId: `command-${command}`,
      payload: { command }
    });

    expect(result.ok).toBe(true);
  });

  it("recusa JSON, canal, versão e tipos desconhecidos sem refletir o conteúdo recebido", () => {
    expect(parseHostToPlayerMessage("{token-secreto")).toMatchObject({
      ok: false,
      error: { code: "invalid-json" }
    });
    expect(parseHostToPlayerMessage({
      channel: "outro-canal",
      version: PLAYER_BRIDGE_VERSION,
      type: "score.load",
      requestId: "bad-channel",
      payload: {}
    })).toMatchObject({
      ok: false,
      error: { code: "invalid-message", requestId: "bad-channel" }
    });
    expect(parseHostToPlayerMessage({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: 2,
      type: "score.load",
      requestId: "bad-version",
      payload: {}
    })).toMatchObject({
      ok: false,
      error: { code: "unsupported-version", requestId: "bad-version" }
    });
    expect(parseHostToPlayerMessage({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "token.set",
      requestId: "bad-type",
      payload: { token: "token-secreto" }
    })).toEqual({
      ok: false,
      error: {
        code: "unsupported-type",
        message: "O tipo de mensagem não é reconhecido.",
        requestId: "bad-type"
      }
    });
  });

  it("recusa XML acima do limite e campos não previstos nas duas mensagens aceitas", () => {
    const envelope = {
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "score.load",
      requestId: "load-limited",
      payload: {
        musicXml: "<score-partwise />",
        scoreName: "Estudo.musicxml"
      }
    };

    expect(parseHostToPlayerMessage({ ...envelope, token: "não-deve-ser-aceito" }).ok).toBe(false);
    expect(parseHostToPlayerMessage({
      ...envelope,
      payload: { ...envelope.payload, token: "não-deve-ser-aceito" }
    }).ok).toBe(false);
    expect(parseHostToPlayerMessage({
      ...envelope,
      payload: {
        ...envelope.payload,
        musicXml: `<score-partwise>${"a".repeat(MAX_PLAYER_MUSICXML_BYTES)}</score-partwise>`
      }
    }).ok).toBe(false);
    expect(parseHostToPlayerMessage({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "player.command",
      requestId: "command-extra",
      payload: { command: "pause", token: "não-deve-ser-aceito" }
    }).ok).toBe(false);
  });

  it("serializa respostas e reconhece apenas a rota dedicada", () => {
    const serialized = serializePlayerToHostMessage({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "bridge.ready",
      payload: { commands: ["pause", "stop", "dispose"] }
    });

    expect(JSON.parse(serialized)).toMatchObject({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: 1,
      type: "bridge.ready"
    });
    expect(isPlayerWebViewPath("/mobile/player")).toBe(true);
    expect(isPlayerWebViewPath("/mobile/player/")).toBe(true);
    expect(isPlayerWebViewPath("/")).toBe(false);
    expect(isPlayerWebViewPath("/scores/mobile/player")).toBe(false);
  });
});
