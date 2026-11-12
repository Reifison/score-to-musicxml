// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Score } from "../api/types";
import ScoreDetailsScreen from "../../app/score/[id]";

const testState = vi.hoisted(() => ({
  scoreCache: {} as Record<string, unknown>,
  previewProps: [] as Array<Record<string, unknown>>,
  playerProps: [] as Array<Record<string, unknown>>,
  historyProps: [] as Array<Record<string, unknown>>,
  queryOptions: [] as Array<{ queryKey: unknown[]; enabled: boolean }>,
  scrollTo: vi.fn(),
  playerMounts: { reading: 0, comparison: 0 },
  playerUnmounts: { reading: 0, comparison: 0 },
  userId: "user-1" as string | null,
  token: "session-token" as string | null,
  libraryCache: {} as Record<string, { scores: Score[] }>,
  savedLibraryCache: {} as Record<string, { scores: Score[] }>,
  savedDetails: {} as Record<string, Score | undefined>,
  queryError: null as { status: number } | null,
  queryLoading: false,
  fetchedAfterMount: true
}));

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useQuery: (options: { queryKey: unknown[]; enabled: boolean }) => {
    testState.queryOptions.push(options);
    const userId = options.queryKey[1];
    const score = typeof userId === "string" ? testState.scoreCache[userId] : undefined;
    return { data: score ? { score } : undefined, isLoading: testState.queryLoading, error: testState.queryError,
      isError: Boolean(testState.queryError), isFetchedAfterMount: testState.fetchedAfterMount, refetch: vi.fn() };
  },
  useQueryClient: () => ({
    setQueryData: vi.fn(), invalidateQueries: vi.fn(),
    getQueryData: (key: unknown[]) => typeof key[1] === "string"
      ? (key[0] === "saved-score-library" ? testState.savedLibraryCache[key[1]] : testState.libraryCache[key[1]]) : undefined
  })
}));
vi.mock("expo-sharing", () => ({ isAvailableAsync: vi.fn(async () => false), shareAsync: vi.fn() }));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({ id: "score-1" }) }));
vi.mock("../api/client", () => ({ API_URL: "https://api.example.test", api: {} }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ token: testState.token, user: testState.userId ? { id: testState.userId } : null }) }));
vi.mock("../player/scoreDetailsCache", () => ({
  readCachedScoreDetails: async (userId: string) => testState.savedDetails[userId],
  saveCachedScoreDetails: vi.fn()
}));
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
      notice?: React.ReactNode | ((openDetails: () => void, closeDetails: () => void) => React.ReactNode);
      details: React.ReactNode | ((closeDetails: () => void) => React.ReactNode);
      children: (viewport: { height: number; suspended: boolean; fontScale: number }) => React.ReactNode;
    }) => {
      const [detailsOpen, setDetailsOpen] = React.useState(false);
      const closeDetails = () => setDetailsOpen(false);
      const readingNotice = typeof notice === "function" ? notice(() => setDetailsOpen(true), closeDetails) : notice;
      return <main>
        <header><button onClick={() => setDetailsOpen(true)}>Abrir detalhes do teste</button>{readingNotice}</header>
        <section data-testid="reader-viewport">{children({ height: 500, suspended: false, fontScale: 1 })}</section>
        {detailsOpen ? <aside data-testid="reader-details">{typeof details === "function" ? details(closeDetails) : details}</aside> : null}
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
vi.mock("../player/ScorePlayerWebView", async () => {
  const React = await import("react");
  return { ScorePlayerWebView: (props: Record<string, unknown>) => {
    const kind = props.height === 420 ? "comparison" : "reading";
    const [position, setPosition] = React.useState(0);
    React.useEffect(() => {
      testState.playerMounts[kind] += 1;
      return () => { testState.playerUnmounts[kind] += 1; };
    }, []);
    testState.playerProps.push(props);
    return <div data-testid={kind === "reading" ? "final-score-player" : "comparison-score-player"} data-suspended={String(props.suspended)}>
      <span>Position {position}</span><button onClick={() => setPosition(37)}>Avançar leitor</button>
    </div>;
  } };
});
vi.mock("../components/GuidedScoreReview", () => ({ GuidedScoreReview: (props: { originalPreview: React.ReactNode; resultPreview: React.ReactNode; onLocateIssue: (issue: unknown) => void; onJumpTo: (offset: number) => void }) => <section data-testid="guided-review">
  {props.originalPreview}{props.resultPreview}<button onClick={() => props.onLocateIssue({ severity: "warning", code: "RHYTHM_SHORT", message: "Check this measure", page: 2, measure: "8" })}>Localizar aviso</button>
  <button onClick={() => props.onLocateIssue({ severity: "warning", code: "PAGE_ONLY", message: "Check page", page: 99 })}>Localizar somente página</button>
  <button onClick={() => props.onJumpTo(160)}>Ir aos avisos</button>
</section> }));
vi.mock("../components/ScoreVersionHistory", () => ({ ScoreVersionHistory: (props: Record<string, unknown>) => {
  testState.historyProps.push(props);
  return <section data-testid="version-history">Saved versions</section>;
} }));
vi.mock("../theme/styles", () => ({
  colors: { primary: "#f60", primaryDark: "#a40", onPrimary: "#fff", ink: "#222", muted: "#777", warning: "#a60" },
  sharedStyles: { subtitle: {}, error: {}, button: {}, buttonText: {}, buttonSecondary: {}, buttonTextSecondary: {} }
}));
vi.mock("react-native", async () => {
  const React = await import("react");
  return {
  ActivityIndicator: () => null,
  Alert: { alert: vi.fn() },
  Image: () => <img alt="Original score page" />,
  Pressable: ({ children, onPress, accessibilityRole, accessibilityState }: { children: React.ReactNode; onPress?: () => void; accessibilityRole?: string; accessibilityState?: { selected?: boolean } }) =>
    <button aria-label={typeof children === "string" ? children : undefined} aria-selected={accessibilityState?.selected} onClick={onPress} role={accessibilityRole}>{children}</button>,
  StyleSheet: { create: (styles: unknown) => styles },
  ScrollView: React.forwardRef(({ children }: { children: React.ReactNode }, ref) => {
    React.useImperativeHandle(ref, () => ({ scrollTo: testState.scrollTo }));
    return <div>{children}</div>;
  }),
  View: ({ children, accessibilityElementsHidden, pointerEvents }: { children: React.ReactNode; accessibilityElementsHidden?: boolean; pointerEvents?: string }) =>
    <div aria-hidden={accessibilityElementsHidden} data-pointer-events={pointerEvents}>{children}</div>
  };
});

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
  testState.scrollTo.mockClear();
  testState.playerMounts = { reading: 0, comparison: 0 };
  testState.playerUnmounts = { reading: 0, comparison: 0 };
  testState.userId = "user-1";
  testState.token = "session-token";
  testState.libraryCache = {};
  testState.savedLibraryCache = {};
  testState.savedDetails = {};
  testState.queryError = null;
  testState.queryLoading = false;
  testState.fetchedAfterMount = true;
});
afterEach(() => cleanup());

