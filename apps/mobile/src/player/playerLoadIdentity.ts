import { allowsScorePlayback, canDownloadMusicXml, canPreviewMusicXml } from "../api/scoreAvailability";
import type { Score } from "../api/types";
import { musicXmlCacheRevision } from "./musicXmlCacheRevision";

/** Stable identity for the player inputs that require loading the score again. */
export function playerLoadIdentity(score: Score): string {
  return JSON.stringify([
    score.id,
    score.userId,
    score.originalFilename,
    score.resultStatus ?? null,
    musicXmlCacheRevision(score),
    canPreviewMusicXml(score),
    canDownloadMusicXml(score),
    score.canPlay === true,
    allowsScorePlayback(score) === false ? "preview-only" : "playback"
  ]);
}
