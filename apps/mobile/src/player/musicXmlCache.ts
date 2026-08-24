import { Directory, File, Paths } from "expo-file-system";
import type { Score } from "../api/types";
import { safeCacheKey } from "../files/exportFilenames";
import { validatePlayerMusicXml } from "./bridge";
import { isPlayerMusicXmlCacheFresh } from "./musicXmlCachePolicy";

type CacheableScore = Pick<Score, "id" | "userId">;

/**
 * Keeps the source notation in the app's persistent storage. The file's
 * modification time doubles as its last-opened timestamp: every successful
 * cache read writes the same validated MusicXML back to renew the seven days.
 */
export async function loadCachedPlayerMusicXml(score: CacheableScore): Promise<string | null> {
  const file = fileFor(score);
  if (!file.exists) return null;

  if (!isPlayerMusicXmlCacheFresh(file.modificationTime)) {
    removeFile(file);
    return null;
  }

  try {
    const musicXml = await file.text();
    validatePlayerMusicXml(musicXml, file.size);
    // Refresh the expiry from this opening. If the touch fails, the valid
    // document is still safe to show and will naturally expire on schedule.
    try {
      file.write(musicXml);
    } catch {
      // Best-effort timestamp refresh.
    }
    return musicXml;
  } catch {
    removeFile(file);
    return null;
  }
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
  return new File(directoryFor(score), `${safeCacheKey(score.id)}.musicxml`);
}

function removeFile(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // A later open overwrites the entry; cleanup does not block the player.
  }
}
