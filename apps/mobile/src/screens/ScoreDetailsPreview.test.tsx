// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Score } from "../api/types";
import ScoreDetailsScreen from "../../app/score/[id]";

const testState = vi.hoisted(() => ({
  scoreCache: {} as Record<string, unknown>,
  previewProps: [] as Array<Record<string, unknown>>,
  playerProps: [] as Array<Record<string, unknown>>,
  historyProps: [] as Array<Record<string, unknown>>,
  queryOptions: [] as Array<{ queryKey: unknown[]; enabled: boolean }>,
  userId: "user-1" as string | null,
  token: "session-token" as string | null
}));

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useQuery: (options: { queryKey: unknown[]; enabled: boolean }) => {
    testState.queryOptions.push(options);
    const userId = options.queryKey[1];
    const score = typeof userId === "string" ? testState.scoreCache[userId] : undefined;
    return { data: score ? { score } : undefined, isLoading: false, refetch: vi.fn() };
  },
  useQueryClient: () => ({ setQueryData: vi.fn(), invalidateQueries: vi.fn() })
}));
vi.mock("expo-sharing", () => ({ isAvailableAsync: vi.fn(async () => false), shareAsync: vi.fn() }));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({ id: "score-1" }) }));
vi.mock("../api/client", () => ({ API_URL: "https://api.example.test", api: {} }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ token: testState.token, user: testState.userId ? { id: testState.userId } : null }) }));
vi.mock("../i18n", () => {
  const t = (portuguese: string, _english: string, params?: Record<string, unknown>) =>
    portuguese.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => String(params?.[key] ?? ""));
  return { t, useTranslation: () => ({ language: "pt", t }) };
});
vi.mock("../adaptive/AdaptiveTypography", () => ({ AdaptiveText: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("../components/ScoreReaderLayout", async () => {
  const React = await import("react");
  return {
    ScoreReaderLayout: ({ notice, details, children }: {
      notice?: React.ReactNode | ((openDetails: () => void) => React.ReactNode);
      details: React.ReactNode;
      children: (viewport: { height: number; suspended: boolean; fontScale: number }) => React.ReactNode;
    }) => {
      const [detailsOpen, setDetailsOpen] = React.useState(false);
      const readingNotice = typeof notice === "function" ? notice(() => setDetailsOpen(true)) : notice;
      return <main>
        <header>{readingNotice}</header>
        <section data-testid="reader-viewport">{children({ height: 500, suspended: false, fontScale: 1 })}</section>
        {detailsOpen ? <aside data-testid="reader-details">{details}</aside> : null}
      </main>;
    }
  };
});
vi.mock("../components/ScoreConversionProgress", () => ({ ScoreConversionProgress: () => <div>Conversion progress</div> }));
vi.mock("../components/FirstPagePreview", () => ({
  FirstPagePreview: (props: Record<string, unknown>) => {
    testState.previewProps.push(props);
    return <div data-testid="first-page-preview">Prévia da primeira página</div>;
  }
}));
vi.mock("../components/RecognitionQualityNotice", () => ({ RecognitionQualityNotice: () => null }));
vi.mock("../components/ScoreTypePicker", () => ({ ScoreTypePicker: () => null }));
vi.mock("../components/StatusBadge", () => ({ StatusBadge: () => null }));
vi.mock("../player/ScorePlayerWebView", () => ({ ScorePlayerWebView: (props: Record<string, unknown>) => {
  testState.playerProps.push(props);
  return <div data-testid="final-score-player">Full score player</div>;
} }));
vi.mock("../components/GuidedScoreReview", () => ({ GuidedScoreReview: (props: { originalPreview: React.ReactNode; resultPreview: React.ReactNode; onLocateIssue: (issue: unknown) => void }) => <section data-testid="guided-review">
  {props.originalPreview}{props.resultPreview}<button onClick={() => props.onLocateIssue({ severity: "warning", code: "RHYTHM_SHORT", message: "Check this measure", page: 2, measure: "8" })}>Localizar aviso</button>
</section> }));
vi.mock("../components/ScoreVersionHistory", () => ({ ScoreVersionHistory: (props: Record<string, unknown>) => {
  testState.historyProps.push(props);
  return <section data-testid="version-history">Saved versions</section>;
} }));
vi.mock("../theme/styles", () => ({
  colors: { primary: "#f60", primaryDark: "#a40", onPrimary: "#fff", ink: "#222", muted: "#777", warning: "#a60" },
  sharedStyles: { subtitle: {}, error: {}, button: {}, buttonText: {}, buttonSecondary: {}, buttonTextSecondary: {} }
}));
vi.mock("react-native", () => ({
  ActivityIndicator: () => null,
  Alert: { alert: vi.fn() },
  Image: () => <img alt="Original score page" />,
  Pressable: ({ children, onPress, accessibilityRole }: { children: React.ReactNode; onPress?: () => void; accessibilityRole?: string }) =>
    <button aria-label={typeof children === "string" ? children : undefined} onClick={onPress} role={accessibilityRole}>{children}</button>,
  StyleSheet: { create: (styles: unknown) => styles },
  ScrollView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

const revision = "a".repeat(64);
function scoreWithPreview(hasFinalScore: boolean): Score {
  return {
    id: "score-1",
    userId: "user-1",
    originalFilename: "Study.pdf",
    storedFilename: "study.pdf",
    fileType: "pdf",
    mimeType: "application/pdf",
    fileSize: 500,
    uploadStatus: "converted",
    conversionStatus: hasFinalScore ? "converted" : "processing",
    resultStatus: hasFinalScore ? "complete" : null,
    errorMessage: null,
    warnings: null,
    confidence: null,
    musicxmlFilename: hasFinalScore ? "final.musicxml" : null,
    scoreType: "piano",
    scoreTypeSelected: true,
    attempts: [{
      id: "attempt-2", scoreId: "score-1", kind: "manual", status: "processing", errorCode: null, errorMessage: null,
      coverage: null, musicxmlFilename: null, createdAt: "2026-10-16T12:00:00.000Z", startedAt: "2026-10-16T12:00:01.000Z", finishedAt: null
    }],
    conversionProgress: {
      attemptId: "attempt-2", stage: "validating", totalPages: 4, currentPage: 3, completedPages: [1],
      failedPages: [], excludedPages: [], reusedPages: [], updatedAt: "2026-10-16T12:00:02.000Z"
    },
    conversionPreview: {
      attemptId: "attempt-2", revision, page: 1, totalPages: 4, createdAt: "2026-10-16T12:00:02.000Z", warnings: []
    },
    isFavorite: false,
    createdAt: "2026-10-16T10:00:00.000Z",
    updatedAt: "2026-10-16T12:00:00.000Z",
    convertedAt: hasFinalScore ? "2026-10-16T10:00:00.000Z" : null
  } as unknown as Score;
}

beforeEach(() => {
  testState.scoreCache = { "user-1": scoreWithPreview(false) };
  testState.previewProps = [];
  testState.queryOptions = [];
  testState.playerProps = [];
  testState.historyProps = [];
  testState.userId = "user-1";
  testState.token = "session-token";
});
afterEach(() => cleanup());

describe("ScoreDetailsScreen first-page preview visibility", () => {
  it("shows an active first-page preview in the initial reading viewport", () => {
    render(<ScoreDetailsScreen />);

    expect(screen.getByTestId("reader-viewport").querySelector("[data-testid='first-page-preview']")).toBeTruthy();
    expect(screen.queryByTestId("final-score-player")).toBeNull();
    expect(testState.previewProps[0]).toEqual(expect.objectContaining({ height: 500, suspended: false, fontScale: 1, scrollable: true, token: "session-token" }));
  });

  it("keeps a prior full score in the viewport and exposes the retry preview from its banner", () => {
    testState.scoreCache = { "user-1": scoreWithPreview(true) };
    render(<ScoreDetailsScreen />);

    expect(screen.getByTestId("reader-viewport").querySelector("[data-testid='final-score-player']")).toBeTruthy();
    expect(screen.queryByTestId("first-page-preview")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Prévia da página 1 de 4/ }));
    expect(screen.getByTestId("reader-details").querySelector("[data-testid='first-page-preview']")).toBeTruthy();
    expect(screen.getByTestId("reader-viewport").querySelector("[data-testid='final-score-player']")).toBeTruthy();
  });

  it("scopes cached score data to the signed-in account and hides it after logout", () => {
    const view = render(<ScoreDetailsScreen />);
    expect(screen.getByTestId("first-page-preview")).toBeTruthy();
    expect(testState.queryOptions.at(-1)).toEqual(expect.objectContaining({ queryKey: ["score", "user-1", "score-1"], enabled: true }));

    testState.userId = "user-2";
    testState.token = "another-session-token";
    view.rerender(<ScoreDetailsScreen />);
    expect(testState.queryOptions.at(-1)).toEqual(expect.objectContaining({ queryKey: ["score", "user-2", "score-1"], enabled: true }));
    expect(screen.queryByTestId("first-page-preview")).toBeNull();

    testState.userId = null;
    testState.token = null;
    view.rerender(<ScoreDetailsScreen />);
    expect(testState.queryOptions.at(-1)).toEqual(expect.objectContaining({ queryKey: ["score", null, "score-1"], enabled: false }));
    expect(screen.queryByTestId("first-page-preview")).toBeNull();
    expect(screen.queryByTestId("final-score-player")).toBeNull();
  });
  it("opens guided review in the workspace and locates an issue in both source and notation", () => {
    testState.scoreCache = { "user-1": { ...scoreWithPreview(true), conversionPreview: null, coverage: { totalPages: 2, processedPages: [1, 2], missingPages: [], pages: [] } } };
    render(<ScoreDetailsScreen />);
    fireEvent.click(screen.getByRole("tab", { name: "Conferir" }));
    expect(screen.getByTestId("reader-viewport").querySelector("[data-testid='guided-review']")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Localizar aviso" }));
    expect(screen.getByText("Página 2 de 2 do original")).toBeTruthy();
    expect(testState.playerProps.at(-1)?.readingTarget).toEqual(expect.objectContaining({ measure: "8" }));
  });

  it("opens a prior version as view-only, restores current view and ignores old-account callbacks", () => {
    testState.scoreCache = { "user-1": { ...scoreWithPreview(true), conversionPreview: null } };
    const view = render(<ScoreDetailsScreen />);
    fireEvent.click(screen.getByRole("tab", { name: "Versões" }));
    const open = testState.historyProps.at(-1)?.onOpenVersion as (version: unknown, xml: string) => void;
    const oldVersion = { id: "revision:old", revision: "old-revision", isCurrent: false };
    act(() => open(oldVersion, "<score-partwise />"));
    expect(screen.getByText("Versão anterior · somente visualização")).toBeTruthy();
    expect(testState.playerProps.at(-1)?.versionPreview).toEqual({ versionId: "revision:old", revision: "old-revision", musicXml: "<score-partwise />" });
    fireEvent.click(screen.getByRole("button", { name: "Voltar à atual" }));
    expect(testState.playerProps.at(-1)?.versionPreview).toBeUndefined();
    testState.userId = "user-2";
    testState.token = "new-token";
    testState.scoreCache["user-2"] = { ...scoreWithPreview(true), conversionPreview: null };
    view.rerender(<ScoreDetailsScreen />);
    act(() => open(oldVersion, "<score-partwise />"));
    expect(screen.queryByText("Versão anterior · somente visualização")).toBeNull();
  });

});
