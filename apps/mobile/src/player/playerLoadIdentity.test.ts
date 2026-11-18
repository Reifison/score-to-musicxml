import { describe, expect, it } from "vitest";
import type { ConversionAttempt, Score } from "../api/types";
import { playerLoadIdentity } from "./playerLoadIdentity";

const attempt = (id: string, status: ConversionAttempt["status"], filename: string | null): ConversionAttempt => ({
  id,
  scoreId: "score-1",
  kind: id === "initial" ? "initial" : "manual",
  status,
  errorCode: null,
  errorMessage: null,
  coverage: null,
  musicxmlFilename: filename,
  createdAt: "2026-10-06T10:00:00.000Z",
  startedAt: "2026-10-06T10:00:01.000Z",
  finishedAt: status === "queued" || status === "processing" ? null : "2026-10-06T10:00:02.000Z"
});

const completeScore: Score = {
  id: "score-1",
  userId: "user-1",
  originalFilename: "score.pdf",
  storedFilename: "score.pdf",
  fileType: "pdf",
  mimeType: "application/pdf",
  fileSize: 100,
  uploadStatus: "uploaded",
  conversionStatus: "converted",
  errorMessage: null,
  warnings: null,
  confidence: null,
  musicxmlFilename: "score.musicxml",
  scoreType: "melody",
  scoreTypeSelected: true,
  resultStatus: "complete",
  coverage: null,
  lastErrorCode: null,
  attempts: [attempt("initial", "complete", "score.musicxml")],
  reviewStatus: "approved",
  reviewRevision: "xml-revision-1",
  canPlay: true,
  canExportMidi: true,
  isFavorite: false,
  createdAt: "2026-10-06T10:00:00.000Z",
  updatedAt: "2026-10-06T10:00:02.000Z",
  convertedAt: "2026-10-06T10:00:02.000Z"
};

describe("player load identity", () => {
  it("stays stable as a retry queues or fails while the previous file remains current", () => {
    const identity = playerLoadIdentity(completeScore);

    expect(playerLoadIdentity({
      ...completeScore,
      attempts: [...completeScore.attempts!, attempt("retry", "processing", null)]
    })).toBe(identity);
    expect(playerLoadIdentity({
      ...completeScore,
      errorMessage: "A retry failed",
      lastErrorCode: "RETRY_FAILED",
      attempts: [...completeScore.attempts!, attempt("retry", "failed", null)]
    })).toBe(identity);
  });

  it("changes when a new successful result replaces the current MusicXML", () => {
    const updated = {
      ...completeScore,
      resultStatus: "partial" as const,
      canPlay: false,
      canExportMidi: false,
      attempts: [...completeScore.attempts!, attempt("retry-result", "partial", "score.musicxml")]
    };

    expect(playerLoadIdentity(updated)).not.toBe(playerLoadIdentity(completeScore));
  });

  it("changes when playback permission changes for the same cached file", () => {
    expect(playerLoadIdentity({ ...completeScore, canPlay: false }))
      .not.toBe(playerLoadIdentity(completeScore));
  });

  it("changes when the review revision changes while the MusicXML filename stays the same", () => {
    expect(playerLoadIdentity({ ...completeScore, reviewRevision: "xml-revision-2" }))
      .not.toBe(playerLoadIdentity(completeScore));
  });
});
