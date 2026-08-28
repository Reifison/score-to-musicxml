import { constants as fileSystemConstants } from "node:fs";
import fs from "node:fs/promises";
import type { Score } from "../domain.js";
import type { AuditRepository, ScoreRepository } from "../repositories/contracts.js";
import type { ScoreConversionQueue } from "../queues/ScoreConversionQueue.js";
import { validateUploadedFile } from "../utils/fileValidation.js";
import { FileStorageService } from "./FileStorageService.js";

type UploadSecurityCheck = {
  scan(buffer: Buffer, originalFilename: string): Promise<void>;
};

export type MissingMusicXmlExportRepairSummary = {
  checked: number;
  exportsUnavailable: number;
  recoverable: number;
  queued: number;
  skipped: {
    exportBecameAvailable: number;
    invalidUpload: number;
    stateChanged: number;
  };
  queueFailures: number;
};

/**
 * Finds converted scores whose MusicXML has disappeared and, only when asked
 * explicitly, puts the safe subset back on the regular conversion queue.
 */
export class MissingMusicXmlExportRepairService {
  constructor(
    private scores: ScoreRepository,
    private audits: AuditRepository,
    private storage: FileStorageService,
    private uploadSecurity: UploadSecurityCheck,
    private maxUploadBytes: number,
    private queue?: ScoreConversionQueue
  ) {}

  async run(options: { apply?: boolean } = {}): Promise<MissingMusicXmlExportRepairSummary> {
    const apply = options.apply === true;
    if (apply && !this.queue) throw new Error("Repair queue is required when apply mode is enabled.");

    const summary: MissingMusicXmlExportRepairSummary = {
      checked: 0,
      exportsUnavailable: 0,
      recoverable: 0,
      queued: 0,
      skipped: { exportBecameAvailable: 0, invalidUpload: 0, stateChanged: 0 },
      queueFailures: 0
    };
    const convertedScores = await this.scores.list({ status: "converted" });

    for (const score of convertedScores) {
      summary.checked += 1;
      if (await this.hasReadableExport(score)) continue;
      summary.exportsUnavailable += 1;

      if (!await this.hasRecoverableUpload(score)) {
        summary.skipped.invalidUpload += 1;
        continue;
      }
      summary.recoverable += 1;
      if (!apply) continue;

      try {
        const current = await this.scores.claimRepair(score.id);
        if (!current) {
          summary.skipped.stateChanged += 1;
          continue;
        }
        if (await this.hasReadableExport(current)) {
          await this.scores.update(current.id, { conversionStatus: "converted" });
          summary.skipped.exportBecameAvailable += 1;
          continue;
        }
        await this.queue!.enqueue(current.id);
        await this.audits.create({
          actorId: current.userId,
          action: "conversion_queued",
          entity: "score",
          entityId: current.id,
          metadata: { reason: "missing_or_unreadable_musicxml_export", automated: true }
        });
        summary.queued += 1;
      } catch (error) {
        summary.queueFailures += 1;
        await this.scores.update(score.id, { conversionStatus: "converted" }).catch(() => undefined);
        console.error("MusicXML export repair queue failed", {
          scoreId: score.id,
          errorCode: errorCode(error)
        });
      }
    }

    return summary;
  }

  private async hasReadableExport(score: Score): Promise<boolean> {
    if (!score.musicxmlFilename) return false;
    return this.storage.isReadableExport(score.musicxmlFilename);
  }

  private async hasRecoverableUpload(score: Score): Promise<boolean> {
    try {
      const uploadPath = this.storage.resolveUploadPath(score.storedFilename);
      const handle = await fs.open(uploadPath, fileSystemConstants.O_RDONLY | fileSystemConstants.O_NOFOLLOW);
      try {
        const details = await handle.stat();
        if (!details.isFile() || details.size !== score.fileSize || details.size > this.maxUploadBytes) return false;
        const upload = await handle.readFile();
        const validated = validateUploadedFile(score.originalFilename, upload, this.maxUploadBytes);
        if (validated.fileType !== score.fileType || validated.mimeType !== score.mimeType) return false;
        await this.uploadSecurity.scan(upload, validated.originalFilename);
        return true;
      } finally {
        await handle.close();
      }
    } catch {
      return false;
    }
  }
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return error instanceof Error ? error.name : "UNKNOWN";
}
