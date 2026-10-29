import { describe, expect, it } from "vitest";
import type { ConversionAttempt, ConversionProgress } from "../api/types";
import { conversionProgressPresentation, isConversionProgressActive, shouldPollConversionScore } from "./conversionProgressPresentation";

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

describe("mobile conversion progress presentation", () => {
  it("shows per-page counts without requiring a known total", () => {
    const view = conversionProgressPresentation({
      conversionStatus: "converted",
      conversionProgress: progress({ totalPages: null, completedPages: [1, 2, 2], currentPage: 3 }),
      attempts: []
    }, "pt");

    expect(view).toMatchObject({
      stageLabel: "Reconhecendo páginas",
      summary: "2 páginas reconhecidas.",
      currentPageLabel: "Página 3",
      interrupted: false
    });
  });

  it("reports reuse, page failures, and exclusions independently", () => {
    const view = conversionProgressPresentation({
      conversionStatus: "processing",
      conversionProgress: progress({ stage: "validating", completedPages: [1], reusedPages: [2], failedPages: [3], excludedPages: [4] }),
      attempts: []
    }, "en");

    expect(view?.stageLabel).toBe("Checking recognized pages");
    expect(view?.summary).toBe("2 of 4 pages recognized.");
    expect(view?.details).toEqual(["1 page reused", "1 page failed", "1 page excluded"]);
  });

  it("shows pages recognized before the failed retry only, while preserving previous results", () => {
    const latest = attempt("attempt-2", "failed", "2026-10-16T12:00:00.000Z");
    const view = conversionProgressPresentation({
      conversionStatus: "converted",
      conversionProgress: progress({ stage: "interrupted", totalPages: 3, completedPages: [2], reusedPages: [3] }),
      attempts: [attempt("attempt-1", "complete", "2026-10-15T12:00:00.000Z"), latest]
    }, "en");
    const stale = conversionProgressPresentation({
      conversionStatus: "converted",
      conversionProgress: progress({ stage: "interrupted", attemptId: "attempt-1", completedPages: [1] }),
      attempts: [attempt("attempt-1", "complete", "2026-10-15T12:00:00.000Z"), latest]
    }, "en");

    expect(view).toMatchObject({
      stageLabel: "Attempt interrupted",
      summary: "2 of 3 pages recognized before the interruption.",
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

  it("hides complete final progress and keeps the converted retry pollable", () => {
    const complete = { conversionStatus: "converted" as const, conversionProgress: progress({ stage: "complete" }), attempts: [attempt("attempt-2", "complete", "2026-10-16T12:00:00.000Z")] };
    const activeRetry = { conversionStatus: "converted" as const, conversionProgress: progress(), attempts: [attempt("attempt-2", "processing", "2026-10-16T12:00:00.000Z")] };
    const pagesRecognized = { ...activeRetry, conversionProgress: progress({ stage: "complete" }) };

    expect(conversionProgressPresentation(complete, "pt")).toBeNull();
    expect(conversionProgressPresentation(pagesRecognized, "pt")).toBeNull();
    expect(isConversionProgressActive(activeRetry.conversionProgress)).toBe(true);
    expect(shouldPollConversionScore(activeRetry)).toBe(true);
    expect(shouldPollConversionScore({ conversionStatus: "converted", conversionProgress: progress(), attempts: [] })).toBe(true);
    expect(shouldPollConversionScore(complete)).toBe(false);
    expect(shouldPollConversionScore(pagesRecognized)).toBe(true);
    expect(shouldPollConversionScore({ ...activeRetry, conversionProgress: null, attempts: [] })).toBe(false);
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

  it("localizes preparation and interruption copy in Portuguese and English", () => {
    const preparing = progress({ stage: "preparing", completedPages: [], currentPage: null });
    const interrupted = progress({ stage: "interrupted", totalPages: 2, completedPages: [1] });
    expect(conversionProgressPresentation({ conversionStatus: "processing", conversionProgress: preparing, attempts: [] }, "pt")?.stageLabel)
      .toBe("Preparando a conversão");
    expect(conversionProgressPresentation({ conversionStatus: "failed", conversionProgress: interrupted, attempts: [] }, "pt")?.summary)
      .toBe("1 de 2 páginas reconhecidas antes da interrupção.");
    expect(conversionProgressPresentation({ conversionStatus: "failed", conversionProgress: interrupted, attempts: [] }, "en")?.summary)
      .toBe("1 of 2 pages recognized before the interruption.");
    expect(conversionProgressPresentation({
      conversionStatus: "failed",
      conversionProgress: progress({ stage: "interrupted", completedPages: [], reusedPages: [] }),
      attempts: []
    }, "pt")?.summary).toBe("Nenhuma página reconhecida antes da interrupção.");
  });
});
