import { isPlayerSessionSnapshot, type PlayerReadingSnapshot, type PlayerSessionSnapshot } from "./sessionSnapshotContract";
import { getLanguage, t } from "../i18n";

export const PLAYER_BRIDGE_CHANNEL = "score-to-musicxml/player";
export const PLAYER_BRIDGE_VERSION = 1 as const;
export const MAX_PLAYER_MUSICXML_BYTES = 12 * 1024 * 1024;
const MAX_INCOMING_MESSAGE_LENGTH = 16 * 1024;
const MAX_REQUEST_ID_LENGTH = 128;
const MAX_SCORE_NAME_LENGTH = 256;
const MAX_ERROR_MESSAGE_LENGTH = 512;

export type PlayerHostCommand = "pause" | "stop" | "dispose";
export type PlayerBridgeCapability = "session.snapshot" | "session.restore" | "score.focus";
export type PlayerReadingTarget = { id: string; page?: number; measure?: string };
export type PlayerLanguage = "pt" | "en";
export type PlayerScoreState = "loading" | "ready" | "empty" | "error" | "disposed";
export type PlayerPlaybackState = "idle" | "playing" | "paused" | "stopped" | "ended";
export type PlayerBridgeErrorCode =
  | "invalid-json"
  | "invalid-message"
  | "unsupported-version"
  | "unsupported-type"
  | "score-not-loaded";

export class PlayerMusicXmlError extends Error {
  constructor(
    public readonly code: "empty" | "too-large" | "invalid",
    message: string
  ) {
    super(message);
    this.name = "PlayerMusicXmlError";
  }
}

export type PlayerToHostMessage =
  | {
      channel: typeof PLAYER_BRIDGE_CHANNEL;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: "bridge.ready";
      payload: { commands: PlayerHostCommand[] };
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
      payload: { state: PlayerScoreState; message?: string };
    }
  | {
      channel: typeof PLAYER_BRIDGE_CHANNEL;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: "playback.state";
      requestId: string;
      payload: {
        state: PlayerPlaybackState;
        positionMs: number;
        durationMs: number;
        tempo: number;
      };
    }
  | {
      channel: typeof PLAYER_BRIDGE_CHANNEL;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: "reading.state";
      requestId: string;
      payload: PlayerReadingSnapshot;
    }
  | {
      channel: typeof PLAYER_BRIDGE_CHANNEL;
      version: typeof PLAYER_BRIDGE_VERSION;
      type: "bridge.error";
      requestId?: string;
      payload: { code: PlayerBridgeErrorCode; message: string };
    };

export type PlayerMessageParseResult =
  | { ok: true; message: PlayerToHostMessage }
  | { ok: false; reason: "invalid-json" | "invalid-message" };

export function createScoreLoadMessage(
  requestId: string,
  musicXml: string,
  scoreName: string,
  allowPlayback?: boolean,
  restoreSnapshot?: PlayerSessionSnapshot,
  language?: PlayerLanguage
): string {
  assertRequestId(requestId);
  const normalizedName = scoreName.trim();
  if (!normalizedName || normalizedName.length > MAX_SCORE_NAME_LENGTH) {
    throw new Error(localized("O nome da partitura não é válido para o player.", "The score name is invalid for the player.", language));
  }
  validatePlayerMusicXml(musicXml, undefined, language);
  if (restoreSnapshot !== undefined && !isPlayerSessionSnapshot(restoreSnapshot)) {
    throw new Error(localized("A posição salva do player não é válida.", "The saved player position is invalid.", language));
  }
  return JSON.stringify({
    channel: PLAYER_BRIDGE_CHANNEL,
    version: PLAYER_BRIDGE_VERSION,
    type: "score.load",
    requestId,
    payload: {
      musicXml,
      scoreName: normalizedName,
      ...(allowPlayback === false ? { allowPlayback: false } : {}),
      ...(restoreSnapshot ? { restoreSnapshot } : {}),
      ...(language ? { language } : {})
    }
  });
}

