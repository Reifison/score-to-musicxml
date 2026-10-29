import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Score } from "../types/domain.js";
import { ScoreCard } from "./ScoreCard.js";

const baseScore: Score = {
  id: "score-1",
  userId: "user-1",
  originalFilename: "Estudo.pdf",
  storedFilename: "score.pdf",
  fileType: "pdf",
  mimeType: "application/pdf",
  fileSize: 1024,
  uploadStatus: "converted",
  conversionStatus: "converted",
  errorMessage: null,
  warnings: null,
  confidence: null,
  musicxmlFilename: "score.musicxml",
  canDownloadMusicXml: false,
  reviewStatus: "needs_review",
  reviewRevision: "xml-revision-1",
  isFavorite: false,
  createdAt: "2026-10-07T00:00:00.000Z",
  updatedAt: "2026-10-07T00:00:00.000Z",
  convertedAt: "2026-10-07T00:00:00.000Z"
};

const props = {
  onOpen: vi.fn(),
  onDelete: vi.fn(),
  onDownload: vi.fn(),
  onToggleFavorite: vi.fn()
};

describe("ScoreCard delivery availability", () => {
  it("keeps the download disabled when the API says it is unavailable", () => {
    render(<ScoreCard score={baseScore} {...props} />);

    expect(screen.getByRole("button", { name: "Baixar MusicXML" })).toBeDisabled();
    expect(screen.queryByText(/revisão/i)).not.toBeInTheDocument();
  });

  it("does not let an old needs_review status block server-approved delivery", () => {
    render(<ScoreCard score={{ ...baseScore, canDownloadMusicXml: true }} {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Baixar MusicXML" }));

    expect(props.onDownload).toHaveBeenCalledWith(expect.objectContaining({ reviewStatus: "needs_review" }));
  });

  it("shows a recognition warning while preserving API-provided downloads", () => {
    render(<ScoreCard score={{
      ...baseScore,
      canDownloadMusicXml: true,
      recognitionQuality: {
        status: "needs_review",
        sourceComparison: "compared",
        checkedMeasures: 4,
        accuracyVerified: false,
        issues: []
      }
    }} {...props} />);

    expect(screen.getByText("Revisar partitura")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Baixar MusicXML" })).toBeEnabled();
  });
});
