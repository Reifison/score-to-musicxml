import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env.js";
import type { ScoreConversionService } from "../services/ScoreConversionService.js";

export interface ScoreConversionQueue {
  enqueue(scoreId: string): Promise<void>;
}

export class InlineConversionQueue implements ScoreConversionQueue {
  constructor(private service: ScoreConversionService, private waitForCompletion = false) {}

  async enqueue(scoreId: string): Promise<void> {
    const run = this.service.convertScore(scoreId);
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

  async enqueue(scoreId: string): Promise<void> {
    await this.queue.add("convert-score", { scoreId }, { attempts: 2, backoff: { type: "exponential", delay: 3000 }, removeOnComplete: 100, removeOnFail: 200 });
  }
}
