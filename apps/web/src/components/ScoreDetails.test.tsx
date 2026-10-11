import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Score } from "../types/domain.js";
import { ScoreDetails } from "./ScoreDetails.js";

const { scorePlayerSpy } = vi.hoisted(() => ({ scorePlayerSpy: vi.fn() }));
vi.mock("./ScorePlayer.js", () => ({
  ScorePlayer: (props: { allowPlayback?: boolean; previewOnly?: boolean }) => {
    scorePlayerSpy(props);
    return <div data-testid="score-player">Player</div>;
  }
}));

const score: Score = {
  id: "score-1",
  userId: "user-1",
  originalFilename: "Estudo.pdf",
  storedFilename: "score.pdf",
  fileType: "pdf",
  mimeType: "application/pdf",
  fileSize: 1024,
  uploadStatus: "converted",
  conversionStatus: "converted",
  scoreType: "piano",
  scoreTypeSelected: true,
  resultStatus: "complete",
  coverage: { totalPages: 2, processedPages: [1, 2], missingPages: [], pages: [] },
  attempts: [],
  reviewStatus: "needs_review",
  reviewRevision: "xml-revision-1",
  canDownloadMusicXml: true,
  canPlay: true,
  canExportMidi: true,
  errorMessage: null,
  warnings: null,
  confidence: null,
  musicxmlFilename: "score.musicxml",
  isFavorite: false,
  createdAt: "2026-10-07T00:00:00.000Z",
  updatedAt: "2026-10-07T00:00:00.000Z",
  convertedAt: "2026-10-07T00:00:00.000Z"
};

const props = {
  onClose: vi.fn(),
  onDownload: vi.fn(),
  onDownloadMidi: vi.fn(),
  onRename: vi.fn(),
  detailError: "",
  onRetry: vi.fn(async () => score),
  onRefreshDetail: vi.fn(async () => score)
};

describe("ScoreDetails delivery", () => {
  it("shows playback when a tie could not be verified for export", () => {
    render(<ScoreDetails score={{ ...score, canPlay: false, canExportMidi: false,
      validation: { version: 1, issues: [], checkedMeasures: 1, skippedMeasures: 0, requiresReview: true,
        midiValidation: { status: "unverified", checkedNotes: 0, issues: [{ code: "MIDI_EVENTS_UNVERIFIED", message: "Ligadura não verificada." }], limitations: [], xmlSHA256: "xml" }
      }
    }} {...props} />);
    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({ allowPlayback: true }));
    expect(screen.getByRole("button", { name: "Baixar MIDI" })).toBeDisabled();
  });

  it("hides review actions and diagnostics while retaining the API response", () => {
    render(<ScoreDetails score={{
      ...score,
      canDownloadMusicXml: false,
      canPlay: false,
      canExportMidi: false,
      validation: {
        version: 1,
        issues: [{ code: "RHYTHM_SHORT", severity: "warning", message: "Diagnostic detail stays in the API.", measure: "12" }],
        checkedMeasures: 14,
        skippedMeasures: 1,
        requiresReview: true,
        visualReview: {
          version: 1,
          status: "partial",
          sourceSHA256: "source-hash",
          xmlSHA256: "xml-hash",
          reader: null,
          checkedMeasures: 1,
          unknownMeasures: 0,
          segments: [],
          proposals: [{ id: "proposal-1", status: "pending", segmentId: "segment-1", page: 1, partId: "piano", partIndex: 0, measureIndex: 0, measure: "1", noteIndex: 0, before: null, after: null, applicable: true, reason: "manual_review", differences: ["pitch"] }],
          limitations: [],
          accuracyVerified: false,
          trainingEligible: false,
          history: []
        }
      }
    }} {...props} />);

    expect(screen.queryByText(/revisão/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Diagnostic detail stays in the API.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /aceitar correção|manter resultado|conferi a prévia|concluir revisão/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "MusicXML ainda não disponível" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Baixar MIDI" })).toBeDisabled();
    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({ allowPlayback: true, previewOnly: true }));
  });

  it("follows server availability flags even while an old review status is pending", () => {
    render(<ScoreDetails score={score} {...props} />);

    expect(screen.getByText("Convertido")).toBeInTheDocument();
    expect(screen.queryByText(/revisão/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Baixar MusicXML" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Baixar MIDI" })).toBeEnabled();
    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({ allowPlayback: true, previewOnly: false }));
  });

  it("restores playback of converted excerpts while keeping partial MIDI export blocked", () => {
    render(<ScoreDetails score={{ ...score, resultStatus: "partial", canPlay: true, canExportMidi: true }} {...props} />);

    expect(screen.getByRole("status")).toHaveTextContent("A partitura está incompleta.");
    expect(screen.getByRole("button", { name: "Baixar MusicXML parcial" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Baixar MIDI" })).toBeDisabled();
    expect(screen.getByText(/As páginas ausentes não serão tocadas/)).toBeInTheDocument();
    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({ allowPlayback: true }));
  });

  it("keeps legacy MusicXML download available without inferring MIDI permission", () => {
    render(<ScoreDetails score={{ ...score, resultStatus: null, canDownloadMusicXml: true, canPlay: true, canExportMidi: true }} {...props} />);

    expect(screen.getByRole("button", { name: /Baixar MusicXML.*cobertura desconhecida/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Baixar MIDI" })).toBeDisabled();
    expect(scorePlayerSpy).toHaveBeenLastCalledWith(expect.objectContaining({ allowPlayback: true }));
  });

  it("keeps retry available for a converted result", () => {
    render(<ScoreDetails score={score} {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(props.onRetry).toHaveBeenCalledWith(score.id, undefined);
  });
});
