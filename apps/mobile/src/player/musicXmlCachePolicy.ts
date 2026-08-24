export const PLAYER_MUSICXML_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** A cache entry is reusable for seven days after the most recent opening. */
export function isPlayerMusicXmlCacheFresh(
  modificationTime: number | null,
  currentTime = Date.now()
): boolean {
  if (modificationTime === null || !Number.isFinite(modificationTime)) return false;
  return currentTime - modificationTime <= PLAYER_MUSICXML_CACHE_TTL_MS;
}
