import { describe, expect, it } from "vitest";
import type { Score } from "../types/domain.js";
import { currentFirstPagePreview } from "./firstPagePreview.js";

const revision = "a".repeat(64);
const score: Pick<Score, "attempts" | "conversionProgress" | "conversionPreview"> = {
  attempts: [{
    id: "attempt-2", scoreId: "score-1", kind: "manual", status: "processing", errorCode: null, errorMessage: null,
    coverage: null, musicxmlFilename: null, createdAt: "2026-10-16T12:00:00.000Z", startedAt: "2026-10-16T12:00:01.000Z", finishedAt: null
  }],
  conversionProgress: {
    attemptId: "attempt-2", stage: "validating", totalPages: 4, currentPage: 3,
    completedPages: [1], failedPages: [], excludedPages: [], reusedPages: [], updatedAt: "2026-10-16T12:00:02.000Z"
  },
  conversionPreview: {
    attemptId: "attempt-2", revision, page: 1, totalPages: 4, createdAt: "2026-10-16T12:00:02.000Z", warnings: []
  }
};

describe("currentFirstPagePreview", () => {
  it("accepts only the first page for the active attempt and its current revision", () => {
    expect(currentFirstPagePreview(score)).toMatchObject({ attemptId: "attempt-2", page: 1, totalPages: 4, revision });
  });

  it("hides metadata from a previous attempt after progress advances", () => {
    expect(currentFirstPagePreview({
      ...score,
      conversionProgress: { ...score.conversionProgress!, attemptId: "attempt-3" }
    })).toBeNull();
    expect(currentFirstPagePreview({
      ...score,
      attempts: score.attempts?.map((attempt) => ({ ...attempt, status: "complete" as const }))
    })).toBeNull();
  });

  it("rejects unsupported pages, one-page inputs, and malformed revisions", () => {
    expect(currentFirstPagePreview({ ...score, conversionPreview: { ...score.conversionPreview!, page: 2 as 1 } })).toBeNull();
    expect(currentFirstPagePreview({ ...score, conversionPreview: { ...score.conversionPreview!, totalPages: 1 } })).toBeNull();
    expect(currentFirstPagePreview({ ...score, conversionPreview: { ...score.conversionPreview!, revision: "revision-2" } })).toBeNull();
  });
});
