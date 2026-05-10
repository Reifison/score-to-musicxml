import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { createServices } from "../container.js";

if (!env.REDIS_URL) {
  throw new Error("REDIS_URL é obrigatório para rodar o worker BullMQ.");
}

const services = createServices(undefined, { inlineQueue: true });
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

new Worker(
  "score-conversion",
  async (job) => {
    await services.conversion.convertScore(job.data.scoreId);
  },
  { connection, concurrency: env.OMR_WORKER_CONCURRENCY }
);

console.log("Score conversion worker started");
