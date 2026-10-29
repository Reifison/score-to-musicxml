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

  it("aceita apenas a extensão opcional booleana que desativa reprodução", () => {
    const envelope = {
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "score.load",
      requestId: "partial-score",
      payload: {
        musicXml: "<score-partwise />",
        scoreName: "Estudo parcial.musicxml",
        allowPlayback: false
      }
    };

    expect(parseHostToPlayerMessage(envelope)).toMatchObject({
      ok: true,
      message: { payload: { allowPlayback: false } }
    });
    expect(parseHostToPlayerMessage({
      ...envelope,
      payload: { ...envelope.payload, allowPlayback: "false" }
    }).ok).toBe(false);
    expect(parseHostToPlayerMessage({
      ...envelope,
      payload: { ...envelope.payload, token: "campo não permitido" }
    }).ok).toBe(false);
  });

  it("aceita o idioma opcional na carga e troca de idioma sem recarregar a partitura", () => {
    const load = {
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "score.load",
      requestId: "load-en",
      payload: { musicXml: "<score-partwise />", scoreName: "Study.musicxml", language: "en" }
    };
    expect(parseHostToPlayerMessage(load)).toMatchObject({
      ok: true,
      message: { payload: { language: "en" } }
    });
    expect(parseHostToPlayerMessage({
      ...load,
      payload: { ...load.payload, language: "es" }
    }).ok).toBe(false);

    expect(parseHostToPlayerMessage({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "player.language",
      requestId: "load-en",
      payload: { language: "pt" }
    })).toEqual({
      ok: true,
      message: {
        channel: PLAYER_BRIDGE_CHANNEL,
        version: PLAYER_BRIDGE_VERSION,
        type: "player.language",
        requestId: "load-en",
        payload: { language: "pt" }
      }
    });
    expect(parseHostToPlayerMessage({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "player.language",
      requestId: "load-en",
      payload: { language: "es" }
    }).ok).toBe(false);
  });

  it("aceita um snapshot de leitura somente na carga que foi negociada", () => {
    const restoreSnapshot = {
      playback: { state: "paused", positionMs: 2_400, durationMs: 9_000, tempo: 88 },
      reading: { page: 2, scrollRatio: 0.35, anchorMeasureId: "measure-8", anchorViewportRatio: 0.15 }
    };
    const envelope = {
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "score.load",
      requestId: "load-restore",
      payload: { musicXml: "<score-partwise />", scoreName: "Estudo.musicxml", restoreSnapshot }
    };

    expect(parseHostToPlayerMessage(envelope)).toMatchObject({
      ok: true,
      message: { payload: { restoreSnapshot } }
    });
    expect(parseHostToPlayerMessage({
      ...envelope,
      payload: { ...envelope.payload, restoreSnapshot: { ...restoreSnapshot, token: "secret" } }
    }).ok).toBe(false);
    expect(parseHostToPlayerMessage({
      ...envelope,
      payload: { ...envelope.payload, restoreSnapshot: { ...restoreSnapshot, reading: { page: 2, scrollRatio: 4 } } }
    }).ok).toBe(false);
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
  it("accepts bounded review locations and rejects injected or invalid targets", () => {
    const envelope = { channel: PLAYER_BRIDGE_CHANNEL, version: PLAYER_BRIDGE_VERSION, type: "score.focus", requestId: "load-1" };
    expect(parseHostToPlayerMessage({ ...envelope, payload: { target: { id: "review-1", page: 2, measure: "0" } } }).ok).toBe(true);
    for (const target of [{ id: "review-1" }, { id: "review-1", page: -1 }, { id: "review-1", measure: "" }, { id: "review-1", page: 1, token: "unexpected" }]) {
      expect(parseHostToPlayerMessage({ ...envelope, payload: { target } }).ok).toBe(false);
    }
  });

});
