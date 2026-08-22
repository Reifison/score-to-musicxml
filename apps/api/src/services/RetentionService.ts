import { env } from "../config/env.js";
import type { AuditRepository, ScoreRepository } from "../repositories/contracts.js";
import { FileStorageService } from "./FileStorageService.js";
import { TemporaryFileCleanupService } from "./TemporaryFileCleanupService.js";

export class RetentionService {
  constructor(
    private scores: ScoreRepository,
    private audits: AuditRepository,
    private storage: FileStorageService,
    private temporaryFiles = new TemporaryFileCleanupService()
  ) {}

  async cleanup(ipAddress?: string): Promise<{
    auditsDeleted: number;
    cutoff: { audits: Date; scores: Date };
    scoresDeleted: number;
    tempDirectoriesDeleted: number;
  }> {
    const scoreCutoff = daysAgo(env.SCORE_RETENTION_DAYS);
    const auditCutoff = daysAgo(env.AUDIT_RETENTION_DAYS);
    const expiredScores = await this.scores.listOlderThan(scoreCutoff);
    let scoresDeleted = 0;

    for (const score of expiredScores) {
      await this.storage.deleteUpload(score.storedFilename);
      await this.storage.deleteExport(score.musicxmlFilename);
      await this.scores.delete(score.id);
      await this.audits.create({
        action: "score_deleted",
        entity: "score",
        entityId: score.id,
        ipAddress,
        metadata: { reason: "retention", scoreRetentionDays: env.SCORE_RETENTION_DAYS }
      });
      scoresDeleted += 1;
    }

    const auditsDeleted = await this.audits.deleteOlderThan(auditCutoff);
    const tempDirectoriesDeleted = await this.temporaryFiles.cleanupStaleDirectories();
    return {
      auditsDeleted,
      cutoff: { audits: auditCutoff, scores: scoreCutoff },
      scoresDeleted,
      tempDirectoriesDeleted
    };
  }
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
