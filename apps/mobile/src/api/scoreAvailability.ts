import type { Score } from "./types";

export function canPreviewMusicXml(score: Score): boolean {
  return score.conversionStatus === "converted" && Boolean(score.musicxmlFilename);
}

export function canDownloadMusicXml(score: Score): boolean {
  if (!canPreviewMusicXml(score)) return false;
  return score.canDownloadMusicXml ?? true;
}

function hasTechnicalMidiPlaybackBlock(score: Score): boolean {
  return score.validation?.midiValidation?.status === "failed";
}

export function canPlayScore(score: Score): boolean {
  return canPreviewMusicXml(score) && !hasTechnicalMidiPlaybackBlock(score);
}

export function canExportScoreMidi(score: Score): boolean {
  return score.resultStatus === "complete" && score.canExportMidi === true;
}

export function allowsScorePlayback(score: Score): boolean | undefined {
  return canPlayScore(score) ? undefined : false;
}
