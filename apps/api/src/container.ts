import { env } from "./config/env.js";
import type { Repositories } from "./repositories/contracts.js";
import { createPrismaRepositories } from "./repositories/prismaRepositories.js";
import { BullMqScoreConversionQueue, InlineConversionQueue, type ScoreConversionQueue } from "./queues/ScoreConversionQueue.js";
import { AuthService } from "./services/AuthService.js";
import { FileStorageService } from "./services/FileStorageService.js";
import { createOmrAdapter } from "./services/OmrAdapter.js";
import { ScoreConversionService } from "./services/ScoreConversionService.js";
import { ScoreService } from "./services/ScoreService.js";
import { ScoreUploadService } from "./services/ScoreUploadService.js";
import { UserService } from "./services/UserService.js";

export type AppServices = ReturnType<typeof createServices>;

export function createServices(repositories: Repositories = createPrismaRepositories(), options: { inlineQueue?: boolean; waitForInlineQueue?: boolean } = {}) {
  const storage = new FileStorageService();
  const auth = new AuthService(repositories.users, repositories.sessions, repositories.audits);
  const conversion = new ScoreConversionService(repositories.scores, repositories.audits, storage, createOmrAdapter());
  let queue: ScoreConversionQueue;
  if (options.inlineQueue || !env.REDIS_URL) {
    queue = new InlineConversionQueue(conversion, options.waitForInlineQueue);
  } else {
    queue = new BullMqScoreConversionQueue();
  }
  return {
    repositories,
    storage,
    auth,
    users: new UserService(repositories.users, repositories.audits, auth),
    conversion,
    scores: new ScoreService(repositories.scores, repositories.audits, storage),
    uploads: new ScoreUploadService(repositories.scores, repositories.audits, storage, queue)
  };
}
