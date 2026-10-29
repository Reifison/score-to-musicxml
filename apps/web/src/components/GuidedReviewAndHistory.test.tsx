// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Score, ScoreVersion, VisualCorrectionProposal } from "../types/domain.js";

const state = vi.hoisted(() => ({
  decide: vi.fn(),
  api: vi.fn(),
  versions: vi.fn(),
  versionXml: vi.fn(),
  download: vi.fn()
}));

vi.mock("../api/client.js", () => ({
  ApiError: class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } },
  api: state.api,
  decideVisualReviewProposal: state.decide,
  fetchScoreVersions: state.versions,
  fetchScoreVersionMusicXml: state.versionXml,
  downloadScoreVersionMusicXml: state.download
}));

import { GuidedScoreReview } from "./GuidedScoreReview.js";
import { ScoreVersionHistory } from "./ScoreVersionHistory.js";

const safeProposal: VisualCorrectionProposal = {
  id: "proposal-1", status: "pending", segmentId: "segment-1", page: 1, partId: "P1", partIndex: 0, measureIndex: 0, measure: "3", noteIndex: 0,
  before: { kind: "note", step: "C", alter: 0, octave: 4, duration: 1, type: "quarter" },
  after: { kind: "rest", duration: 1, type: "quarter" }, applicable: true, reason: "Source linked", differences: ["pitch"]
};

const baseScore = {
  id: "score-1", userId: "user-1", originalFilename: "Study.pdf", storedFilename: "study.pdf", fileType: "pdf", mimeType: "application/pdf", fileSize: 100,
  uploadStatus: "converted", conversionStatus: "converted", errorMessage: null, warnings: null, confidence: null, musicxmlFilename: "study.musicxml",
  isFavorite: false, createdAt: "2026-10-20T12:00:00.000Z", updatedAt: "2026-10-20T12:00:00.000Z", convertedAt: "2026-10-20T12:00:00.000Z",
  reviewRevision: "revision-1", validation: {
    issues: [{ code: "missing", severity: "warning", message: "A measure needs a closer look.", page: 1, partId: "P1", measure: "3" }],
    visualReview: { status: "completed", proposals: [safeProposal, { ...safeProposal, id: "unsafe", applicable: false }], unknownMeasures: 0, history: [] }
  }
} as unknown as Score;

const previousVersion: ScoreVersion = {
  id: "revision:revision-old", label: "Review 1", createdAt: "2026-10-19T10:00:00.000Z", kind: "correction", revision: "revision-old",
  isCurrent: false, status: "needs_review", coverage: { totalPages: 2, processedPages: 1, missingPages: [2] }, available: true
};
const currentVersion: ScoreVersion = { ...previousVersion, id: "attempt:attempt-2", label: "Conversion 2", kind: "conversion", revision: "revision-current", isCurrent: true, status: "approved", coverage: { totalPages: 2, processedPages: 2, missingPages: [] } };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  Object.defineProperty(window.navigator, "language", { configurable: true, value: "pt-BR" });
});

