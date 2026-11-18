// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Score } from "../types/domain.js";
import { FirstPagePreview } from "./FirstPagePreview.js";

const testState = vi.hoisted(() => ({
  fetch: vi.fn(),
  player: vi.fn()
}));

vi.mock("../api/client.js", () => ({
  ApiError: class ApiError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
  },
  fetchFirstPagePreview: testState.fetch
}));
vi.mock("./ScorePlayer.js", () => ({
  ScorePlayer: (props: { allowPlayback?: boolean; musicXml?: string; scoreName: string }) => {
    testState.player(props);
    return <div data-testid="preview-player" data-allow-playback={String(props.allowPlayback)} data-music-xml={props.musicXml} />;
  }
}));

const revision = "a".repeat(64);
const baseScore = {
  id: "score-1",
  userId: "user-1",
  originalFilename: "Estudo.pdf",
  attempts: [{
    id: "attempt-2", scoreId: "score-1", kind: "manual", status: "processing", errorCode: null, errorMessage: null,
    coverage: null, musicxmlFilename: null, createdAt: "2026-10-16T12:00:00.000Z", startedAt: "2026-10-16T12:00:01.000Z", finishedAt: null
  }],
  conversionProgress: {
    attemptId: "attempt-2", stage: "validating", totalPages: 4, currentPage: 3,
    completedPages: [1], failedPages: [], excludedPages: [], reusedPages: [], updatedAt: "2026-10-16T12:00:02.000Z"
  },
  conversionPreview: {
    attemptId: "attempt-2", revision, page: 1, totalPages: 4, createdAt: "2026-10-16T12:00:02.000Z", warnings: []
  }
} as unknown as Score;

beforeEach(() => {
  Object.defineProperty(window.navigator, "language", { configurable: true, value: "pt-BR" });
  testState.fetch.mockReset();
  testState.player.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe("web FirstPagePreview", () => {
  it("loads the current revision into a notation-only player and labels it provisional", async () => {
    testState.fetch.mockResolvedValue("<score-partwise />");

    render(<FirstPagePreview score={baseScore} />);

    expect(screen.getByRole("region", { name: "Prévia da primeira página" })).toBeInTheDocument();
    expect(screen.getByText("Página 1 de 4")).toBeInTheDocument();
    expect(screen.getByText(/provisória e ainda não foi conferida com o original/)).toBeInTheDocument();
    expect(await screen.findByTestId("preview-player")).toHaveAttribute("data-allow-playback", "false");
    expect(screen.getByTestId("preview-player")).toHaveAttribute("data-music-xml", "<score-partwise />");
    expect(testState.fetch).toHaveBeenCalledWith("score-1", revision, expect.any(AbortSignal));
  });

  it("does not let a response for an older attempt replace the current preview", async () => {
    let resolveOld: ((xml: string) => void) | undefined;
    testState.fetch
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce("<score-partwise id='current'/>");
    const view = render(<FirstPagePreview score={baseScore} />);
    await waitFor(() => expect(testState.fetch).toHaveBeenCalledTimes(1));

    const nextScore = {
      ...baseScore,
      attempts: [
        { ...baseScore.attempts![0], id: "attempt-3" },
        ...baseScore.attempts!.map((attempt) => ({ ...attempt, status: "complete" as const }))
      ],
      conversionProgress: { ...baseScore.conversionProgress!, attemptId: "attempt-3" },
      conversionPreview: { ...baseScore.conversionPreview!, attemptId: "attempt-3", revision: "b".repeat(64) }
    } as unknown as Score;
    view.rerender(<FirstPagePreview score={nextScore} />);

    expect(await screen.findByTestId("preview-player")).toHaveAttribute("data-music-xml", "<score-partwise id='current'/>");
    await act(async () => resolveOld?.("<score-partwise id='old'/ >"));
    expect(screen.getByTestId("preview-player")).toHaveAttribute("data-music-xml", "<score-partwise id='current'/>");
  });

  it("shows an expired preview calmly and offers retry for a connection error", async () => {
    const { ApiError } = await import("../api/client.js");
    testState.fetch.mockRejectedValueOnce(new ApiError("gone", 410));
    const view = render(<FirstPagePreview score={baseScore} />);
    expect(await screen.findByText("Esta prévia não está mais disponível. A conversão continua.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).not.toBeInTheDocument();

    testState.fetch.mockRejectedValueOnce(new ApiError("offline", 0));
    view.rerender(<FirstPagePreview score={{ ...baseScore, conversionPreview: { ...baseScore.conversionPreview!, revision: "c".repeat(64) } }} />);
    expect(await screen.findByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    testState.fetch.mockResolvedValueOnce("<score-partwise />");
    view.getByRole("button", { name: "Tentar novamente" }).click();
    expect(await screen.findByTestId("preview-player")).toBeInTheDocument();
  });
});
