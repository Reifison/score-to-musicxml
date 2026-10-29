// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Score, ScoreVersion, VisualCorrectionProposal } from "../api/types";

const state = vi.hoisted(() => ({
  decide: vi.fn(),
  score: vi.fn(),
  versions: vi.fn(),
  versionXml: vi.fn(),
  download: vi.fn(),
  share: vi.fn(),
  auth: { token: "session-token" as string | null, user: { id: "user-1" } as { id: string } | null },
  previewLayout: null as ((event: { nativeEvent: { layout: { width: number } } }) => void) | null,
  previewStyle: null as unknown,
  previewSectionStyles: [] as unknown[]
}));

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-sharing", () => ({ isAvailableAsync: vi.fn(async () => true), shareAsync: state.share }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => state.auth }));
vi.mock("../api/client", () => ({
  ApiError: class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } },
  api: {
    decideVisualReviewProposal: state.decide,
    score: state.score,
    scoreVersions: state.versions,
    scoreVersionMusicXml: state.versionXml,
    downloadScoreVersionMusicXml: state.download
  }
}));
vi.mock("react-native", () => ({
  Pressable: ({ children, onPress, disabled, accessibilityLabel }: { children: ReactNode; onPress?: () => void; disabled?: boolean; accessibilityLabel?: string }) => <button aria-label={accessibilityLabel} disabled={disabled} onClick={onPress}>{children}</button>,
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  View: ({ children, accessibilityLabel, onLayout, testID, style }: { children: ReactNode; accessibilityLabel?: string; onLayout?: (event: { nativeEvent: { layout: { width: number } } }) => void; testID?: string; style?: unknown }) => {
    if (testID === "guided-review-previews") {
      state.previewLayout = onLayout ?? null;
      state.previewStyle = style;
    }
    if (testID === "guided-review-preview-section") state.previewSectionStyles.push(style);
    return <div aria-label={accessibilityLabel} data-testid={testID}>{children}</div>;
  }
}));
vi.mock("../adaptive/AdaptiveTypography", () => ({ AdaptiveText: ({ children }: { children: ReactNode }) => <span>{children}</span> }));
vi.mock("../i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../i18n")>();
  return { ...actual, useTranslation: () => ({ t: actual.t, language: "pt" }) };
});

import { GuidedScoreReview } from "./GuidedScoreReview";
import { ScoreVersionHistory } from "./ScoreVersionHistory";

const proposal: VisualCorrectionProposal = {
  id: "proposal-1", status: "pending", segmentId: "segment-1", page: 1, partId: "P1", partIndex: 0, measureIndex: 0, measure: "3", noteIndex: 0,
  before: { kind: "note", step: "C", alter: 0, octave: 4, duration: 1, type: "quarter" },
  after: { kind: "rest", duration: 1, type: "quarter" }, applicable: true, reason: "Source linked", differences: ["pitch"]
};
const baseScore = {
  id: "score-1", userId: "user-1", originalFilename: "Study.pdf", storedFilename: "study.pdf", fileType: "pdf", mimeType: "application/pdf", fileSize: 100,
  uploadStatus: "converted", conversionStatus: "converted", errorMessage: null, warnings: null, confidence: null, musicxmlFilename: "study.musicxml", isFavorite: false,
  createdAt: "2026-10-20T12:00:00.000Z", updatedAt: "2026-10-20T12:00:00.000Z", convertedAt: "2026-10-20T12:00:00.000Z", reviewRevision: "revision-1",
  validation: { issues: [], visualReview: { status: "completed", proposals: [proposal, { ...proposal, id: "unsafe", applicable: false }], unknownMeasures: 0, history: [] } }
} as unknown as Score;
const currentVersion: ScoreVersion = {
  id: "attempt:attempt-2", label: "Conversion 2", createdAt: "2026-10-20T12:00:00.000Z", kind: "conversion", revision: "revision-current", isCurrent: true,
  status: "approved", coverage: { totalPages: 2, processedPages: 2, missingPages: [] }, available: true
};
const previousVersion: ScoreVersion = { ...currentVersion, id: "revision:revision-old", label: "Review 1", kind: "correction", revision: "revision-old", isCurrent: false };

beforeEach(() => {
  vi.clearAllMocks();
  state.previewSectionStyles = [];
  state.auth = { token: "session-token", user: { id: "user-1" } };
  state.versions.mockResolvedValue({ versions: [currentVersion, previousVersion] });
});
afterEach(cleanup);

