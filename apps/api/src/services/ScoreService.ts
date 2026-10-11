import { createHash } from "node:crypto";
import type { ScoreType, User } from "../domain.js";
import { AppError, forbidden, notFound } from "../errors/AppError.js";
import type { AuditRepository, ScoreRepository } from "../repositories/contracts.js";
import type { ScoreConversionQueue } from "../queues/ScoreConversionQueue.js";
import { renameOriginalFilename, safeMidiFilename, safeMusicXmlFilename } from "../utils/filenames.js";
import { FileStorageService } from "./FileStorageService.js";
import { MidiExportService } from "./MidiExportService.js";
import { reviewRevision, scoreAvailability } from "./MusicalReview.js";
import { applyVisualCorrection } from "./VisualMusicXml.js";
import { inspectMusicXmlValidation } from "./MusicXmlValidation.js";
import { inspectMidiForReview, reviewAcceptanceFor, withMidiValidation } from "./MidiReviewPreflight.js";
import { AutomaticDeliveryService } from "./AutomaticDeliveryService.js";

export class ScoreService {
  constructor(
    private scores: ScoreRepository,
    private audits: AuditRepository,
    private storage: FileStorageService,
    private midiExport = new MidiExportService(),
    private queue?: ScoreConversionQueue,
    private automaticDelivery = true
  ) {}

  async listFor(user: User, filters: { status?: string; userId?: string; favorite?: boolean } = {}) {
    await this.purgeExpired();
    const delivery = this.automaticDelivery ? new AutomaticDeliveryService(this.scores, this.audits, this.storage, this.midiExport) : null;
    if (user.role === "admin") {
      const listed = await this.scores.list({
        status: this.parseStatus(filters.status),
        userId: filters.userId,
        favorite: filters.favorite
      });
      return Promise.all(listed.map(async (score) => delivery && score.reviewStatus === "needs_review"
        ? await delivery.finalize(score.id).catch(() => score) ?? score : score));
    }
    const listed = await this.scores.list({ userId: user.id, status: this.parseStatus(filters.status), favorite: filters.favorite });
    return Promise.all(listed.map(async (score) => delivery && score.reviewStatus === "needs_review"
      ? await delivery.finalize(score.id).catch(() => score) ?? score : score));
  }

  async listTrashFor(user: User, filters: { favorite?: boolean } = {}) {
    await this.purgeExpired();
    return this.scores.listTrash({
      userId: user.role === "admin" ? undefined : user.id,
      favorite: filters.favorite
    });
  }

  async getFor(user: User, scoreId: string) {
    let score = await this.scores.findById(scoreId);
    if (!score) throw notFound();
    if (user.role !== "admin" && score.userId !== user.id) throw forbidden();
    if (this.automaticDelivery && score.reviewStatus === "needs_review") score = await new AutomaticDeliveryService(this.scores, this.audits, this.storage, this.midiExport)
      .finalize(scoreId).catch(() => score) ?? score;
    const attempts = await this.scores.listAttempts(score.id);
    return { ...score, attempts, ...scoreAvailability(score) };
  }

  async approveReviewFor(user: User, scoreId: string, revision: string, ipAddress?: string) {
    const score = await this.getFor(user, scoreId);
    if (!score.musicxmlFilename || !score.reviewRevision || score.reviewRevision !== revision) {
      throw new AppError(409, "A prévia mudou. Abra a versão atual e confira novamente.", "REVIEW_REVISION_CHANGED");
    }
    const xml = await this.storage.readExport(score.musicxmlFilename);
    if (reviewRevision(score.musicxmlFilename, xml) !== revision) {
      throw new AppError(409, "O conteúdo desta versão mudou. Reprocesse antes de revisar.", "REVIEW_REVISION_CHANGED");
    }
    if (score.validation?.visualReview?.proposals.some((proposal) => proposal.status === "pending")) {
      throw new AppError(409, "Confira as propostas de correção antes de finalizar esta versão.", "VISUAL_PROPOSALS_PENDING");
    }
    if (score.reviewStatus === "approved") {
      const existing = await this.scores.approveReview(scoreId, revision, user.id);
      if (!existing) throw new AppError(409, "Há uma conversão em andamento ou a prévia mudou.", "REVIEW_REVISION_CHANGED");
      return this.getFor(user, scoreId);
    }
    const validation = withMidiValidation(score.validation ?? inspectMusicXmlValidation(xml), await inspectMidiForReview(xml, this.midiExport));
    validation.reviewAcceptance = reviewAcceptanceFor(validation, revision);
    const approved = await this.scores.approveReview(scoreId, revision, user.id, validation);
    if (!approved) throw new AppError(409, "Há uma conversão em andamento ou a prévia mudou. Aguarde e confira a versão atual.", "REVIEW_REVISION_CHANGED");
    await this.audits.create({ actorId: user.id, action: "score_reviewed", entity: "score", entityId: scoreId, ipAddress,
      metadata: { revision, decision: user.role === "admin" ? "admin_confirmed_preview" : "user_confirmed_preview", actorRole: user.role,
        acceptance: validation.reviewAcceptance, midiValidationStatus: validation.midiValidation?.status,
        accuracyVerified: false, trainingEligible: false } }).catch(() => undefined);
    return this.getFor(user, scoreId);
  }

