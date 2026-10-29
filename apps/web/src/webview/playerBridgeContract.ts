import type { PlaybackSnapshot } from "../audio/types.js";
import type { ScorePlayerState } from "../components/ScorePlayer.js";
import type { PlayerLanguage } from "../i18n/player.js";

export const PLAYER_BRIDGE_CHANNEL = "score-to-musicxml/player";
export const PLAYER_BRIDGE_VERSION = 1 as const;
export const PLAYER_WEBVIEW_PATH = "/mobile/player";
export const MAX_PLAYER_MUSICXML_BYTES = 12 * 1024 * 1024;

const MAX_HOST_MESSAGE_LENGTH = MAX_PLAYER_MUSICXML_BYTES + 2048;
const MAX_SCORE_NAME_LENGTH = 256;

export type PlayerHostCommand = "pause" | "stop" | "dispose";
export type PlayerBridgeCapability = "session.snapshot" | "session.restore" | "score.focus";
export type PlayerReadingTarget = { id: string; page?: number; measure?: string };

export type PlayerSessionSnapshot = {
  playback: Pick<PlaybackSnapshot, "state" | "positionMs" | "durationMs" | "tempo">;
  reading: {
    page: number;
    scrollRatio: number;
    anchorMeasureId?: string;
    anchorViewportRatio?: number;
  };
};

export type HostToPlayerMessage =
  | {
      channel: typeof PLAYER_BRIDGE_CHANNEL;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: "score.focus";
      requestId: string;
      payload: { target: PlayerReadingTarget };
    }
  | {
      channel: typeof PLAYER_BRIDGE_CHANNEL;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: "score.load";
      requestId: string;
      payload: {
        musicXml: string;
        scoreName: string;
        allowPlayback?: boolean;
        restoreSnapshot?: PlayerSessionSnapshot;
        language?: PlayerLanguage;
      };
    }
  | {
      channel: typeof PLAYER_BRIDGE_CHANNEL;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: "player.command";
      requestId: string;
      payload: {
        command: PlayerHostCommand;
      };
    }
  | {
      channel: typeof PLAYER_BRIDGE_CHANNEL;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: "player.language";
      requestId: string;
      payload: { language: PlayerLanguage };
    };

export type PlayerToHostMessage =
  | {
      channel: typeof PLAYER_BRIDGE_CHANNEL;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: "bridge.ready";
      payload: {
        commands: PlayerHostCommand[];
      };
    }
  | {
      channel: typeof PLAYER_BRIDGE_CHANNEL;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: "bridge.capabilities";
      payload: { capabilities: PlayerBridgeCapability[] };
    }
  | {
      channel: typeof PLAYER_BRIDGE_CHANNEL;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: "score.status";
      requestId: string;
      payload: {
        state: ScorePlayerState | "disposed";
        message?: string;
      };
    }
  | {
      channel: typeof PLAYER_BRIDGE_CHANNEL;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: "playback.state";
      requestId: string;
      payload: Pick<PlaybackSnapshot, "state" | "positionMs" | "durationMs" | "tempo">;
    }
  | {
      channel: typeof PLAYER_BRIDGE_CHANNEL;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: "reading.state";
      requestId: string;
      payload: PlayerSessionSnapshot["reading"];
    }
  | {
      channel: typeof PLAYER_BRIDGE_CHANNEL;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: "bridge.error";
      requestId?: string;
      payload: {
        code: PlayerBridgeErrorCode;
        message: string;
      };
    };

export type PlayerBridgeErrorCode =
  | "invalid-json"
  | "invalid-message"
  | "unsupported-version"
  | "unsupported-type"
  | "score-not-loaded";

export type PlayerBridgeParseResult =
  | { ok: true; message: HostToPlayerMessage }
  | {
      ok: false;
      error: {
        code: Exclude<PlayerBridgeErrorCode, "score-not-loaded">;
        message: string;
        requestId?: string;
      };
    };

