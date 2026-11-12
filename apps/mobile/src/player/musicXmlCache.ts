import { Directory, File, Paths } from "expo-file-system";
import type { Score } from "../api/types";
import { safeCacheKey } from "../files/exportFilenames";
import { validatePlayerMusicXml } from "./bridge";

type CacheableScore = Pick<Score, "id" | "userId"> & { cacheRevision: string };

export function playerCacheIdentity(score: Score, sessionUserId = score.userId): CacheableScore {
  return {
    id: score.id,
    userId: sessionUserId,
    // A list response has no conversion attempts. The content revision must
    // therefore use fields shared by list and detail responses.
    cacheRevision: score.reviewRevision && /^[a-f0-9]{64}$/i.test(score.reviewRevision)
      ? `review-${score.reviewRevision}`
      : `result-${stableRevisionKey(JSON.stringify([score.musicxmlFilename ?? null, score.convertedAt ?? null, score.resultStatus ?? null]))}`
  };
}

/**
 * Prepared notation stays available offline until the app's data is removed.
 * A different content revision gets its own file and cannot replace this one.
 */
export async function loadCachedPlayerMusicXml(score: CacheableScore): Promise<string | null> {
  const file = fileFor(score);
  if (!file.exists) return null;

  try {
    const musicXml = await file.text();
    validatePlayerMusicXml(musicXml, file.size);
    return musicXml;
  } catch {
    return null;
  }
}

// The full fallback identity is hashed before it becomes a filename: the
// earlier truncation to 80 characters could hide a change near the end.
function stableRevisionKey(value: string): string {
  const seeds = [0x811c9dc5, 0x6d2b79f5, 0x1b873593, 0x85ebca6b];
  return seeds.map((seed) => {
    let hash = seed;
    for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 0x01000193);
    return (hash >>> 0).toString(16).padStart(8, "0");
  }).join("");
}

export function savePlayerMusicXmlToCache(score: CacheableScore, musicXml: string): void {
  validatePlayerMusicXml(musicXml);
  const directory = directoryFor(score);
  directory.create({ idempotent: true, intermediates: true });
  fileFor(score).write(musicXml);
}

function directoryFor(score: CacheableScore): Directory {
  return new Directory(Paths.document, "player-musicxml", safeCacheKey(score.userId));
}

function fileFor(score: CacheableScore): File {
  return new File(directoryFor(score), `${safeCacheKey(score.id)}-${safeCacheKey(score.cacheRevision)}.musicxml`);
}
