import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Score } from "../domain.js";
import type { AuditRepository, ScoreRepository } from "../repositories/contracts.js";
import { basenameWithoutExtension } from "../utils/filenames.js";
import { FileStorageService } from "./FileStorageService.js";
import type { OmrAdapter } from "./OmrAdapter.js";

export class ScoreConversionService {
  constructor(
    private scores: ScoreRepository,
    private audits: AuditRepository,
    private storage: FileStorageService,
    private omr: OmrAdapter
  ) {}

  async convertScore(scoreId: string): Promise<Score> {
    const score = await this.scores.findById(scoreId);
    if (!score) throw new Error("Score not found");

    await this.scores.update(scoreId, { conversionStatus: "processing", errorMessage: null });
    await this.audits.create({ actorId: score.userId, action: "conversion_started", entity: "score", entityId: scoreId });

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "score-omr-"));
    try {
      const inputPath = this.storage.resolveUploadPath(score.storedFilename);
      const result = await this.omr.convert(inputPath, score.originalFilename, tempDir);
      const exportStoredFilename = this.storage.generateExportStoredFilename(score.id);
      await this.storage.saveExport(exportStoredFilename, result.musicXml);
      const updated = await this.scores.update(scoreId, {
        conversionStatus: "converted",
        uploadStatus: "uploaded",
        musicxmlFilename: exportStoredFilename,
        warnings: result.warnings,
        confidence: result.confidence,
        convertedAt: new Date()
      });
      await this.audits.create({
        actorId: score.userId,
        action: "conversion_completed",
        entity: "score",
        entityId: scoreId,
        metadata: { outputBase: `${basenameWithoutExtension(score.originalFilename)}.musicxml`, confidence: result.confidence }
      });
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido na conversão.";
      const updated = await this.scores.update(scoreId, {
        conversionStatus: "failed",
        errorMessage: message.slice(0, 1000)
      });
      await this.audits.create({ actorId: score.userId, action: "conversion_failed", entity: "score", entityId: scoreId, metadata: { message: message.slice(0, 300) } });
      return updated;
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
}
