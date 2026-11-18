import { describe, expect, it } from "vitest";
import { MAX_PLAYER_PREVIEW_BASE64_LENGTH, type PlayerReadingPreview } from "./bridge";
import { createPlayerSessionSnapshotStore, type PlayerSessionIdentity, type PlayerSessionSnapshot } from "./sessionSnapshot";

class MemoryStorage {
  values = new Map<string, string>();

  async getAllKeys() { return [...this.values.keys()]; }
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
  async multiRemove(keys: readonly string[]) { keys.forEach((key) => this.values.delete(key)); }
}

class DelayedFirstWriteStorage extends MemoryStorage {
  private releaseWrite: () => void = () => undefined;
  private signalWriteStarted: () => void = () => undefined;
  private readonly firstWriteGate = new Promise<void>((resolve) => { this.releaseWrite = resolve; });
  readonly firstWriteStarted = new Promise<void>((resolve) => { this.signalWriteStarted = resolve; });
  private delayFirstWrite = true;

  releaseFirstWrite() {
    this.releaseWrite();
  }

  override async setItem(key: string, value: string) {
    if (this.delayFirstWrite) {
      this.delayFirstWrite = false;
      this.signalWriteStarted();
      await this.firstWriteGate;
    }
    await super.setItem(key, value);
  }
}

class DelayedFirstReadStorage extends MemoryStorage {
  private releaseRead: () => void = () => undefined;
  private signalReadStarted: () => void = () => undefined;
  private readonly firstReadGate = new Promise<void>((resolve) => { this.releaseRead = resolve; });
  readonly firstReadStarted = new Promise<void>((resolve) => { this.signalReadStarted = resolve; });
  private delayFirstRead = true;

  releaseFirstRead() { this.releaseRead(); }

  override async getItem(key: string) {
    const value = await super.getItem(key);
    if (this.delayFirstRead) {
      this.delayFirstRead = false;
      this.signalReadStarted();
      await this.firstReadGate;
    }
    return value;
  }
}

const identity: PlayerSessionIdentity = {
  userId: "user-1",
  scoreId: "score-1",
  revision: "conversion:attempt-3:review:xml-7"
};

const snapshot: PlayerSessionSnapshot = {
  playback: { state: "paused", positionMs: 4_250, durationMs: 30_000, tempo: 92 },
  reading: { page: 3, scrollRatio: 0.4, anchorMeasureId: "measure-17", anchorViewportRatio: 0.2 }
};

