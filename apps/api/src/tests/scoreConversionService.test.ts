import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversionCoverage, User } from "../domain.js";
import { AppError } from "../errors/AppError.js";
import { InMemoryAuditRepository, InMemoryScoreRepository } from "../repositories/inMemoryRepositories.js";
import type { ScoreConversionQueue } from "../queues/ScoreConversionQueue.js";
import { FileStorageService } from "../services/FileStorageService.js";
import type { OmrAdapter, OmrResult } from "../services/OmrAdapter.js";
import { QueueReconciler } from "../services/QueueReconciler.js";
import { ScoreConversionService } from "../services/ScoreConversionService.js";
import { ScoreService } from "../services/ScoreService.js";
import { ScoreUploadService } from "../services/ScoreUploadService.js";
import { EntitlementService } from "../services/EntitlementService.js";
import type { FileSecurityService } from "../services/FileSecurityService.js";
import type { AuditRepository } from "../repositories/contracts.js";
import { InMemoryEntitlementRepository } from "../repositories/inMemoryRepositories.js";
import { env } from "../config/env.js";
import type { MidiExportService } from "../services/MidiExportService.js";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { force: true, recursive: true }))); });
const coverage = (missingPages: number[] = []): ConversionCoverage => ({
  totalPages: missingPages.length ? 2 : 1,
  processedPages: [1],
  missingPages,
  pages: [
    { page: 1, status: "processed", parts: [{ id: "P1", name: "Melody", staffCount: 1, staves: [1] }] },
    ...missingPages.map((page) => ({ page, status: "missing" as const, parts: [] }))
  ]
});
const oneNoteMusicXml = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>1</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note></measure></part></score-partwise>`;
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const result = (missingPages: number[] = []): OmrResult => ({ musicXml: oneNoteMusicXml, coverage: coverage(missingPages), warnings: missingPages.length ? ["Página 2 ausente"] : [] });

async function setup(omr: OmrAdapter, midiInspector?: MidiExportService, automaticDelivery = false) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "score-conversion-test-"));
  dirs.push(dir);
  const scores = new InMemoryScoreRepository();
  const audits = new InMemoryAuditRepository();
  const storage = new FileStorageService(path.join(dir, "uploads"), path.join(dir, "exports"));
  await storage.saveUpload("source.pdf", Buffer.from("%PDF-1.4\n%%EOF"));
  const score = await scores.create({ userId: "user-1", originalFilename: "Estudo.pdf", storedFilename: "source.pdf", fileType: "pdf", mimeType: "application/pdf", fileSize: 10, uploadStatus: "uploaded", conversionStatus: "queued", scoreType: "melody", scoreTypeSelected: true });
  const conversion = new ScoreConversionService(scores, audits, storage, omr, undefined, midiInspector, automaticDelivery);
  const queue = { enqueue: vi.fn().mockResolvedValue(undefined) } as unknown as ScoreConversionQueue;
  conversion.setQueue(queue);
  const user = { id: "user-1", role: "user" } as User;
  const service = new ScoreService(scores, audits, storage, midiInspector, queue, automaticDelivery);
  return { scores, audits, storage, score, conversion, queue, user, service };
}

describe("ScoreConversionService", () => {
  it("entrega automaticamente o MusicXML selecionado com origem do sistema e MIDI validado", async () => {
    const ctx = await setup({ convert: async () => result() }, undefined, true);
    const converted = await ctx.conversion.convertScore(ctx.score.id);
    expect(converted).toMatchObject({ reviewStatus: "approved", reviewedById: null, canDownloadMusicXml: true, canPlay: true });
    expect(converted.validation?.reviewAcceptance).toMatchObject({ method: "automatic_delivery_v1", accuracyVerified: false, trainingEligible: false });
    expect((await ctx.service.downloadFor(ctx.user, ctx.score.id)).musicXml.toString("utf8")).toBe(oneNoteMusicXml);
    expect((await ctx.audits.list()).filter((entry) => entry.action === "score_reviewed")).toMatchObject([
      { actorId: null, metadata: { decision: "automatic_delivery", selectedXmlSHA256: sha256(oneNoteMusicXml) } }
    ]);
    await ctx.service.getFor(ctx.user, ctx.score.id);
    expect((await ctx.audits.list()).filter((entry) => entry.action === "score_reviewed")).toHaveLength(1);
  });

  it("entrega o MusicXML parcial, permite escuta e mantém MIDI bloqueado", async () => {
    const ctx = await setup({ convert: async () => result([2]) }, undefined, true);
    const converted = await ctx.conversion.convertScore(ctx.score.id);
    expect(converted).toMatchObject({ reviewStatus: "approved", resultStatus: "partial", canPlay: true, canExportMidi: false });
    expect((await ctx.service.downloadFor(ctx.user, ctx.score.id)).musicXml.toString("utf8")).toBe(oneNoteMusicXml);
    await expect(ctx.service.downloadMidiFor(ctx.user, ctx.score.id)).rejects.toMatchObject({ code: "PARTIAL_PLAYBACK_BLOCKED" });
  });

  it("bloqueia finais antes da revisão e registra decisão sem promover referência de treinamento", async () => {
    const ctx = await setup({ convert: async () => result() });
    const converted = await ctx.conversion.convertScore(ctx.score.id);
    await expect(ctx.service.downloadFor(ctx.user, ctx.score.id)).rejects.toMatchObject({ code: "REVIEW_REQUIRED" });
    await expect(ctx.service.downloadMidiFor(ctx.user, ctx.score.id)).rejects.toMatchObject({ code: "REVIEW_REQUIRED" });
    expect((await ctx.service.downloadFor(ctx.user, ctx.score.id, undefined, true)).reviewStatus).toBe("needs_review");
    await expect(ctx.service.approveReviewFor({ id: "other", role: "user" } as User, ctx.score.id, converted.reviewRevision!)).rejects.toMatchObject({ statusCode: 403 });
    const approved = await ctx.service.approveReviewFor(ctx.user, ctx.score.id, converted.reviewRevision!);
    expect(approved).toMatchObject({ reviewStatus: "approved", canPlay: true, reviewedById: ctx.user.id });
    expect(approved.validation?.reviewAcceptance).toMatchObject({ kind: "accepted_with_reservations", midiStatus: "passed", accuracyVerified: false, trainingEligible: false });
    const audit = (await ctx.audits.list()).find((item) => item.action === "score_reviewed");
    expect(audit?.metadata).toMatchObject({ accuracyVerified: false, trainingEligible: false, revision: converted.reviewRevision });
    const sameApproval = await ctx.service.approveReviewFor(ctx.user, ctx.score.id, converted.reviewRevision!);
    expect(sameApproval.validation?.reviewAcceptance).toEqual(approved.validation?.reviewAcceptance);
    expect(sameApproval.reviewedAt).toEqual(approved.reviewedAt);
    expect((await ctx.audits.list()).filter((item) => item.action === "score_reviewed")).toHaveLength(1);
  });

  it("não aceita revisão antiga após nova conversão com XML idêntico, nem durante retry", async () => {
    const ctx = await setup({ convert: async () => result() });
    const first = await ctx.conversion.convertScore(ctx.score.id);
    await ctx.service.approveReviewFor(ctx.user, ctx.score.id, first.reviewRevision!);
    await ctx.service.retryFor(ctx.user, ctx.score.id);
    await expect(ctx.service.approveReviewFor(ctx.user, ctx.score.id, first.reviewRevision!)).rejects.toMatchObject({ code: "REVIEW_REVISION_CHANGED" });
    const manual = (await ctx.scores.listAttempts(ctx.score.id)).find((item) => item.kind === "manual")!;
    const next = await ctx.conversion.convertScore(ctx.score.id, manual.id);
    expect(next.reviewRevision).not.toBe(first.reviewRevision);
    expect(next).toMatchObject({ reviewStatus: "needs_review", canPlay: true, reviewedAt: null });
    await expect(ctx.service.approveReviewFor(ctx.user, ctx.score.id, first.reviewRevision!)).rejects.toMatchObject({ code: "REVIEW_REVISION_CHANGED" });
    await ctx.service.approveReviewFor(ctx.user, ctx.score.id, next.reviewRevision!);
  });

  it("preserva evidências privadas antes da limpeza temporária e remove junto ao export", async () => {
    let temporaryImage = "";
    const ctx = await setup({ convert: async (_input, _name, workDir) => {
      temporaryImage = path.join(workDir, "page.png");
      await fs.writeFile(temporaryImage, Buffer.from("source-image"));
      return { ...result(), evidence: [{ page: 1, candidate: 1, selected: true, reason: "Leitura original", xml: result().musicXml,
        sourceImagePath: temporaryImage, validation: { version: 1, issues: [], checkedMeasures: 0, skippedMeasures: 0, requiresReview: true } }] };
    } });
    const converted = await ctx.conversion.convertScore(ctx.score.id);
    await expect(fs.access(temporaryImage)).rejects.toMatchObject({ code: "ENOENT" });
    const evidence = await ctx.service.evidenceFor(ctx.user, ctx.score.id) as { originalSha256: string; candidates: Array<{ image: { filename: string }; xml: { filename: string }; sourceMapping: unknown }> };
    expect(evidence.originalSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.candidates[0].sourceMapping).toEqual({ page: 1, coordinates: null });
    const asset = await ctx.service.evidenceAssetFor(ctx.user, ctx.score.id, evidence.candidates[0].image.filename);
    expect(await fs.readFile(asset, "utf8")).toBe("source-image");
    await expect(ctx.service.evidenceFor({ id: "other", role: "user" } as User, ctx.score.id)).rejects.toMatchObject({ statusCode: 403 });
    await expect(ctx.service.evidenceAssetFor(ctx.user, ctx.score.id, "../source.pdf")).rejects.toMatchObject({ code: "INVALID_EVIDENCE_ASSET" });
    await ctx.storage.deleteExport(converted.musicxmlFilename!);
    await expect(fs.access(asset)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("impede aprovação de conteúdo que foi alterado fora da revisão", async () => {
    const ctx = await setup({ convert: async () => result() });
    const converted = await ctx.conversion.convertScore(ctx.score.id);
    await fs.writeFile(ctx.storage.resolveExportPath(converted.musicxmlFilename!), `${result().musicXml}\n`);
    await expect(ctx.service.approveReviewFor(ctx.user, ctx.score.id, converted.reviewRevision!)).rejects.toMatchObject({ code: "REVIEW_REVISION_CHANGED" });
  });

  it("publica prévia completa com cobertura e libera MIDI após revisão", async () => {
    const convert = vi.fn(async () => result());
    const ctx = await setup({ convert });
    const converted = await ctx.conversion.convertScore(ctx.score.id);
    expect(convert).toHaveBeenCalledWith(expect.any(String), "Estudo.pdf", expect.any(String), expect.objectContaining({ scoreType: "melody", scoreTypeSelected: true }));
    expect(converted.resultStatus).toBe("complete");
    expect(converted.canPlay).toBe(true);
    expect(converted.reviewStatus).toBe("needs_review");
    expect(converted.reviewRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(converted.validation?.midiValidation).toMatchObject({
      status: "passed",
      checkedNotes: 1,
      xmlSHA256: sha256(oneNoteMusicXml)
    });
    expect((await ctx.scores.findById(ctx.score.id))?.validation?.midiValidation).toEqual(converted.validation?.midiValidation);
    expect((await ctx.service.approveReviewFor(ctx.user, ctx.score.id, converted.reviewRevision!)).canPlay).toBe(true);
    expect(converted.confidence).toBeNull();
    expect((await ctx.scores.listAttempts(ctx.score.id))[0].status).toBe("complete");
    expect(await ctx.storage.readExport(converted.musicxmlFilename!)).toContain("score-partwise");
  });

  it("preserva o MusicXML e a aprovação com ressalvas quando a validação MIDI falha", async () => {
    const midiInspector = {
      inspect: vi.fn(async (musicXml: string) => ({
        status: "failed" as const,
        checkedNotes: 0,
        checkedDurations: 0,
        issues: [{ code: "MIDI_EVENT_MISMATCH", message: "As notas do MIDI divergem da execução desta partitura." }],
        limitations: [],
        xmlSHA256: sha256(musicXml)
      })),
      generate: vi.fn(async () => Buffer.from("should-not-run"))
    } as unknown as MidiExportService;
    const ctx = await setup({ convert: async () => result() }, midiInspector);
    const converted = await ctx.conversion.convertScore(ctx.score.id);

    expect(converted.validation?.midiValidation).toMatchObject({ status: "failed", xmlSHA256: sha256(oneNoteMusicXml) });
    expect(converted.musicxmlFilename).toBeTruthy();
    expect(await ctx.storage.readExport(converted.musicxmlFilename!)).toBe(oneNoteMusicXml);

    const approved = await ctx.service.approveReviewFor(ctx.user, ctx.score.id, converted.reviewRevision!);
    expect(approved).toMatchObject({
      reviewStatus: "approved",
      canPlay: false,
      canExportMidi: false,
      canDownloadMusicXml: true,
      validation: { reviewAcceptance: { kind: "accepted_with_reservations", accuracyVerified: false, trainingEligible: false, midiStatus: "failed" } }
    });
    const download = await ctx.service.downloadFor(ctx.user, ctx.score.id);
    expect(download.musicXml.toString("utf8")).toBe(oneNoteMusicXml);
    await expect(ctx.service.downloadMidiFor(ctx.user, ctx.score.id)).rejects.toMatchObject({ code: "MIDI_VALIDATION_FAILED" });
    expect(midiInspector.generate).not.toHaveBeenCalled();
  });

  it("mantém a conversão e registra estado não verificado quando o inspetor MIDI não está disponível", async () => {
    const midiInspector = {
      inspect: vi.fn().mockRejectedValue(new Error("inspector unavailable")),
      generate: vi.fn(async () => Buffer.from("should-not-run"))
    } as unknown as MidiExportService;
    const ctx = await setup({ convert: async () => result() }, midiInspector);
    const converted = await ctx.conversion.convertScore(ctx.score.id);

    expect(converted).toMatchObject({ conversionStatus: "converted", resultStatus: "complete", reviewStatus: "needs_review" });
    expect(converted.validation?.midiValidation).toMatchObject({
      status: "unverified",
      xmlSHA256: sha256(oneNoteMusicXml),
      issues: [{ code: "MIDI_PREFLIGHT_UNAVAILABLE" }]
    });
    expect((await ctx.scores.findById(ctx.score.id))?.validation?.midiValidation).toEqual(converted.validation?.midiValidation);
    expect(await ctx.storage.readExport(converted.musicxmlFilename!)).toBe(oneNoteMusicXml);

    const approved = await ctx.service.approveReviewFor(ctx.user, ctx.score.id, converted.reviewRevision!);
    expect(approved.validation?.reviewAcceptance).toMatchObject({
      kind: "accepted_with_reservations", midiStatus: "unverified", accuracyVerified: false, trainingEligible: false
    });
    expect(approved).toMatchObject({ canPlay: true, canExportMidi: false, canDownloadMusicXml: true });
    expect((await ctx.service.listFor(ctx.user))[0]).toMatchObject({ canPlay: true, canExportMidi: false });
    await expect(ctx.service.downloadMidiFor(ctx.user, ctx.score.id)).rejects.toMatchObject({ code: "MIDI_PREFLIGHT_UNAVAILABLE" });
    expect(midiInspector.generate).not.toHaveBeenCalled();
  });

  it("publica parcial com páginas ausentes e bloqueia MIDI no servidor", async () => {
    const ctx = await setup({ convert: async () => result([2]) });
    const converted = await ctx.conversion.convertScore(ctx.score.id);
    expect(converted.resultStatus).toBe("partial");
    expect(converted.coverage?.missingPages).toEqual([2]);
    expect(converted.canPlay).toBe(true);
    await expect(ctx.service.downloadFor(ctx.user, ctx.score.id)).rejects.toMatchObject({ code: "REVIEW_REQUIRED" });
    expect(await ctx.service.downloadFor(ctx.user, ctx.score.id, undefined, true)).toMatchObject({ missingPages: [2], resultStatus: "partial" });
    await ctx.service.approveReviewFor(ctx.user, ctx.score.id, converted.reviewRevision!);
    expect(await ctx.service.downloadFor(ctx.user, ctx.score.id)).toMatchObject({ missingPages: [2], resultStatus: "partial" });
    await expect(ctx.service.downloadMidiFor(ctx.user, ctx.score.id)).rejects.toMatchObject({ code: "PARTIAL_PLAYBACK_BLOCKED" });
  });

  it("não declara completa uma saída com papel de página ainda incerto", async () => {
    const pending = coverage();
    pending.uncertainPages = [1];
    pending.pages[0].contentRole = "uncertain";
    pending.pages[0].classification = { method: "staff_evidence_v1", evidence: ["no_strong_staff_evidence;not_proof_of_nonmusical"] };
    const ctx = await setup({ convert: async () => ({ ...result(), coverage: pending }) });
    const converted = await ctx.conversion.convertScore(ctx.score.id);
    expect(converted.resultStatus).toBe("partial");
    await ctx.service.approveReviewFor(ctx.user, ctx.score.id, converted.reviewRevision!);
    await expect(ctx.service.downloadMidiFor(ctx.user, ctx.score.id)).rejects.toMatchObject({ code: "PARTIAL_PLAYBACK_BLOCKED" });
  });

  it("aceita cobertura completa quando a página excluída tem decisão e hashes verificados", async () => {
    const complete = coverage();
    complete.totalPages = 2;
    complete.excludedPages = [2];
    complete.pages.push({ page: 2, status: "excluded", contentRole: "nonmusical", parts: [], classification: {
      method: "verified_manual_v1", evidence: ["source_and_original_image_hashes_match"], decision: "nonmusical", reviewer: "curadoria", reason: "capa",
      sourceSHA256: "a".repeat(64), originalImageSHA256: "b".repeat(64)
    } });
    const ctx = await setup({ convert: async () => ({ ...result(), coverage: complete }) });
    const converted = await ctx.conversion.convertScore(ctx.score.id);
    expect(converted.resultStatus).toBe("complete");
    expect(converted.coverage?.excludedPages).toEqual([2]);
  });

  it("publica aviso de duração sem reescrever o XML ou confundir cobertura com precisão", async () => {
    const musicXml = `<score-partwise><part-list><score-part id="P1"><part-name>Violão</part-name></score-part></part-list><part id="P1"><measure number="15"><attributes><divisions>12</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>21</duration></note></measure></part></score-partwise>`;
    const ctx = await setup({ convert: async () => ({ ...result(), musicXml, warnings: ["Conferir digitação"] }) });
    const converted = await ctx.conversion.convertScore(ctx.score.id);
    expect(converted.resultStatus).toBe("complete");
    expect(converted.confidence).toBeNull();
    expect(converted.warnings).toEqual(expect.arrayContaining([
      "Conferir digitação",
      expect.stringContaining("compasso 15 (Violão) ocupa 1,75 de 2"),
      expect.stringContaining("As notas do MIDI divergem")
    ]));
    expect(await ctx.storage.readExport(converted.musicxmlFilename!)).toBe(musicXml);
  });

  it("preserva resultado anterior quando retry manual falha e limita a uma tentativa", async () => {
    let call = 0;
    const ctx = await setup({ convert: async () => { if (call++ === 0) return result(); throw new AppError(422, "Foto ilegível", "OMR_CAPTURE_FAILURE"); } });
    const first = await ctx.conversion.convertScore(ctx.score.id);
    await ctx.service.retryFor(ctx.user, ctx.score.id);
    const manual = (await ctx.scores.listAttempts(ctx.score.id)).find((attempt) => attempt.kind === "manual")!;
    const failed = await ctx.conversion.convertScore(ctx.score.id, manual.id);
    expect(failed.conversionStatus).toBe("converted");
    expect(failed.musicxmlFilename).toBe(first.musicxmlFilename);
    expect(failed.resultStatus).toBe("complete");
    expect(failed.errorMessage).toContain("Foto ilegível");
    expect((await ctx.scores.getAttempt(manual.id))?.status).toBe("failed");
    await expect(ctx.service.retryFor(ctx.user, ctx.score.id)).rejects.toMatchObject({ code: "MANUAL_RETRY_LIMIT" });
  });

  it("mantém download MusicXML legado sem afirmar cobertura ou liberar player", async () => {
    const ctx = await setup({ convert: async () => result() });
    await ctx.storage.saveExport("legacy.musicxml", oneNoteMusicXml);
    await ctx.scores.update(ctx.score.id, { conversionStatus: "converted", musicxmlFilename: "legacy.musicxml", resultStatus: null, coverage: null, scoreTypeSelected: false });
    await ctx.scores.finishAttempt((await ctx.scores.listAttempts(ctx.score.id))[0].id, { status: "failed" });
    const legacy = await ctx.service.getFor(ctx.user, ctx.score.id);
    expect(legacy.canPlay).toBe(true);
    expect((await ctx.service.downloadFor(ctx.user, ctx.score.id)).resultStatus).toBe("unverified");
    await expect(ctx.service.downloadMidiFor(ctx.user, ctx.score.id)).rejects.toMatchObject({ code: "MIDI_NOT_READY" });
    await expect(ctx.service.retryFor(ctx.user, ctx.score.id)).rejects.toMatchObject({ code: "SCORE_TYPE_REQUIRED" });
    const retried = await ctx.service.retryFor(ctx.user, ctx.score.id, undefined, "piano");
    expect(retried.scoreTypeSelected).toBe(true);
    expect(retried.scoreType).toBe("piano");
  });

  it("agenda apenas uma retentativa automática para falha temporária", async () => {
    const ctx = await setup({ convert: async () => { throw new AppError(503, "Falha transitória", "OMR_TEMPORARY_FAILURE"); } });
    await ctx.conversion.convertScore(ctx.score.id);
    const attempts = await ctx.scores.listAttempts(ctx.score.id);
    expect(attempts.map((attempt) => attempt.kind)).toEqual(["initial", "automatic"]);
    expect(ctx.queue.enqueue).toHaveBeenCalledWith(ctx.score.id, attempts[1].id);
    await ctx.conversion.convertScore(ctx.score.id, attempts[1].id);
    expect(await ctx.scores.listAttempts(ctx.score.id)).toHaveLength(2);
  });

  it("não repete automaticamente a conversão inteira após exceder o tempo, mas permite retry manual", async () => {
    const ctx = await setup({ convert: async () => { throw new AppError(504, "Tempo excedido", "OMR_CONVERSION_TIMEOUT"); } });
    const failed = await ctx.conversion.convertScore(ctx.score.id);
    expect(failed.conversionStatus).toBe("failed");
    expect(failed.lastErrorCode).toBe("OMR_CONVERSION_TIMEOUT");
    expect(await ctx.scores.listAttempts(ctx.score.id)).toHaveLength(1);
    expect(ctx.queue.enqueue).not.toHaveBeenCalled();
    await ctx.service.retryFor(ctx.user, ctx.score.id);
    const attempts = await ctx.scores.listAttempts(ctx.score.id);
    expect(attempts.map((attempt) => attempt.kind)).toEqual(["initial", "manual"]);
    expect(ctx.queue.enqueue).toHaveBeenCalledWith(ctx.score.id, attempts[1].id);
  });

  it("agenda retry automático quando o processo retorna erro nativo ENOSPC", async () => {
    const nativeError = Object.assign(new Error("disk full"), { code: "ENOSPC" });
    const ctx = await setup({ convert: async () => { throw nativeError; } });
    const failed = await ctx.conversion.convertScore(ctx.score.id);
    expect(failed.conversionStatus).toBe("queued");
    expect(failed.lastErrorCode).toBe("ENOSPC");
    expect((await ctx.scores.listAttempts(ctx.score.id)).map((attempt) => ({ kind: attempt.kind, status: attempt.status, code: attempt.errorCode }))).toEqual([
      { kind: "initial", status: "failed", code: "ENOSPC" },
      { kind: "automatic", status: "queued", code: null }
    ]);
    expect(ctx.queue.enqueue).toHaveBeenCalledOnce();
  });

  it("serializa falha inicial e retry manual sem disputar a tentativa automática", async () => {
    const ctx = await setup({ convert: async () => result() });
    const initial = (await ctx.scores.listAttempts(ctx.score.id))[0];
    const token = await ctx.scores.claimAttempt(initial.id);
    expect(token).toBeTruthy();
    const outcomes = await Promise.allSettled([
      ctx.scores.failAttempt(ctx.score.id, initial.id, token!, "OMR_CONVERSION_TIMEOUT", "timeout", true),
      ctx.scores.createManualAttempt(ctx.score.id)
    ]);
    expect(outcomes[0]).toMatchObject({ status: "fulfilled", value: { retryAttempt: { kind: "automatic", status: "queued" } } });
    expect(outcomes[1]).toMatchObject({ status: "rejected", reason: { code: "CONVERSION_IN_PROGRESS" } });
    expect((await ctx.scores.listAttempts(ctx.score.id)).map((attempt) => attempt.kind)).toEqual(["initial", "automatic"]);
    expect((await ctx.scores.listPendingAttempts(10)).map((attempt) => attempt.kind)).toEqual(["automatic"]);
  });

  it("impede que execução antiga da mesma tentativa publique ou falhe após retomada", async () => {
    const ctx = await setup({ convert: async () => result() });
    const initial = (await ctx.scores.listAttempts(ctx.score.id))[0];
    const oldToken = await ctx.scores.claimAttempt(initial.id);
    expect(await ctx.scores.requeueStaleAttempts(new Date(Date.now() + 1000))).toBe(1);
    const newToken = await ctx.scores.claimAttempt(initial.id);
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(oldToken);
    expect(await ctx.scores.failAttempt(ctx.score.id, initial.id, oldToken!, "OMR_CONVERSION_TIMEOUT", "old", true)).toBeNull();
    expect(await ctx.scores.publishResult(ctx.score.id, initial.id, oldToken!, { resultStatus: "complete", coverage: coverage(), musicxmlFilename: "old.musicxml", warnings: [] })).toBeNull();
    const fresh = await ctx.scores.publishResult(ctx.score.id, initial.id, newToken!, { resultStatus: "complete", coverage: coverage(), musicxmlFilename: "new.musicxml", warnings: [] });
    expect(fresh?.musicxmlFilename).toBe("new.musicxml");
    expect((await ctx.scores.listAttempts(ctx.score.id)).map((attempt) => attempt.kind)).toEqual(["initial"]);
  });

  it("propaga deadline ao OMR e registra timeout depois do cancelamento", async () => {
    const oldTimeout = env.OMR_CONVERSION_TIMEOUT_MS;
    env.OMR_CONVERSION_TIMEOUT_MS = 25;
    try {
      let stopped = false;
      const ctx = await setup({ convert: async (_input, _filename, _output, options) => new Promise<OmrResult>((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => { stopped = true; reject(options.signal?.reason); }, { once: true });
      }) });
      await ctx.conversion.convertScore(ctx.score.id);
      expect(stopped).toBe(true);
      expect((await ctx.scores.listAttempts(ctx.score.id))[0]).toMatchObject({ status: "failed", errorCode: "OMR_CONVERSION_TIMEOUT" });
    } finally {
      env.OMR_CONVERSION_TIMEOUT_MS = oldTimeout;
    }
  });

  it("recupera tentativa persistida sem job por reconciliação idempotente", async () => {
    const ctx = await setup({ convert: async () => result() });
    const reconciler = new QueueReconciler(ctx.scores, ctx.queue);
    expect(await reconciler.runOnce()).toBe(1);
    expect(await reconciler.runOnce()).toBe(1);
    const attempts = await ctx.scores.listAttempts(ctx.score.id);
    expect(attempts).toHaveLength(1);
    expect(ctx.queue.enqueue).toHaveBeenNthCalledWith(1, ctx.score.id, attempts[0].id);
    expect(ctx.queue.enqueue).toHaveBeenNthCalledWith(2, ctx.score.id, attempts[0].id);
  });

  it("uma falha de banco na reconciliação não impede a rodada seguinte", async () => {
    const ctx = await setup({ convert: async () => result() });
    const original = ctx.scores.requeueStaleAttempts.bind(ctx.scores);
    vi.spyOn(ctx.scores, "requeueStaleAttempts").mockRejectedValueOnce(new Error("database unavailable")).mockImplementation(original);
    const reconciler = new QueueReconciler(ctx.scores, ctx.queue);
    await expect(reconciler.runOnce()).rejects.toThrow("database unavailable");
    expect(await reconciler.runOnce()).toBe(1);
    expect(ctx.queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it("mantém upload e débito únicos quando auditoria e enqueue falham", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "score-upload-recovery-"));
    dirs.push(dir);
    const scores = new InMemoryScoreRepository();
    const entitlements = new InMemoryEntitlementRepository(scores);
    const audits = { create: vi.fn().mockRejectedValue(new Error("audit unavailable")) } as unknown as AuditRepository;
    const entitlementService = new EntitlementService(entitlements, audits);
    const storage = new FileStorageService(path.join(dir, "uploads"), path.join(dir, "exports"));
    const queue = { enqueue: vi.fn().mockRejectedValueOnce(new Error("redis unavailable")).mockResolvedValue(undefined) } as unknown as ScoreConversionQueue;
    const security = { scan: async () => undefined, stripImageMetadata: async (buffer: Buffer) => buffer } as unknown as FileSecurityService;
    const upload = new ScoreUploadService(audits, storage, queue, entitlementService, security, scores);
    const user = { id: "u1", role: "user" } as User;
    const score = await upload.upload({ user, filename: "study.pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF"), scoreType: "melody" });
    expect(score.conversionStatus).toBe("queued");
    expect((await entitlements.getSummary(user.id, 3)).freeScansUsed).toBe(1);
    expect(await new QueueReconciler(scores, queue).runOnce()).toBe(1);
    expect(await scores.listAttempts(score.id)).toHaveLength(1);
    expect((await entitlements.getSummary(user.id, 3)).freeScansUsed).toBe(1);
  });
});
