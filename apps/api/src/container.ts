import { env } from "./config/env.js";
import type { Repositories } from "./repositories/contracts.js";
import { createPrismaRepositories } from "./repositories/prismaRepositories.js";
import { BullMqScoreConversionQueue, InlineConversionQueue, type ScoreConversionQueue } from "./queues/ScoreConversionQueue.js";
import { AuthService } from "./services/AuthService.js";
import { EntitlementService } from "./services/EntitlementService.js";
import { FileStorageService } from "./services/FileStorageService.js";
import { FileSecurityService } from "./services/FileSecurityService.js";
import { createOmrAdapter } from "./services/OmrAdapter.js";
import { RetentionService } from "./services/RetentionService.js";
import { ScoreConversionService } from "./services/ScoreConversionService.js";
import { ScoreService } from "./services/ScoreService.js";
import { ScoreUploadService } from "./services/ScoreUploadService.js";
import { UserService } from "./services/UserService.js";

export type AppServices = ReturnType<typeof createServices>;

export function createServices(repositories: Repositories = createPrismaRepositories(), options: { inlineQueue?: boolean; waitForInlineQueue?: boolean } = {}) {
  const storage = new FileStorageService();
  const fileSecurity = new FileSecurityService();
  const auth = new AuthService(repositories.users, repositories.sessions, repositories.audits);
  const entitlements = new EntitlementService(repositories.entitlements, repositories.audits);
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
    fileSecurity,
    auth,
    entitlements,
    users: new UserService(repositories.users, repositories.audits, auth),
    retention: new RetentionService(repositories.scores, repositories.audits, storage),
    conversion,
    scores: new ScoreService(repositories.scores, repositories.audits, storage),
    uploads: new ScoreUploadService(repositories.audits, storage, queue, entitlements, fileSecurity)
  };
}
