import AsyncStorage from "@react-native-async-storage/async-storage";
import { isPlayerReadingPreview, MAX_PLAYER_PREVIEW_BASE64_LENGTH, type PlayerReadingPreview } from "./bridge";
import { isPlayerSessionSnapshot, type PlayerSessionIdentity, type PlayerSessionSnapshot } from "./sessionSnapshotContract";

export type { PlayerPlaybackSnapshot, PlayerReadingSnapshot, PlayerSessionIdentity, PlayerSessionSnapshot } from "./sessionSnapshotContract";

type StoredSnapshot = {
  version: 1;
  identity: PlayerSessionIdentity;
  savedAt: number;
  snapshot: PlayerSessionSnapshot;
};

type StoredPreview = {
  version: 1;
  identity: PlayerSessionIdentity;
  savedAt: number;
  preview: PlayerReadingPreview;
};

export type PlayerSessionLease = {
  userId: string;
  generation: number;
  globalGeneration: number;
  /** Invalidates writes from leases that predate deletion of a score. */
  issuedGeneration: number;
};

type SnapshotStorage = Pick<
  typeof AsyncStorage,
  "getAllKeys" | "getItem" | "multiRemove" | "removeItem" | "setItem"
>;

const STORAGE_PREFIX = "@score-to-musicxml/player-session/v1/";
const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_IN_MEMORY_PREVIEWS = 3;

/**
 * Cursor snapshots contain no MusicXML or credentials. A separate bounded
 * image preview shares the same account/score deletion and lease fences.
 */
