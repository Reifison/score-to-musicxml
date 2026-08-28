import { describe, expect, it } from "vitest";
import {
  MAX_PLAYER_MUSICXML_BYTES,
  PLAYER_BRIDGE_CHANNEL,
  PLAYER_BRIDGE_VERSION,
  createPlayerCommandMessage,
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

  it("solicita uma sessão imersiva sem incluir credenciais", () => {
    const serialized = createScoreLoadMessage(
      "score-fullscreen",
      "<score-partwise />",
      "Estudo.musicxml",
      true
    );

    expect(JSON.parse(serialized)).toMatchObject({
      type: "score.load",
      payload: { immersive: true }
    });
    expect(serialized).not.toContain("Bearer");
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
    const viewport = parsePlayerToHostMessage(JSON.stringify({
      channel: PLAYER_BRIDGE_CHANNEL,
      version: PLAYER_BRIDGE_VERSION,
      type: "viewport.state",
      requestId: "score-1",
      payload: { immersive: true }
    }));

    expect(ready).toEqual(expect.objectContaining({ ok: true }));
    expect(status).toEqual(expect.objectContaining({ ok: true }));
    expect(playback).toEqual(expect.objectContaining({ ok: true }));
    expect(viewport).toEqual(expect.objectContaining({
      ok: true,
      message: expect.objectContaining({ type: "viewport.state", payload: { immersive: true } })
    }));
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
        type: "playback.state",
        requestId: "score-1",
        // Voice metadata stays inside the shared web player; bridge V1 remains stable.
        payload: { state: "playing", positionMs: 1200, durationMs: 5000, tempo: 120, voices: [] }
      },
      {
        channel: PLAYER_BRIDGE_CHANNEL,
        version: 1,
        type: "viewport.state",
        requestId: "score-1",
        payload: { immersive: "sim" }
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
});
