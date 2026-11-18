import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "../config/env.js";
import type { ConversionAttempt, ConversionCoverage, ConversionPreview, ConversionProgress, Score } from "../domain.js";
import { AppError } from "../errors/AppError.js";
import type { ScoreConversionQueue } from "../queues/ScoreConversionQueue.js";
import type { AuditRepository, ScoreRepository } from "../repositories/contracts.js";
import { basenameWithoutExtension } from "../utils/filenames.js";
import { FileStorageService } from "./FileStorageService.js";
import type { OmrAdapter, OmrPageProgress, OmrReadyPage, OmrResult } from "./OmrAdapter.js";
import { inspectMusicXml } from "./MusicXmlCoverage.js";
import { preparingProgress } from "./ConversionProgress.js";
import { inspectMusicXmlRhythm } from "./MusicXmlRhythm.js";
import { inspectMusicXmlValidation } from "./MusicXmlValidation.js";
import { reviewRevision } from "./MusicalReview.js";
import { withConversionSignal } from "./SubprocessRunner.js";
import { SourceVisualValidationService } from "./SourceVisualValidationService.js";
import { MidiExportService } from "./MidiExportService.js";
import { inspectMidiForReview, withMidiValidation } from "./MidiReviewPreflight.js";
import { AutomaticDeliveryService } from "./AutomaticDeliveryService.js";
import { NotesRhythmReferenceService, isCurrentNotesRhythmReference, referenceReuseVisualReview } from "./NotesRhythmReferenceService.js";

const pipelineVersion = "notes-rhythm-v7";

function errorCode(error: unknown): string {
  if (error instanceof AppError) return error.code;
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return "OMR_UNKNOWN_FAILURE";
}

export function isTemporaryConversionError(code: string): boolean {
  // Replaying the same CPU-bound conversion after its budget expires doubles the wait.
  // Keep the explicit user retry available, but reserve automatic retries for transient failures.
  return ["ETIMEDOUT", "EIO", "ENOSPC", "ECONNRESET", "OMR_TEMPORARY_FAILURE"].includes(code);
}

export function validCoverage(coverage: ConversionCoverage | undefined): coverage is ConversionCoverage {
  if (!coverage || !Number.isInteger(coverage.totalPages) || coverage.totalPages < 1) return false;
  const excluded = coverage.excludedPages ?? [];
  const uncertain = coverage.uncertainPages ?? [];
  const unsupported = coverage.unsupportedPages ?? [];
  const all = [...coverage.processedPages, ...coverage.missingPages, ...excluded];
  if (!coverage.processedPages.length || all.length !== coverage.totalPages || new Set(all).size !== coverage.totalPages) return false;
  if (all.some((page) => !Number.isInteger(page) || page < 1 || page > coverage.totalPages)) return false;
  if (new Set(uncertain).size !== uncertain.length || uncertain.some((page) => !Number.isInteger(page) || page < 1 || page > coverage.totalPages || excluded.includes(page))) return false;
  if (new Set(unsupported).size !== unsupported.length || unsupported.some((page) => !coverage.missingPages.includes(page))) return false;
  return coverage.pages.length === coverage.totalPages && new Set(coverage.pages.map((page) => page.page)).size === coverage.totalPages && coverage.pages.every((page) =>
    page.page >= 1 && page.page <= coverage.totalPages && (page.contentRole === "uncertain") === uncertain.includes(page.page)
    && (page.supportStatus === "unsupported") === unsupported.includes(page.page)
    && (page.status === "processed" ? coverage.processedPages.includes(page.page) && page.parts.length > 0 && page.contentRole !== "nonmusical"
      : page.status === "missing" ? coverage.missingPages.includes(page.page) && page.parts.length === 0 && page.contentRole !== "nonmusical"
        : page.status === "excluded" && excluded.includes(page.page) && page.parts.length === 0 && page.contentRole === "nonmusical"
          && page.classification?.method === "verified_manual_v1" && page.classification.decision === "nonmusical"
          && Boolean(page.classification.reviewer?.trim()) && Boolean(page.classification.reason?.trim())
          && /^[a-f0-9]{64}$/.test(page.classification.sourceSHA256 ?? "") && /^[a-f0-9]{64}$/.test(page.classification.originalImageSHA256 ?? ""))
  );
}

export class ScoreConversionService {
  private queue?: ScoreConversionQueue;

