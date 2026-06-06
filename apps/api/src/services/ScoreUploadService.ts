import type { User } from "../domain.js";
import { env } from "../config/env.js";
import type { AuditRepository } from "../repositories/contracts.js";
import type { ScoreConversionQueue } from "../queues/ScoreConversionQueue.js";
import { AppError } from "../errors/AppError.js";
import { validateUploadedFile } from "../utils/fileValidation.js";
import { EntitlementService } from "./EntitlementService.js";
import { FileStorageService } from "./FileStorageService.js";
import { FileSecurityService } from "./FileSecurityService.js";

export class ScoreUploadService {
  constructor(
    private audits: AuditRepository,
    private storage: FileStorageService,
    private queue: ScoreConversionQueue,
    private entitlements: EntitlementService,
    private fileSecurity: FileSecurityService
  ) {}

  async upload(input: { user: User; filename: string; buffer: Buffer; ipAddress?: string; preprocessingProfile?: string | null }) {
    const validated = validateUploadedFile(input.filename, input.buffer, env.MAX_UPLOAD_BYTES);
    const preprocessingProfile = validated.fileType === "image" ? parsePreprocessingProfile(input.preprocessingProfile) : null;
    await this.entitlements.assertCanUpload(input.user);
    await this.fileSecurity.scan(input.buffer, validated.originalFilename);
    const safeBuffer = await this.fileSecurity.stripImageMetadata(input.buffer, validated.mimeType);
    if (safeBuffer.length > env.MAX_UPLOAD_BYTES) {
      throw new AppError(413, "Imagem processada ficou acima do tamanho máximo permitido.", "FILE_TOO_LARGE");
    }
    const storedFilename = this.storage.generateStoredFilename(validated.originalFilename);
    await this.storage.saveUpload(storedFilename, safeBuffer);
    let score;
    try {
      score = await this.entitlements.createScoreForUpload({
        userId: input.user.id,
        originalFilename: validated.originalFilename,
        storedFilename,
        fileType: validated.fileType,
        mimeType: validated.mimeType,
        fileSize: safeBuffer.length,
        preprocessingProfile,
        uploadStatus: "uploaded",
        conversionStatus: "queued"
      }, input.ipAddress);
    } catch (error) {
      await this.storage.deleteUpload(storedFilename);
      throw error;
    }
    await this.audits.create({ actorId: input.user.id, action: "score_uploaded", entity: "score", entityId: score.id, ipAddress: input.ipAddress, metadata: { originalFilename: validated.originalFilename } });
    await this.audits.create({ actorId: input.user.id, action: "conversion_queued", entity: "score", entityId: score.id, ipAddress: input.ipAddress });
    await this.queue.enqueue(score.id);
    return score;
  }
}

function parsePreprocessingProfile(value: string | null | undefined): string | null {
  return value === "document_scanner" ? value : null;
}
