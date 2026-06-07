import type { User } from "../domain.js";
import { AppError, forbidden, notFound } from "../errors/AppError.js";
import type { AuditRepository, ScoreRepository } from "../repositories/contracts.js";
import { renameOriginalFilename, safeMusicXmlFilename } from "../utils/filenames.js";
import { FileStorageService } from "./FileStorageService.js";

export class ScoreService {
  constructor(
    private scores: ScoreRepository,
    private audits: AuditRepository,
    private storage: FileStorageService
  ) {}

  async listFor(user: User, filters: { status?: string; userId?: string; favorite?: boolean } = {}) {
    if (user.role === "admin") {
      return this.scores.list({
        status: this.parseStatus(filters.status),
        userId: filters.userId,
        favorite: filters.favorite
      });
    }
    return this.scores.list({ userId: user.id, status: this.parseStatus(filters.status), favorite: filters.favorite });
  }

  async getFor(user: User, scoreId: string) {
    const score = await this.scores.findById(scoreId);
    if (!score) throw notFound();
    if (user.role !== "admin" && score.userId !== user.id) throw forbidden();
    return score;
  }

  async deleteFor(user: User, scoreId: string, ipAddress?: string) {
    const score = await this.getFor(user, scoreId);
    await this.storage.deleteUpload(score.storedFilename);
    await this.storage.deleteExport(score.musicxmlFilename);
    await this.scores.delete(score.id);
    await this.audits.create({ actorId: user.id, action: "score_deleted", entity: "score", entityId: score.id, ipAddress });
  }

  async setFavoriteFor(user: User, scoreId: string, isFavorite: boolean) {
    const score = await this.getFor(user, scoreId);
    return this.scores.update(score.id, { isFavorite });
  }

  async renameFor(user: User, scoreId: string, originalFilename: string, ipAddress?: string) {
    const score = await this.getFor(user, scoreId);
    const nextFilename = renameOriginalFilename(score.originalFilename, originalFilename);
    if (!nextFilename) throw new AppError(400, "Nome inválido.", "INVALID_FILENAME");
    if (nextFilename === score.originalFilename) return score;

    const updated = await this.scores.update(score.id, { originalFilename: nextFilename });
    await this.audits.create({
      actorId: user.id,
      action: "score_renamed",
      entity: "score",
      entityId: score.id,
      ipAddress,
      metadata: { from: score.originalFilename, to: nextFilename }
    });
    return updated;
  }

  async downloadFor(user: User, scoreId: string, ipAddress?: string) {
    const score = await this.getFor(user, scoreId);
    if (score.conversionStatus !== "converted" || !score.musicxmlFilename) {
      throw new AppError(409, "MusicXML ainda não disponível para download.", "DOWNLOAD_NOT_READY");
    }
    await this.audits.create({ actorId: user.id, action: "score_downloaded", entity: "score", entityId: score.id, ipAddress });
    return {
      path: this.storage.resolveExportPath(score.musicxmlFilename),
      filename: safeMusicXmlFilename(score.originalFilename)
    };
  }

  private parseStatus(status?: string) {
    if (!status) return undefined;
    if (["uploaded", "queued", "processing", "converted", "failed"].includes(status)) return status as never;
    throw new AppError(400, "Status inválido.", "INVALID_STATUS");
  }
}