  async decideVisualProposalFor(user: User, scoreId: string, revision: string, proposalId: string, decision: "accept" | "reject" | "undo", ipAddress?: string) {
    const score = await this.getFor(user, scoreId);
    const report = score.validation?.visualReview;
    if (score.reviewStatus !== "needs_review" || !score.musicxmlFilename || !score.reviewRevision || score.reviewRevision !== revision || !report) {
      throw new AppError(409, "A revisão mudou. Abra a versão atual antes de decidir.", "REVIEW_REVISION_CHANGED");
    }
    const oldXml = await this.storage.readExport(score.musicxmlFilename);
    if (reviewRevision(score.musicxmlFilename, oldXml) !== revision || createHash("sha256").update(oldXml).digest("hex") !== report.xmlSHA256) {
      throw new AppError(409, "O conteúdo da prévia mudou. Reprocesse antes de corrigir.", "REVIEW_REVISION_CHANGED");
    }
    const proposal = report.proposals.find((entry) => entry.id === proposalId);
    if (!proposal) throw new AppError(404, "Proposta não encontrada nesta versão.", "VISUAL_PROPOSAL_NOT_FOUND");
    if (report.history.length >= 5000) throw new AppError(409, "O limite do histórico de revisão foi atingido.", "VISUAL_REVIEW_LIMIT");
    if ((decision === "undo" && proposal.status === "pending") || (decision !== "undo" && proposal.status !== "pending")) {
      throw new AppError(409, "A proposta já recebeu outra decisão. Atualize a revisão.", "VISUAL_PROPOSAL_ALREADY_DECIDED");
    }
    let xml = oldXml;
    try {
      if (decision === "accept") xml = applyVisualCorrection(oldXml, proposal, "accept");
      else if (decision === "undo" && proposal.status === "accepted") xml = applyVisualCorrection(oldXml, proposal, "undo");
    } catch {
      throw new AppError(409, "Esta alteração exige revisão manual ou o evento já mudou. Confira novamente o trecho.", "VISUAL_CORRECTION_UNSAFE");
    }
    const nextReport = structuredClone(report);
    nextReport.proposals.find((entry) => entry.id === proposalId)!.status = decision === "accept" ? "accepted" : decision === "reject" ? "rejected" : "pending";
    nextReport.xmlSHA256 = createHash("sha256").update(xml).digest("hex");
    const filename = this.storage.generateExportStoredFilename(score.id);
    const nextRevision = reviewRevision(filename, xml);
    nextReport.history.push({ proposalId, decision, baseRevision: revision, revision: nextRevision, actorId: user.id, at: new Date().toISOString(),
      exportFilename: filename, previousExportFilename: score.musicxmlFilename });
    const validation = withMidiValidation({ ...inspectMusicXmlValidation(xml), visualReview: nextReport, requiresReview: true }, await inspectMidiForReview(xml, this.midiExport));
    const warnings = validation.issues.map((issue) => issue.message);
    let published = false;
    try {
      await this.storage.saveExport(filename, xml);
      await this.storage.saveReviewDecisionEvidence(filename, { parentFilename: score.musicxmlFilename, revision: nextRevision, validation });
      const result = await this.scores.publishReviewDecision(scoreId, revision, { musicxmlFilename: filename, reviewRevision: nextRevision, validation, warnings });
      if (!result) throw new AppError(409, "Há uma conversão ou outra decisão em andamento. Atualize a revisão.", "REVIEW_REVISION_CHANGED");
      published = true;
    } finally {
      if (!published) await this.storage.deleteExport(filename).catch(() => undefined);
    }
    await this.audits.create({ actorId: user.id, action: "score_reviewed", entity: "score", entityId: scoreId, ipAddress,
      metadata: { decision: `visual_${decision}`, proposalId, baseRevision: revision, revision: nextRevision,
        page: proposal.page, partId: proposal.partId, measure: proposal.measure, before: proposal.before, after: proposal.after,
        accuracyVerified: false, trainingEligible: false } }).catch(() => undefined);
    return this.getFor(user, scoreId);
  }

  async evidenceFor(user: User, scoreId: string) {
    const score = await this.getFor(user, scoreId);
    if (!score.musicxmlFilename) throw new AppError(404, "Evidências ainda não disponíveis.", "EVIDENCE_NOT_FOUND");
    return this.storage.readConversionEvidence(score.musicxmlFilename);
  }

  async evidenceAssetFor(user: User, scoreId: string, asset: string) {
    const score = await this.getFor(user, scoreId);
    if (!score.musicxmlFilename) throw new AppError(404, "Evidências ainda não disponíveis.", "EVIDENCE_NOT_FOUND");
    return this.storage.resolveEvidenceAsset(score.musicxmlFilename, asset);
  }

