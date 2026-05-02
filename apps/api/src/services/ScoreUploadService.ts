import type { User } from "../domain.js";
import { env } from "../config/env.js";
import type { AuditRepository, ScoreRepository } from "../repositories/contracts.js";
import type { ScoreConversionQueue } from "../queues/ScoreConversionQueue.js";
import { validateUploadedFile } from "../utils/fileValidation.js";
import { FileStorageService } from "./FileStorageService.js";

export class ScoreUploadService {
  constructor(
    private scores: ScoreRepository,
    private audits: AuditRepository,
    private storage: FileStorageService,
    private queue: ScoreConversionQueue
  ) {}

  async upload(input: { user: User; filename: string; buffer: Buffer; ipAddress?: string }) {
    const validated = validateUploadedFile(input.filename, input.buffer, env.MAX_UPLOAD_BYTES);
    const storedFilename = this.storage.generateStoredFilename(validated.originalFilename);
    await this.storage.saveUpload(storedFilename, input.buffer);
    const score = await this.scores.create({
      userId: input.user.id,
      originalFilename: validated.originalFilename,
      storedFilename,
      fileType: validated.fileType,
      mimeType: validated.mimeType,
      fileSize: input.buffer.length,
      uploadStatus: "uploaded",
      conversionStatus: "queued"
    });
    await this.audits.create({ actorId: input.user.id, action: "score_uploaded", entity: "score", entityId: score.id, ipAddress: input.ipAddress, metadata: { originalFilename: validated.originalFilename } });
    await this.audits.create({ actorId: input.user.id, action: "conversion_queued", entity: "score", entityId: score.id, ipAddress: input.ipAddress });
    await this.queue.enqueue(score.id);
    return score;
  }
}