export function parseHostToPlayerMessage(raw: unknown): PlayerBridgeParseResult {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (!raw.length || raw.length > MAX_HOST_MESSAGE_LENGTH) {
      return failure("invalid-message", "A mensagem recebida excede o limite permitido.");
    }
    try {
      value = JSON.parse(raw);
    } catch {
      return failure("invalid-json", "A mensagem recebida não contém JSON válido.");
    }
  }

  if (!isRecord(value)) {
    return failure("invalid-message", "A mensagem recebida não é um objeto.");
  }

  const requestId = validRequestId(value.requestId) ? value.requestId : undefined;
  if (value.channel !== PLAYER_BRIDGE_CHANNEL) {
    return failure("invalid-message", "O canal da mensagem não é reconhecido.", requestId);
  }
  if (value.version !== PLAYER_BRIDGE_VERSION) {
    return failure("unsupported-version", "A versão do contrato não é compatível.", requestId);
  }
  if (!validRequestId(value.requestId)) {
    return failure("invalid-message", "A mensagem precisa de um identificador válido.");
  }

  if (value.type === "score.load") {
    if (
      !hasOnlyKeys(value, ["channel", "version", "type", "requestId", "payload"])
      || !isRecord(value.payload)
      || !hasOnlyRequiredAndOptionalKeys(value.payload, ["musicXml", "scoreName"], ["allowPlayback", "restoreSnapshot", "language"])
      || typeof value.payload.musicXml !== "string"
      || typeof value.payload.scoreName !== "string"
      || ("allowPlayback" in value.payload && typeof value.payload.allowPlayback !== "boolean")
      || ("restoreSnapshot" in value.payload && !isPlayerSessionSnapshot(value.payload.restoreSnapshot))
      || ("language" in value.payload && !isPlayerLanguage(value.payload.language))
      || !value.payload.scoreName.trim()
      || value.payload.scoreName.trim().length > MAX_SCORE_NAME_LENGTH
      || !isValidMusicXml(value.payload.musicXml)
    ) {
      return failure("invalid-message", "Os dados da partitura são inválidos.", value.requestId);
    }
    return {
      ok: true,
      message: {
        channel: PLAYER_BRIDGE_CHANNEL,
        version: PLAYER_BRIDGE_VERSION,
        type: "score.load",
        requestId: value.requestId,
        payload: {
          musicXml: value.payload.musicXml,
          scoreName: value.payload.scoreName.trim(),
          ...(typeof value.payload.allowPlayback === "boolean" ? { allowPlayback: value.payload.allowPlayback } : {}),
          ...(isPlayerSessionSnapshot(value.payload.restoreSnapshot) ? { restoreSnapshot: value.payload.restoreSnapshot } : {}),
          ...(isPlayerLanguage(value.payload.language) ? { language: value.payload.language } : {})
        }
      }
    };
  }

  if (value.type === "score.focus") {
    const target = isRecord(value.payload) ? value.payload.target : undefined;
    if (
      !hasOnlyKeys(value, ["channel", "version", "type", "requestId", "payload"])
      || !isRecord(value.payload) || !hasOnlyKeys(value.payload, ["target"])
      || !isRecord(target) || !hasOnlyRequiredAndOptionalKeys(target, ["id"], ["page", "measure"])
      || !validRequestId(target.id)
      || (target.page === undefined && target.measure === undefined)
      || (target.page !== undefined && (!Number.isInteger(target.page) || !validFiniteNumber(target.page, 1, 10_000)))
      || (target.measure !== undefined && (typeof target.measure !== "string" || !target.measure.trim() || target.measure.length > 128))
    ) return failure("invalid-message", "A localização da partitura é inválida.", requestId);
    return { ok: true, message: {
      channel: PLAYER_BRIDGE_CHANNEL, version: PLAYER_BRIDGE_VERSION, type: "score.focus",
      requestId: value.requestId, payload: { target: target as PlayerReadingTarget }
    } };
  }

  if (value.type === "player.language") {
    if (
      !hasOnlyKeys(value, ["channel", "version", "type", "requestId", "payload"])
      || !validRequestId(value.requestId)
      || !isRecord(value.payload)
      || !hasOnlyKeys(value.payload, ["language"])
      || !isPlayerLanguage(value.payload.language)
    ) {
      return failure("invalid-message", "O idioma do player é inválido.", requestId);
    }
    return {
      ok: true,
      message: {
        channel: PLAYER_BRIDGE_CHANNEL,
        version: PLAYER_BRIDGE_VERSION,
        type: "player.language",
        requestId: value.requestId,
        payload: { language: value.payload.language }
      }
    };
  }

  if (value.type === "player.command") {
    if (
      !hasOnlyKeys(value, ["channel", "version", "type", "requestId", "payload"])
      || !isRecord(value.payload)
      || !hasOnlyKeys(value.payload, ["command"])
      || !isPlayerHostCommand(value.payload.command)
    ) {
      return failure("invalid-message", "O comando do player é inválido.", value.requestId);
    }
    return {
      ok: true,
      message: {
        channel: PLAYER_BRIDGE_CHANNEL,
        version: PLAYER_BRIDGE_VERSION,
        type: "player.command",
        requestId: value.requestId,
        payload: { command: value.payload.command }
      }
    };
  }

  return failure("unsupported-type", "O tipo de mensagem não é reconhecido.", value.requestId);
}

