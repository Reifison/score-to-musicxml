import { describe, expect, it } from "vitest";
import type { ConversionAttempt, ConversionProgress } from "../types/domain.js";
import { conversionProgressPresentation, isConversionProgressActive, shouldPollConversionScore } from "./conversionProgressPresentation.js";

function progress(overrides: Partial<ConversionProgress> = {}): ConversionProgress {
  return {
    attemptId: "attempt-2",
    stage: "recognizing",
    totalPages: 4,
    currentPage: 3,
    completedPages: [1, 2],
    failedPages: [],
    excludedPages: [],
    reusedPages: [],
    updatedAt: "2026-10-16T12:00:00.000Z",
    ...overrides
  };
}

function attempt(id: string, status: ConversionAttempt["status"], createdAt: string): ConversionAttempt {
  return {
    id, scoreId: "score-1", kind: "manual", status, errorCode: null, errorMessage: null,
    coverage: null, musicxmlFilename: null, createdAt, startedAt: null, finishedAt: null
  };
}

describe("web conversion progress presentation", () => {
  it("shows recognized counts and the current page when the total is unknown", () => {
    const view = conversionProgressPresentation({
      conversionStatus: "converted",
      conversionProgress: progress({ totalPages: null, completedPages: [1, 2, 2], currentPage: 3 }),
      attempts: []
    }, "en");

    expect(view).toMatchObject({
      stageLabel: "Recognizing pages",
      summary: "2 pages recognized.",
      currentPageLabel: "Page 3",
      interrupted: false
    });
  });

  it("reports reused, failed, and excluded page counts without inventing a percentage", () => {
    const view = conversionProgressPresentation({
      conversionStatus: "processing",
      conversionProgress: progress({
        completedPages: [1], reusedPages: [2], failedPages: [3], excludedPages: [4]
      }),
      attempts: []
    }, "pt");

    expect(view?.summary).toBe("2 de 4 páginas reconhecidas.");
    expect(view?.details).toEqual(["1 página reaproveitada", "1 página com falha", "1 página excluída"]);
    expect(view?.announcement).not.toMatch(/%|segundo|minuto/i);
  });

  it("uses a distinct validating label and localizes it to English", () => {
    expect(conversionProgressPresentation({
      conversionStatus: "processing", conversionProgress: progress({ stage: "validating" }), attempts: []
    }, "en")?.stageLabel).toBe("Checking recognized pages");
  });

  it("shows pages recognized before an interrupted attempt and suppresses stale progress", () => {
    const failedAttempt = attempt("attempt-2", "failed", "2026-10-16T12:00:00.000Z");
    const interrupted = conversionProgressPresentation({
      conversionStatus: "converted",
      conversionProgress: progress({ stage: "interrupted", totalPages: null, completedPages: [4], reusedPages: [5] }),
      attempts: [attempt("attempt-1", "complete", "2026-10-15T12:00:00.000Z"), failedAttempt]
    }, "en");
    const stale = conversionProgressPresentation({
      conversionStatus: "converted",
      conversionProgress: progress({ stage: "interrupted", attemptId: "attempt-1", completedPages: [1, 2, 3] }),
      attempts: [attempt("attempt-1", "complete", "2026-10-15T12:00:00.000Z"), failedAttempt]
    }, "en");

    expect(interrupted).toMatchObject({
      stageLabel: "Attempt interrupted",
      summary: "2 pages recognized before the interruption.",
      details: ["1 page reused"],
      interrupted: true
    });
    expect(stale).toBeNull();

    expect(conversionProgressPresentation({
      conversionStatus: "failed",
      conversionProgress: progress({ stage: "interrupted", totalPages: 4, completedPages: [], reusedPages: [] }),
      attempts: []
    }, "en")?.summary).toBe("No pages were recognized before the interruption.");
  });

  it("hides completed progress for a final score, while retaining polling for a converted score's active retry", () => {
    const finalScore = { conversionStatus: "converted" as const, conversionProgress: progress({ stage: "complete" }), attempts: [attempt("attempt-2", "complete", "2026-10-16T12:00:00.000Z")] };
    const activeRetry = { conversionStatus: "converted" as const, conversionProgress: progress(), attempts: [attempt("attempt-2", "processing", "2026-10-16T12:00:00.000Z")] };
    const completedPagesButStaleActiveAttempt = { ...activeRetry, conversionProgress: progress({ stage: "complete" }) };

    expect(conversionProgressPresentation(finalScore, "pt")).toBeNull();
    expect(conversionProgressPresentation(completedPagesButStaleActiveAttempt, "pt")).toBeNull();
    expect(isConversionProgressActive(activeRetry.conversionProgress)).toBe(true);
    expect(shouldPollConversionScore(activeRetry)).toBe(true);
    expect(shouldPollConversionScore({ conversionStatus: "converted", conversionProgress: progress(), attempts: [] })).toBe(true);
    expect(shouldPollConversionScore(finalScore)).toBe(false);
    expect(shouldPollConversionScore(completedPagesButStaleActiveAttempt)).toBe(true);
  });

  it("uses manual attempt priority when attempt timestamps match", () => {
    const timestamp = "2026-10-16T12:00:00.000Z";
    const view = conversionProgressPresentation({
      conversionStatus: "converted",
      conversionProgress: progress({ attemptId: "manual" }),
      attempts: [{ ...attempt("initial", "complete", timestamp), kind: "initial" }, attempt("manual", "processing", timestamp)]
    }, "en");

    expect(view?.stageLabel).toBe("Recognizing pages");
  });

  it("ignores invalid page numbers outside the declared total", () => {
    const view = conversionProgressPresentation({
      conversionStatus: "processing",
      conversionProgress: progress({ totalPages: 2, currentPage: 9, completedPages: [1, 2, 9] }),
      attempts: []
    }, "en");

    expect(view?.summary).toBe("2 of 2 pages recognized.");
    expect(view?.currentPageLabel).toBeUndefined();
  });

  it("localizes preparing and interrupted messages in Portuguese and English", () => {
    expect(conversionProgressPresentation({
      conversionStatus: "processing", conversionProgress: progress({ stage: "preparing", completedPages: [], currentPage: null }), attempts: []
    }, "pt")?.stageLabel).toBe("Preparando a conversão");
    expect(conversionProgressPresentation({
      conversionStatus: "failed", conversionProgress: progress({ stage: "interrupted", completedPages: [1], totalPages: 2 }), attempts: []
    }, "pt")?.summary).toBe("1 de 2 páginas reconhecidas antes da interrupção.");
    expect(conversionProgressPresentation({
      conversionStatus: "failed", conversionProgress: progress({ stage: "interrupted", completedPages: [1], totalPages: 2 }), attempts: []
    }, "en")?.summary).toBe("1 of 2 pages recognized before the interruption.");
    expect(conversionProgressPresentation({
      conversionStatus: "failed", conversionProgress: progress({ stage: "interrupted", completedPages: [], reusedPages: [] }), attempts: []
    }, "pt")?.summary).toBe("Nenhuma página reconhecida antes da interrupção.");
  });
});