describe("player session snapshots", () => {
  it("restores the latest valid reading position only for its user, score, and revision", async () => {
    const storage = new MemoryStorage();
    const store = createPlayerSessionSnapshotStore(storage);
    const lease = store.createLease(identity.userId)!;

    await store.save(identity, snapshot, lease);
    await store.save(identity, { ...snapshot, playback: { ...snapshot.playback, positionMs: 5_100 } }, lease);

    expect(await store.load(identity, lease)).toEqual({
      ...snapshot,
      playback: { ...snapshot.playback, positionMs: 5_100 }
    });
    expect(await store.load({ ...identity, revision: "conversion:attempt-4" }, lease)).toBeNull();
    expect(await store.load({ ...identity, userId: "user-2" }, lease)).toBeNull();
    expect(await store.load({ ...identity, scoreId: "score-2" }, lease)).toBeNull();
  });

  it("expires stale snapshots and rejects malformed persisted data", async () => {
    const storage = new MemoryStorage();
    let now = 1_800_000_000_000;
    const store = createPlayerSessionSnapshotStore(storage, () => now);
    const lease = store.createLease(identity.userId)!;
    await store.save(identity, snapshot, lease);
    now += 7 * 24 * 60 * 60 * 1000 + 1;
    expect(await store.load(identity, lease)).toBeNull();

    await store.save(identity, snapshot, lease);
    const key = (await storage.getAllKeys())[0];
    storage.values.set(key, JSON.stringify({ version: 1, identity, savedAt: now, snapshot: { ...snapshot, token: "secret" } }));
    expect(await store.load(identity, lease)).toBeNull();
    expect(storage.values.has(key)).toBe(false);
  });

  it("clears only the requested account's saved player sessions", async () => {
    const storage = new MemoryStorage();
    const store = createPlayerSessionSnapshotStore(storage);
    const userOneLease = store.createLease("user-1")!;
    const userTwoLease = store.createLease("user-2")!;
    await store.save(identity, snapshot, userOneLease);
    await store.save({ ...identity, userId: "user-2" }, snapshot, userTwoLease);

    await store.clear("user-1");

    expect(await store.load(identity, userOneLease)).toBeNull();
    expect(await store.load({ ...identity, userId: "user-2" }, userTwoLease)).toEqual(snapshot);
  });

  it("fences saves and reads from a session that was cleared, including late cleanup writes", async () => {
    const storage = new MemoryStorage();
    const store = createPlayerSessionSnapshotStore(storage);
    const oldLease = store.createLease(identity.userId)!;
    await store.save(identity, snapshot, oldLease);

    await store.clear(identity.userId);
    await store.save(identity, { ...snapshot, playback: { ...snapshot.playback, positionMs: 8_000 } }, oldLease);

    expect(await store.load(identity, oldLease)).toBeNull();
    expect(storage.values.size).toBe(0);
    const newLease = store.createLease(identity.userId)!;
    expect(await store.load(identity, newLease)).toBeNull();
    await store.save(identity, snapshot, newLease);
    expect(await store.load(identity, newLease)).toEqual(snapshot);
  });

  it("clears a deleted score for one account without affecting another score or account", async () => {
    const storage = new MemoryStorage();
    const store = createPlayerSessionSnapshotStore(storage);
    const userOneLease = store.createLease("user-1")!;
    const userTwoLease = store.createLease("user-2")!;
    const otherScoreLease = store.createLease("user-1")!;
    const userTwoIdentity = { ...identity, userId: "user-2" };
    const otherScoreIdentity = { ...identity, scoreId: "score-2" };
    const lateSnapshot = { ...snapshot, playback: { ...snapshot.playback, positionMs: 8_000 } };

    await store.save(identity, snapshot, userOneLease);
    await store.save(userTwoIdentity, snapshot, userTwoLease);
    await store.save(otherScoreIdentity, snapshot, otherScoreLease);

    await store.clearScores([identity.scoreId], "user-1");
    await store.save(identity, lateSnapshot, userOneLease);

    expect(await store.load(identity, userOneLease)).toBeNull();
    expect(await store.load(userTwoIdentity, userTwoLease)).toEqual(snapshot);
    expect(await store.load(otherScoreIdentity, otherScoreLease)).toEqual(snapshot);
    expect(storage.values.size).toBe(2);
  });

  it("fences a write already in flight when a score is deleted", async () => {
    const storage = new DelayedFirstWriteStorage();
    const store = createPlayerSessionSnapshotStore(storage);
    const oldLease = store.createLease(identity.userId)!;
    const savePromise = store.save(identity, snapshot, oldLease);
    await storage.firstWriteStarted;

    const clearPromise = store.clearScores([identity.scoreId]);
    storage.releaseFirstWrite();
    await Promise.all([savePromise, clearPromise]);
    await store.save(identity, { ...snapshot, playback: { ...snapshot.playback, positionMs: 9_000 } }, oldLease);

    expect(storage.values.size).toBe(0);
    expect(await store.load(identity, oldLease)).toBeNull();
  });

  it("clears all account snapshots for a globally unique deleted score but leaves other scores", async () => {
    const storage = new MemoryStorage();
    const store = createPlayerSessionSnapshotStore(storage);
    const userOneLease = store.createLease("user-1")!;
    const userTwoLease = store.createLease("user-2")!;
    const otherScoreLease = store.createLease("user-2")!;
    const userTwoIdentity = { ...identity, userId: "user-2" };
    const otherScoreIdentity = { ...userTwoIdentity, scoreId: "score-2" };

    await store.save(identity, snapshot, userOneLease);
    await store.save(userTwoIdentity, snapshot, userTwoLease);
    await store.save(otherScoreIdentity, snapshot, otherScoreLease);

    await store.clearScores([identity.scoreId]);

    expect(await store.load(identity, userOneLease)).toBeNull();
    expect(await store.load(userTwoIdentity, userTwoLease)).toBeNull();
    expect(await store.load(otherScoreIdentity, otherScoreLease)).toEqual(snapshot);
    expect(storage.values.size).toBe(1);
  });
});

