import { api } from "../api/client";
import { canDownloadMusicXml, canPreviewMusicXml } from "../api/scoreAvailability";
import type { Score } from "../api/types";
import { loadCachedPlayerMusicXml, playerCacheIdentity, savePlayerMusicXmlToCache } from "./musicXmlCache";
import { readCachedScoreDetails, saveCachedScoreDetails } from "./scoreDetailsCache";

const PREPARATION_WORKERS = 2;
const downloadQueues = new Map<string, Promise<unknown>>();

/**
 * Use one temporary download per score at a time. Background preparation and
 * an opening reader can otherwise overwrite and delete each other's file.
 */
export function loadPreparedPlayerMusicXml(
  token: string,
  sessionUserId: string,
  score: Score,
  isActive: () => boolean = () => true,
  preview = !canDownloadMusicXml(score)
): Promise<string | null> {
  const identity = playerCacheIdentity(score, sessionUserId);
  // The download's temporary path is keyed by owner and score, not session.
  const queueKey = JSON.stringify([score.userId, score.id]);
  const previous = downloadQueues.get(queueKey);
  const operation = (async () => {
    if (previous) await previous.catch(() => undefined);
    if (!isActive()) return null;
    const cached = await loadCachedPlayerMusicXml(identity);
    if (cached) return cached;
    if (!isActive()) return null;
    const document = await api.loadMusicXmlForPlayer(token, { id: score.id, userId: score.userId }, preview);
    if (isActive()) {
      try {
        savePlayerMusicXmlToCache(identity, document);
      } catch {
        // The document remains usable for this opening if storage is full.
      }
    }
    return document;
  })();
  downloadQueues.set(queueKey, operation);
  void operation.finally(() => {
    if (downloadQueues.get(queueKey) === operation) downloadQueues.delete(queueKey);
  }).catch(() => undefined);
  return operation;
}

/** Prepare converted items in the background while the library remains usable. */
export function startOfflineScorePreparation(token: string, sessionUserId: string, scores: Score[]): () => void {
  let cancelled = false;
  let next = 0;
  const candidates = scores.filter(canPreviewMusicXml);
  const active = () => !cancelled;

  async function work(): Promise<void> {
    while (active() && next < candidates.length) {
      const listed = candidates[next++];
      try {
        const saved = await readCachedScoreDetails(sessionUserId, listed.id);
        if (!active()) return;
        if (saved && isSamePublication(saved, listed)) {
          const cached = await loadCachedPlayerMusicXml(playerCacheIdentity(saved, sessionUserId));
          if (cached) continue;
        }
        if (!active()) return;
        const { score } = await api.score(token, listed.id);
        if (!active()) return;
        if (!score || score.id !== listed.id || !canPreviewMusicXml(score)) continue;
        try {
          saveCachedScoreDetails(sessionUserId, score);
        } catch {
          // A failed details save must not block preparing other scores.
        }
        await loadPreparedPlayerMusicXml(token, sessionUserId, score, active, true);
      } catch {
        // A network or file error affects only this item and can be retried
        // when the library is refreshed or the score is opened online.
      }
    }
  }

  for (let worker = 0; worker < Math.min(PREPARATION_WORKERS, candidates.length); worker += 1) void work();
  return () => { cancelled = true; };
}

function isSamePublication(saved: Score, listed: Score): boolean {
  return saved.id === listed.id && saved.userId === listed.userId
    && saved.updatedAt === listed.updatedAt
    && playerCacheIdentity(saved).cacheRevision === playerCacheIdentity(listed).cacheRevision;
}
