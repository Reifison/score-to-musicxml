import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env.js";
import type { ScoreConversionService } from "../services/ScoreConversionService.js";

export interface ScoreConversionQueue {
  enqueue(scoreId: string, attemptId?: string): Promise<void>;
  ping?(): Promise<void>;
  workerReady?(): Promise<boolean>;
  close?(): Promise<void>;
}

export class InlineConversionQueue implements ScoreConversionQueue {
  constructor(private service: ScoreConversionService, private waitForCompletion = false) {}

  async enqueue(scoreId: string, attemptId?: string): Promise<void> {
    const run = this.service.convertScore(scoreId, attemptId);
    if (this.waitForCompletion) await run;
    else void run.catch(() => undefined);
  }
}

export class BullMqScoreConversionQueue implements ScoreConversionQueue {
  private connection: Redis;
  private queue: Queue;

  constructor() {
    this.connection = new Redis(env.REDIS_URL!, { maxRetriesPerRequest: null });
    this.queue = new Queue("score-conversion", { connection: this.connection });
  }

  async enqueue(scoreId: string, attemptId?: string): Promise<void> {
    if (attemptId) {
      const old = await this.queue.getJob(`attempt-${attemptId}`);
      if (old && ["failed", "completed"].includes(await old.getState())) await old.remove();
    }
    await this.queue.add("convert-score", { scoreId, attemptId }, {
      jobId: attemptId ? `attempt-${attemptId}` : undefined,
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 200
    });
  }

  async ping(): Promise<void> { await this.connection.ping(); }
  async workerReady(): Promise<boolean> { return (await this.connection.get("score-conversion:worker-heartbeat")) !== null; }
  async close(): Promise<void> { await this.queue.close(); if (this.connection.status !== "end") await this.connection.quit(); }
}
