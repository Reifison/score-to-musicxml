import { describe, expect, it } from "vitest";
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
