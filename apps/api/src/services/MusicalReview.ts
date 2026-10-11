import { createHash } from "node:crypto";
import type { Score } from "../domain.js";

export function reviewRevision(filename: string, xml: string): string {
  // Include the immutable export identity: identical XML from a later attempt still needs a new review.
  return createHash("sha256").update(filename).update("\0").update(xml).digest("hex");
}

export function scoreAvailability(score: Score) {
  const approved = score.reviewStatus === "approved";
  const exportReady = approved && score.resultStatus === "complete" && Boolean(score.scoreTypeSelected && score.coverage && score.musicxmlFilename);
  const midiValidation = score.validation?.midiValidation;
  const midiIssueCodes = [
    ...(midiValidation?.issues ?? []),
    ...(score.validation?.issues ?? [])
  ];
  const unsafeMidi = midiValidation?.status === "failed"
    || midiIssueCodes.some((issue) => ["MIDI_EVENTS_UNVERIFIED", "MIDI_PREFLIGHT_UNAVAILABLE"].includes(issue.code));
  // An unavailable export check is not a generation failure. The browser
  // prepares playback independently from the converted MusicXML.
  const canPlay = score.conversionStatus === "converted"
    && Boolean(score.musicxmlFilename) && midiValidation?.status !== "failed";
  return {
    reviewStatus: score.reviewStatus ?? "unverified",
    canPlay,
    canExportMidi: exportReady && !unsafeMidi,
    // Legacy XML remains retrievable with its explicit unverified status.
    canDownloadMusicXml: Boolean(score.musicxmlFilename && (approved || !score.reviewRevision))
  };
}
