import type { Score } from "../api/types";

type CacheRevisionInput = Pick<Score, "musicxmlFilename" | "convertedAt" | "resultStatus" | "attempts" | "reviewRevision">;

export function musicXmlCacheRevision(score: CacheRevisionInput): string {
  const latestResult = score.attempts?.filter((attempt) =>
    (attempt.status === "complete" || attempt.status === "partial") && Boolean(attempt.musicxmlFilename)
  ).at(-1);
  const contentRevision = latestResult
    ? `attempt:${latestResult.id}:${latestResult.musicxmlFilename}`
    : `${score.resultStatus ?? "unverified"}:${score.musicxmlFilename ?? "no-file"}:${score.convertedAt ?? "unknown-date"}`;
  return score.reviewRevision ? `${contentRevision}:review:${score.reviewRevision}` : contentRevision;
}
