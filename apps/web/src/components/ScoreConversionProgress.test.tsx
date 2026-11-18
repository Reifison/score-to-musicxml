import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Score } from "../types/domain.js";
import { ScoreConversionProgress } from "./ScoreConversionProgress.js";

const score = {
  id: "score-1",
  userId: "user-1",
  originalFilename: "Study.pdf",
  storedFilename: "score.pdf",
  fileType: "pdf",
  mimeType: "application/pdf",
  fileSize: 100,
  uploadStatus: "converted",
  conversionStatus: "converted",
  conversionProgress: {
    attemptId: "attempt-2",
    stage: "recognizing",
    totalPages: null,
    currentPage: 5,
    completedPages: [1, 2],
    failedPages: [],
    excludedPages: [],
    reusedPages: [],
    updatedAt: "2026-10-16T12:00:00.000Z"
  },
  attempts: [],
  errorMessage: null,
  warnings: null,
  confidence: null,
  musicxmlFilename: "score.musicxml",
  isFavorite: false,
  createdAt: "2026-10-16T10:00:00.000Z",
  updatedAt: "2026-10-16T12:00:00.000Z",
  convertedAt: "2026-10-16T10:00:00.000Z"
} satisfies Score;

describe("ScoreConversionProgress", () => {
  it("announces localized page status accessibly and wraps the current page", () => {
    render(<ScoreConversionProgress score={score} language="en" />);

    const status = screen.getByRole("status", { name: /Recognizing pages\. 2 pages recognized\. Page 5/i });
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Page 5");
    expect(status).toHaveTextContent("2 pages recognized.");
  });

  it("does not show a completed progress block for a final score", () => {
    render(<ScoreConversionProgress score={{
      ...score,
      conversionProgress: { ...score.conversionProgress!, stage: "complete" },
      attempts: [{ id: "attempt-2", scoreId: "score-1", kind: "manual", status: "complete", errorCode: null, errorMessage: null, coverage: null, musicxmlFilename: "score.musicxml", createdAt: "2026-10-16T12:00:00.000Z", startedAt: null, finishedAt: "2026-10-16T12:01:00.000Z" }]
    }} language="pt" />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("describes an interrupted attempt as recognized pages and keeps reuse explicit", () => {
    render(<ScoreConversionProgress score={{
      ...score,
      conversionProgress: { ...score.conversionProgress!, stage: "interrupted", completedPages: [1], reusedPages: [2] }
    }} language="en" />);

    const status = screen.getByRole("status", { name: /Attempt interrupted\. 2 pages recognized before the interruption\..*1 page reused/i });
    expect(status).toHaveTextContent("2 pages recognized before the interruption.");
    expect(status).toHaveTextContent("1 page reused");
  });
});
