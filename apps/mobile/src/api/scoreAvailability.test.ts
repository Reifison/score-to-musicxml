import { describe, expect, it } from "vitest";
import type { Score } from "./types";
import { allowsScorePlayback, canDownloadMusicXml, canExportScoreMidi, canPlayScore, canPreviewMusicXml } from "./scoreAvailability";

const baseScore: Score = {
  id: "score-1",
  userId: "user-1",
  originalFilename: "partitura.pdf",
  storedFilename: "stored.pdf",
  fileType: "pdf",
  mimeType: "application/pdf",
  fileSize: 100,
  uploadStatus: "converted",
  conversionStatus: "converted",
  errorMessage: null,
  warnings: null,
  confidence: null,
  musicxmlFilename: "partitura.musicxml",
  scoreType: "piano",
  scoreTypeSelected: true,
  isFavorite: false,
  createdAt: "2026-10-06T00:00:00.000Z",
  updatedAt: "2026-10-06T00:00:00.000Z",
  convertedAt: "2026-10-06T00:00:00.000Z"
};

describe("API-derived score availability", () => {
  it("honors a server download block while allowing playback for an old needs_review result", () => {
    const pending = { ...baseScore, resultStatus: "complete" as const, reviewStatus: "needs_review" as const, canDownloadMusicXml: false, canPlay: false, canExportMidi: false };

    expect(canPreviewMusicXml(pending)).toBe(true);
    expect(canDownloadMusicXml(pending)).toBe(false);
    expect(canPlayScore(pending)).toBe(true);
    expect(canExportScoreMidi(pending)).toBe(false);
    expect(allowsScorePlayback(pending)).toBeUndefined();
  });

  it("does not let needs_review status override server-approved availability", () => {
    const delivered = { ...baseScore, resultStatus: "complete" as const, reviewStatus: "needs_review" as const, canDownloadMusicXml: true, canPlay: true, canExportMidi: true };

    expect(canDownloadMusicXml(delivered)).toBe(true);
    expect(canPlayScore(delivered)).toBe(true);
    expect(canExportScoreMidi(delivered)).toBe(true);
    expect(allowsScorePlayback(delivered)).toBeUndefined();
  });

  it("allows playback but blocks MIDI on partial results even when flags are permissive", () => {
    const partial = { ...baseScore, resultStatus: "partial" as const, canDownloadMusicXml: true, canPlay: true, canExportMidi: true };

    expect(canPreviewMusicXml(partial)).toBe(true);
    expect(canDownloadMusicXml(partial)).toBe(true);
    expect(canPlayScore(partial)).toBe(true);
    expect(canExportScoreMidi(partial)).toBe(false);
    expect(allowsScorePlayback(partial)).toBeUndefined();
  });

  it("derives playback from the published MusicXML when legacy API fields are missing", () => {
    expect(canDownloadMusicXml(baseScore)).toBe(true);
    expect(canPlayScore(baseScore)).toBe(true);
    expect(canExportScoreMidi(baseScore)).toBe(false);
    expect(allowsScorePlayback(baseScore)).toBeUndefined();
  });

  it("allows unverified export checks but blocks technical MIDI failures", () => {
    const failed = {
      ...baseScore,
      canPlay: true,
      validation: { version: 1 as const, issues: [], checkedMeasures: 0, skippedMeasures: 0, requiresReview: true, midiValidation: {
        status: "failed" as const, checkedNotes: 0, issues: [], limitations: [], xmlSHA256: "xml"
      } }
    };
    const eventsUnverified = {
      ...baseScore,
      canPlay: true,
      validation: { version: 1 as const, issues: [], checkedMeasures: 0, skippedMeasures: 0, requiresReview: true, midiValidation: {
        status: "unverified" as const, checkedNotes: 0, issues: [{ code: "MIDI_EVENTS_UNVERIFIED", message: "Eventos não verificados." }], limitations: [], xmlSHA256: "xml"
      } }
    };
    const preflightUnavailable = {
      ...baseScore,
      canPlay: true,
      validation: { version: 1 as const, issues: [{ code: "MIDI_PREFLIGHT_UNAVAILABLE", severity: "warning" as const, message: "Prévia indisponível." }], checkedMeasures: 0, skippedMeasures: 0, requiresReview: true }
    };

    expect(canPlayScore(failed)).toBe(false);
    expect(canPlayScore(eventsUnverified)).toBe(true);
    expect(canPlayScore(preflightUnavailable)).toBe(true);
    expect(allowsScorePlayback(failed)).toBe(false);
  });
});