export function createPlayerSessionSnapshotStore(storage: SnapshotStorage, now = () => Date.now()) {
  const writes = new Map<string, { generation: number; pending: string | null; draining?: Promise<void> }>();
  const previewWriterGenerations = new Map<string, number>();
  const previewMemory = new Map<string, StoredPreview>();
  const userGenerations = new Map<string, number>();
  const scoreInvalidationGenerations = new Map<string, number>();
  let globalGeneration = 0;
  let issuedGeneration = 0;

  function createLease(userId: string): PlayerSessionLease | null {
    if (!validUserId(userId)) return null;
    issuedGeneration += 1;
    return {
      userId,
      generation: userGenerations.get(userId) ?? 0,
      globalGeneration,
      issuedGeneration
    };
  }

  function isCurrentLease(identity: PlayerSessionIdentity, lease: PlayerSessionLease): boolean {
    if (!validIdentity(identity) || !validLease(lease)) return false;
    const scoreInvalidationGeneration = Math.max(
      scoreInvalidationGenerations.get(scoreInvalidationKey(identity.scoreId)) ?? 0,
      scoreInvalidationGenerations.get(scoreInvalidationKey(identity.scoreId, identity.userId)) ?? 0
    );
    return lease.userId === identity.userId
      && lease.generation === (userGenerations.get(identity.userId) ?? 0)
      && lease.globalGeneration === globalGeneration
      && lease.issuedGeneration > scoreInvalidationGeneration;
  }

  async function load(identity: PlayerSessionIdentity, lease: PlayerSessionLease): Promise<PlayerSessionSnapshot | null> {
    if (!isCurrentLease(identity, lease)) return null;
    const key = storageKey(identity);
    const writeState = writes.get(key);
    if (writeState) await waitForWrites(key, writeState, storage);
    if (!isCurrentLease(identity, lease)) return null;

    let raw: string | null;
    try {
      raw = await storage.getItem(key);
    } catch {
      return null;
    }
    if (!isCurrentLease(identity, lease)) return null;
    if (!raw) return null;

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      await storage.removeItem(key).catch(() => undefined);
      return null;
    }
    if (!isStoredSnapshot(value) || !sameIdentity(value.identity, identity)) {
      await storage.removeItem(key).catch(() => undefined);
      return null;
    }

    const age = now() - value.savedAt;
    if (age < -5 * 60 * 1000 || age > SNAPSHOT_TTL_MS) {
      await storage.removeItem(key).catch(() => undefined);
      return null;
    }
    return value.snapshot;
  }

  async function save(identity: PlayerSessionIdentity, snapshot: PlayerSessionSnapshot, lease: PlayerSessionLease): Promise<void> {
    if (!isCurrentLease(identity, lease) || !isPlayerSessionSnapshot(snapshot)) return;
    return enqueueWrite(storageKey(identity), {
      version: 1,
      identity,
      savedAt: now(),
      snapshot
    } satisfies StoredSnapshot);
  }

  function memoryPreview(identity: PlayerSessionIdentity, lease: PlayerSessionLease): PlayerReadingPreview | null {
    if (!isCurrentLease(identity, lease)) return null;
    const key = previewStorageKey(identity);
    const value = previewMemory.get(key);
    if (!value || !sameIdentity(value.identity, identity) || !isFreshPreview(value, now())) return null;
    return value.preview;
  }

  function rememberPreview(key: string, value: StoredPreview) {
    previewMemory.delete(key);
    previewMemory.set(key, value);
    if (previewMemory.size > MAX_IN_MEMORY_PREVIEWS) {
      const oldest = previewMemory.keys().next().value;
      if (oldest !== undefined) previewMemory.delete(oldest);
    }
  }

  async function loadPreview(identity: PlayerSessionIdentity, lease: PlayerSessionLease): Promise<PlayerReadingPreview | null> {
    if (!isCurrentLease(identity, lease)) return null;
    const cached = memoryPreview(identity, lease);
    if (cached) return cached;
    const key = previewStorageKey(identity);
    const writeState = writes.get(key);
    if (writeState) await waitForWrites(key, writeState, storage);
    if (!isCurrentLease(identity, lease)) return null;
    const readGeneration = writes.get(key)?.generation ?? 0;
    let raw: string | null;
    try {
      raw = await storage.getItem(key);
    } catch {
      return null;
    }
    if (!isCurrentLease(identity, lease)) return null;
    if ((writes.get(key)?.generation ?? 0) !== readGeneration) return memoryPreview(identity, lease);
    if (!raw || raw.length > MAX_PLAYER_PREVIEW_BASE64_LENGTH + 4096) return null;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!isStoredPreview(value) || !sameIdentity(value.identity, identity)) return null;
    if (!isFreshPreview(value, now())) return null;
    rememberPreview(key, value);
    return value.preview;
  }

  async function savePreview(identity: PlayerSessionIdentity, preview: PlayerReadingPreview, lease: PlayerSessionLease): Promise<void> {
    if (!isCurrentLease(identity, lease) || !isPlayerReadingPreview(preview)) return;
    const key = previewStorageKey(identity);
    if (lease.issuedGeneration < (previewWriterGenerations.get(key) ?? 0)) return;
    previewWriterGenerations.set(key, lease.issuedGeneration);
    const value = { version: 1, identity, savedAt: now(), preview } satisfies StoredPreview;
    rememberPreview(key, value);
    return enqueueWrite(key, value);
  }

  async function enqueueWrite(key: string, value: StoredSnapshot | StoredPreview): Promise<void> {
    let state = writes.get(key);
    if (!state) {
      state = { generation: 0, pending: null };
      writes.set(key, state);
    }

    state.generation += 1;
    const generation = state.generation;
    state.pending = JSON.stringify(value);
    if (!state.draining) beginDrain(key, state, storage);
    // If another save arrived while storage was busy, its higher generation
    // replaces this pending value and the drain writes only the newest state.
    if (state.generation !== generation) return waitForWrites(key, state, storage);
    return waitForWrites(key, state, storage);
  }

  async function clear(userId?: string): Promise<void> {
    if (userId === undefined) globalGeneration += 1;
    else userGenerations.set(userId, (userGenerations.get(userId) ?? 0) + 1);
    for (const key of previewMemory.keys()) {
      if (userId === undefined || key.startsWith(userPrefix(userId))) previewMemory.delete(key);
    }

    const keysToRemove = [...writes.entries()]
      .filter(([key]) => key.startsWith(STORAGE_PREFIX)
        && (userId === undefined || key.startsWith(userPrefix(userId))))
      .map(([key, state]) => {
        state.generation += 1;
        state.pending = null;
        return [key, state] as const;
      });

    await Promise.all(keysToRemove.map(([key, state]) => waitForWrites(key, state, storage)));
    let storedKeys: readonly string[];
    try {
      storedKeys = await storage.getAllKeys();
    } catch {
      return;
    }
    const selectedKeys = storedKeys.filter((key) =>
      key.startsWith(STORAGE_PREFIX)
      && (userId === undefined || key.startsWith(userPrefix(userId)))
    );
    if (selectedKeys.length > 0) await storage.multiRemove(selectedKeys).catch(() => undefined);
  }

  async function clearScores(scoreIds: string[], userId?: string): Promise<void> {
    if (userId !== undefined && !validUserId(userId)) return;
    const selectedScoreIds = [...new Set(scoreIds.filter(validScoreId))];
    if (selectedScoreIds.length === 0) return;

    for (const scoreId of selectedScoreIds) {
      issuedGeneration += 1;
      scoreInvalidationGenerations.set(scoreInvalidationKey(scoreId, userId), issuedGeneration);
    }
    for (const key of previewMemory.keys()) {
      if (selectedScoreIds.some((scoreId) => keyMatchesScore(key, scoreId, userId))) previewMemory.delete(key);
    }

    const keysToWaitFor = [...writes.entries()]
      .filter(([key]) => selectedScoreIds.some((scoreId) => keyMatchesScore(key, scoreId, userId)))
      .map(([key, state]) => {
        state.generation += 1;
        state.pending = null;
        return [key, state] as const;
      });
    await Promise.all(keysToWaitFor.map(([key, state]) => waitForWrites(key, state, storage)));

    let storedKeys: readonly string[];
    try {
      storedKeys = await storage.getAllKeys();
    } catch {
      return;
    }
    const selectedKeys = storedKeys.filter((key) =>
      selectedScoreIds.some((scoreId) => keyMatchesScore(key, scoreId, userId))
    );
    if (selectedKeys.length > 0) await storage.multiRemove(selectedKeys).catch(() => undefined);
  }

  return { clear, clearScores, createLease, load, save, loadPreview, savePreview, memoryPreview };
}