export function createPlayerLanguageMessage(requestId: string, language: PlayerLanguage): string {
  assertRequestId(requestId);
  if (!isPlayerLanguage(language)) throw new Error(t("O idioma do player não é válido.", "The player language is invalid."));
  return JSON.stringify({
    channel: PLAYER_BRIDGE_CHANNEL,
    version: PLAYER_BRIDGE_VERSION,
    type: "player.language",
    requestId,
    payload: { language }
  });
}

export function createPlayerFocusMessage(requestId: string, target: PlayerReadingTarget): string {
  assertRequestId(requestId);
  assertRequestId(target.id);
  if ((target.page === undefined && target.measure === undefined)
    || (target.page !== undefined && (!Number.isInteger(target.page) || target.page < 1 || target.page > 10_000))
    || (target.measure !== undefined && (!target.measure.trim() || target.measure.length > 128))) {
    throw new Error(t("A localização da partitura é inválida.", "The score location is invalid."));
  }
  return JSON.stringify({ channel: PLAYER_BRIDGE_CHANNEL, version: PLAYER_BRIDGE_VERSION,
    type: "score.focus", requestId, payload: { target } });
}

export function createPlayerCommandMessage(
  requestId: string,
  command: PlayerHostCommand
): string {
  assertRequestId(requestId);
  if (!isPlayerHostCommand(command)) throw new Error(t("O comando do player não é válido.", "The player command is invalid."));
  return JSON.stringify({
    channel: PLAYER_BRIDGE_CHANNEL,
    version: PLAYER_BRIDGE_VERSION,
    type: "player.command",
    requestId,
    payload: { command }
  });
}

