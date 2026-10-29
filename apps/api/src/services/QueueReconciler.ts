import { env } from "../config/env.js";
import type { ScoreConversionQueue } from "../queues/ScoreConversionQueue.js";
import type { ScoreRepository } from "../repositories/contracts.js";

export class QueueReconciler {
  private running = false;
  constructor(private scores: ScoreRepository, private queue: ScoreConversionQueue) {}

  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const staleBefore = new Date(Date.now() - env.OMR_CONVERSION_TIMEOUT_MS - 60_000);
      await this.scores.requeueStaleAttempts(staleBefore);
      const pending = await this.scores.listPendingAttempts(100);
      let enqueued = 0;
      for (const attempt of pending) {
        try {
          await this.queue.enqueue(attempt.scoreId, attempt.id);
          enqueued += 1;
        } catch {
          // The durable queued attempt is retried on the next reconciliation.
        }
      }
      return enqueued;
    } finally {
      this.running = false;
    }
  }
}