const playerSessionSnapshotStore = createPlayerSessionSnapshotStore(AsyncStorage);

export function createPlayerSessionLease(userId: string): PlayerSessionLease | null {
  return playerSessionSnapshotStore.createLease(userId);
}

export function loadPlayerSessionSnapshot(identity: PlayerSessionIdentity, lease: PlayerSessionLease): Promise<PlayerSessionSnapshot | null> {
  return playerSessionSnapshotStore.load(identity, lease);
}

export function savePlayerSessionSnapshot(
  identity: PlayerSessionIdentity,
  snapshot: PlayerSessionSnapshot,
  lease: PlayerSessionLease
): Promise<void> {
  return playerSessionSnapshotStore.save(identity, snapshot, lease);
}

export function loadPlayerReadingPreview(identity: PlayerSessionIdentity, lease: PlayerSessionLease): Promise<PlayerReadingPreview | null> {
  return playerSessionSnapshotStore.loadPreview(identity, lease);
}

export function getMemoryPlayerReadingPreview(identity: PlayerSessionIdentity, lease: PlayerSessionLease): PlayerReadingPreview | null {
  return playerSessionSnapshotStore.memoryPreview(identity, lease);
}

export function savePlayerReadingPreview(identity: PlayerSessionIdentity, preview: PlayerReadingPreview, lease: PlayerSessionLease): Promise<void> {
  return playerSessionSnapshotStore.savePreview(identity, preview, lease);
}

/** Clear only player reading snapshots, for example when the authenticated session logs out. */
export function clearPlayerSessionSnapshots(userId?: string): Promise<void> {
  return playerSessionSnapshotStore.clear(userId);
}

/** Clear snapshots for deleted scores. Omit userId to invalidate every account's snapshot for those globally unique score IDs. */
export function clearPlayerSessionSnapshotsForScores(scoreIds: string[], userId?: string): Promise<void> {
  return playerSessionSnapshotStore.clearScores(scoreIds, userId);
}

export function clearPlayerSessionSnapshotsForScore(scoreId: string, userId?: string): Promise<void> {
  return playerSessionSnapshotStore.clearScores([scoreId], userId);
}

function isStoredSnapshot(value: unknown): value is StoredSnapshot {
  return isRecord(value)
    && hasOnlyKeys(value, ["version", "identity", "savedAt", "snapshot"])
    && value.version === 1
    && isPlayerSessionIdentity(value.identity)
    && isFiniteNumber(value.savedAt, 0, Number.MAX_SAFE_INTEGER)
    && isPlayerSessionSnapshot(value.snapshot);
}