export function parsePlayerToHostMessage(raw: unknown): PlayerMessageParseResult {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_INCOMING_MESSAGE_LENGTH) {
    return invalid("invalid-message");
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return invalid("invalid-json");
  }

  if (!isRecord(value) || value.channel !== PLAYER_BRIDGE_CHANNEL || value.version !== PLAYER_BRIDGE_VERSION) {
    return invalid("invalid-message");
  }

  if (value.type === "bridge.ready") {
    if (!hasOnlyKeys(value, ["channel", "version", "type", "payload"]) || !isRecord(value.payload)) {
      return invalid("invalid-message");
    }
    if (!hasOnlyKeys(value.payload, ["commands"]) || !validCommands(value.payload.commands)) {
      return invalid("invalid-message");
    }
    return {
      ok: true,
      message: {
        channel: PLAYER_BRIDGE_CHANNEL,
        version: PLAYER_BRIDGE_VERSION,
        type: "bridge.ready",
        payload: { commands: value.payload.commands }
      }
    };
  }

  if (value.type === "bridge.capabilities") {
    if (!hasOnlyKeys(value, ["channel", "version", "type", "payload"]) || !isRecord(value.payload)) {
      return invalid("invalid-message");
    }
    if (!hasExactKeys(value.payload, ["capabilities"]) || !validCapabilities(value.payload.capabilities)) {
      return invalid("invalid-message");
    }
    return {
      ok: true,
      message: {
        channel: PLAYER_BRIDGE_CHANNEL,
        version: PLAYER_BRIDGE_VERSION,
        type: "bridge.capabilities",
        payload: { capabilities: value.payload.capabilities }
      }
    };
  }

  if (value.type === "score.status") {
    if (!validEnvelopeWithRequest(value) || !isRecord(value.payload)) return invalid("invalid-message");
    if (!hasOnlyKeys(value.payload, ["state", "message"]) || !isPlayerScoreState(value.payload.state)) {
      return invalid("invalid-message");
    }
    if (value.payload.message !== undefined && !validSafeMessage(value.payload.message)) {
      return invalid("invalid-message");
    }
    return {
      ok: true,
      message: {
        channel: PLAYER_BRIDGE_CHANNEL,
        version: PLAYER_BRIDGE_VERSION,
        type: "score.status",
        requestId: value.requestId,
        payload: {
          state: value.payload.state,
          ...(value.payload.message ? { message: value.payload.message } : {})
        }
      }
    };
  }

  if (value.type === "playback.state") {
    if (!validEnvelopeWithRequest(value) || !isRecord(value.payload)) return invalid("invalid-message");
    if (
      !hasOnlyKeys(value.payload, ["state", "positionMs", "durationMs", "tempo"])
      || !isPlayerPlaybackState(value.payload.state)
      || !validFiniteNumber(value.payload.positionMs, 0, 604_800_000)
      || !validFiniteNumber(value.payload.durationMs, 0, 604_800_000)
      || !validFiniteNumber(value.payload.tempo, 1, 1000)
      || value.payload.positionMs > value.payload.durationMs + 1000
    ) {
      return invalid("invalid-message");
    }
    return {
      ok: true,
      message: {
        channel: PLAYER_BRIDGE_CHANNEL,
        version: PLAYER_BRIDGE_VERSION,
        type: "playback.state",
        requestId: value.requestId,
        payload: {
          state: value.payload.state,
          positionMs: value.payload.positionMs,
          durationMs: value.payload.durationMs,
          tempo: value.payload.tempo
        }
      }
    };
  }

  if (value.type === "reading.state") {
    if (!validEnvelopeWithRequest(value) || !isRecord(value.payload)) return invalid("invalid-message");
    if (
      !hasExactRequiredAndOptionalKeys(value.payload, ["page", "scrollRatio"], ["anchorMeasureId", "anchorViewportRatio"])
      || !Number.isInteger(value.payload.page)
      || !validFiniteNumber(value.payload.page, 1, 10_000)
      || !validFiniteNumber(value.payload.scrollRatio, 0, 1)
      || (value.payload.anchorMeasureId !== undefined && !validAnchorId(value.payload.anchorMeasureId))
      || (value.payload.anchorViewportRatio !== undefined && !validFiniteNumber(value.payload.anchorViewportRatio, -1, 1))
      || (value.payload.anchorMeasureId === undefined) !== (value.payload.anchorViewportRatio === undefined)
    ) return invalid("invalid-message");
    return {
      ok: true,
      message: {
        channel: PLAYER_BRIDGE_CHANNEL,
        version: PLAYER_BRIDGE_VERSION,
        type: "reading.state",
        requestId: value.requestId,
        payload: {
          page: value.payload.page,
          scrollRatio: value.payload.scrollRatio,
          ...(typeof value.payload.anchorMeasureId === "string" ? { anchorMeasureId: value.payload.anchorMeasureId } : {}),
          ...(typeof value.payload.anchorViewportRatio === "number" ? { anchorViewportRatio: value.payload.anchorViewportRatio } : {})
        }
      }
    };
  }

  if (value.type === "bridge.error") {
    if (!validOptionalRequestEnvelope(value) || !isRecord(value.payload)) return invalid("invalid-message");
    if (
      !hasOnlyKeys(value.payload, ["code", "message"])
      || !isPlayerBridgeErrorCode(value.payload.code)
      || !validSafeMessage(value.payload.message)
    ) {
      return invalid("invalid-message");
    }
    return {
      ok: true,
      message: {
        channel: PLAYER_BRIDGE_CHANNEL,
        version: PLAYER_BRIDGE_VERSION,
        type: "bridge.error",
        ...(value.requestId ? { requestId: value.requestId } : {}),
        payload: { code: value.payload.code, message: value.payload.message }
      }
    };
  }

  return invalid("invalid-message");
}

