export type PlayerPlaybackSnapshot = {
  state: "idle" | "playing" | "paused" | "stopped" | "ended";
  positionMs: number;
  durationMs: number;
  tempo: number;
};

export type PlayerReadingSnapshot = {
  page: number;
  scrollRatio: number;
  anchorMeasureId?: string;
  anchorViewportRatio?: number;
};

export type PlayerSessionSnapshot = {
  playback: PlayerPlaybackSnapshot;
  reading: PlayerReadingSnapshot;
};

export type PlayerSessionIdentity = {
  userId: string;
  scoreId: string;
  revision: string;
};

export function isPlayerSessionSnapshot(value: unknown): value is PlayerSessionSnapshot {
  if (!isRecord(value) || !hasOnlyKeys(value, ["playback", "reading"])) return false;
  const playback = value.playback;
  const reading = value.reading;
  if (!isRecord(playback) || !hasOnlyKeys(playback, ["state", "positionMs", "durationMs", "tempo"])) return false;
  if (!isRecord(reading) || !hasOnlyOptionalKeys(reading, ["page", "scrollRatio"], ["anchorMeasureId", "anchorViewportRatio"])) return false;
  if (
    !isPlaybackState(playback.state)
    || !isFiniteNumber(playback.positionMs, 0, 604_800_000)
    || !isFiniteNumber(playback.durationMs, 0, 604_800_000)
    || playback.positionMs > playback.durationMs + 1_000
    || !isFiniteNumber(playback.tempo, 20, 400)
    || !Number.isInteger(reading.page)
    || !isFiniteNumber(reading.page, 1, 10_000)
    || !isFiniteNumber(reading.scrollRatio, 0, 1)
  ) return false;
  if (reading.anchorMeasureId !== undefined && !isAnchorId(reading.anchorMeasureId)) return false;
  if (reading.anchorViewportRatio !== undefined && !isFiniteNumber(reading.anchorViewportRatio, -1, 1)) return false;
  return (reading.anchorMeasureId === undefined) === (reading.anchorViewportRatio === undefined);
}

function isPlaybackState(value: unknown): value is PlayerPlaybackSnapshot["state"] {
  return value === "idle" || value === "playing" || value === "paused" || value === "stopped" || value === "ended";
}

function isAnchorId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && !/[\u0000-\u001f\u007f]/.test(value);
}

function isFiniteNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).length === allowed.length && Object.keys(value).every((key) => allowed.includes(key));
}

function hasOnlyOptionalKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[]
): boolean {
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key)) && keys.every((key) => required.includes(key) || optional.includes(key));
}