export function serializePlayerToHostMessage(message: PlayerToHostMessage): string {
  return JSON.stringify(message);
}

function isPlayerSessionSnapshot(value: unknown): value is PlayerSessionSnapshot {
  if (!isRecord(value) || !hasOnlyKeys(value, ["playback", "reading"])) return false;
  const playback = value.playback;
  const reading = value.reading;
  if (!isRecord(playback) || !hasOnlyKeys(playback, ["state", "positionMs", "durationMs", "tempo"])) return false;
  if (!isRecord(reading) || !hasRequiredAndOptionalKeys(reading, ["page", "scrollRatio"], ["anchorMeasureId", "anchorViewportRatio"])) return false;
  if (
    !isPlaybackState(playback.state)
    || !validFiniteNumber(playback.positionMs, 0, 604_800_000)
    || !validFiniteNumber(playback.durationMs, 0, 604_800_000)
    || playback.positionMs > playback.durationMs + 1_000
    || !validFiniteNumber(playback.tempo, 20, 400)
    || !Number.isInteger(reading.page)
    || !validFiniteNumber(reading.page, 1, 10_000)
    || !validFiniteNumber(reading.scrollRatio, 0, 1)
  ) return false;
  if (reading.anchorMeasureId !== undefined && !validAnchorId(reading.anchorMeasureId)) return false;
  if (reading.anchorViewportRatio !== undefined && !validFiniteNumber(reading.anchorViewportRatio, -1, 1)) return false;
  return (reading.anchorMeasureId === undefined) === (reading.anchorViewportRatio === undefined);
}

function isPlaybackState(value: unknown): value is PlaybackSnapshot["state"] {
  return value === "idle" || value === "playing" || value === "paused" || value === "stopped" || value === "ended";
}

function isPlayerLanguage(value: unknown): value is PlayerLanguage {
  return value === "pt" || value === "en";
}

export function isPlayerWebViewPath(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return normalized === PLAYER_WEBVIEW_PATH;
}

function failure(
  code: Exclude<PlayerBridgeErrorCode, "score-not-loaded">,
  message: string,
  requestId?: string
): PlayerBridgeParseResult {
  return { ok: false, error: { code, message, requestId } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function hasRequiredAndOptionalKeys(value: Record<string, unknown>, required: string[], optional: string[]): boolean {
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key))
    && keys.every((key) => required.includes(key) || optional.includes(key));
}

function hasOnlyRequiredAndOptionalKeys(value: Record<string, unknown>, required: string[], optional: string[]): boolean {
  return hasRequiredAndOptionalKeys(value, required, optional);
}

function validFiniteNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validAnchorId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && !/[\u0000-\u001f\u007f]/.test(value);
}

function isValidMusicXml(value: string): boolean {
  if (!value.trim() || !/<score-(?:partwise|timewise)\b/i.test(value)) return false;
  return new TextEncoder().encode(value).byteLength <= MAX_PLAYER_MUSICXML_BYTES;
}

function validRequestId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function isPlayerHostCommand(value: unknown): value is PlayerHostCommand {
  return value === "pause" || value === "stop" || value === "dispose";
}