export function validatePlayerMusicXml(
  musicXml: string,
  knownBytes?: number | null,
  language: PlayerLanguage = getLanguage()
): void {
  if (typeof musicXml !== "string" || !musicXml.trim()) {
    throw new PlayerMusicXmlError("empty", localized("O MusicXML desta partitura está vazio.", "This score's MusicXML is empty.", language));
  }
  validatePlayerMusicXmlSize(knownBytes ?? utf8ByteLength(musicXml), language);
  if (!/<score-(?:partwise|timewise)\b/i.test(musicXml)) {
    throw new PlayerMusicXmlError("invalid", localized("O arquivo recebido não contém uma partitura MusicXML válida.", "The received file does not contain valid MusicXML.", language));
  }
}

export function validatePlayerMusicXmlSize(bytes: number, language: PlayerLanguage = getLanguage()): void {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new PlayerMusicXmlError("invalid", localized("O tamanho do MusicXML recebido é inválido.", "The received MusicXML size is invalid.", language));
  }
  if (bytes > MAX_PLAYER_MUSICXML_BYTES) {
    throw new PlayerMusicXmlError("too-large", localized("Esta partitura é grande demais para abrir no player do app.", "This score is too large to open in the app player.", language));
  }
}

function invalid(reason: "invalid-json" | "invalid-message"): PlayerMessageParseResult {
  return { ok: false, reason };
}

function validEnvelopeWithRequest(value: Record<string, unknown>): value is Record<string, unknown> & { requestId: string } {
  return hasOnlyKeys(value, ["channel", "version", "type", "requestId", "payload"])
    && validRequestId(value.requestId);
}

function validOptionalRequestEnvelope(value: Record<string, unknown>): value is Record<string, unknown> & { requestId?: string } {
  return hasOnlyKeys(value, ["channel", "version", "type", "requestId", "payload"])
    && (value.requestId === undefined || validRequestId(value.requestId));
}

function assertRequestId(value: string): void {
  if (!validRequestId(value)) throw new Error(t("O identificador da mensagem não é válido.", "The message identifier is invalid."));
}

function localized(portuguese: string, english: string, language?: PlayerLanguage): string {
  if (language === undefined) return t(portuguese, english);
  return language === "en" ? english : portuguese;
}

function validRequestId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_REQUEST_ID_LENGTH;
}

function validSafeMessage(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ERROR_MESSAGE_LENGTH;
}

function validCommands(value: unknown): value is PlayerHostCommand[] {
  return Array.isArray(value)
    && value.length > 0
    && value.length <= 3
    && value.every(isPlayerHostCommand)
    && new Set(value).size === value.length;
}

function validCapabilities(value: unknown): value is PlayerBridgeCapability[] {
  return Array.isArray(value)
    && value.length <= 3
    && value.every((capability) => capability === "session.snapshot" || capability === "session.restore" || capability === "score.focus")
    && new Set(value).size === value.length;
}

function validAnchorId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && !/[\u0000-\u001f\u007f]/.test(value);
}

function isPlayerHostCommand(value: unknown): value is PlayerHostCommand {
  return value === "pause" || value === "stop" || value === "dispose";
}

function isPlayerLanguage(value: unknown): value is PlayerLanguage {
  return value === "pt" || value === "en";
}

function isPlayerScoreState(value: unknown): value is PlayerScoreState {
  return value === "loading" || value === "ready" || value === "empty" || value === "error" || value === "disposed";
}

function isPlayerPlaybackState(value: unknown): value is PlayerPlaybackState {
  return value === "idle" || value === "playing" || value === "paused" || value === "stopped" || value === "ended";
}

function isPlayerBridgeErrorCode(value: unknown): value is PlayerBridgeErrorCode {
  return value === "invalid-json"
    || value === "invalid-message"
    || value === "unsupported-version"
    || value === "unsupported-type"
    || value === "score-not-loaded";
}

function validFiniteNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).length === allowed.length && hasOnlyKeys(value, allowed);
}

function hasExactRequiredAndOptionalKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[]
): boolean {
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key))
    && keys.every((key) => required.includes(key) || optional.includes(key));
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
    if (bytes > MAX_PLAYER_MUSICXML_BYTES) return bytes;
  }
  return bytes;
}