function isStoredPreview(value: unknown): value is StoredPreview {
  return isRecord(value)
    && hasOnlyKeys(value, ["version", "identity", "savedAt", "preview"])
    && value.version === 1
    && isPlayerSessionIdentity(value.identity)
    && isFiniteNumber(value.savedAt, 0, Number.MAX_SAFE_INTEGER)
    && isPlayerReadingPreview(value.preview);
}

function isFreshPreview(value: StoredPreview, currentTime: number): boolean {
  const age = currentTime - value.savedAt;
  return age >= -5 * 60 * 1000 && age <= SNAPSHOT_TTL_MS;
}

function isPlayerSessionIdentity(value: unknown): value is PlayerSessionIdentity {
  return isRecord(value)
    && hasOnlyKeys(value, ["userId", "scoreId", "revision"])
    && validIdentity(value as PlayerSessionIdentity);
}

function validIdentity(identity: PlayerSessionIdentity): boolean {
  return isRecord(identity) && validUserId(identity.userId)
    && typeof identity.scoreId === "string" && identity.scoreId.length > 0 && identity.scoreId.length <= 256
    && typeof identity.revision === "string" && identity.revision.length > 0 && identity.revision.length <= 2_048;
}

function validUserId(userId: unknown): userId is string {
  return typeof userId === "string" && userId.length > 0 && userId.length <= 256;
}

function validScoreId(scoreId: unknown): scoreId is string {
  return typeof scoreId === "string" && scoreId.length > 0 && scoreId.length <= 256;
}

function validLease(lease: PlayerSessionLease): boolean {
  return isRecord(lease)
    && validUserId(lease.userId)
    && Number.isSafeInteger(lease.generation) && lease.generation >= 0
    && Number.isSafeInteger(lease.globalGeneration) && lease.globalGeneration >= 0
    && Number.isSafeInteger(lease.issuedGeneration) && lease.issuedGeneration >= 0;
}

function sameIdentity(left: PlayerSessionIdentity, right: PlayerSessionIdentity): boolean {
  return left.userId === right.userId && left.scoreId === right.scoreId && left.revision === right.revision;
}

function storageKey(identity: PlayerSessionIdentity): string {
  return `${userPrefix(identity.userId)}${encodeURIComponent(identity.scoreId)}/${fingerprint(identity.revision)}`;
}

function previewStorageKey(identity: PlayerSessionIdentity): string {
  return `${userPrefix(identity.userId)}${encodeURIComponent(identity.scoreId)}/preview`;
}

function scoreInvalidationKey(scoreId: string, userId?: string): string {
  return JSON.stringify([userId ?? null, scoreId]);
}

function keyMatchesScore(key: string, scoreId: string, userId?: string): boolean {
  if (!key.startsWith(STORAGE_PREFIX)) return false;
  const [storedUserId, storedScoreId, revision, ...extra] = key.slice(STORAGE_PREFIX.length).split("/");
  return extra.length === 0
    && Boolean(storedUserId)
    && storedScoreId === encodeURIComponent(scoreId)
    && Boolean(revision)
    && (userId === undefined || storedUserId === encodeURIComponent(userId));
}

function userPrefix(userId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(userId)}/`;
}

function fingerprint(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

async function drainWrites(
  key: string,
  state: { generation: number; pending: string | null },
  storage: SnapshotStorage
): Promise<void> {
  while (state.pending !== null) {
    const pending = state.pending;
    const generation = state.generation;
    state.pending = null;
    if (generation !== state.generation) continue;
    try {
      await storage.setItem(key, pending);
    } catch {
      // Persistence is best-effort; the current player session remains usable.
    }
  }
}

function beginDrain(
  key: string,
  state: { generation: number; pending: string | null; draining?: Promise<void> },
  storage: SnapshotStorage
): Promise<void> {
  const draining = drainWrites(key, state, storage).finally(() => {
    if (state.draining === draining) state.draining = undefined;
    if (state.pending !== null) void beginDrain(key, state, storage);
  });
  state.draining = draining;
  return draining;
}

async function waitForWrites(
  key: string,
  state: { generation: number; pending: string | null; draining?: Promise<void> },
  storage: SnapshotStorage
): Promise<void> {
  while (state.draining || state.pending !== null) {
    if (state.draining) await state.draining;
    else await beginDrain(key, state, storage);
  }
}

function isFiniteNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).length === allowed.length && Object.keys(value).every((key) => allowed.includes(key));
}

