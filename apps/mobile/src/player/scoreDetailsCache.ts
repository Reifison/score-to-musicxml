import { Directory, File, Paths } from "expo-file-system";
import type { Score } from "../api/types";
import { safeCacheKey } from "../files/exportFilenames";

type StoredScoreDetails = { sessionUserId: string; score: Score };

/** The viewer needs fields such as attempts that are absent from the list. */
export async function readCachedScoreDetails(sessionUserId: string, scoreId: string): Promise<Score | undefined> {
  try {
    const file = detailsFile(sessionUserId, scoreId);
    if (!file.exists) return undefined;
    const stored = JSON.parse(await file.text()) as Partial<StoredScoreDetails>;
    if (stored.sessionUserId !== sessionUserId || stored.score?.id !== scoreId || typeof stored.score.userId !== "string") return undefined;
    return stored.score;
  } catch {
    return undefined;
  }
}

export function saveCachedScoreDetails(sessionUserId: string, score: Score): void {
  const directory = detailsDirectory(sessionUserId);
  directory.create({ idempotent: true, intermediates: true });
  detailsFile(sessionUserId, score.id).write(JSON.stringify({ sessionUserId, score } satisfies StoredScoreDetails));
}

function detailsDirectory(sessionUserId: string): Directory {
  return new Directory(Paths.document, "offline-score-details", safeCacheKey(sessionUserId));
}

function detailsFile(sessionUserId: string, scoreId: string): File {
  return new File(detailsDirectory(sessionUserId), `${safeCacheKey(scoreId)}.json`);
}
