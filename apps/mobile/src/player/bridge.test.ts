import { describe, expect, it } from "vitest";
import {
  MAX_PLAYER_MUSICXML_BYTES,
  PLAYER_BRIDGE_CHANNEL,
  PLAYER_BRIDGE_VERSION,
  createPlayerCommandMessage,
  createPlayerFocusMessage,
  createPlayerLanguageMessage,
  createScoreLoadMessage,
  parsePlayerToHostMessage,
  validatePlayerMusicXml,
  validatePlayerMusicXmlSize
} from "./bridge";

describe("player bridge", () => {
  it("serializa MusicXML sem credencial ou dado fora do contrato", () => {
    const serialized = createScoreLoadMessage(
      "score-1",
      "<?xml version=\"1.0\"?><score-partwise />",
      "  Estudo.musicxml  "
    );

    expect(JSON.parse(serialized)).toEqual({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "score.load",
      requestId: "score-1",
      payload: {
        musicXml: "<?xml version=\"1.0\"?><score-partwise />",
        scoreName: "Estudo.musicxml"
      }
    });
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("Bearer");
  });

  it("marca a prévia parcial sem ativar controles de reprodução", () => {
    const message = JSON.parse(createScoreLoadMessage(
      "score-preview",
      "<score-partwise />",
      "Estudo parcial.musicxml",
      false
    ));

    expect(message.payload.allowPlayback).toBe(false);
    expect(createScoreLoadMessage("score-complete", "<score-partwise />", "Estudo.musicxml"))
      .not.toContain("allowPlayback");
  });

  it("inclui restauração somente quando a página anunciou essa extensão", () => {
    const restoreSnapshot = {
      playback: { state: "paused", positionMs: 1_200, durationMs: 5_000, tempo: 96 },
      reading: { page: 2, scrollRatio: 0.25, anchorMeasureId: "measure-7", anchorViewportRatio: 0.1 }
    } as const;
    const payload = JSON.parse(createScoreLoadMessage(
      "load-restore",
      "<score-partwise />",
      "Estudo.musicxml",
      true,
      restoreSnapshot
    )).payload;

    expect(payload.restoreSnapshot).toEqual(restoreSnapshot);
    expect(createScoreLoadMessage("load-legacy", "<score-partwise />", "Estudo.musicxml"))
      .not.toContain("restoreSnapshot");
    expect(() => createScoreLoadMessage("load-bad", "<score-partwise />", "Estudo.musicxml", true, {
      ...restoreSnapshot,
      token: "secret"
    } as never)).toThrow(/posição salva/);
  });

  it("envia o idioma inicial e atualiza os rótulos da sessão sem recarregar o MusicXML", () => {
    expect(JSON.parse(createScoreLoadMessage(
      "load-en",
      "<score-partwise />",
      "Study.musicxml",
      true,
      undefined,
      "en"
    ))).toEqual({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "score.load",
      requestId: "load-en",
      payload: { musicXml: "<score-partwise />", scoreName: "Study.musicxml", language: "en" }
    });
    expect(JSON.parse(createPlayerLanguageMessage("load-en", "pt"))).toEqual({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "player.language",
      requestId: "load-en",
      payload: { language: "pt" }
    });
    expect(() => createPlayerLanguageMessage("load-en", "es" as never)).toThrow(/idioma/);
    expect(() => createScoreLoadMessage("load-bad-en", " ", "Study.musicxml", true, undefined, "en"))
      .toThrow("This score's MusicXML is empty.");
  });

  it("limita os comandos enviados ao player", () => {
    expect(JSON.parse(createPlayerCommandMessage("command-1", "dispose"))).toEqual({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "player.command",
      requestId: "command-1",
      payload: { command: "dispose" }
    });
    expect(() => createPlayerCommandMessage("command-2", "play" as never)).toThrow(/comando/);
  });

  it("aceita somente mensagens de retorno conhecidas e bem formadas", () => {
    const ready = parsePlayerToHostMessage(JSON.stringify({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "bridge.ready",
      payload: { commands: ["pause", "stop", "dispose"] }
    }));
    const status = parsePlayerToHostMessage(JSON.stringify({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "score.status",
      requestId: "score-1",
      payload: { state: "ready" }
    }));
    const playback = parsePlayerToHostMessage(JSON.stringify({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "playback.state",
      requestId: "score-1",
      payload: { state: "playing", positionMs: 1200, durationMs: 5000, tempo: 120 }
    }));

    expect(ready).toEqual(expect.objectContaining({ ok: true }));
    expect(status).toEqual(expect.objectContaining({ ok: true }));
    expect(playback).toEqual(expect.objectContaining({ ok: true }));
    expect(parsePlayerToHostMessage(JSON.stringify({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "bridge.capabilities",
      payload: { capabilities: ["session.snapshot", "session.restore"] }
    }))).toEqual({
      ok: true,
      message: {
        channel: PLAYER_BRIDGE_CHANNEL,
        version: PLAYER_BRIDGE_VERSION,
        type: "bridge.capabilities",
        payload: { capabilities: ["session.snapshot", "session.restore"] }
      }
    });
    expect(parsePlayerToHostMessage(JSON.stringify({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "reading.state",
      requestId: "load-1",
      payload: { page: 4, scrollRatio: 0.3, anchorMeasureId: "measure-11", anchorViewportRatio: 0.2 }
    }))).toMatchObject({ ok: true, message: { type: "reading.state", requestId: "load-1" } });
  });

  it("rejeita canal, versão, tipo, campos extras e números suspeitos", () => {
    const messages = [
      { channel: "outro", version: 1, type: "bridge.ready", payload: { commands: ["pause"] } },
      { channel: PLAYER_BRIDGE_CHANNEL, version: 2, type: "bridge.ready", payload: { commands: ["pause"] } },
      { channel: PLAYER_BRIDGE_CHANNEL, version: 1, type: "token.read", payload: {} },
      { channel: PLAYER_BRIDGE_CHANNEL, version: 1, type: "bridge.ready", payload: { commands: ["pause"] }, token: "secreto" },
      {
        channel: PLAYER_BRIDGE_CHANNEL,
        version: 1,
        type: "playback.state",
        requestId: "score-1",
        payload: { state: "playing", positionMs: Number.NaN, durationMs: 5000, tempo: 120 }
      },
      {
        channel: PLAYER_BRIDGE_CHANNEL,
        version: 1,
        type: "reading.state",
        requestId: "load-1",
        payload: { page: 2, scrollRatio: 1.2 }
      },
      {
        channel: PLAYER_BRIDGE_CHANNEL,
        version: 1,
        type: "bridge.capabilities",
        payload: { capabilities: ["session.restore", "session.restore"] }
      }
    ];

    for (const message of messages) {
      expect(parsePlayerToHostMessage(JSON.stringify(message))).toEqual({ ok: false, reason: "invalid-message" });
    }
    expect(parsePlayerToHostMessage("não é JSON")).toEqual({ ok: false, reason: "invalid-json" });
  });

  it("rejeita mensagens de erro extensas e códigos não documentados", () => {
    const base = {
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "bridge.error"
    };
    expect(parsePlayerToHostMessage(JSON.stringify({
      ...base,
      payload: { code: "token-leaked", message: "erro" }
    }))).toEqual({ ok: false, reason: "invalid-message" });
    expect(parsePlayerToHostMessage(JSON.stringify({
      ...base,
      payload: { code: "invalid-message", message: "x".repeat(513) }
    }))).toEqual({ ok: false, reason: "invalid-message" });
  });
});