describe("ScoreDetailsScreen first-page preview visibility", () => {
  it("opens a cached list item immediately while its details are loading", () => {
    const listed = { ...scoreWithPreview(true), conversionPreview: null, attempts: undefined };
    testState.scoreCache = {};
    testState.libraryCache = { "user-1": { scores: [listed] } };
    testState.queryLoading = true;
    render(<ScoreDetailsScreen />);

    expect(screen.getByTestId("final-score-player")).toBeTruthy();
    expect(testState.playerProps.at(-1)?.score).toEqual(listed);
  });

  it("restores complete saved details offline and isolates them across accounts", async () => {
    testState.scoreCache = {};
    testState.queryLoading = true;
    testState.savedDetails = { "user-1": { ...scoreWithPreview(true), conversionPreview: null } };
    const view = render(<ScoreDetailsScreen />);
    await waitFor(() => expect(screen.getByTestId("final-score-player")).toBeTruthy());

    testState.userId = "user-2";
    testState.token = "another-token";
    view.rerender(<ScoreDetailsScreen />);
    expect(screen.queryByTestId("final-score-player")).toBeNull();
  });

  it("does not show cached data after the server denies access", () => {
    testState.scoreCache = {};
    testState.libraryCache = { "user-1": { scores: [{ ...scoreWithPreview(true), conversionPreview: null }] } };
    testState.queryError = { status: 403 };
    render(<ScoreDetailsScreen />);

    expect(screen.queryByTestId("final-score-player")).toBeNull();
    expect(screen.getByText("Não foi possível abrir os dados desta partitura.")).toBeTruthy();
  });

  it("does not reopen a cached score omitted from the saved account library", async () => {
    testState.scoreCache = { "user-1": { ...scoreWithPreview(true), conversionPreview: null } };
    testState.savedLibraryCache = { "user-1": { scores: [] } };
    testState.savedDetails = { "user-1": { ...scoreWithPreview(true), conversionPreview: null } };
    testState.fetchedAfterMount = false;
    const view = render(<ScoreDetailsScreen />);
    await act(async () => Promise.resolve());
    expect(screen.queryByTestId("final-score-player")).toBeNull();

    // A successful new server response can still authorize a direct link.
    testState.fetchedAfterMount = true;
    view.rerender(<ScoreDetailsScreen />);
    expect(screen.getByTestId("final-score-player")).toBeTruthy();
  });

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
    fireEvent.click(screen.getByRole("button", { name: "Localizar somente página" }));
    expect(screen.getByText("Página 2 de 2 do original")).toBeTruthy();
    expect(testState.playerProps.at(-1)?.readingTarget).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Ir aos avisos" }));
    expect(testState.scrollTo).toHaveBeenCalledWith({ y: 160, animated: true });
  });

  it("keeps the reading player mounted and paused while comparing, then restores its position", () => {
    testState.scoreCache = { "user-1": { ...scoreWithPreview(true), conversionPreview: null } };
    render(<ScoreDetailsScreen />);
    const readingPlayer = screen.getByTestId("final-score-player");
    fireEvent.click(screen.getByRole("button", { name: "Avançar leitor" }));
    expect(readingPlayer.textContent).toContain("Position 37");
    expect(readingPlayer.getAttribute("data-suspended")).toBe("false");

    fireEvent.click(screen.getByRole("tab", { name: "Conferir" }));
    expect(screen.getByTestId("final-score-player")).toBe(readingPlayer);
    expect(readingPlayer.getAttribute("data-suspended")).toBe("true");
    expect(readingPlayer.closest('[aria-hidden="true"]')?.getAttribute("data-pointer-events")).toBe("none");
    expect(screen.getByTestId("comparison-score-player").getAttribute("data-suspended")).toBe("false");
    expect(testState.playerProps.filter((props) => props.height === 420).at(-1)?.persistSession).toBe(false);
    expect(testState.playerMounts).toEqual({ reading: 1, comparison: 1 });
    expect(testState.playerUnmounts.reading).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Voltar à partitura" }));
    expect(screen.getByTestId("final-score-player")).toBe(readingPlayer);
    expect(readingPlayer.textContent).toContain("Position 37");
    expect(readingPlayer.getAttribute("data-suspended")).toBe("false");
    expect(screen.queryByTestId("comparison-score-player")).toBeNull();
    expect(testState.playerUnmounts).toEqual({ reading: 0, comparison: 1 });
  });

  it("passes a new score revision to the retained reader before returning", () => {
    const original = { ...scoreWithPreview(true), conversionPreview: null, reviewRevision: "review-1" };
    testState.scoreCache = { "user-1": original };
    const view = render(<ScoreDetailsScreen />);
    const readingPlayer = screen.getByTestId("final-score-player");
    fireEvent.click(screen.getByRole("tab", { name: "Conferir" }));

    const revised = { ...original, reviewRevision: "review-2", updatedAt: "2026-11-09T12:00:00.000Z" };
    testState.scoreCache = { "user-1": revised };
    view.rerender(<ScoreDetailsScreen />);
    expect(testState.playerProps.filter((props) => props.height === 500).at(-1)).toEqual(expect.objectContaining({ score: revised, suspended: true }));
    fireEvent.click(screen.getByRole("button", { name: "Voltar à partitura" }));
    expect(screen.getByTestId("final-score-player")).toBe(readingPlayer);
    expect(testState.playerProps.at(-1)).toEqual(expect.objectContaining({ score: revised, suspended: false }));
    expect(testState.playerMounts.reading).toBe(1);
  });

  it("recreates the retained reader when the signed-in account changes", () => {
    testState.scoreCache = { "user-1": { ...scoreWithPreview(true), conversionPreview: null } };
    const view = render(<ScoreDetailsScreen />);
    const previousPlayer = screen.getByTestId("final-score-player");

    testState.userId = "user-2";
    testState.token = "new-token";
    testState.scoreCache["user-2"] = { ...scoreWithPreview(true), conversionPreview: null };
    view.rerender(<ScoreDetailsScreen />);
    expect(screen.getByTestId("final-score-player")).not.toBe(previousPlayer);
    expect(testState.playerMounts.reading).toBe(2);
    expect(testState.playerUnmounts.reading).toBe(1);
  });

  it("opens the review banner directly, closes details, and offers a clear return to the score", () => {
    testState.scoreCache = { "user-1": { ...scoreWithPreview(true), conversionPreview: null,
      recognitionQuality: { status: "needs_review", sourceComparison: "compared", checkedMeasures: 1, accuracyVerified: false, issues: [] } } };
    render(<ScoreDetailsScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir detalhes do teste" }));
    expect(screen.getByTestId("reader-details")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Revisar partitura com o original" }));
    expect(screen.queryByTestId("reader-details")).toBeNull();
    expect(screen.getByTestId("guided-review")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Conferir" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Voltar à partitura" }));
    expect(screen.queryByTestId("guided-review")).toBeNull();
    expect(screen.getByTestId("final-score-player")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Partitura" }).getAttribute("aria-selected")).toBe("true");
  });

  it("opens review from details and keeps unfinished conversions in details", () => {
    testState.scoreCache = { "user-1": { ...scoreWithPreview(true), conversionPreview: null } };
    const view = render(<ScoreDetailsScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir detalhes do teste" }));
    fireEvent.click(screen.getByRole("button", { name: "Conferir com o original" }));
    expect(screen.queryByTestId("reader-details")).toBeNull();
    expect(screen.getByTestId("guided-review")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Voltar à partitura" }));

    testState.scoreCache = { "user-1": { ...scoreWithPreview(false), conversionPreview: null, resultStatus: "partial" } };
    view.rerender(<ScoreDetailsScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Ver detalhes da conversão" }));
    expect(screen.getByTestId("reader-details")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Conferir com o original" })).toBeNull();
  });

  it("offers comparison for a partial result with available MusicXML", () => {
    testState.scoreCache = { "user-1": { ...scoreWithPreview(true), conversionPreview: null, resultStatus: "partial" } };
    render(<ScoreDetailsScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Conversão parcial · conferir com o original" }));
    expect(screen.getByTestId("guided-review")).toBeTruthy();
    expect(screen.queryByTestId("reader-details")).toBeNull();
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
    fireEvent.click(screen.getByRole("tab", { name: "Conferir" }));
    fireEvent.click(screen.getByRole("button", { name: "Voltar à partitura" }));
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
