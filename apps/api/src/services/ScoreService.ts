import type { User } from "../domain.js";
import { AppError, forbidden, notFound } from "../errors/AppError.js";
import type { AuditRepository, ScoreRepository } from "../repositories/contracts.js";
import { renameOriginalFilename, safeMidiFilename, safeMusicXmlFilename } from "../utils/filenames.js";
import { FileStorageService } from "./FileStorageService.js";
import { MidiExportService } from "./MidiExportService.js";

export class ScoreService {
  constructor(
    private scores: ScoreRepository,
    private audits: AuditRepository,
    private storage: FileStorageService,
    private midiExport = new MidiExportService()
  ) {}

  async listFor(user: User, filters: { status?: string; userId?: string; favorite?: boolean } = {}) {
    await this.purgeExpired();
    if (user.role === "admin") {
      return this.scores.list({
        status: this.parseStatus(filters.status),
        userId: filters.userId,
        favorite: filters.favorite
      });
    }
    return this.scores.list({ userId: user.id, status: this.parseStatus(filters.status), favorite: filters.favorite });
  }

  async listTrashFor(user: User, filters: { favorite?: boolean } = {}) {
    await this.purgeExpired();
    return this.scores.listTrash({
      userId: user.role === "admin" ? undefined : user.id,
      favorite: filters.favorite
    });
  }

  async getFor(user: User, scoreId: string) {
    const score = await this.scores.findById(scoreId);
    if (!score) throw notFound();
    if (user.role !== "admin" && score.userId !== user.id) throw forbidden();
    return score;
  }

  async deleteFor(user: User, scoreId: string, ipAddress?: string) {
    const score = await this.getFor(user, scoreId);
    const deletedAt = new Date();
    const purgeAt = new Date(deletedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    await this.scores.softDelete(score.id, { deletedAt, purgeAt });
    await this.audits.create({
      actorId: user.id,
      action: "score_deleted",
      entity: "score",
      entityId: score.id,
      ipAddress,
      metadata: { reason: "trash", deletedAt, purgeAt }
    });
  }

  async restoreFor(user: User, scoreId: string, ipAddress?: string) {
    await this.purgeExpired();
    const score = await this.scores.findByIdIncludingDeleted(scoreId);
    if (!score) throw notFound();
    if (user.role !== "admin" && score.userId !== user.id) throw forbidden();
    if (!score.deletedAt) throw new AppError(409, "A partitura já está na sua lista.", "SCORE_NOT_IN_TRASH");
    const restored = await this.scores.restore(score.id);
    await this.audits.create({ actorId: user.id, action: "score_restored", entity: "score", entityId: score.id, ipAddress });
    return restored;
  }

  async bulkDeleteFor(user: User, scoreIds: string[], ipAddress?: string) {
    const uniqueIds = [...new Set(scoreIds)];
    const scores = await Promise.all(uniqueIds.map((scoreId) => this.getFor(user, scoreId)));
    const deletedAt = new Date();
    const purgeAt = new Date(deletedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    for (const score of scores) {
      await this.scores.softDelete(score.id, { deletedAt, purgeAt });
      await this.audits.create({
        actorId: user.id,
        action: "score_deleted",
        entity: "score",
        entityId: score.id,
        ipAddress,
        metadata: { reason: "trash", deletedAt, purgeAt, bulk: true }
      });
    }
    return { deletedCount: scores.length, purgeAt };
  }

  async bulkFavoriteFor(user: User, scoreIds: string[], isFavorite: boolean) {
    const uniqueIds = [...new Set(scoreIds)];
    const scores = await Promise.all(uniqueIds.map((scoreId) => this.getFor(user, scoreId)));
    for (const score of scores) await this.scores.update(score.id, { isFavorite });
    return { updatedCount: scores.length };
  }

  async setFavoriteFor(user: User, scoreId: string, isFavorite: boolean) {
    const score = await this.getFor(user, scoreId);
    return this.scores.update(score.id, { isFavorite });
  }

  private async purgeExpired() {
    const expired = await this.scores.listExpiredTrash(new Date());
    for (const score of expired) {
      await this.storage.deleteUpload(score.storedFilename);
      await this.storage.deleteExport(score.musicxmlFilename);
      await this.scores.delete(score.id);
      await this.audits.create({
        action: "score_deleted",
        entity: "score",
        entityId: score.id,
        metadata: { reason: "trash_expired", purgeAt: score.purgeAt }
      });
    }
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

    let musicXml: Buffer;
    try {
      musicXml = await this.storage.readExportForDownload(score.musicxmlFilename);
    } catch (error) {
      console.error("MusicXML export unavailable for download", {
        scoreId: score.id,
        exportFilename: score.musicxmlFilename,
        error: fileErrorDetails(error)
      });
      throw new AppError(
        410,
        "O arquivo MusicXML desta partitura não está disponível. Converta o arquivo novamente.",
        "MUSICXML_EXPORT_UNAVAILABLE"
      );
    }

    await this.audits.create({ actorId: user.id, action: "score_downloaded", entity: "score", entityId: score.id, ipAddress });
    return {
      musicXml,
      filename: safeMusicXmlFilename(score.originalFilename)
    };
  }

  async downloadMidiFor(user: User, scoreId: string, ipAddress?: string) {
    const score = await this.getFor(user, scoreId);
    if (score.conversionStatus !== "converted" || !score.musicxmlFilename) {
      throw new AppError(409, "MusicXML ainda não disponível para gerar MIDI.", "MIDI_NOT_READY");
    }

    const musicXml = await this.storage.readExport(score.musicxmlFilename);
    const buffer = await this.midiExport.generate(musicXml);

    await this.audits.create({
      actorId: user.id,
      action: "score_downloaded",
      entity: "score",
      entityId: score.id,
      ipAddress,
      metadata: { format: "midi" }
    });

    return {
      buffer,
      filename: safeMidiFilename(score.originalFilename)
    };
  }

  private parseStatus(status?: string) {
    if (!status) return undefined;
    if (["uploaded", "queued", "processing", "converted", "failed"].includes(status)) return status as never;
    throw new AppError(400, "Status inválido.", "INVALID_STATUS");
  }
}

function fileErrorDetails(error: unknown): Record<string, string | undefined> {
  if (!(error instanceof Error)) return { message: String(error) };
  const errno = error as NodeJS.ErrnoException;
  return { name: error.name, code: errno.code, message: error.message };
}