  constructor(
    private scores: ScoreRepository,
    private audits: AuditRepository,
    private storage: FileStorageService,
    private omr: OmrAdapter,
    private sourceVisual = new SourceVisualValidationService({ readerExecutable: env.SOURCE_VISUAL_READER_BIN,
      maxPages: env.SOURCE_VISUAL_MAX_PAGES, maxMeasures: env.SOURCE_VISUAL_MAX_MEASURES, timeoutMs: env.SOURCE_VISUAL_TIMEOUT_MS }),
    private midiInspector = new MidiExportService(),
    private automaticDelivery = true,
    private references = new NotesRhythmReferenceService(storage)
  ) {}

  setQueue(queue: ScoreConversionQueue): void { this.queue = queue; }

  async convertScore(scoreId: string, attemptId?: string): Promise<Score> {
    let score = await this.scores.findById(scoreId);
    if (!score) throw new AppError(404, "Partitura não encontrada.", "SCORE_NOT_FOUND");
    const attempt = await this.findQueuedAttempt(scoreId, attemptId);
    if (!attempt) return score;
    const claimToken = await this.scores.claimAttempt(attempt.id);
    if (!claimToken) return (await this.scores.findById(scoreId)) ?? score;
    score = (await this.scores.findById(scoreId)) ?? score;
    await this.auditSafely({ actorId: score.userId, action: "conversion_started", entity: "score", entityId: scoreId, metadata: { attemptId: attempt.id, kind: attempt.kind } });

    let tempDir: string | null = null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new AppError(504, "Tempo máximo de conversão excedido.", "OMR_CONVERSION_TIMEOUT")), env.OMR_CONVERSION_TIMEOUT_MS);
    let exportStoredFilename: string | null = null;
    let pagePreview: ConversionPreview | null = null;
    let progress: ConversionProgress = preparingProgress(attempt.id);
    const onProgress = async (snapshot: OmrPageProgress): Promise<void> => {
      if (controller.signal.aborted) throw controller.signal.reason;
      const next: ConversionProgress = { ...snapshot, attemptId: attempt.id, updatedAt: new Date().toISOString() };
      if (!await this.scores.updateConversionProgress(scoreId, attempt.id, claimToken, next)) {
        controller.abort(new AppError(409, "Esta conversão foi retomada por outra execução.", "OMR_ATTEMPT_SUPERSEDED"));
        throw controller.signal.reason;
      }
      progress = next;
    };
    const onPageReady = async (page: OmrReadyPage): Promise<void> => {
      if (page.page !== 1 || page.totalPages <= 1 || pagePreview) return;
      if (controller.signal.aborted) throw controller.signal.reason;
      try {
        inspectMusicXml(page.result.musicXml, 1, score.scoreType ?? "melody");
        pagePreview = await this.storage.saveFirstPagePreview(score.storedFilename, attempt.id, page.totalPages,
          page.result.musicXml, page.result.warnings);
        if (controller.signal.aborted) throw controller.signal.reason;
        if (!await this.scores.publishConversionPreview(scoreId, attempt.id, claimToken, pagePreview)) {
          controller.abort(new AppError(409, "Esta conversão foi retomada por outra execução.", "OMR_ATTEMPT_SUPERSEDED"));
          throw controller.signal.reason;
        }
      } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason;
        // Preview availability must not discard a healthy page or its final
        // conversion. The normal result still goes through every validator.
        console.warn("First-page preview unavailable", { scoreId, attemptId: attempt.id, code: errorCode(error) });
      }
    };
    try {
      await onProgress({ ...progress, stage: "preparing" });
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "score-omr-"));
      // macOS exposes its temporary directory through /var -> /private/var.
      // Use one canonical root for OMR evidence and checkpoint containment.
      tempDir = await fs.realpath(tempDir);
      const workDir = tempDir;
      const inputPath = this.storage.resolveUploadPath(score.storedFilename);
      const lookup = await this.references.lookup({ sourcePath: inputPath, ownerUserId: score.userId,
        scoreType: score.scoreType ?? "melody", scoreTypeSelected: score.scoreTypeSelected === true });
      const reference = lookup.match && isCurrentNotesRhythmReference(lookup.match.reference,
        await this.scores.findById(lookup.match.reference.sourceScoreId)) ? lookup.match : null;
      const referenceReuse = reference ? { scope: "notes_rhythm" as const, sourceSHA256: reference.reference.sourceSHA256,
        referenceScoreId: reference.reference.sourceScoreId, referenceRevision: reference.reference.sourceReviewRevision,
        referenceXmlSHA256: reference.reference.xmlSHA256, kind: reference.reference.referenceKind,
        accuracyVerified: false as const, trainingEligible: false as const } : undefined;
      const conversionMode = reference ? "reference_reuse" : "omr";
      const result: OmrResult = reference ? { musicXml: reference.musicXml, coverage: reference.coverage,
        warnings: ["Notas e ritmo reaproveitados da revisão autorizada deste mesmo arquivo."],
        engine: { name: "notes-rhythm-reference", version: "1" } }
        : await withConversionSignal(controller.signal, () => this.omr.convert(inputPath, score.originalFilename, workDir, {
          preprocessingProfile: score.preprocessingProfile, scoreType: score.scoreType ?? "melody", scoreTypeSelected: score.scoreTypeSelected === true,
          experimentalAutomaticRecovery: env.EXPERIMENTAL_NATIVE_EVENT_RECOVERY,
          signal: controller.signal, checkpointDirectory: this.storage.resolveConversionCheckpointDirectory(score.storedFilename), onProgress, onPageReady }));
      if (controller.signal.aborted) throw controller.signal.reason;
      const coverage = result.coverage;
      if (!validCoverage(coverage)) {
        throw new AppError(422, "O reconhecimento não informou cobertura verificável das páginas.", "OMR_COVERAGE_MISSING");
      }
      await onProgress({ stage: "validating", totalPages: coverage.totalPages, currentPage: null,
        completedPages: [...coverage.processedPages], failedPages: [...coverage.missingPages], excludedPages: [...(coverage.excludedPages ?? [])],
        reusedPages: progress.reusedPages.filter((page) => coverage.processedPages.includes(page)) });
      const resultStatus = coverage.missingPages.length || coverage.uncertainPages?.length ? "partial" : "complete";
      const rhythm = inspectMusicXmlRhythm(result.musicXml);
      const finalValidation = inspectMusicXmlValidation(result.musicXml);
      const combinedIssues = [...new Map([...finalValidation.issues, ...(result.validation?.issues ?? [])]
        .map((issue) => [JSON.stringify(issue), issue])).values()];
      const visual = reference ? { review: referenceReuseVisualReview(reference), assets: [] }
        : await withConversionSignal(controller.signal, () => this.sourceVisual.evaluate({
        sourcePath: inputPath, workDir, musicXml: result.musicXml, coverage, candidates: result.evidence ?? []
      }));
      if (lookup.diagnostic || (lookup.match && !reference)) {
        visual.review.diagnostics = [...(visual.review.diagnostics ?? []), {
          code: lookup.diagnostic ?? "NOTES_RHYTHM_REFERENCE_STALE",
          message: "A revisão cadastrada não pôde ser reutilizada; foi realizada uma nova leitura do arquivo."
        }];
      }
      if (controller.signal.aborted) throw controller.signal.reason;
      const midiValidation = await withConversionSignal(controller.signal, () => inspectMidiForReview(result.musicXml, this.midiInspector));
      if (controller.signal.aborted) throw controller.signal.reason;
      const validation = withMidiValidation({ ...finalValidation, issues: combinedIssues, visualReview: visual.review,
        ...(referenceReuse ? { referenceReuse } : {}), requiresReview: true }, midiValidation);
      const warnings = [...new Set([...result.warnings, ...rhythm.warnings, ...validation.issues
        .filter((issue) => !["RHYTHM_SHORT", "RHYTHM_LONG", "RHYTHM_INVALID_POSITION"].includes(issue.code)).map((issue) => issue.message)])];
      exportStoredFilename = this.storage.generateExportStoredFilename(score.id);
      const revision = reviewRevision(exportStoredFilename, result.musicXml);
      await this.storage.saveExport(exportStoredFilename, result.musicXml);
      await this.storage.saveConversionEvidence(exportStoredFilename, {
        sourcePath: inputPath, workDir, revision,
        metadata: { parentExportFilename: score.musicxmlFilename, attemptId: attempt.id, engine: result.engine ?? { name: env.OMR_ENGINE, version: null },
          pipelineVersion, conversionMode, reusedPages: progress.reusedPages, referenceReuse: referenceReuse ?? null, preprocessingProfile: score.preprocessingProfile, scoreType: score.scoreType,
          validation, coverage, diagnosticCodes: [...new Set([...validation.issues.map((issue) => issue.code), ...(validation.visualReview?.diagnostics ?? []).map((item) => item.code)])], accuracyVerified: false },
        candidates: result.evidence ?? [], visualAssets: visual.assets
      });
      const updated = await this.scores.publishResult(scoreId, attempt.id, claimToken, {
        resultStatus,
        coverage,
        musicxmlFilename: exportStoredFilename,
        warnings,
        reviewRevision: revision,
        validation
      });
      if (!updated) {
        await this.storage.deleteExport(exportStoredFilename).catch(() => undefined);
        exportStoredFilename = null;
        return (await this.scores.findById(scoreId)) ?? score;
      }
      await this.auditSafely({ actorId: score.userId, action: "conversion_completed", entity: "score", entityId: scoreId,
        metadata: { attemptId: attempt.id, outputBase: `${basenameWithoutExtension(score.originalFilename)}.musicxml`, resultStatus, missingPages: coverage.missingPages,
          rhythmCheckedMeasures: rhythm.checkedMeasures, rhythmSkippedMeasures: rhythm.skippedMeasures, rhythmIssueCount: rhythm.issues.length,
          pipelineVersion, conversionMode, reusedPages: progress.reusedPages, referenceReuse: referenceReuse ?? null, visualStatus: visual.review.status,
          midiValidationStatus: midiValidation.status, midiCheckedNotes: midiValidation.checkedNotes,
          visualCheckedMeasures: visual.review.checkedMeasures, visualUnknownMeasures: visual.review.unknownMeasures,
          visualProposalCount: visual.review.proposals.length,
          diagnosticCodes: [...new Set([...validation.issues.map((issue) => issue.code), ...(validation.visualReview?.diagnostics ?? []).map((item) => item.code)])] } });
      // The conversion is already committed. A delivery failure must not mark its attempt failed.
      if (!this.automaticDelivery) return updated;
      return await new AutomaticDeliveryService(this.scores, this.audits, this.storage, this.midiInspector)
        .finalize(scoreId).catch(() => updated) ?? updated;
    } catch (error) {
      const reason: unknown = controller.signal.aborted ? controller.signal.reason : error;
      const code = errorCode(reason);
      const message = (reason instanceof Error ? reason.message : "Erro desconhecido na conversão.").slice(0, 1000);
      const failed = await this.scores.failAttempt(scoreId, attempt.id, claimToken, code, message, attempt.kind === "initial" && isTemporaryConversionError(code));
      if (!failed) {
        const current = (await this.scores.findById(scoreId)) ?? score;
        if (exportStoredFilename && current.musicxmlFilename !== exportStoredFilename) await this.storage.deleteExport(exportStoredFilename).catch(() => undefined);
        return current;
      }
      if (exportStoredFilename) await this.storage.deleteExport(exportStoredFilename).catch(() => undefined);
      await this.auditSafely({ actorId: score.userId, action: "conversion_failed", entity: "score", entityId: scoreId, metadata: {
        attemptId: attempt.id, code, message: message.slice(0, 300), totalPages: progress.totalPages,
        currentPage: progress.currentPage, completedPages: progress.completedPages, reusedPages: progress.reusedPages } });
      if (failed.retryAttempt) await this.queue?.enqueue(scoreId, failed.retryAttempt.id).catch(() => undefined);
      return failed.score;
    } finally {
      clearTimeout(timer);
      if (pagePreview) await this.storage.deleteFirstPagePreview(score.storedFilename, pagePreview).catch(() => undefined);
      if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  private async findQueuedAttempt(scoreId: string, attemptId?: string): Promise<ConversionAttempt | null> {
    const attempt = attemptId ? await this.scores.getAttempt(attemptId) : (await this.scores.listAttempts(scoreId)).find((item) => item.status === "queued");
    return attempt?.scoreId === scoreId && attempt.status === "queued" ? attempt : null;
  }

  private async auditSafely(input: Parameters<AuditRepository["create"]>[0]): Promise<void> {
    try { await this.audits.create(input); } catch { /* Conversion state is authoritative; audit failure must not strand an upload. */ }
  }
}
