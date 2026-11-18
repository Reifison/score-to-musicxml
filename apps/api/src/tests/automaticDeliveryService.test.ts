import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversionCoverage, MusicalValidation, Score, User } from "../domain.js";
import { InMemoryAuditRepository, InMemoryScoreRepository } from "../repositories/inMemoryRepositories.js";
import { FileStorageService } from "../services/FileStorageService.js";
import { MidiExportService } from "../services/MidiExportService.js";
import { AutomaticDeliveryService } from "../services/AutomaticDeliveryService.js";
import { ScoreService } from "../services/ScoreService.js";
import { reviewRevision } from "../services/MusicalReview.js";
import type { SourceVisualReview, VisualCorrectionProposal } from "../services/SourceVisualReviewTypes.js";

const dirs: string[] = [];
const xml = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>1</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note></measure></part></score-partwise>`;
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const coverage: ConversionCoverage = {
  totalPages: 1,
  processedPages: [1],
  missingPages: [],
  pages: [{ page: 1, status: "processed", parts: [{ id: "P1", name: "Melody", staffCount: 1, staves: [1] }] }]
};

function proposal(id = "proposal-1"): VisualCorrectionProposal {
  return {
    id,
    status: "pending",
    segmentId: "segment-1",
    page: 1,
    partId: "P1",
    partIndex: 0,
    measureIndex: 0,
    measure: "1",
    noteIndex: 0,
    before: null,
    after: null,
    applicable: false,
    reason: "Leitura ambígua",
    differences: ["Conferir a nota"]
  };
}

function visualReviewFor(musicXml: string, proposals: VisualCorrectionProposal[] = []): SourceVisualReview {
  return {
    version: 1,
    status: "completed",
    sourceSHA256: "a".repeat(64),
    xmlSHA256: hash(musicXml),
    reader: null,
    checkedMeasures: 1,
    unknownMeasures: proposals.length,
    segments: [],
    proposals,
    limitations: [],
    accuracyVerified: false,
    trainingEligible: false,
    history: []
  };
}

function validationFor(musicXml: string, visualReview?: SourceVisualReview): MusicalValidation {
  return {
    version: 1,
    ...(visualReview ? { visualReview } : {}),
    issues: [],
    checkedMeasures: 1,
    skippedMeasures: 0,
    requiresReview: true
  };
}

function passingMidiInspector(): MidiExportService {
  return {
    inspect: vi.fn(async (musicXml: string) => ({
      status: "passed" as const,
      checkedNotes: 1,
      checkedDurations: 1,
      issues: [],
      limitations: [],
      xmlSHA256: hash(musicXml)
    })),
    generate: vi.fn(async () => Buffer.from("midi"))
  } as unknown as MidiExportService;
}

type SetupOptions = {
  musicXml?: string;
  validation?: MusicalValidation;
  midiInspector?: MidiExportService;
};

async function setup(options: SetupOptions = {}) {
  const musicXml = options.musicXml ?? xml;
  const filename = "score-selected.musicxml";
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "automatic-delivery-test-"));
  dirs.push(dir);
  const scores = new InMemoryScoreRepository();
  const audits = new InMemoryAuditRepository();
  const storage = new FileStorageService(path.join(dir, "uploads"), path.join(dir, "exports"));
  await storage.saveExport(filename, musicXml);
  const score = await scores.create({
    userId: "user-1",
    originalFilename: "Estudo.pdf",
    storedFilename: "source.pdf",
    fileType: "pdf",
    mimeType: "application/pdf",
    fileSize: 10,
    uploadStatus: "uploaded",
    conversionStatus: "queued",
    scoreType: "melody",
    scoreTypeSelected: true
  });
  const attempt = (await scores.listAttempts(score.id))[0];
  const token = await scores.claimAttempt(attempt.id);
  if (!token) throw new Error("A tentativa de teste não pôde ser assumida.");
  const revision = reviewRevision(filename, musicXml);
  const published = await scores.publishResult(score.id, attempt.id, token, {
    resultStatus: "complete",
    coverage,
    musicxmlFilename: filename,
    reviewRevision: revision,
    validation: options.validation,
    warnings: []
  });
  if (!published) throw new Error("A versão de teste não pôde ser publicada.");
  const midiInspector = options.midiInspector ?? passingMidiInspector();
  const delivery = new AutomaticDeliveryService(scores, audits, storage, midiInspector);
  const user = { id: "user-1", role: "user" } as User;
  return { scores, audits, storage, score: published, filename, musicXml, revision, delivery, midiInspector, user };
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("AutomaticDeliveryService", () => {
  it("preserva exatamente o MusicXML selecionado e aprova sem usuário revisor", async () => {
    const ctx = await setup();
    const delivered = await ctx.delivery.finalize(ctx.score.id);

    expect(delivered).toMatchObject({
      musicxmlFilename: ctx.filename,
      reviewRevision: ctx.revision,
      reviewStatus: "approved",
      reviewedById: null,
      canPlay: true
    });
    expect(await ctx.storage.readExport(ctx.filename)).toBe(ctx.musicXml);
    expect((await ctx.audits.list()).find((entry) => entry.action === "score_reviewed")).toMatchObject({
      actorId: null,
      metadata: { decision: "automatic_delivery", method: "automatic_delivery_v1", selectedXmlSHA256: hash(ctx.musicXml) }
    });
  });

  it("rejeita internamente propostas visuais pendentes antes da aprovação", async () => {
    const visual = visualReviewFor(xml, [proposal()]);
    const ctx = await setup({ validation: validationFor(xml, visual) });
    const delivered = await ctx.delivery.finalize(ctx.score.id);

    expect(delivered?.reviewStatus).toBe("approved");
    expect(delivered?.reviewedById).toBeNull();
    expect(delivered?.validation?.visualReview?.proposals).toMatchObject([{ id: "proposal-1", status: "rejected" }]);
    expect(delivered?.validation?.visualReview?.history).toMatchObject([{
      proposalId: "proposal-1",
      decision: "reject",
      actorId: "system:automatic_delivery_v1",
      revision: ctx.revision
    }]);
    expect(await ctx.storage.readExport(ctx.filename)).toBe(xml);
    expect((await ctx.audits.list()).filter((entry) => entry.action === "score_reviewed")).toHaveLength(1);
  });

  it("não aprova uma versão stale nem ultrapassa uma retentativa em andamento", async () => {
    const stale = await setup();
    await fs.writeFile(stale.storage.resolveExportPath(stale.filename), `${stale.musicXml}\n`);
    const staleResult = await stale.delivery.finalize(stale.score.id);
    expect(staleResult).toMatchObject({ reviewStatus: "needs_review", reviewedById: null });
    expect(await stale.audits.list()).toHaveLength(0);

    const retry = await setup();
    await retry.scores.createManualAttempt(retry.score.id);
    const retryResult = await retry.delivery.finalize(retry.score.id);
    expect(retryResult).toMatchObject({ reviewStatus: "needs_review", reviewedById: null });
    expect(await retry.audits.list()).toHaveLength(0);
  });

  it("é idempotente quando a mesma entrega automática é repetida", async () => {
    const ctx = await setup();
    const first = await ctx.delivery.finalize(ctx.score.id);
    const firstReviewedAt = first?.reviewedAt;
    const second = await ctx.delivery.finalize(ctx.score.id);

    expect(second).toMatchObject({ reviewStatus: "approved", reviewedById: null, reviewRevision: ctx.revision });
    expect(second?.reviewedAt).toEqual(firstReviewedAt);
    expect((await ctx.audits.list()).filter((entry) => entry.action === "score_reviewed")).toHaveLength(1);
    expect(ctx.midiInspector.inspect).toHaveBeenCalledTimes(1);
  });

  it("mantém o MusicXML quando a validação MIDI falha e bloqueia áudio/exportação", async () => {
    const midiInspector = {
      inspect: vi.fn(async (musicXml: string) => ({
        status: "failed" as const,
        checkedNotes: 0,
        checkedDurations: 0,
        issues: [{ code: "MIDI_EVENT_MISMATCH", message: "As notas do MIDI divergem da partitura." }],
        limitations: [],
        xmlSHA256: hash(musicXml)
      })),
      generate: vi.fn(async () => Buffer.from("should-not-run"))
    } as unknown as MidiExportService;
    const ctx = await setup({ midiInspector });
    const delivered = await ctx.delivery.finalize(ctx.score.id);

    expect(delivered).toMatchObject({ reviewStatus: "approved", reviewedById: null, canPlay: false, canExportMidi: false });
    expect(delivered?.validation?.midiValidation).toMatchObject({ status: "failed", xmlSHA256: hash(ctx.musicXml) });
    expect(await ctx.storage.readExport(ctx.filename)).toBe(ctx.musicXml);

    const service = new ScoreService(ctx.scores, ctx.audits, ctx.storage, midiInspector);
    await expect(service.downloadFor(ctx.user, ctx.score.id)).resolves.toMatchObject({ resultStatus: "complete" });
    await expect(service.downloadMidiFor(ctx.user, ctx.score.id)).rejects.toMatchObject({ code: "MIDI_VALIDATION_FAILED" });
    expect(midiInspector.generate).not.toHaveBeenCalled();
  });
});