describe("player reading previews", () => {
  const preview: PlayerReadingPreview = { page: 3, width: 800, height: 1200, jpegBase64: "/9j/AAAAAAAAAAAA" };

  it("keeps one preview per score and isolates account and exact revision", async () => {
    const storage = new MemoryStorage();
    const store = createPlayerSessionSnapshotStore(storage);
    const firstLease = store.createLease(identity.userId)!;
    const revised = { ...identity, revision: "conversion:attempt-4" };
    const revisedLease = store.createLease(identity.userId)!;
    const otherUser = { ...identity, userId: "user-2" };
    const otherLease = store.createLease(otherUser.userId)!;
    await store.savePreview(identity, preview, firstLease);
    await store.savePreview(otherUser, { ...preview, page: 5 }, otherLease);
    expect(await store.loadPreview(identity, firstLease)).toEqual(preview);
    expect(await store.loadPreview(revised, revisedLease)).toBeNull();
    expect(await store.loadPreview({ ...identity, scoreId: "other-score" }, firstLease)).toBeNull();

    await store.savePreview(revised, { ...preview, page: 4 }, revisedLease);
    await store.savePreview(identity, preview, firstLease);
    expect(await store.loadPreview(identity, firstLease)).toBeNull();
    expect(await store.loadPreview(revised, revisedLease)).toEqual({ ...preview, page: 4 });
    expect(await store.loadPreview(otherUser, otherLease)).toEqual({ ...preview, page: 5 });
    expect(storage.values.size).toBe(2);
  });

  it("keeps at most three recent previews in memory and reloads evicted ones from storage", async () => {
    const storage = new MemoryStorage();
    const store = createPlayerSessionSnapshotStore(storage);
    const lease = store.createLease(identity.userId)!;
    const scores = ["one", "two", "three", "four"].map((scoreId) => ({ ...identity, scoreId }));
    for (const score of scores.slice(0, 3)) await store.savePreview(score, preview, lease);
    expect(store.memoryPreview(scores[0], lease)).toEqual(preview);
    await store.savePreview(scores[3], preview, lease);
    expect(store.memoryPreview(scores[0], lease)).toBeNull();
    expect(store.memoryPreview(scores[1], lease)).toEqual(preview);
    expect(await store.loadPreview(scores[0], lease)).toEqual(preview);
    expect(store.memoryPreview(scores[0], lease)).toEqual(preview);
  });

  it("does not let an older storage read replace a newer memory preview", async () => {
    const storage = new DelayedFirstReadStorage();
    const writer = createPlayerSessionSnapshotStore(storage);
    await writer.savePreview(identity, preview, writer.createLease(identity.userId)!);
    const store = createPlayerSessionSnapshotStore(storage);
    const lease = store.createLease(identity.userId)!;
    const loading = store.loadPreview(identity, lease);
    await storage.firstReadStarted;
    const latest = { ...preview, page: 5 };
    await store.savePreview(identity, latest, lease);
    storage.releaseFirstRead();
    expect(await loading).toEqual(latest);
    expect(store.memoryPreview(identity, lease)).toEqual(latest);
  });

  it("rejects invalid, oversized and expired previews", async () => {
    const storage = new MemoryStorage();
    let now = 1_800_000_000_000;
    const store = createPlayerSessionSnapshotStore(storage, () => now);
    const lease = store.createLease(identity.userId)!;
    await store.savePreview(identity, { ...preview, jpegBase64: "<svg onload=alert(1)>" }, lease);
    await store.savePreview(identity, { ...preview, jpegBase64: `/9j/${"A".repeat(MAX_PLAYER_PREVIEW_BASE64_LENGTH)}` }, lease);
    expect(storage.values.size).toBe(0);

    await store.savePreview(identity, preview, lease);
    now += 7 * 24 * 60 * 60 * 1000 + 1;
    expect(await store.loadPreview(identity, lease)).toBeNull();
    const key = (await storage.getAllKeys())[0];
    storage.values.set(key, "x".repeat(MAX_PLAYER_PREVIEW_BASE64_LENGTH + 4097));
    expect(await store.loadPreview(identity, lease)).toBeNull();
  });

  it("removes previews on logout and rejects late writes from the old session", async () => {
    const storage = new MemoryStorage();
    const store = createPlayerSessionSnapshotStore(storage);
    const oldLease = store.createLease(identity.userId)!;
    await store.savePreview(identity, preview, oldLease);
    expect(store.memoryPreview(identity, oldLease)).toEqual(preview);
    const clearing = store.clear(identity.userId);
    expect(store.memoryPreview(identity, oldLease)).toBeNull();
    await clearing;
    await store.savePreview(identity, preview, oldLease);
    expect(storage.values.size).toBe(0);
    expect(await store.loadPreview(identity, store.createLease(identity.userId)!)).toBeNull();
  });

  it("fences an in-flight preview write when its score is deleted", async () => {
    const storage = new DelayedFirstWriteStorage();
    const store = createPlayerSessionSnapshotStore(storage);
    const oldLease = store.createLease(identity.userId)!;
    const saving = store.savePreview(identity, preview, oldLease);
    await storage.firstWriteStarted;
    const clearing = store.clearScores([identity.scoreId], identity.userId);
    expect(store.memoryPreview(identity, oldLease)).toBeNull();
    storage.releaseFirstWrite();
    await Promise.all([saving, clearing]);
    await store.savePreview(identity, preview, oldLease);
    expect(storage.values.size).toBe(0);
    expect(await store.loadPreview(identity, oldLease)).toBeNull();
  });
});
