import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ConversionCoverage } from "../domain.js";
import type { CreateScoreInput, Repositories } from "../repositories/contracts.js";

const qaUrl = "postgresql://qauser:qapassword@127.0.0.1:55432/score_qa";
const coverage: ConversionCoverage = {
  totalPages: 1,
  processedPages: [1],
  missingPages: [],
  pages: [{ page: 1, status: "processed", parts: [{ id: "P1", name: "Melody", staffCount: 1, staves: [1] }] }]
};

describe.skipIf(process.env.SCORE_PRISMA_INTEGRATION !== "1")("Prisma conversion integration (isolated QA database)", () => {
  let prisma: PrismaClient;
  let repos: Repositories;
  let userId: string | null = null;

  const scoreInput = (): CreateScoreInput => ({
    userId: userId!,
    originalFilename: "qa-study.pdf",
    storedFilename: `${randomUUID()}.pdf`,
    fileType: "pdf",
    mimeType: "application/pdf",
    fileSize: 16,
    scoreType: "melody",
    scoreTypeSelected: true,
    uploadStatus: "uploaded",
    conversionStatus: "queued"
  });

  beforeAll(async () => {
    if (process.env.DATABASE_URL !== qaUrl) {
      throw new Error("Integration test requires the exact temporary QA DATABASE_URL on 127.0.0.1:55432/score_qa.");
    }
    const [{ prisma: db }, { createPrismaRepositories }] = await Promise.all([
      import("../db/prisma.js"),
      import("../repositories/prismaRepositories.js")
    ]);
    prisma = db;
    const identity = await prisma.$queryRaw<Array<{ database: string; username: string }>>`SELECT current_database() AS database, current_user AS username`;
    if (identity[0]?.database !== "score_qa" || identity[0]?.username !== "qauser") {
      throw new Error("Connected database identity does not match the isolated QA database.");
    }
    repos = createPrismaRepositories();
    const user = await prisma.user.create({ data: { name: "QA conversion", email: `conversion-${randomUUID()}@example.invalid`, passwordHash: "qa-only", role: "user" } });
    userId = user.id;
  });

  afterAll(async () => {
    if (prisma && userId) await prisma.user.delete({ where: { id: userId } });
    if (prisma) await prisma.$disconnect();
  });

  it("aplicou as migrations de cobertura, tipos e token de execução", async () => {
    const migrations = await prisma.$queryRaw<Array<{ migration_name: string }>>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
    expect(migrations.map((item) => item.migration_name)).toContain("20261006000000_conversion_reliability");
    expect(migrations.map((item) => item.migration_name)).toContain("20261006010000_conversion_attempt_fence");
    const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string; udt_name: string }>>`
      SELECT table_name, column_name, udt_name FROM information_schema.columns
      WHERE table_schema = 'public' AND ((table_name = 'Score' AND column_name IN ('scoreType', 'resultStatus', 'coverage'))
        OR (table_name = 'ConversionAttempt' AND column_name = 'claimToken'))`;
    expect(columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ table_name: "Score", column_name: "scoreType", udt_name: "ScoreType" }),
      expect.objectContaining({ table_name: "Score", column_name: "resultStatus", udt_name: "ConversionResultStatus" }),
      expect.objectContaining({ table_name: "Score", column_name: "coverage", udt_name: "jsonb" }),
      expect.objectContaining({ table_name: "ConversionAttempt", column_name: "claimToken", udt_name: "text" })
    ]));
  });

  it("cria upload, tentativa e débito de quota na mesma transação", async () => {
    const first = await repos.entitlements.createScoreForUpload(scoreInput(), 1);
    expect(first.debitedFreeScan).toBe(true);
    expect((await repos.scores.listAttempts(first.score.id)).map((attempt) => [attempt.kind, attempt.status])).toEqual([["initial", "queued"]]);
    await expect(repos.entitlements.createScoreForUpload(scoreInput(), 1)).rejects.toMatchObject({ code: "FREE_SCAN_LIMIT_REACHED" });
    expect((await repos.entitlements.getSummary(userId!, 1)).freeScansUsed).toBe(1);
    expect(await prisma.scanUsage.count({ where: { userId: userId! } })).toBe(1);
  });

  it("serializa falha inicial com criação automática contra retry manual", async () => {
    const score = await repos.scores.create(scoreInput());
    const initial = (await repos.scores.listAttempts(score.id))[0];
    const token = await repos.scores.claimAttempt(initial.id);
    expect(token).toBeTruthy();
    const results = await Promise.allSettled([
      repos.scores.failAttempt(score.id, initial.id, token!, "OMR_CONVERSION_TIMEOUT", "timeout", true),
      repos.scores.createManualAttempt(score.id)
    ]);
    expect(results[0]).toMatchObject({ status: "fulfilled", value: { retryAttempt: { kind: "automatic", status: "queued" } } });
    expect(results[1]).toMatchObject({ status: "rejected", reason: { code: "CONVERSION_IN_PROGRESS" } });
    expect((await repos.scores.listAttempts(score.id)).map((attempt) => attempt.kind)).toEqual(["initial", "automatic"]);
    expect((await repos.scores.findById(score.id))?.conversionStatus).toBe("queued");
  });

  it("rejeita publicação e falha do token antigo após retomada da mesma tentativa", async () => {
    const score = await repos.scores.create(scoreInput());
    const initial = (await repos.scores.listAttempts(score.id))[0];
    const oldToken = await repos.scores.claimAttempt(initial.id);
    expect(await repos.scores.requeueStaleAttempts(new Date(Date.now() + 1000))).toBeGreaterThanOrEqual(1);
    const freshToken = await repos.scores.claimAttempt(initial.id);
    expect(freshToken).toBeTruthy();
    expect(freshToken).not.toBe(oldToken);
    expect(await repos.scores.publishResult(score.id, initial.id, oldToken!, { resultStatus: "complete", coverage, musicxmlFilename: "old.musicxml", warnings: [] })).toBeNull();
    expect(await repos.scores.failAttempt(score.id, initial.id, oldToken!, "EIO", "old worker", true)).toBeNull();
    const fresh = await repos.scores.publishResult(score.id, initial.id, freshToken!, { resultStatus: "complete", coverage, musicxmlFilename: "fresh.musicxml", warnings: [] });
    expect(fresh?.musicxmlFilename).toBe("fresh.musicxml");
    expect((await repos.scores.getAttempt(initial.id))?.status).toBe("complete");
  });

  it("permite somente uma tentativa manual sob chamadas concorrentes", async () => {
    const score = await repos.scores.create(scoreInput());
    const initial = (await repos.scores.listAttempts(score.id))[0];
    const token = await repos.scores.claimAttempt(initial.id);
    await repos.scores.failAttempt(score.id, initial.id, token!, "OMR_CAPTURE_FAILURE", "unreadable", false);
    const results = await Promise.allSettled([
      repos.scores.createManualAttempt(score.id),
      repos.scores.createManualAttempt(score.id)
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect((await repos.scores.listAttempts(score.id)).filter((attempt) => attempt.kind === "manual")).toHaveLength(1);
  });
  it("publica apenas uma decisão de revisão e bloqueia aprovação com proposta pendente", async () => {
    const score = await repos.scores.create(scoreInput());
    const attempt = (await repos.scores.listAttempts(score.id))[0];
    const token = await repos.scores.claimAttempt(attempt.id);
    const validation = { version: 1 as const, issues: [], checkedMeasures: 1, skippedMeasures: 0, requiresReview: true,
      visualReview: { version: 1 as const, status: "completed" as const, sourceSHA256: "a".repeat(64), xmlSHA256: "b".repeat(64),
        reader: null, checkedMeasures: 1, unknownMeasures: 0, segments: [], limitations: [], history: [], accuracyVerified: false as const, trainingEligible: false as const,
        proposals: [{ id: "pending", status: "pending" as const, segmentId: "segment", page: 1, partId: "P1", partIndex: 0,
          measureIndex: 0, measure: "1", noteIndex: 0, before: null, after: null, applicable: false, reason: "ambiguous", differences: [] }] } };
    await repos.scores.publishResult(score.id, attempt.id, token!, { resultStatus: "complete", coverage,
      musicxmlFilename: "first.musicxml", reviewRevision: "base", validation, warnings: [] });
    expect(await repos.scores.approveReview(score.id, "base", userId!)).toBeNull();
    const decisions = await Promise.all([
      repos.scores.publishReviewDecision(score.id, "base", { musicxmlFilename: "decision-a.musicxml", reviewRevision: "a", validation, warnings: [] }),
      repos.scores.publishReviewDecision(score.id, "base", { musicxmlFilename: "decision-b.musicxml", reviewRevision: "b", validation, warnings: [] })
    ]);
    expect(decisions.filter(Boolean)).toHaveLength(1);
    const latest = (await repos.scores.findById(score.id))!;
    await repos.scores.createManualAttempt(score.id);
    expect(await repos.scores.publishReviewDecision(score.id, latest.reviewRevision!, {
      musicxmlFilename: "blocked.musicxml", reviewRevision: "blocked", validation, warnings: [] })).toBeNull();
  });

});
