import type { PlaybackSnapshot } from "../audio/types.js";
import type { ScorePlayerState } from "../components/ScorePlayer.js";

export const PLAYER_BRIDGE_CHANNEL = "score-to-musicxml/player";
export const PLAYER_BRIDGE_VERSION = 1 as const;
export const PLAYER_WEBVIEW_PATH = "/mobile/player";
export const MAX_PLAYER_MUSICXML_BYTES = 12 * 1024 * 1024;

const MAX_HOST_MESSAGE_LENGTH = MAX_PLAYER_MUSICXML_BYTES + 2048;
const MAX_SCORE_NAME_LENGTH = 256;

export type PlayerHostCommand = "pause" | "stop" | "dispose";

export type HostToPlayerMessage =
  | {
      channel: typeof PLAYER_BRIDGE_CHANNEL;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: "score.load";
      requestId: string;
      payload: {
        musicXml: string;
        scoreName: string;
        immersive?: boolean;
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
      type: "viewport.state";
      requestId: string;
      payload: { immersive: boolean };
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
      || !hasOnlyKeys(value.payload, value.payload.immersive === undefined
        ? ["musicXml", "scoreName"]
        : ["musicXml", "scoreName", "immersive"])
      || typeof value.payload.musicXml !== "string"
      || typeof value.payload.scoreName !== "string"
      || (value.payload.immersive !== undefined && typeof value.payload.immersive !== "boolean")
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
          ...(value.payload.immersive === true ? { immersive: true } : {})
        }
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

export function isPlayerWebViewPath(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return normalized === PLAYER_WEBVIEW_PATH;
}

/** Release builds load this signed document from the app bundle, not the web route. */
export function isBundledPlayerWebViewLocation(location: Pick<Location, "pathname" | "protocol">): boolean {
  return location.protocol === "file:" && location.pathname.endsWith("/player/index.html");
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