describe("mobile guided score review", () => {
  it("allows rejecting an unsafe pending suggestion without offering acceptance", async () => {
    state.decide.mockResolvedValue({ score: baseScore });
    render(<GuidedScoreReview score={baseScore} />);

    expect(screen.getAllByRole("button", { name: "Aceitar" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Recusar" })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Recusar" })[1]);
    await waitFor(() => expect(state.decide).toHaveBeenCalledWith("session-token", "score-1", "revision-1", "unsafe", "reject", expect.any(AbortSignal)));
  });

  it("labels automatic rejection honestly and sends undo when reconsidered", async () => {
    const autoRejected = {
      ...baseScore,
      validation: {
        ...baseScore.validation!,
        visualReview: {
          ...baseScore.validation!.visualReview!,
          proposals: [{ ...proposal, status: "rejected" }],
          history: [{ proposalId: proposal.id, decision: "reject", actorId: "system:automatic_delivery_v1" }]
        }
      }
    } as unknown as Score;
    state.decide.mockResolvedValue({ score: { ...autoRejected, reviewRevision: "revision-2" } });
    render(<GuidedScoreReview score={autoRejected} />);

    expect(screen.getByText("Não aplicada automaticamente")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reavaliar sugestão" }));
    await waitFor(() => expect(state.decide).toHaveBeenCalledWith("session-token", "score-1", "revision-1", proposal.id, "undo", expect.any(AbortSignal)));
  });

  it("uses the measured width to keep previews full width or fit two explicit columns", () => {
    render(<GuidedScoreReview score={baseScore} />);
    const flattenedStyles = (value: unknown) => (Array.isArray(value) ? value : [value]).filter(Boolean) as Array<{ flexDirection?: string; width?: number | string; flexShrink?: number; minWidth?: number }>;
    const wrapperStyle = () => Object.assign({}, ...flattenedStyles(state.previewStyle));
    const childStyles = () => state.previewSectionStyles.slice(-2).map((value) => Object.assign({}, ...flattenedStyles(value)));

    act(() => state.previewLayout?.({ nativeEvent: { layout: { width: 799 } } }));
    expect(wrapperStyle()).toMatchObject({ flexDirection: "column", width: "100%" });
    expect(childStyles().map((style) => style.width)).toEqual(["100%", "100%"]);
    act(() => state.previewLayout?.({ nativeEvent: { layout: { width: 800 } } }));
    expect(wrapperStyle()).toMatchObject({ flexDirection: "row", width: "100%" });
    expect(childStyles()).toEqual([
      expect.objectContaining({ width: 393, flexShrink: 1, minWidth: 0 }),
      expect.objectContaining({ width: 393, flexShrink: 1, minWidth: 0 })
    ]);
  });

  it("uses singular counts and hides empty findings while keeping the proposal empty state", () => {
    const oneProposal = { ...baseScore, validation: { ...baseScore.validation!, visualReview: { ...baseScore.validation!.visualReview!, proposals: [proposal] } } } as Score;
    const { rerender } = render(<GuidedScoreReview score={oneProposal} />);
    expect(screen.getByText("1 apontamento")).toBeTruthy();
    expect(screen.getByText("1 pendente")).toBeTruthy();
    expect(screen.queryByText("Apontamentos")).toBeNull();

    const empty = { ...baseScore, validation: { ...baseScore.validation!, visualReview: { ...baseScore.validation!.visualReview!, proposals: [] } } } as Score;
    rerender(<GuidedScoreReview score={empty} />);
    expect(screen.queryByText("Apontamentos")).toBeNull();
    expect(screen.getByText("Nenhuma sugestão de nota ou pausa disponível.")).toBeTruthy();
  });

  it("submits a safe decision with the current revision", async () => {
    const updated = { ...baseScore, reviewRevision: "revision-2", updatedAt: "2026-10-20T12:02:00.000Z" } as Score;
    state.decide.mockResolvedValue({ score: updated });
    const onScoreChange = vi.fn();
    render(<GuidedScoreReview score={baseScore} onScoreChange={onScoreChange} originalPreview={<span>Source</span>} resultPreview={<span>Notation</span>} />);

    expect(screen.getByText("Source")).toBeTruthy();
    expect(screen.getByText("Notation")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Aceitar" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));

    await waitFor(() => expect(state.decide).toHaveBeenCalledWith("session-token", "score-1", "revision-1", "proposal-1", "accept", expect.any(AbortSignal)));
    expect(onScoreChange).toHaveBeenCalledWith(updated);
  });
});

describe("mobile score version history", () => {
  it("opens the chosen historical version and shares its exported MusicXML", async () => {
    state.versionXml.mockResolvedValue("<score-partwise id='old'/>");
    state.download.mockResolvedValue({ uri: "file:///cache/Study-previous-version.musicxml" });
    const onOpenVersion = vi.fn();
    render(<ScoreVersionHistory score={baseScore} onOpenVersion={onOpenVersion} />);

    await screen.findByText("Review 1");
    expect(screen.getAllByText(/disponível/)).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Abrir" })[1]);
    await waitFor(() => expect(onOpenVersion).toHaveBeenCalledWith(previousVersion, "<score-partwise id='old'/>") );
    expect(state.versionXml).toHaveBeenCalledWith("session-token", "score-1", previousVersion.id, expect.any(AbortSignal));

    fireEvent.click(screen.getAllByRole("button", { name: "Exportar" })[1]);
    await waitFor(() => expect(state.download).toHaveBeenCalledWith("session-token", "score-1", previousVersion.id, "Study-correction-revision-old.musicxml", expect.any(AbortSignal)));
    expect(state.share).toHaveBeenCalledWith("file:///cache/Study-previous-version.musicxml", expect.objectContaining({ mimeType: "application/vnd.recordare.musicxml+xml" }));
  });

  it("aborts an export and does not open sharing after the account signs out", async () => {
    let finishExport!: (file: { uri: string }) => void;
    let exportSignal!: AbortSignal;
    state.download.mockImplementation((_token, _scoreId, _versionId, _filename, signal) => {
      exportSignal = signal;
      return new Promise((resolve) => { finishExport = resolve; });
    });
    const view = render(<ScoreVersionHistory score={baseScore} onOpenVersion={vi.fn()} />);
    await screen.findByText("Review 1");

    fireEvent.click(screen.getAllByRole("button", { name: "Exportar" })[1]);
    await waitFor(() => expect(state.download).toHaveBeenCalled());
    state.auth = { token: null, user: null };
    view.rerender(<ScoreVersionHistory score={baseScore} onOpenVersion={vi.fn()} />);
    expect(exportSignal.aborted).toBe(true);
    finishExport({ uri: "file:///cache/Study-previous-version.musicxml" });
    await waitFor(() => expect(state.share).not.toHaveBeenCalled());
  });
});
