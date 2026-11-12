import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Score } from "../api/types";
import { loadPreparedPlayerMusicXml, startOfflineScorePreparation } from "./offlineScorePreparation";

const state = vi.hoisted(() => ({
  documents: new Map<string, string>(),
  details: new Map<string, unknown>(),
  score: vi.fn(),
  download: vi.fn()
}));

vi.mock("../api/client", () => ({ api: { score: state.score, loadMusicXmlForPlayer: state.download } }));
vi.mock("./scoreDetailsCache", () => ({
  readCachedScoreDetails: async (userId: string, id: string) => state.details.get(`${userId}:${id}`),
  saveCachedScoreDetails: (userId: string, score: Score) => state.details.set(`${userId}:${score.id}`, score)
}));
vi.mock("./musicXmlCache", () => ({
  playerCacheIdentity: (score: Score, userId = score.userId) => ({ id: score.id, userId, cacheRevision: score.reviewRevision ?? score.convertedAt }),
  loadCachedPlayerMusicXml: async (identity: { id: string; userId: string; cacheRevision: string }) =>
    state.documents.get(`${identity.userId}:${identity.id}:${identity.cacheRevision}`) ?? null,
  savePlayerMusicXmlToCache: (identity: { id: string; userId: string; cacheRevision: string }, xml: string) =>
    state.documents.set(`${identity.userId}:${identity.id}:${identity.cacheRevision}`, xml)
}));

const xml = "<score-partwise />";
const makeScore = (id: string, extra: Partial<Score> = {}): Score => ({
  id, userId: "owner-1", conversionStatus: "converted", musicxmlFilename: `${id}.musicxml`,
  resultStatus: "complete", convertedAt: "2026-10-01", updatedAt: "2026-10-01",
  reviewRevision: "revision-1", canDownloadMusicXml: true, ...extra
} as Score);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  state.documents.clear();
  state.details.clear();
  state.score.mockReset().mockImplementation(async (_token: string, id: string) => ({ score: makeScore(id) }));
  state.download.mockReset().mockResolvedValue(xml);
});

describe("offline score preparation", () => {
  it("prepares only converted scores, using the signed-in account for storage", async () => {
    startOfflineScorePreparation("token-1", "admin-1", [
      makeScore("one"), makeScore("two", { canDownloadMusicXml: false }),
      makeScore("processing", { conversionStatus: "processing" })
    ]);

    await vi.waitFor(() => expect(state.documents.size).toBe(2));
    expect(state.score).toHaveBeenCalledTimes(2);
    expect(state.download).toHaveBeenCalledWith("token-1", { id: "one", userId: "owner-1" }, true);
    expect(state.download).toHaveBeenCalledWith("token-1", { id: "two", userId: "owner-1" }, true);
    expect(state.details.has("admin-1:one")).toBe(true);
    expect(state.documents.get("admin-1:one:revision-1")).toBe(xml);
    expect(state.documents.has("owner-1:one:revision-1")).toBe(false);
  });

  it("reuses complete saved data but downloads a changed revision", async () => {
    const original = makeScore("one");
    state.details.set("owner-1:one", original);
    state.documents.set("owner-1:one:revision-1", xml);
    startOfflineScorePreparation("token-1", "owner-1", [original]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state.score).not.toHaveBeenCalled();
    expect(state.download).not.toHaveBeenCalled();

    const revised = makeScore("one", { reviewRevision: "revision-2", updatedAt: "2026-10-02" });
    state.score.mockResolvedValue({ score: revised });
    startOfflineScorePreparation("token-1", "owner-1", [revised]);
    await vi.waitFor(() => expect(state.documents.has("owner-1:one:revision-2")).toBe(true));
    expect(state.documents.has("owner-1:one:revision-1")).toBe(true);
  });

  it("limits parallel preparations and stops new work after cancellation", async () => {
    const pending = [deferred<{ score: Score }>(), deferred<{ score: Score }>()];
    state.score.mockImplementation((_token: string, id: string) => pending[id === "one" ? 0 : 1].promise);
    const cancel = startOfflineScorePreparation("token-1", "owner-1", [makeScore("one"), makeScore("two"), makeScore("three")]);
    await vi.waitFor(() => expect(state.score).toHaveBeenCalledTimes(2));
    cancel();
    pending[0].resolve({ score: makeScore("one") });
    pending[1].resolve({ score: makeScore("two") });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state.score).toHaveBeenCalledTimes(2);
    expect(state.download).not.toHaveBeenCalled();
    expect(state.details.size).toBe(0);
  });

  it("shares a completed download with a simultaneous reader without overwriting temporary files", async () => {
    const pending = deferred<string>();
    state.download.mockReturnValue(pending.promise);
    const first = loadPreparedPlayerMusicXml("token", "owner-1", makeScore("one"));
    const second = loadPreparedPlayerMusicXml("token", "owner-1", makeScore("one"));
    await vi.waitFor(() => expect(state.download).toHaveBeenCalledTimes(1));
    pending.resolve(xml);
    expect(await Promise.all([first, second])).toEqual([xml, xml]);
    expect(state.download).toHaveBeenCalledTimes(1);
  });

  it("does not save a download that completes after the session ends", async () => {
    const pending = deferred<string>();
    state.download.mockReturnValue(pending.promise);
    let active = true;
    const load = loadPreparedPlayerMusicXml("token", "owner-1", makeScore("one"), () => active);
    await vi.waitFor(() => expect(state.download).toHaveBeenCalledOnce());
    active = false;
    pending.resolve(xml);
    expect(await load).toBe(xml);
    expect(state.documents.size).toBe(0);
  });
});