describe("validatePlayerMusicXml", () => {
  it("aceita partwise e timewise dentro do limite", () => {
    expect(() => validatePlayerMusicXml("<score-partwise />")).not.toThrow();
    expect(() => validatePlayerMusicXml("<score-timewise />")).not.toThrow();
  });

  it("rejeita vazio, conteúdo incorreto e arquivo acima de 12 MiB", () => {
    expect(() => validatePlayerMusicXml(" ")).toThrow(/vazio/);
    expect(() => validatePlayerMusicXml("<html />")).toThrow(/MusicXML válida/);
    expect(() => validatePlayerMusicXml("<score-partwise />", MAX_PLAYER_MUSICXML_BYTES + 1)).toThrow(/grande demais/);
    expect(() => validatePlayerMusicXmlSize(Number.NaN)).toThrow(/tamanho/);
  });
  it("sends review locations only with a bounded page or measure", () => {
    expect(JSON.parse(createPlayerFocusMessage("load-1", { id: "review-1", measure: "0" }))).toMatchObject({
      type: "score.focus", requestId: "load-1", payload: { target: { id: "review-1", measure: "0" } }
    });
    expect(() => createPlayerFocusMessage("load-1", { id: "review-1", page: -1 })).toThrow();
    expect(() => createPlayerFocusMessage("load-1", { id: "review-1" })).toThrow();
  });

});
