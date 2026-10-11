import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { createServices } from "../container.js";
import { prisma } from "../db/prisma.js";

if (!env.REDIS_URL) {
  throw new Error("REDIS_URL é obrigatório para rodar o worker BullMQ.");
}

const services = createServices();
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker(
  "score-conversion",
  async (job) => {
    await services.conversion.convertScore(job.data.scoreId, job.data.attemptId);
  },
  { connection, concurrency: env.OMR_WORKER_CONCURRENCY }
);

const heartbeat = async () => {
  if (connection.status !== "ready") return;
  if (!worker.isRunning() || worker.isPaused()) {
    await connection.del("score-conversion:worker-heartbeat").catch(() => undefined);
    return;
  }
  try { await connection.set("score-conversion:worker-heartbeat", String(Date.now()), "EX", 20); } catch { /* /ready reports unavailable */ }
};
void heartbeat();
const heartbeatTimer = setInterval(() => { void heartbeat(); }, 5_000);
heartbeatTimer.unref();
const reconcile = () => { void services.reconciler.runOnce().catch((error) => console.error("Queue reconciliation failed; will retry", error)); };
const reconcileTimer = setInterval(reconcile, 30_000);
reconcileTimer.unref();
reconcile();
worker.on("closed", () => {
  clearInterval(heartbeatTimer);
  clearInterval(reconcileTimer);
  void connection.del("score-conversion:worker-heartbeat").catch(() => undefined);
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
  void worker.close().finally(async () => { await services.queue.close?.(); if (connection.status !== "end") await connection.quit(); await prisma.$disconnect(); });
});

console.log("Score conversion worker started");
