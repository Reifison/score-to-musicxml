import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversionCoverage, User } from "../domain.js";
import { InMemoryAuditRepository, InMemoryScoreRepository } from "../repositories/inMemoryRepositories.js";
import { FileStorageService } from "../services/FileStorageService.js";
import type { OmrAdapter } from "../services/OmrAdapter.js";
import { ScoreConversionService } from "../services/ScoreConversionService.js";
import { SourceVisualValidationService } from "../services/SourceVisualValidationService.js";
import { inspectMusicXmlValidation } from "../services/MusicXmlValidation.js";
import { reviewRevision } from "../services/MusicalReview.js";
import { ScoreService } from "../services/ScoreService.js";
import type { SourceVisualReview, VisualCorrectionProposal } from "../services/SourceVisualReviewTypes.js";
import { parseVisualMusicXml } from "../services/VisualMusicXml.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { force: true, recursive: true }))); vi.restoreAllMocks(); });
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const baseXml = `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Solo</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>1</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note></measure></part></score-partwise>`;
const coverage: ConversionCoverage = { totalPages: 1, processedPages: [1], missingPages: [], pages: [
  { page: 1, status: "processed", parts: [{ id: "P1", name: "Solo", staffCount: 1, staves: [1] }] }
] };
const owner = { id: "owner", role: "user" } as User;
const stranger = { id: "stranger", role: "user" } as User;

async function setup() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "source-visual-decision-"));
  directories.push(directory);
  const workDir = path.join(directory, "work");
  await fs.mkdir(workDir);
  const storage = new FileStorageService(path.join(directory, "uploads"), path.join(directory, "exports"));
  const scores = new InMemoryScoreRepository();
  const audits = new InMemoryAuditRepository();
  const service = new ScoreService(scores, audits, storage, undefined, undefined, false);
  const sourceBytes = Buffer.from("private-original-source");
  await storage.saveUpload("source.pdf", sourceBytes);
  const score = await scores.create({ userId: owner.id, originalFilename: "Test.pdf", storedFilename: "source.pdf",
    fileType: "pdf", mimeType: "application/pdf", fileSize: sourceBytes.length, uploadStatus: "uploaded", conversionStatus: "queued",
    scoreType: "melody", scoreTypeSelected: true });
  const filename = storage.generateExportStoredFilename(score.id);
  const revision = reviewRevision(filename, baseXml);
  const pagePath = path.join(workDir, "page.png");
  const cropPath = path.join(workDir, "crop.png");
  await sharp({ create: { width: 80, height: 40, channels: 3, background: "white" } }).png().toFile(pagePath);
  await sharp(pagePath).extract({ left: 5, top: 5, width: 30, height: 20 }).png().toFile(cropPath);
  const proposal: VisualCorrectionProposal = { id: "pitch-c-to-d", status: "pending", segmentId: "visual-p0-m0", page: 1,
    partId: "P1", partIndex: 0, measureIndex: 0, measure: "1", noteIndex: 0,
    before: { kind: "note", step: "C", alter: 0, octave: 4, duration: 1, type: "quarter", dots: 0 },
    after: { kind: "note", step: "D", alter: 0, octave: 4, duration: 1, type: "quarter", dots: 0 },
    applicable: true, reason: "Leitura local da fonte diverge.", differences: ["pitch"] };
  const visualReview: SourceVisualReview = { version: 1, status: "completed", sourceSHA256: hash(sourceBytes), xmlSHA256: hash(baseXml),
    reader: { name: "local-fixture-reader", sourceFirst: true }, checkedMeasures: 1, unknownMeasures: 0,
    segments: [{ id: proposal.segmentId, page: 1, partId: "P1", partIndex: 0, measureIndex: 0, measure: "1",
      status: "suspected", sourceAsset: "visual-page-1.png", cropAsset: "visual-crop-2.png", sourceImageSHA256: hash(await fs.readFile(pagePath)),
      rectangle: { left: 0.0625, top: 0.125, width: 0.375, height: 0.5 } }],
    proposals: [proposal], limitations: [], accuracyVerified: false, trainingEligible: false, history: [] };
  const validation = { ...inspectMusicXmlValidation(baseXml), visualReview, requiresReview: true };
  await storage.saveExport(filename, baseXml);
  await storage.saveConversionEvidence(filename, { sourcePath: storage.resolveUploadPath("source.pdf"), workDir, revision,
    metadata: { validation, coverage, accuracyVerified: false },
    candidates: [{ page: 1, candidate: 1, selected: true, reason: "initial", xml: baseXml, sourceImagePath: pagePath, validation }],
    visualAssets: [{ name: "visual-page-1.png", path: pagePath, sha256: hash(await fs.readFile(pagePath)) },
      { name: "visual-crop-2.png", path: cropPath, sha256: hash(await fs.readFile(cropPath)) }] });
  const initialAttempt = (await scores.listAttempts(score.id))[0];
  const token = await scores.claimAttempt(initialAttempt.id);
  expect(token).toBeTruthy();
  const published = await scores.publishResult(score.id, initialAttempt.id, token!, {
    resultStatus: "complete", coverage, musicxmlFilename: filename, warnings: [], reviewRevision: revision, validation });
  expect(published).toBeTruthy();
  return { directory, workDir, storage, scores, audits, service, score, filename, revision, proposal };
}