describe("guided score review", () => {
  it("uses singular counts and hides empty findings while keeping the proposal empty state", () => {
    const oneProposal = {
      ...baseScore,
      validation: { ...baseScore.validation!, issues: [], visualReview: { ...baseScore.validation!.visualReview!, proposals: [safeProposal] } }
    } as Score;
    const { container, rerender } = render(<GuidedScoreReview score={oneProposal} />);
    expect(screen.getByText("1 apontamento")).toBeTruthy();
    expect(screen.getByText("1 pendente")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Apontamentos" })).toBeNull();
    expect(container.querySelector(".guided-review-findings")?.classList.contains("is-proposals-only")).toBe(true);

    const empty = { ...oneProposal, validation: { ...oneProposal.validation!, visualReview: { ...oneProposal.validation!.visualReview!, proposals: [] } } } as Score;
    rerender(<GuidedScoreReview score={empty} />);
    expect(screen.queryByRole("heading", { name: "Apontamentos" })).toBeNull();
    expect(screen.getByText("Nenhuma sugestão de nota ou pausa disponível.")).toBeTruthy();
  });

  it("locates findings, allows only safe proposals, and sends the current revision for decisions", async () => {
    const updated = { ...baseScore, reviewRevision: "revision-2" } as Score;
    state.decide.mockResolvedValue(updated);
    const onScoreChange = vi.fn();
    const onLocateProposal = vi.fn();
    render(<GuidedScoreReview score={baseScore} onScoreChange={onScoreChange} onLocateProposal={onLocateProposal} originalPreview={<div>Source page</div>} resultPreview={<div>Notation</div>} />);

    expect(screen.getByText("Source page")).toBeTruthy();
    expect(screen.getByText("Notation")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Aceitar" })).toHaveLength(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Localizar" })[1]);
    expect(onLocateProposal).toHaveBeenCalledWith(safeProposal);

    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));
    await waitFor(() => expect(state.decide).toHaveBeenCalledWith("score-1", "revision-1", "proposal-1", "accept", expect.any(AbortSignal)));
    await waitFor(() => expect(onScoreChange).toHaveBeenCalledWith(updated));
  });

  it("allows rejecting an unsafe pending proposal and then undoing that rejection", async () => {
    const rejected = {
      ...baseScore,
      reviewRevision: "revision-2",
      updatedAt: "2026-10-20T12:02:00.000Z",
      validation: {
        ...baseScore.validation!,
        visualReview: { ...baseScore.validation!.visualReview!, proposals: [safeProposal, { ...safeProposal, id: "unsafe", applicable: false, status: "rejected" }] }
      }
    } as Score;
    state.decide.mockResolvedValue(rejected);
    render(<GuidedScoreReview score={baseScore} />);

    expect(screen.getAllByRole("button", { name: "Aceitar" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Recusar" })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Recusar" })[1]);
    await waitFor(() => expect(state.decide).toHaveBeenCalledWith("score-1", "revision-1", "unsafe", "reject", expect.any(AbortSignal)));

    fireEvent.click(await screen.findByRole("button", { name: "Desfazer" }));
    await waitFor(() => expect(state.decide).toHaveBeenLastCalledWith("score-1", "revision-2", "unsafe", "undo", expect.any(AbortSignal)));
  });

  it("labels automatic rejection honestly and offers reconsideration", async () => {
    const autoRejected = {
      ...baseScore,
      validation: {
        ...baseScore.validation!,
        visualReview: {
          ...baseScore.validation!.visualReview!,
          proposals: [{ ...safeProposal, status: "rejected" }],
          history: [{ proposalId: safeProposal.id, decision: "reject", actorId: "system:automatic_delivery_v1" }]
        }
      }
    } as unknown as Score;
    state.decide.mockResolvedValue({ ...autoRejected, reviewRevision: "revision-2" });
    render(<GuidedScoreReview score={autoRejected} />);

    expect(screen.getByText("Não aplicada automaticamente")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reavaliar sugestão" }));
    await waitFor(() => expect(state.decide).toHaveBeenCalledWith("score-1", "revision-1", safeProposal.id, "undo", expect.any(AbortSignal)));
  });

  it("refreshes the score when a revision-guarded decision is stale", async () => {
    const refreshed = { ...baseScore, reviewRevision: "revision-3", updatedAt: "2026-10-20T12:05:00.000Z" } as Score;
    const { ApiError } = await import("../api/client.js");
    state.decide.mockRejectedValue(new ApiError("stale", 409));
    state.api.mockResolvedValue({ score: refreshed });
    const onScoreChange = vi.fn();
    render(<GuidedScoreReview score={baseScore} onScoreChange={onScoreChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/mudou em outra sessão|changed in another session/i);
    expect(state.api).toHaveBeenCalledWith("/api/scores/score-1", { signal: expect.any(AbortSignal) });
    expect(onScoreChange).toHaveBeenCalledWith(refreshed);
  });

  it("aborts an in-flight decision and drops its callback when the session changes", async () => {
    let finishDecision!: (score: Score) => void;
    let decisionSignal!: AbortSignal;
    state.decide.mockImplementation((_scoreId, _revision, _proposalId, _decision, signal) => {
      decisionSignal = signal;
      return new Promise((resolve) => { finishDecision = resolve; });
    });
    const onScoreChange = vi.fn();
    render(<GuidedScoreReview score={baseScore} onScoreChange={onScoreChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));
    await waitFor(() => expect(state.decide).toHaveBeenCalled());
    window.dispatchEvent(new Event("score-to-musicxml:session-changed"));
    expect(decisionSignal.aborted).toBe(true);
    finishDecision({ ...baseScore, reviewRevision: "revision-2" } as Score);
    await waitFor(() => expect(onScoreChange).not.toHaveBeenCalled());
  });

  it("submits rejection and undo as revision-guarded proposal decisions", async () => {
    state.decide.mockResolvedValue({ ...baseScore, reviewRevision: "revision-2" });
    const rejectedScore = {
      ...baseScore,
      validation: {
        ...baseScore.validation!,
        visualReview: { ...baseScore.validation!.visualReview!, proposals: [{ ...safeProposal, status: "pending" }, { ...safeProposal, id: "unsafe", applicable: false }] }
      }
    } as Score;
    const view = render(<GuidedScoreReview score={rejectedScore} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Recusar" })[0]);
    await waitFor(() => expect(state.decide).toHaveBeenCalledWith("score-1", "revision-1", "proposal-1", "reject", expect.any(AbortSignal)));

    const acceptedScore = {
      ...baseScore,
      reviewRevision: "revision-2",
      updatedAt: "2026-10-20T12:02:00.000Z",
      validation: {
        ...baseScore.validation!,
        visualReview: { ...baseScore.validation!.visualReview!, proposals: [{ ...safeProposal, status: "accepted" }, { ...safeProposal, id: "unsafe", applicable: false }] }
      }
    } as Score;
    view.rerender(<GuidedScoreReview score={acceptedScore} />);
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    await waitFor(() => expect(state.decide).toHaveBeenLastCalledWith("score-1", "revision-2", "proposal-1", "undo", expect.any(AbortSignal)));
  });
});

describe("score version history", () => {
  it("marks the current version, opens an immutable selected version, and exports it on request", async () => {
    state.versions.mockResolvedValue([currentVersion, previousVersion]);
    state.versionXml.mockResolvedValue("<score-partwise id='old'/>");
    state.download.mockResolvedValue(undefined);
    const onOpenVersion = vi.fn();
    render(<ScoreVersionHistory score={baseScore} onOpenVersion={onOpenVersion} />);

    expect(await screen.findByText(/Atual/)).toBeTruthy();
    expect(await screen.findByText(/disponível/)).toBeTruthy();
    expect(screen.getByText(/1 de 2 páginas|1 of 2 pages/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Abrir" })[1]);
    await waitFor(() => expect(onOpenVersion).toHaveBeenCalledWith(previousVersion, "<score-partwise id='old'/>") );
    expect(state.versionXml).toHaveBeenCalledWith("score-1", previousVersion.id, expect.any(AbortSignal));
    expect(await screen.findByRole("status")).toHaveTextContent(/Aberta: Review 1/);

    fireEvent.click(screen.getAllByRole("button", { name: "Exportar" })[1]);
    await waitFor(() => expect(state.download).toHaveBeenCalledWith("score-1", previousVersion.id, "Study-correction-revision-old.musicxml", expect.any(AbortSignal)));
  });

  it("marks a version unavailable when its historical MusicXML has expired", async () => {
    state.versions.mockResolvedValue([currentVersion, previousVersion]);
    const { ApiError } = await import("../api/client.js");
    state.versionXml.mockRejectedValue(new ApiError("gone", 410));
    render(<ScoreVersionHistory score={baseScore} onOpenVersion={vi.fn()} />);
    await screen.findByText("Review 1");

    fireEvent.click(screen.getAllByRole("button", { name: "Abrir" })[1]);
    expect(await screen.findByText("Esta versão não está mais disponível.")).toBeTruthy();
    expect(screen.getAllByText("Arquivo indisponível")).toHaveLength(1);
    expect((screen.getAllByRole("button", { name: "Exportar" })[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it("aborts historical export when the account session changes", async () => {
    let finishExport!: (value: void) => void;
    let exportSignal!: AbortSignal;
    state.versions.mockResolvedValue([currentVersion, previousVersion]);
    state.download.mockImplementation((_scoreId, _versionId, _filename, signal) => {
      exportSignal = signal;
      return new Promise((resolve) => { finishExport = resolve; });
    });
    render(<ScoreVersionHistory score={baseScore} onOpenVersion={vi.fn()} />);
    await screen.findByText("Review 1");
    fireEvent.click(screen.getAllByRole("button", { name: "Exportar" })[1]);
    await waitFor(() => expect(state.download).toHaveBeenCalled());

    window.dispatchEvent(new Event("score-to-musicxml:session-changed"));
    expect(exportSignal.aborted).toBe(true);
    finishExport(undefined);
    await waitFor(() => expect(screen.queryByText(/Arquivo exportado/)).toBeNull());
  });

  it("does not open an old-version preview after the account session changes", async () => {
    let finishPreview!: (musicXml: string) => void;
    let previewSignal!: AbortSignal;
    state.versions.mockResolvedValue([currentVersion, previousVersion]);
    state.versionXml.mockImplementation((_scoreId, _versionId, signal) => {
      previewSignal = signal;
      return new Promise((resolve) => { finishPreview = resolve; });
    });
    const onOpenVersion = vi.fn();
    render(<ScoreVersionHistory score={baseScore} onOpenVersion={onOpenVersion} />);
    await screen.findByText("Review 1");
    fireEvent.click(screen.getAllByRole("button", { name: "Abrir" })[1]);
    await waitFor(() => expect(state.versionXml).toHaveBeenCalled());

    window.dispatchEvent(new Event("score-to-musicxml:session-changed"));
    expect(previewSignal.aborted).toBe(true);
    finishPreview("<score-partwise />");
    await waitFor(() => expect(onOpenVersion).not.toHaveBeenCalled());
  });
});
