import { describe, expect, it } from "vitest";
import type { Score } from "../types/domain.js";
import { canDownloadScoreMusicXml, canExportScoreMidi, canPlayScore, canPreviewMusicXml } from "./availability.js";

const baseScore: Score = {
  id: "score-1",
  userId: "user-1",
  originalFilename: "partitura.pdf",
  storedFilename: "partitura.pdf",
  fileType: "pdf",
  mimeType: "application/pdf",
  fileSize: 100,
  uploadStatus: "converted",
  conversionStatus: "converted",
  resultStatus: "complete",
  scoreType: "melody",
  scoreTypeSelected: true,
  reviewStatus: "approved",
  reviewRevision: "revision-1",
  canPlay: false,
  canExportMidi: true,
  canDownloadMusicXml: true,
  validation: {
    version: 1,
    issues: [],
    checkedMeasures: 1,
    skippedMeasures: 0,
    requiresReview: true,
    midiValidation: { status: "passed", checkedNotes: 1, issues: [], limitations: [], xmlSHA256: "xml" }
  },
  musicxmlFilename: "partitura.musicxml",
  isFavorite: false,
  createdAt: "2026-10-08T00:00:00.000Z",
  updatedAt: "2026-10-08T00:00:00.000Z",
  convertedAt: "2026-10-08T00:00:00.000Z",
  errorMessage: null,
  warnings: null,
  confidence: null
};

describe("score availability", () => {
  it("deriva escuta do MusicXML publicado mesmo para versões pendentes, parciais e legadas", () => {
    const pending = { ...baseScore, reviewStatus: "needs_review" as const, canPlay: false, canExportMidi: false, canDownloadMusicXml: false };
    const partial = { ...pending, resultStatus: "partial" as const, scoreTypeSelected: false, coverage: { totalPages: 2, processedPages: [1], missingPages: [2], pages: [] } };
    const legacy = { ...baseScore, reviewStatus: "unverified" as const, reviewRevision: null, resultStatus: null, scoreTypeSelected: false, coverage: null, canPlay: false, canExportMidi: false, canDownloadMusicXml: true };

    expect(canPreviewMusicXml(pending)).toBe(true);
    expect(canPlayScore(pending)).toBe(true);
    expect(canPlayScore(partial)).toBe(true);
    expect(canPlayScore(legacy)).toBe(true);
    expect(canExportScoreMidi(pending)).toBe(false);
    expect(canExportScoreMidi(partial)).toBe(false);
    expect(canExportScoreMidi(legacy)).toBe(false);
    expect(canDownloadScoreMusicXml(pending)).toBe(false);
    expect(canDownloadScoreMusicXml(legacy)).toBe(true);
  });

  it("preserva os requisitos de exportação final", () => {
    expect(canExportScoreMidi(baseScore)).toBe(true);
    expect(canExportScoreMidi({ ...baseScore, reviewStatus: "needs_review" })).toBe(true);
    expect(canExportScoreMidi({ ...baseScore, resultStatus: "partial" })).toBe(false);
    expect(canExportScoreMidi({ ...baseScore, canExportMidi: false })).toBe(false);
  });

  it("permite escuta com conferência indisponível, bloqueando somente falhas MIDI", () => {
    const failed = { ...baseScore, validation: { ...baseScore.validation!, midiValidation: { ...baseScore.validation!.midiValidation!, status: "failed" as const } } };
    const eventsUnverified = { ...baseScore, validation: { ...baseScore.validation!, midiValidation: { ...baseScore.validation!.midiValidation!, status: "unverified" as const, issues: [{ code: "MIDI_EVENTS_UNVERIFIED", message: "Eventos não verificados." }] } } };
    const preflightUnavailable = { ...baseScore, validation: { ...baseScore.validation!, issues: [{ code: "MIDI_PREFLIGHT_UNAVAILABLE", severity: "warning" as const, message: "Prévia indisponível." }] } };

    expect(canPlayScore(failed)).toBe(false);
    expect(canPlayScore(eventsUnverified)).toBe(true);
    expect(canPlayScore(preflightUnavailable)).toBe(true);
  });

  it("exige conversão publicada com MusicXML", () => {
    expect(canPlayScore({ ...baseScore, conversionStatus: "processing" })).toBe(false);
    expect(canPlayScore({ ...baseScore, musicxmlFilename: null })).toBe(false);
  });
});
