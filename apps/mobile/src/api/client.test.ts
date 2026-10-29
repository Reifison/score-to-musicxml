import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let api: typeof import("./client").api;

const testState = vi.hoisted(() => ({
  events: [] as string[],
  clearScore: vi.fn(),
  clearScores: vi.fn()
}));

vi.mock("expo-file-system", () => ({
  Directory: class Directory {},
  File: class File {},
  Paths: { cache: {} }
}));

vi.mock("../player/sessionSnapshot", () => ({
  clearPlayerSessionSnapshotsForScore: testState.clearScore,
  clearPlayerSessionSnapshotsForScores: testState.clearScores
}));

function response(body = "{}", status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body
  } as Response;
}

function stubFetch(result: Response) {
  const fetchMock = vi.fn(async () => {
    testState.events.push("api-response");
    return result;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(async () => {
  vi.stubGlobal("__DEV__", true);
  testState.events.length = 0;
  testState.clearScore.mockReset().mockImplementation(async () => {
    testState.events.push("snapshot-clear");
  });
  testState.clearScores.mockReset().mockImplementation(async () => {
    testState.events.push("snapshots-clear");
  });
  ({ api } = await import("./client"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("score deletion snapshot invalidation", () => {
  it("clears one score only after the API confirms deletion", async () => {
    stubFetch(response());

    await api.deleteScore("token", "score-1", "user-1");

    expect(testState.events).toEqual(["api-response", "snapshot-clear"]);
    expect(testState.clearScore).toHaveBeenCalledWith("score-1", "user-1");
  });

  it("does not invalidate snapshots when the server rejects a deletion", async () => {
    stubFetch(response('{"error":"Não autorizado."}', 403));

    await expect(api.deleteScore("token", "score-1", "user-1")).rejects.toMatchObject({ status: 403 });

    expect(testState.clearScore).not.toHaveBeenCalled();
  });

  it("clears the selected scores after bulk deletion but preserves snapshots for favorites", async () => {
    stubFetch(response('{"deletedCount":2}'));

    await api.bulkScores("token", ["score-1", "score-2"], "delete");

    expect(testState.events).toEqual(["api-response", "snapshots-clear"]);
    expect(testState.clearScores).toHaveBeenCalledWith(["score-1", "score-2"], undefined);

    testState.clearScores.mockClear();
    stubFetch(response('{"updatedCount":2}'));
    await api.bulkScores("token", ["score-1", "score-2"], "favorite", true, "user-1");

    expect(testState.clearScores).not.toHaveBeenCalled();
  });
});

describe("localized server errors", () => {
  async function selectLanguage(value: "pt" | "en") {
    const { configureLanguageController } = await import("../i18n");
    configureLanguageController({ getLanguage: () => value, initialize: async () => value,
      setLanguage: async () => undefined, subscribe: () => () => undefined });
  }
  afterEach(async () => selectLanguage("pt"));

  it("keeps cached error messages in sync with the selected language and preserves the code", async () => {
    const { ApiError, apiRequest } = await import("./client");
    const fetchMock = stubFetch(response('{"error":"E-mail ou senha inválidos.","code":"INVALID_CREDENTIALS"}', 401));
    await selectLanguage("en");
    let error: unknown;
    try { await apiRequest("/api/auth/login"); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "INVALID_CREDENTIALS", status: 401, message: "Invalid email or password." });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((call[1].headers as Headers).get("Accept-Language")).toBe("en-US");
    await selectLanguage("pt");
    expect((error as Error).message).toBe("E-mail ou senha inválidos.");
  });

  it("reports connection failures in the selected language", async () => {
    const { apiRequest } = await import("./client");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await selectLanguage("en");
    await expect(apiRequest("/health")).rejects.toMatchObject({ code: "NETWORK_ERROR", message: "Network request failed. Check your internet connection." });
    await selectLanguage("pt");
    await expect(apiRequest("/health")).rejects.toMatchObject({ code: "NETWORK_ERROR", message: "Falha na conexão. Verifique sua internet." });
  });
});

describe("first-page MusicXML preview", () => {
  it("sends the revision and bearer token in the authenticated request, then returns raw XML", async () => {
    const { api } = await import("./client");
    const revision = "c".repeat(64);
    const signal = new AbortController().signal;
    const fetchMock = stubFetch(response("<score-partwise />"));

    await expect(api.firstPagePreview("secret-token", "score/1", revision, signal)).resolves.toBe("<score-partwise />");

    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`http://localhost:4000/api/scores/score%2F1/first-page-preview?revision=${revision}`);
    expect(url).not.toContain("secret-token");
    expect(options.signal).toBe(signal);
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer secret-token");
    expect(new Headers(options.headers).get("Accept")).toBe("application/vnd.recordare.musicxml+xml");
  });

  it("preserves status codes for a preview that is no longer available", async () => {
    const { ApiError, api } = await import("./client");
    stubFetch(response('{"error":"Preview is gone."}', 410));

    await expect(api.firstPagePreview("secret-token", "score-1", "d".repeat(64))).rejects.toBeInstanceOf(ApiError);
    await expect(api.firstPagePreview("secret-token", "score-1", "d".repeat(64))).rejects.toMatchObject({ status: 410 });
  });
});

describe("score version history API", () => {
  it("lists available versions and loads the selected MusicXML with the same authenticated score identity", async () => {
    const { api } = await import("./client");
    const versions = [{ id: "revision:abc123", label: "Correção 1", kind: "correction", revision: "abc123", createdAt: "2026-10-20T12:00:00.000Z", isCurrent: false, status: "needs_review", coverage: null, available: true }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(JSON.stringify({ versions })))
      .mockResolvedValueOnce(response("<score-partwise />"));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;

    await expect(api.scoreVersions("session-secret", "score/1", signal)).resolves.toEqual({ versions });
    await expect(api.scoreVersionMusicXml("session-secret", "score/1", "revision:abc123", signal)).resolves.toBe("<score-partwise />");

    const [versionsUrl, versionsOptions] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(versionsUrl).toBe("http://localhost:4000/api/scores/score%2F1/versions");
    expect(versionsOptions.signal).toBe(signal);
    expect(new Headers(versionsOptions.headers).get("Authorization")).toBe("Bearer session-secret");
    const [xmlUrl, xmlOptions] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(xmlUrl).toBe("http://localhost:4000/api/scores/score%2F1/versions/revision%3Aabc123/musicxml");
    expect(xmlOptions.signal).toBe(signal);
    expect(new Headers(xmlOptions.headers).get("Accept")).toBe("application/vnd.recordare.musicxml+xml");
    expect(new Headers(xmlOptions.headers).get("Authorization")).toBe("Bearer session-secret");
  });

  it("preserves the unavailable status for a historical export that expired", async () => {
    const { api, ApiError } = await import("./client");
    stubFetch(response('{"error":"Version is gone."}', 410));

    await expect(api.scoreVersionMusicXml("session-secret", "score-1", "revision:gone")).rejects.toBeInstanceOf(ApiError);
    await expect(api.scoreVersionMusicXml("session-secret", "score-1", "revision:gone")).rejects.toMatchObject({ status: 410 });
  });

  it("passes cancellation through a revision-guarded proposal decision", async () => {
    const { api } = await import("./client");
    const signal = new AbortController().signal;
    const fetchMock = stubFetch(response(JSON.stringify({ score: { id: "score-1" } })));

    await expect(api.decideVisualReviewProposal("session-secret", "score-1", "revision-1", "proposal-1", "reject", signal))
      .resolves.toMatchObject({ score: { id: "score-1" } });

    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:4000/api/scores/score-1/visual-review/decision");
    expect(options.signal).toBe(signal);
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer session-secret");
    expect(options.body).toBe(JSON.stringify({ revision: "revision-1", proposalId: "proposal-1", decision: "reject" }));
  });

  it("does not write an exported MusicXML file when its response is aborted", async () => {
    const { api } = await import("./client");
    const controller = new AbortController();
    stubFetch({
      ok: true,
      status: 200,
      text: async () => {
        controller.abort();
        return "<score-partwise />";
      }
    } as Response);

    await expect(api.downloadScoreVersionMusicXml("session-secret", "score-1", "revision:old", "Study-old.musicxml", controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