async function listedExports(directory: string): Promise<string[]> {
  return (await fs.readdir(path.join(directory, "exports"))).filter((name) => name.endsWith(".musicxml")).sort();
}

describe("source visual review decisions", () => {
  it("finaliza versão pendente por acesso autorizado sem aplicar a proposta incerta", async () => {
    const ctx = await setup();
    const automatic = new ScoreService(ctx.scores, ctx.audits, ctx.storage);
    await expect(automatic.getFor(stranger, ctx.score.id)).rejects.toMatchObject({ statusCode: 403 });
    const delivered = await automatic.getFor(owner, ctx.score.id);
    expect(delivered).toMatchObject({ reviewStatus: "approved", reviewedById: null, canDownloadMusicXml: true,
      validation: { reviewAcceptance: { method: "automatic_delivery_v1", keptVisualProposals: 1 },
        visualReview: { proposals: [{ id: ctx.proposal.id, status: "rejected" }],
          history: [{ actorId: "system:automatic_delivery_v1", decision: "reject", proposalId: ctx.proposal.id }] } } });
    expect(await ctx.storage.readExport(ctx.filename)).toBe(baseXml);
    expect((await automatic.downloadFor(owner, ctx.score.id)).musicXml.toString("utf8")).toBe(baseXml);
    const again = await automatic.getFor(owner, ctx.score.id);
    expect(again.reviewedAt).toEqual(delivered.reviewedAt);
    expect((await ctx.audits.list()).filter((entry) => entry.metadata?.decision === "automatic_delivery")).toHaveLength(1);
  });

  it("mantém entrega automática após desfazer, aceitar e recusar uma proposta", async () => {
    const ctx = await setup();
    const service = new ScoreService(ctx.scores, ctx.audits, ctx.storage);
    const delivered = await service.getFor(owner, ctx.score.id);
    expect(delivered).toMatchObject({ reviewStatus: "approved", canDownloadMusicXml: true,
      validation: { visualReview: { proposals: [{ status: "rejected" }] } } });

    const undone = await service.decideVisualProposalFor(owner, ctx.score.id, delivered.reviewRevision!, ctx.proposal.id, "undo");
    expect(undone).toMatchObject({ reviewStatus: "approved", canDownloadMusicXml: true,
      validation: { reviewAcceptance: { method: "automatic_delivery_v1", revision: undone.reviewRevision },
        visualReview: { proposals: [{ status: "pending" }] } } });
    expect(await ctx.storage.readExport(undone.musicxmlFilename!)).toBe(baseXml);
    expect((await service.getFor(owner, ctx.score.id)).validation?.visualReview?.proposals[0].status).toBe("pending");

    const accepted = await service.decideVisualProposalFor(owner, ctx.score.id, undone.reviewRevision!, ctx.proposal.id, "accept");
    expect(accepted).toMatchObject({ reviewStatus: "approved", canDownloadMusicXml: true,
      validation: { visualReview: { proposals: [{ status: "accepted" }] } } });
    expect(parseVisualMusicXml(await ctx.storage.readExport(accepted.musicxmlFilename!))[0].events[0].step).toBe("D");
    expect((await service.downloadFor(owner, ctx.score.id)).musicXml.toString("utf8")).toBe(await ctx.storage.readExport(accepted.musicxmlFilename!));

    const undoneAccepted = await service.decideVisualProposalFor(owner, ctx.score.id, accepted.reviewRevision!, ctx.proposal.id, "undo");
    expect(undoneAccepted.validation?.visualReview?.proposals[0].status).toBe("pending");
    expect(await ctx.storage.readExport(undoneAccepted.musicxmlFilename!)).toBe(baseXml);
    const rejected = await service.decideVisualProposalFor(owner, ctx.score.id, undoneAccepted.reviewRevision!, ctx.proposal.id, "reject");
    expect(rejected.validation?.visualReview?.proposals[0].status).toBe("rejected");
    expect(rejected.reviewStatus).toBe("approved");
    expect(await ctx.storage.readExport(ctx.filename)).toBe(baseXml);
    expect((await service.versionsFor(owner, ctx.score.id)).map((version) => version.id)).toEqual(expect.arrayContaining([
      `revision:${undone.reviewRevision}`, `revision:${accepted.reviewRevision}`,
      `revision:${undoneAccepted.reviewRevision}`, `revision:${rejected.reviewRevision}`
    ]));
    await expect(service.decideVisualProposalFor(owner, ctx.score.id, delivered.reviewRevision!, ctx.proposal.id, "undo"))
      .rejects.toMatchObject({ code: "REVIEW_REVISION_CHANGED" });
  });

  it("runs source visual comparison inside conversion and carries a proposal into the versioned decision flow", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "source-visual-conversion-"));
    directories.push(directory);
    const storage = new FileStorageService(path.join(directory, "uploads"), path.join(directory, "exports"));
    const scores = new InMemoryScoreRepository();
    const audits = new InMemoryAuditRepository();
    await storage.saveUpload("source.pdf", Buffer.from("private-original-source"));
    const score = await scores.create({ userId: owner.id, originalFilename: "Test.pdf", storedFilename: "source.pdf",
      fileType: "pdf", mimeType: "application/pdf", fileSize: 23, uploadStatus: "uploaded", conversionStatus: "queued",
      scoreType: "melody", scoreTypeSelected: true });
    const readerExecutable = path.join(directory, "local-reader.cjs");
    await fs.writeFile(readerExecutable, `#!/usr/bin/env node
const fs=require('fs');const request=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if(Object.keys(request).sort().join(',')!=='imagePath,imageSHA256,page,version')process.exit(17);
process.stdout.write(JSON.stringify({version:1,page:request.page,inputImageSHA256:request.imageSHA256,coverageComplete:true,
measures:[{partIndex:0,measureIndex:0,rectangle:{left:.1,top:.1,width:.6,height:.7},readable:true,
events:[{onset:0,duration:1,voice:'1',staff:1,kind:'note',step:'D',octave:4,type:'quarter',dots:0}]}]}));`, { mode: 0o700 });
    await fs.chmod(readerExecutable, 0o700);
    const omr: OmrAdapter = { convert: async (_sourcePath, _originalName, workDir) => {
      const pagePath = path.join(workDir, "original-page.png");
      await sharp({ create: { width: 100, height: 70, channels: 3, background: "white" } }).png().toFile(pagePath);
      return { musicXml: baseXml, coverage, warnings: [], evidence: [{ page: 1, candidate: 1, selected: true,
        reason: "local OMR fixture", xml: baseXml, originalImagePath: pagePath, sourceImagePath: pagePath,
        validation: inspectMusicXmlValidation(baseXml, { scope: "page" }) }] };
    } };
    const conversion = new ScoreConversionService(scores, audits, storage, omr,
      new SourceVisualValidationService({ readerExecutable }), undefined, false);
    const converted = await conversion.convertScore(score.id);
    expect(converted.validation?.visualReview).toMatchObject({ status: "completed", checkedMeasures: 1, unknownMeasures: 0,
      accuracyVerified: false, trainingEligible: false, proposals: [{ differences: ["pitch"], status: "pending" }] });
    const service = new ScoreService(scores, audits, storage, undefined, undefined, false);
    await expect(service.approveReviewFor(owner, score.id, converted.reviewRevision!)).rejects.toMatchObject({ code: "VISUAL_PROPOSALS_PENDING" });
    const proposalId = converted.validation!.visualReview!.proposals[0].id;
    const accepted = await service.decideVisualProposalFor(owner, score.id, converted.reviewRevision!, proposalId, "accept");
    expect(parseVisualMusicXml(await storage.readExport(accepted.musicxmlFilename!))[0].events[0].step).toBe("D");
    expect((await service.evidenceFor(owner, score.id) as { validation: { visualReview: SourceVisualReview } }).validation.visualReview.accuracyVerified).toBe(false);
  });

  it("blocks approval while a source-linked proposal is pending, then accepts an immutable revision and permits undo", async () => {
    const ctx = await setup();
    await expect(ctx.service.approveReviewFor(owner, ctx.score.id, ctx.revision)).rejects.toMatchObject({ code: "VISUAL_PROPOSALS_PENDING" });
    const accepted = await ctx.service.decideVisualProposalFor(owner, ctx.score.id, ctx.revision, ctx.proposal.id, "accept");
    expect(accepted.reviewStatus).toBe("needs_review");
    expect(accepted.reviewRevision).not.toBe(ctx.revision);
    expect(accepted.musicxmlFilename).not.toBe(ctx.filename);
    expect(accepted.validation?.visualReview?.proposals[0].status).toBe("accepted");
    expect(parseVisualMusicXml(await ctx.storage.readExport(accepted.musicxmlFilename!))[0].events[0].step).toBe("D");
    expect(await ctx.storage.readExport(ctx.filename)).toBe(baseXml);
    const evidence = await ctx.service.evidenceFor(owner, ctx.score.id) as { parentRevision: string; previousVersionAsset: string;
      outputSha256: string; accuracyVerified: boolean; validation: { visualReview: SourceVisualReview } };
    expect(evidence).toMatchObject({ parentRevision: ctx.revision, previousVersionAsset: "review-version-1.musicxml", accuracyVerified: false });
    expect(evidence.outputSha256).toBe(hash(await ctx.storage.readExport(accepted.musicxmlFilename!)));
    const previousPath = await ctx.service.evidenceAssetFor(owner, ctx.score.id, "review-version-1.musicxml");
    expect(await fs.readFile(previousPath, "utf8")).toBe(baseXml);
    const cropPath = await ctx.service.evidenceAssetFor(owner, ctx.score.id, "visual-crop-2.png");
    expect((await fs.readFile(cropPath)).length).toBeGreaterThan(0);
    expect(evidence.validation.visualReview.history).toMatchObject([{ decision: "accept", baseRevision: ctx.revision }]);
    await expect(ctx.service.approveReviewFor(owner, ctx.score.id, ctx.revision)).rejects.toMatchObject({ code: "REVIEW_REVISION_CHANGED" });

    const undone = await ctx.service.decideVisualProposalFor(owner, ctx.score.id, accepted.reviewRevision!, ctx.proposal.id, "undo");
    expect(undone.reviewRevision).not.toBe(accepted.reviewRevision);
    expect(undone.validation?.visualReview?.proposals[0].status).toBe("pending");
    expect(undone.validation?.visualReview?.history).toMatchObject([{ decision: "accept" }, { decision: "undo" }]);
    expect(parseVisualMusicXml(await ctx.storage.readExport(undone.musicxmlFilename!))[0].events[0].step).toBe("C");
    expect(parseVisualMusicXml(await ctx.storage.readExport(accepted.musicxmlFilename!))[0].events[0].step).toBe("D");
    await expect(ctx.service.approveReviewFor(owner, ctx.score.id, undone.reviewRevision!)).rejects.toMatchObject({ code: "VISUAL_PROPOSALS_PENDING" });
  });

  it("rejects a proposal with identical XML but a new review revision and preserved evidence", async () => {
    const ctx = await setup();
    const rejected = await ctx.service.decideVisualProposalFor(owner, ctx.score.id, ctx.revision, ctx.proposal.id, "reject");
    expect(rejected.reviewRevision).not.toBe(ctx.revision);
    expect(rejected.musicxmlFilename).not.toBe(ctx.filename);
    expect(await ctx.storage.readExport(rejected.musicxmlFilename!)).toBe(baseXml);
    expect(rejected.validation?.visualReview?.proposals[0].status).toBe("rejected");
    expect((await ctx.service.evidenceFor(owner, ctx.score.id) as { parentRevision: string }).parentRevision).toBe(ctx.revision);
    const approved = await ctx.service.approveReviewFor(owner, ctx.score.id, rejected.reviewRevision!);
    expect(approved.reviewStatus).toBe("approved");
    expect(approved.canPlay).toBe(true);
    expect((await ctx.audits.list()).filter((audit) => audit.action === "score_reviewed").map((audit) => audit.metadata?.decision).sort())
      .toEqual(["user_confirmed_preview", "visual_reject"]);
  });

  it("allows only one concurrent decision on a revision and cleans up the losing export", async () => {
    const ctx = await setup();
    const realRead = ctx.storage.readExport.bind(ctx.storage);
    const saves = vi.spyOn(ctx.storage, "saveExport");
    let oldReads = 0;
    let releaseOldReads!: () => void;
    const oldReadGate = new Promise<void>((resolve) => { releaseOldReads = resolve; });
    vi.spyOn(ctx.storage, "readExport").mockImplementation(async (filename) => {
      if (filename === ctx.filename && ++oldReads <= 2) {
        if (oldReads === 2) releaseOldReads();
        await oldReadGate;
      }
      return realRead(filename);
    });
    const outcomes = await Promise.allSettled([
      ctx.service.decideVisualProposalFor(owner, ctx.score.id, ctx.revision, ctx.proposal.id, "accept"),
      ctx.service.decideVisualProposalFor(owner, ctx.score.id, ctx.revision, ctx.proposal.id, "reject")
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(oldReads).toBeGreaterThanOrEqual(2);
    expect(saves).toHaveBeenCalledTimes(2);
    expect(await listedExports(ctx.directory)).toHaveLength(2);
    const current = await ctx.service.getFor(owner, ctx.score.id);
    expect(current.musicxmlFilename).not.toBe(ctx.filename);
    expect(await ctx.storage.readExport(ctx.filename)).toBe(baseXml);
    expect((await fs.readdir(path.join(ctx.directory, "exports"))).filter((name) => name.endsWith(".evidence"))).toHaveLength(2);
  });

  it("rejects unauthorized or stale decisions before changing score and evidence", async () => {
    const ctx = await setup();
    await expect(ctx.service.decideVisualProposalFor(stranger, ctx.score.id, ctx.revision, ctx.proposal.id, "accept"))
      .rejects.toMatchObject({ statusCode: 403 });
    await expect(ctx.service.evidenceFor(stranger, ctx.score.id)).rejects.toMatchObject({ statusCode: 403 });
    await expect(ctx.service.decideVisualProposalFor(owner, ctx.score.id, "0".repeat(64), ctx.proposal.id, "accept"))
      .rejects.toMatchObject({ code: "REVIEW_REVISION_CHANGED" });
    expect(await listedExports(ctx.directory)).toEqual([ctx.filename]);
  });

  it("fails and removes a new decision export when a retry is queued before publication", async () => {
    const ctx = await setup();
    const realPublish = ctx.scores.publishReviewDecision.bind(ctx.scores);
    vi.spyOn(ctx.scores, "publishReviewDecision").mockImplementation(async (scoreId, baseRevision, input) => {
      await ctx.scores.createManualAttempt(scoreId);
      return realPublish(scoreId, baseRevision, input);
    });
    await expect(ctx.service.decideVisualProposalFor(owner, ctx.score.id, ctx.revision, ctx.proposal.id, "accept"))
      .rejects.toMatchObject({ code: "REVIEW_REVISION_CHANGED" });
    expect(await listedExports(ctx.directory)).toEqual([ctx.filename]);
    expect((await fs.readdir(path.join(ctx.directory, "exports"))).filter((name) => name.endsWith(".evidence"))).toHaveLength(1);
    expect((await ctx.service.getFor(owner, ctx.score.id)).reviewRevision).toBe(ctx.revision);
  });
});
