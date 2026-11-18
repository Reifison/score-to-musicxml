import { describe, expect, it } from "vitest";
import type { ConversionAttempt } from "../api/types";
import { musicXmlCacheRevision } from "./musicXmlCacheRevision";

const completedAttempt = (id: string, status: "complete" | "partial" | "failed", filename: string | null): ConversionAttempt => ({
  id,
  scoreId: "score-1",
  kind: "manual",
  status,
  errorCode: null,
  errorMessage: null,
  coverage: null,
  musicxmlFilename: filename,
  createdAt: "2026-10-06T10:00:00.000Z",
  startedAt: "2026-10-06T10:00:01.000Z",
  finishedAt: "2026-10-06T10:00:02.000Z"
});

describe("MusicXML cache revision", () => {
  it("switches to the latest successful file after a retry produces a new result", () => {
    const revision = musicXmlCacheRevision({
      musicxmlFilename: "score.musicxml",
      convertedAt: "2026-10-06T10:00:02.000Z",
      resultStatus: "partial",
      attempts: [completedAttempt("attempt-old", "complete", "score.musicxml"), completedAttempt("attempt-new", "partial", "score.musicxml")]
    });

    expect(revision).toBe("attempt:attempt-new:score.musicxml");
  });

  it("keeps the previous result revision when a later retry fails", () => {
    const revision = musicXmlCacheRevision({
      musicxmlFilename: "score.musicxml",
      convertedAt: "2026-10-06T10:00:02.000Z",
      resultStatus: "complete",
      attempts: [completedAttempt("attempt-old", "complete", "score.musicxml"), completedAttempt("attempt-retry", "failed", null)]
    });

    expect(revision).toBe("attempt:attempt-old:score.musicxml");
  });

  it("keeps a stable but explicitly unverified identity for legacy results", () => {
    const legacy = { musicxmlFilename: "old-score.musicxml", convertedAt: null, resultStatus: null, attempts: undefined };
    expect(musicXmlCacheRevision(legacy)).toBe("unverified:old-score.musicxml:unknown-date");
    expect(musicXmlCacheRevision(legacy)).toBe(musicXmlCacheRevision(legacy));
  });

  it("separates cached notation when the server review revision changes", () => {
    const base = { musicxmlFilename: "score.musicxml", convertedAt: "2026-10-06T10:00:02.000Z", resultStatus: "complete" as const, attempts: [] };

    expect(musicXmlCacheRevision({ ...base, reviewRevision: "xml-revision-a" }))
      .not.toBe(musicXmlCacheRevision({ ...base, reviewRevision: "xml-revision-b" }));
  });
});