  async retryFor(user: User, scoreId: string, ipAddress?: string, scoreType?: ScoreType) {
    const score = await this.getFor(user, scoreId);
    if (!score.scoreTypeSelected && !scoreType) throw new AppError(409, "Escolha o tipo de partitura para reprocessar este envio antigo.", "SCORE_TYPE_REQUIRED");
    if (score.attempts?.some((attempt) => attempt.kind === "manual")) throw new AppError(409, "A tentativa manual deste envio já foi utilizada.", "MANUAL_RETRY_LIMIT");
    if (score.attempts?.some((attempt) => attempt.status === "queued" || attempt.status === "processing")) throw new AppError(409, "Já existe uma conversão em andamento.", "CONVERSION_IN_PROGRESS");
    let attempt;
    try { attempt = await this.scores.createManualAttempt(scoreId, scoreType); }
    catch (error) {
      if ((error as { code?: string }).code === "P2002" || (error instanceof Error && error.message === "Duplicate conversion attempt kind")) {
        throw new AppError(409, "A tentativa manual deste envio já foi utilizada.", "MANUAL_RETRY_LIMIT");
      }
      throw error;
    }
    await this.audits.create({ actorId: user.id, action: "conversion_queued", entity: "score", entityId: scoreId, ipAddress, metadata: { attemptId: attempt.id, kind: "manual" } }).catch(() => undefined);
    await this.queue?.enqueue(scoreId, attempt.id).catch(() => undefined);
    return this.getFor(user, scoreId);
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
      await this.storage.deleteExportHistory(score.musicxmlFilename);
      for (const attempt of await this.scores.listAttempts(score.id)) if (attempt.musicxmlFilename !== score.musicxmlFilename) await this.storage.deleteExport(attempt.musicxmlFilename);
      for (const filename of new Set((score.validation?.visualReview?.history ?? []).flatMap((entry) => [entry.exportFilename, entry.previousExportFilename]))) {
        if (filename) await this.storage.deleteExport(filename);
      }
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

  async downloadFor(user: User, scoreId: string, ipAddress?: string, preview = false) {
    const score = await this.getFor(user, scoreId);
    if (!score.musicxmlFilename || (score.resultStatus && !score.coverage)) {
      throw new AppError(409, "MusicXML ainda não disponível para download.", "DOWNLOAD_NOT_READY");
    }
    if (!preview && !score.canDownloadMusicXml) throw new AppError(409, "Confira a prévia e finalize a revisão antes de baixar.", "REVIEW_REQUIRED");
    let musicXml: Buffer;
    try {
      musicXml = await this.storage.readExportForDownload(score.musicxmlFilename);
    } catch (error) {
      const errorCode = error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
      console.error("MusicXML export unavailable for download", { scoreId: score.id, errorCode });
      throw new AppError(410, "O arquivo MusicXML desta partitura não está disponível. Converta o arquivo novamente.", "MUSICXML_EXPORT_UNAVAILABLE");
    }
    if (!preview) await this.audits.create({ actorId: user.id, action: "score_downloaded", entity: "score", entityId: score.id, ipAddress });
    return {
      musicXml,
      filename: safeMusicXmlFilename(score.originalFilename),
      resultStatus: score.resultStatus ?? "unverified",
      missingPages: score.coverage?.missingPages ?? [],
      reviewStatus: score.reviewStatus
    };
  }

  async downloadMidiFor(user: User, scoreId: string, ipAddress?: string) {
    const score = await this.getFor(user, scoreId);
    if (score.resultStatus !== "complete" || !score.scoreTypeSelected || !score.coverage || !score.musicxmlFilename) {
      if (score.resultStatus === "partial") throw new AppError(409, "MIDI indisponível para resultado parcial; confira as páginas ausentes no MusicXML.", "PARTIAL_PLAYBACK_BLOCKED");
      throw new AppError(409, "MusicXML ainda não disponível para gerar MIDI.", "MIDI_NOT_READY");
    }

    if (score.reviewStatus !== "approved") throw new AppError(409, "Confira a prévia e finalize a revisão antes de gerar MIDI.", "REVIEW_REQUIRED");
    if (score.validation?.midiValidation?.status === "failed") {
      throw new AppError(422, "O MIDI desta versão apresentou uma divergência. Confira os avisos e corrija a partitura antes de exportar o áudio.", "MIDI_VALIDATION_FAILED");
    }
    if (score.validation?.midiValidation?.status === "unverified") {
      throw new AppError(422, "A conferência do MIDI está indisponível para esta versão.", "MIDI_PREFLIGHT_UNAVAILABLE");
    }
    if (score.validation?.midiValidation?.issues.some((issue) => issue.code === "MIDI_EVENTS_UNVERIFIED")) {
      throw new AppError(422, "Confira as ligaduras e casas de repetição antes de gerar o MIDI desta versão.", "MIDI_EVENTS_UNVERIFIED");
    }
    if (score.validation?.midiValidation?.issues.some((issue) => issue.code === "MIDI_PREFLIGHT_UNAVAILABLE")) {
      throw new AppError(422, "A conferência do MIDI está indisponível. Reprocesse esta versão antes de gerar o áudio.", "MIDI_PREFLIGHT_UNAVAILABLE");
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
