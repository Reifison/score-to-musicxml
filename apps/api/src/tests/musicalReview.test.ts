import { describe, expect, it } from "vitest";
import type { ConversionCoverage, Score } from "../domain.js";
import { scoreAvailability } from "../services/MusicalReview.js";

const coverage: ConversionCoverage = {
  totalPages: 1,
  processedPages: [1],
  missingPages: [],
  pages: [{ page: 1, status: "processed", parts: [{ id: "P1", name: "Melody", staffCount: 1, staves: [1] }] }]
};

const baseScore = (): Score => ({
  id: "score-1",
  userId: "user-1",
  originalFilename: "partitura.pdf",
  storedFilename: "partitura.pdf",
  fileType: "pdf",
  mimeType: "application/pdf",
  fileSize: 100,
  preprocessingProfile: null,
  scoreType: "melody",
  scoreTypeSelected: true,
  resultStatus: "complete",
  coverage,
  reviewStatus: "approved",
  reviewRevision: "revision-1",
  validation: {
    version: 1,
    issues: [],
    checkedMeasures: 1,
    skippedMeasures: 0,
    requiresReview: true,
    midiValidation: { status: "passed", checkedNotes: 1, issues: [], limitations: [], xmlSHA256: "xml" }
  },
  uploadStatus: "converted",
  conversionStatus: "converted",
  errorMessage: null,
  warnings: null,
  confidence: null,
  musicxmlFilename: "partitura.musicxml",
  isFavorite: false,
  deletedAt: null,
  purgeAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  convertedAt: new Date()
});

describe("scoreAvailability", () => {
  it("permite escuta de versões pendentes, parciais e legadas", () => {
    const pending = scoreAvailability({
      ...baseScore(),
      reviewStatus: "needs_review",
      resultStatus: "complete",
      scoreTypeSelected: false,
      coverage: null,
      canPlay: false,
      canExportMidi: false
    });
    const partial = scoreAvailability({
      ...baseScore(),
      reviewStatus: "needs_review",
      resultStatus: "partial",
      scoreTypeSelected: false,
      coverage: { ...coverage, totalPages: 2, missingPages: [2], pages: [...coverage.pages, { page: 2, status: "missing", parts: [] }] },
      canPlay: false,
      canExportMidi: false
    });
    const legacy = scoreAvailability({
      ...baseScore(),
      reviewStatus: "unverified",
      reviewRevision: null,
      resultStatus: null,
      scoreTypeSelected: false,
      coverage: null,
      canPlay: false,
      canExportMidi: false
    });

    expect(pending.canPlay).toBe(true);
    expect(partial.canPlay).toBe(true);
    expect(legacy.canPlay).toBe(true);
    expect(pending.canExportMidi).toBe(false);
    expect(partial.canExportMidi).toBe(false);
    expect(legacy.canExportMidi).toBe(false);
    expect(legacy.canDownloadMusicXml).toBe(true);
  });

  it("mantém exportação MIDI final dependente de revisão, cobertura e seleção", () => {
    expect(scoreAvailability({ ...baseScore(), reviewStatus: "needs_review" }).canExportMidi).toBe(false);
    expect(scoreAvailability({ ...baseScore(), resultStatus: "partial" }).canExportMidi).toBe(false);
    expect(scoreAvailability({ ...baseScore(), scoreTypeSelected: false }).canExportMidi).toBe(false);
    expect(scoreAvailability({ ...baseScore(), coverage: null }).canExportMidi).toBe(false);
    expect(scoreAvailability(baseScore()).canExportMidi).toBe(true);
  });

  it("permite escuta sem conferir exportação, preservando o bloqueio de falhas MIDI", () => {
    const failed = scoreAvailability({
      ...baseScore(),
      validation: { ...baseScore().validation!, midiValidation: { ...baseScore().validation!.midiValidation!, status: "failed" } }
    });
    const eventsUnverified = scoreAvailability({
      ...baseScore(),
      validation: { ...baseScore().validation!, midiValidation: { ...baseScore().validation!.midiValidation!, status: "unverified", issues: [{ code: "MIDI_EVENTS_UNVERIFIED", message: "Eventos não verificados." }] } }
    });
    const preflightUnavailable = scoreAvailability({
      ...baseScore(),
      validation: { ...baseScore().validation!, midiValidation: { ...baseScore().validation!.midiValidation!, status: "unverified", issues: [{ code: "MIDI_PREFLIGHT_UNAVAILABLE", message: "Prévia indisponível." }] } }
    });

    expect(failed.canPlay).toBe(false);
    expect(eventsUnverified.canPlay).toBe(true);
    expect(preflightUnavailable.canPlay).toBe(true);
    expect(failed.canExportMidi).toBe(false);
    expect(eventsUnverified.canExportMidi).toBe(false);
    expect(preflightUnavailable.canExportMidi).toBe(false);
  });

  it("exige uma conversão publicada e um MusicXML para escuta", () => {
    expect(scoreAvailability({ ...baseScore(), conversionStatus: "processing" }).canPlay).toBe(false);
    expect(scoreAvailability({ ...baseScore(), musicxmlFilename: null }).canPlay).toBe(false);
  });
});
