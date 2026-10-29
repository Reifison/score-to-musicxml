// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Score } from "../api/types";
import { FirstPagePreview } from "./FirstPagePreview";

const testState = vi.hoisted(() => ({ fetch: vi.fn(), render: vi.fn() }));

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-native", () => ({
  ActivityIndicator: () => <span>Loading</span>,
  Pressable: ({ children, onPress }: { children: ReactNode; onPress?: () => void }) => <button onClick={onPress}>{children}</button>,
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children, accessibilityLabel }: { children: ReactNode; accessibilityLabel?: string }) => <section aria-label={accessibilityLabel}>{children}</section>
}));
vi.mock("../adaptive/AdaptiveTypography", () => ({ AdaptiveText: ({ children }: { children: ReactNode }) => <span>{children}</span> }));
vi.mock("../api/client", () => ({
  ApiError: class ApiError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
  },
  api: { firstPagePreview: testState.fetch }
}));
vi.mock("../i18n", () => ({
  useTranslation: () => ({
    t: (portuguese: string, english: string, args?: Record<string, unknown>) => {
      const source = portuguese;
      return source.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => String(args?.[key] ?? "")) || english;
    }
  })
}));
vi.mock("../theme/styles", () => ({ colors: { panel: "#fff", line: "#ddd", primary: "#f64", primaryDark: "#b43", muted: "#777", warning: "#a60", surfaceSoft: "#f4f0e8", danger: "#b33", ink: "#333" }, sharedStyles: { button: {}, buttonSecondary: {}, buttonText: {}, buttonTextSecondary: {} } }));
vi.mock("../player/ScorePlayerWebView", () => ({
  ScorePlayerWebView: (props: { firstPagePreview: { attemptId: string; revision: string; musicXml: string } }) => {
    testState.render(props);
    return <div data-testid="readonly-preview" data-attempt={props.firstPagePreview.attemptId} data-xml={props.firstPagePreview.musicXml} />;
  }
}));

const revision = "a".repeat(64);
const score = {
  id: "score-1", userId: "user-1", originalFilename: "Study.pdf", storedFilename: "score.pdf", fileType: "pdf", mimeType: "application/pdf", fileSize: 100,
  uploadStatus: "converted", conversionStatus: "converted", errorMessage: null, warnings: null, confidence: null, musicxmlFilename: "final.musicxml",
  attempts: [{ id: "attempt-2", scoreId: "score-1", kind: "manual", status: "processing", errorCode: null, errorMessage: null, coverage: null, musicxmlFilename: null,
    createdAt: "2026-10-16T12:00:00.000Z", startedAt: "2026-10-16T12:00:01.000Z", finishedAt: null }],
  conversionProgress: { attemptId: "attempt-2", stage: "validating", totalPages: 4, currentPage: 3, completedPages: [1], failedPages: [], excludedPages: [], reusedPages: [], updatedAt: "2026-10-16T12:00:02.000Z" },
  conversionPreview: { attemptId: "attempt-2", revision, page: 1, totalPages: 4, createdAt: "2026-10-16T12:00:02.000Z", warnings: [] },
  isFavorite: false, createdAt: "2026-10-16T10:00:00.000Z", updatedAt: "2026-10-16T12:00:00.000Z", convertedAt: "2026-10-16T10:00:00.000Z"
} as unknown as Score;

beforeEach(() => {
  testState.fetch.mockReset();
  testState.render.mockReset();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("mobile FirstPagePreview", () => {
  it("labels the preview, requests the current revision and passes it to the read-only player", async () => {
    testState.fetch.mockResolvedValue("<score-partwise />");

    render(<FirstPagePreview score={score} sessionUserId="user-1" token="session-token" />);

    expect(screen.getByText("Prévia da primeira página")).toBeTruthy();
    expect(screen.getByText("Página 1 de 4")).toBeTruthy();
    expect(screen.getByText(/provisória e ainda não foi conferida com o original/)).toBeTruthy();
    expect(await screen.findByTestId("readonly-preview")).toBeTruthy();
    expect(testState.fetch).toHaveBeenCalledWith("session-token", "score-1", revision, expect.any(AbortSignal));
    expect(testState.render).toHaveBeenCalledWith(expect.objectContaining({ firstPagePreview: expect.objectContaining({ musicXml: "<score-partwise />" }) }));
  });

  it("scopes the response to the signed-in account and ignores an earlier request", async () => {
    let resolveOld: ((xml: string) => void) | undefined;
    testState.fetch
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce("<score-partwise id='current'/>");
    const view = render(<FirstPagePreview score={score} sessionUserId="user-1" token="token-1" />);
    await waitFor(() => expect(testState.fetch).toHaveBeenCalledTimes(1));
    view.rerender(<FirstPagePreview score={score} sessionUserId="user-2" token="token-2" />);

    expect((await screen.findByTestId("readonly-preview")).getAttribute("data-xml")).toBe("<score-partwise id='current'/>");
    await act(async () => resolveOld?.("<score-partwise id='old'/ >"));
    expect(screen.getByTestId("readonly-preview").getAttribute("data-xml")).toBe("<score-partwise id='current'/>");
  });

  it("handles an expired preview without exposing a server error", async () => {
    const { ApiError } = await import("../api/client");
    testState.fetch.mockRejectedValue(new ApiError("internal details", 404));

    render(<FirstPagePreview score={score} sessionUserId="user-1" token="token-1" />);

    expect(await screen.findByText("Esta prévia não está mais disponível. A conversão continua.")).toBeTruthy();
    expect(screen.queryByText("internal details")).toBeNull();
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
  });

  it("does not reveal preview metadata or request XML without an authenticated session", () => {
    render(<FirstPagePreview score={score} sessionUserId="" token="" />);

    expect(screen.queryByText("Prévia da primeira página")).toBeNull();
    expect(testState.fetch).not.toHaveBeenCalled();
  });
});
