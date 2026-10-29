import { randomUUID } from "node:crypto";
import { Prisma, type ScoreStatus as PrismaScoreStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type { AuditLog, ConversionAttempt, ConversionCoverage, EntitlementSummary, Score, Session, User } from "../domain.js";
import { AppError } from "../errors/AppError.js";
import { scoreAvailability } from "../services/MusicalReview.js";
import { preparingProgress, terminalProgress, validConversionProgress } from "../services/ConversionProgress.js";
import { validConversionPreview } from "../services/FirstPagePreview.js";
import type {
  ApplePurchaseNotification,
  ApplePurchaseRecord,
  AuditRepository,
  CreateScoreInput,
  CreateUserInput,
  EntitlementRepository,
  Repositories,
  ScoreFilters,
  ScoreRepository,
  SessionRepository,
  UpdateScoreInput,
  UpdateUserInput,
  UserRepository
} from "./contracts.js";

function mapScore(score: Awaited<ReturnType<typeof prisma.score.findFirst>>): Score | null {
  if (!score) return null;
  const mapped: Score = {
    ...score,
    confidence: null,
    warnings: Array.isArray(score.warnings) ? score.warnings.map(String) : null,
    coverage: score.coverage as ConversionCoverage | null,
    conversionProgress: score.conversionProgress as Score["conversionProgress"],
    conversionPreview: score.conversionPreview as Score["conversionPreview"],
    validation: score.validation as Score["validation"],
    canPlay: score.reviewStatus === "approved" && score.resultStatus === "complete" && score.scoreTypeSelected && Boolean(score.coverage && score.musicxmlFilename),
    canExportMidi: score.reviewStatus === "approved" && score.resultStatus === "complete" && score.scoreTypeSelected && Boolean(score.coverage && score.musicxmlFilename),
    canDownloadMusicXml: Boolean(score.musicxmlFilename && (score.reviewStatus === "approved" || !score.reviewRevision))
  };
  return { ...mapped, ...scoreAvailability(mapped) };
}

function mapAttempt(attempt: Awaited<ReturnType<typeof prisma.conversionAttempt.findUnique>>): ConversionAttempt | null {
  if (!attempt) return null;
  const { claimToken: _claimToken, ...publicAttempt } = attempt;
  return { ...publicAttempt, coverage: attempt.coverage as ConversionCoverage | null };
}

async function lockScore(tx: Prisma.TransactionClient, scoreId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Score" WHERE "id" = ${scoreId} FOR UPDATE`;
}

async function currentAttempt(tx: Prisma.TransactionClient, scoreId: string) {
  const attempts = await tx.conversionAttempt.findMany({ where: { scoreId } });
  return attempts.find((attempt) => attempt.kind === "manual")
    ?? attempts.find((attempt) => attempt.kind === "automatic")
    ?? attempts.find((attempt) => attempt.kind === "initial")
    ?? null;
}

function mapAudit(log: Awaited<ReturnType<typeof prisma.auditLog.findFirst>>): AuditLog | null {
  if (!log) return null;
  const metadata = log.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata) ? log.metadata as Record<string, unknown> : null;
  return { ...log, metadata };
}

function entitlementSummary(input: {
  plan: "free" | "paid";
  source: "free" | "apple" | "google_play" | "legacy_grant" | "admin_grant";
  freeScansUsed: number;
  purchasedAt: Date | null;
  appleProductId: string | null;
  googleProductId: string | null;
  grantedAt: Date | null;
  grantedById: string | null;
  grantReason: string | null;
}, freeScanLimit: number): EntitlementSummary {
  return {
    plan: input.plan,
    source: input.source,
    freeScanLimit,
    freeScansUsed: input.freeScansUsed,
    freeScansRemaining: input.plan === "paid" ? null : Math.max(0, freeScanLimit - input.freeScansUsed),
    purchasedAt: input.purchasedAt,
    appleProductId: input.appleProductId,
    googleProductId: input.googleProductId,
    grantedAt: input.grantedAt,
    grantedById: input.grantedById,
    grantReason: input.grantReason
  };
}

class PrismaUserRepository implements UserRepository {
  create(input: CreateUserInput): Promise<User> {
    return prisma.user.create({ data: input });
  }

  findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  list(): Promise<User[]> {
    return prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  }

  update(id: string, input: UpdateUserInput): Promise<User> {
    return prisma.user.update({ where: { id }, data: input });
  }

  async delete(id: string): Promise<void> {
    await prisma.user.delete({ where: { id } });
  }
}

class PrismaSessionRepository implements SessionRepository {
  create(input: { tokenHash: string; userId: string; expiresAt: Date }): Promise<Session> {
    return prisma.session.create({ data: input });
  }

  findByTokenHash(tokenHash: string): Promise<Session | null> {
    return prisma.session.findUnique({ where: { tokenHash } });
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await prisma.session.deleteMany({ where: { tokenHash } });
  }

  async deleteExpired(now: Date): Promise<void> {
    await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  }
}

class PrismaScoreRepository implements ScoreRepository {
  async create(input: CreateScoreInput): Promise<Score> {
    const score = await prisma.score.create({ data: { ...input, attempts: { create: { kind: "initial" } } } });
    return mapScore(score)!;
  }

  async findById(id: string): Promise<Score | null> {
    const score = await prisma.score.findFirst({ where: { id, deletedAt: null } });
    return mapScore(score);
  }

  async findByIdIncludingDeleted(id: string): Promise<Score | null> {
    const score = await prisma.score.findUnique({ where: { id } });
    return mapScore(score);
  }

  async list(filters: ScoreFilters = {}): Promise<Score[]> {
    const where: Prisma.ScoreWhereInput = {};
    where.deletedAt = null;
    if (filters.userId) where.userId = filters.userId;
    if (filters.favorite !== undefined) where.isFavorite = filters.favorite;
    if (filters.status) where.conversionStatus = filters.status as PrismaScoreStatus;
    if (filters.from || filters.to) {
      where.createdAt = {
        gte: filters.from,
        lte: filters.to
      };
    }
    const scores = await prisma.score.findMany({ where, orderBy: { createdAt: "desc" } });
    return scores.map((score) => mapScore(score)!);
  }

  async listTrash(filters: ScoreFilters = {}): Promise<Score[]> {
    const where: Prisma.ScoreWhereInput = { deletedAt: { not: null } };
    if (filters.userId) where.userId = filters.userId;
    if (filters.favorite !== undefined) where.isFavorite = filters.favorite;
    if (filters.status) where.conversionStatus = filters.status as PrismaScoreStatus;
    if (filters.from || filters.to) {
      where.deletedAt = { not: null, gte: filters.from, lte: filters.to };
    }
    const scores = await prisma.score.findMany({ where, orderBy: { purgeAt: "asc" } });
    return scores.map((score) => mapScore(score)!);
  }

  async listOlderThan(date: Date): Promise<Score[]> {
    const scores = await prisma.score.findMany({ where: { deletedAt: null, createdAt: { lt: date } }, orderBy: { createdAt: "asc" } });
    return scores.map((score) => mapScore(score)!);
  }

  async listExpiredTrash(date: Date): Promise<Score[]> {
    const scores = await prisma.score.findMany({
      where: { deletedAt: { not: null }, purgeAt: { lte: date } },
      orderBy: { purgeAt: "asc" }
    });
    return scores.map((score) => mapScore(score)!);
  }

  async update(id: string, input: UpdateScoreInput): Promise<Score> {
    const score = await prisma.score.update({
      where: { id },
      data: {
        ...input,
        warnings: input.warnings === undefined ? undefined : (input.warnings as Prisma.InputJsonArray | null) ?? Prisma.JsonNull,
        coverage: input.coverage === undefined ? undefined : input.coverage === null ? Prisma.JsonNull : input.coverage as Prisma.InputJsonValue,
        validation: input.validation === undefined ? undefined : input.validation === null ? Prisma.JsonNull : input.validation as Prisma.InputJsonValue
      }
    });
    return mapScore(score)!;
  }

  async softDelete(id: string, input: { deletedAt: Date; purgeAt: Date }): Promise<Score> {
    const score = await prisma.score.update({ where: { id }, data: { ...input, conversionPreview: Prisma.JsonNull } });
    return mapScore(score)!;
  }

  async restore(id: string): Promise<Score> {
    const score = await prisma.score.update({ where: { id }, data: { deletedAt: null, purgeAt: null } });
    return mapScore(score)!;
  }

  async delete(id: string): Promise<void> {
    // Purge can be triggered concurrently by two list requests. deleteMany
    // keeps this final physical removal idempotent in that case.
    await prisma.score.deleteMany({ where: { id } });
  }

  async createAttempt(scoreId: string, kind: "initial" | "automatic" | "manual"): Promise<ConversionAttempt> {
    return prisma.$transaction(async (tx) => {
      await lockScore(tx, scoreId);
      const current = await currentAttempt(tx, scoreId);
      if (current && ["queued", "processing"].includes(current.status)) throw new AppError(409, "Conversão em andamento.", "CONVERSION_IN_PROGRESS");
      return mapAttempt(await tx.conversionAttempt.create({ data: { scoreId, kind } }))!;
    });
  }

  async createManualAttempt(scoreId: string, scoreType?: Score["scoreType"]): Promise<ConversionAttempt> {
    return prisma.$transaction(async (tx) => {
      await lockScore(tx, scoreId);
      const current = await currentAttempt(tx, scoreId);
      if (current && ["queued", "processing"].includes(current.status)) throw new AppError(409, "Conversão em andamento.", "CONVERSION_IN_PROGRESS");
      const attempt = await tx.conversionAttempt.create({ data: { scoreId, kind: "manual" } });
      const score = await tx.score.findUniqueOrThrow({ where: { id: scoreId } });
      await tx.score.update({ where: { id: scoreId }, data: { conversionPreview: Prisma.JsonNull, conversionProgress: preparingProgress(attempt.id), ...(scoreType ? { scoreType, scoreTypeSelected: true } : {}), ...(!score.musicxmlFilename ? { conversionStatus: "queued" } : {}) } });
      return mapAttempt(attempt)!;
    });
  }

  async getAttempt(id: string): Promise<ConversionAttempt | null> {
    return mapAttempt(await prisma.conversionAttempt.findUnique({ where: { id } }));
  }

  async listAttempts(scoreId: string): Promise<ConversionAttempt[]> {
    return (await prisma.conversionAttempt.findMany({ where: { scoreId }, orderBy: { createdAt: "asc" } })).map((item) => mapAttempt(item)!);
  }

  async listPendingAttempts(limit: number): Promise<ConversionAttempt[]> {
    const queued = await prisma.conversionAttempt.findMany({ where: { status: "queued", score: { deletedAt: null } }, orderBy: { createdAt: "asc" } });
    const latest = new Map<string, typeof queued[number]>();
    for (const attempt of queued) latest.set(attempt.scoreId, attempt);
    return [...latest.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).slice(0, limit).map((item) => mapAttempt(item)!);
  }

  async claimAttempt(id: string): Promise<string | null> {
    const found = await prisma.conversionAttempt.findUnique({ where: { id }, select: { scoreId: true } });
    if (!found) return null;
    return prisma.$transaction(async (tx) => {
      await lockScore(tx, found.scoreId);
      const current = await currentAttempt(tx, found.scoreId);
      if (current?.id !== id || current.status !== "queued") return null;
      const score = await tx.score.findUniqueOrThrow({ where: { id: found.scoreId } });
      if (score.deletedAt) return null;
      const claimToken = randomUUID();
      await tx.conversionAttempt.update({ where: { id }, data: { status: "processing", startedAt: new Date(), claimToken } });
      await tx.score.update({ where: { id: found.scoreId }, data: { conversionPreview: Prisma.JsonNull, conversionProgress: preparingProgress(id),
        ...(!score.musicxmlFilename ? { conversionStatus: "processing", errorMessage: null, lastErrorCode: null } : {}) } });
      return claimToken;
    });
  }

  async updateConversionProgress(scoreId: string, attemptId: string, claimToken: string, progress: NonNullable<Score["conversionProgress"]>): Promise<boolean> {
    if (!validConversionProgress(progress, attemptId)) return false;
    return prisma.$transaction(async (tx) => {
      await lockScore(tx, scoreId);
      const current = await currentAttempt(tx, scoreId);
      if (current?.id !== attemptId || current.status !== "processing" || current.claimToken !== claimToken) return false;
      const updated = await tx.score.updateMany({ where: { id: scoreId, deletedAt: null }, data: { conversionProgress: progress } });
      return updated.count === 1;
    });
  }

  async publishConversionPreview(scoreId: string, attemptId: string, claimToken: string, preview: NonNullable<Score["conversionPreview"]>): Promise<boolean> {
    if (!validConversionPreview(preview, attemptId)) return false;
    return prisma.$transaction(async (tx) => {
      await lockScore(tx, scoreId);
      const current = await currentAttempt(tx, scoreId);
      if (current?.id !== attemptId || current.status !== "processing" || current.claimToken !== claimToken) return false;
      const updated = await tx.score.updateMany({ where: { id: scoreId, deletedAt: null }, data: { conversionPreview: preview } });
      return updated.count === 1;
    });
  }

  async requeueStaleAttempts(before: Date): Promise<number> {
    const candidates = await prisma.conversionAttempt.findMany({ where: { status: "processing", startedAt: { lt: before } }, select: { id: true, scoreId: true } });
    let count = 0;
    for (const candidate of candidates) {
      count += await prisma.$transaction(async (tx) => {
        await lockScore(tx, candidate.scoreId);
        const current = await currentAttempt(tx, candidate.scoreId);
        if (current?.id !== candidate.id || current.status !== "processing" || !current.startedAt || current.startedAt >= before) return 0;
        await tx.conversionAttempt.update({ where: { id: candidate.id }, data: { status: "queued", startedAt: null, claimToken: null } });
        const score = await tx.score.findUniqueOrThrow({ where: { id: candidate.scoreId } });
        await tx.score.update({ where: { id: candidate.scoreId }, data: { conversionPreview: Prisma.JsonNull, conversionProgress: preparingProgress(candidate.id),
          ...(!score.musicxmlFilename ? { conversionStatus: "queued" } : {}) } });
        return 1;
      });
    }
    return count;
  }

  async finishAttempt(id: string, input: Parameters<ScoreRepository["finishAttempt"]>[1]): Promise<ConversionAttempt> {
    const item = await prisma.conversionAttempt.update({ where: { id }, data: {
      ...input,
      coverage: input.coverage === undefined ? undefined : input.coverage === null ? Prisma.JsonNull : input.coverage as Prisma.InputJsonValue,
      finishedAt: new Date()
    } });
    return mapAttempt(item)!;
  }

  async publishResult(scoreId: string, attemptId: string, claimToken: string, input: Parameters<ScoreRepository["publishResult"]>[3]): Promise<Score | null> {
    return prisma.$transaction(async (tx) => {
      await lockScore(tx, scoreId);
      const current = await currentAttempt(tx, scoreId);
      if (current?.id !== attemptId || current.status !== "processing" || current.claimToken !== claimToken) return null;
      await tx.conversionAttempt.update({ where: { id: attemptId }, data: { status: input.resultStatus, coverage: input.coverage as Prisma.InputJsonValue, musicxmlFilename: input.musicxmlFilename, finishedAt: new Date() } });
      const existing = await tx.score.findUniqueOrThrow({ where: { id: scoreId } });
      const score = await tx.score.update({ where: { id: scoreId }, data: { conversionPreview: Prisma.JsonNull, conversionProgress: terminalProgress(attemptId, existing.conversionProgress as Score["conversionProgress"], input.coverage), conversionStatus: "converted", resultStatus: input.resultStatus, coverage: input.coverage as Prisma.InputJsonValue, musicxmlFilename: input.musicxmlFilename, warnings: input.warnings, confidence: null, errorMessage: null, lastErrorCode: null, convertedAt: new Date(), reviewStatus: "needs_review", reviewRevision: input.reviewRevision ?? null, validation: input.validation ? input.validation as Prisma.InputJsonValue : Prisma.JsonNull, reviewedAt: null, reviewedById: null } });
      return mapScore(score)!;
    });
  }

  async approveReview(scoreId: string, revision: string, reviewerId: string, validation?: NonNullable<Score["validation"]>): Promise<Score | null> {
    return prisma.$transaction(async (tx) => {
      await lockScore(tx, scoreId);
      const score = await tx.score.findUnique({ where: { id: scoreId } });
      if (!score || score.deletedAt || score.reviewRevision !== revision || !score.musicxmlFilename) return null;
      if (await tx.conversionAttempt.count({ where: { scoreId, status: { in: ["queued", "processing"] } } })) return null;
      if (score.reviewStatus === "approved") return mapScore(score);
      if (score.reviewStatus !== "needs_review") return null;
      if ((score.validation as Score["validation"])?.visualReview?.proposals.some((proposal) => proposal.status === "pending")) return null;
      return mapScore(await tx.score.update({ where: { id: scoreId }, data: { reviewStatus: "approved", reviewedAt: new Date(), reviewedById: reviewerId,
        ...(validation ? { validation: validation as Prisma.InputJsonValue } : {}) } }));
    });
  }

  async approveAutomatic(scoreId: string, revision: string, validation: NonNullable<Score["validation"]>): Promise<Score | null> {
    return prisma.$transaction(async (tx) => {
      await lockScore(tx, scoreId);
      const score = await tx.score.findUnique({ where: { id: scoreId } });
      if (!score || score.deletedAt || score.conversionStatus !== "converted" || score.reviewStatus !== "needs_review"
        || score.reviewRevision !== revision || !score.musicxmlFilename
        || await tx.conversionAttempt.count({ where: { scoreId, status: { in: ["queued", "processing"] } } })
        || validation.visualReview?.proposals.some((proposal) => proposal.status === "pending")) return null;
      return mapScore(await tx.score.update({ where: { id: scoreId }, data: {
        reviewStatus: "approved", reviewedAt: new Date(), reviewedById: null,
        validation: validation as Prisma.InputJsonValue
      } }));
    });
  }

  async publishReviewDecision(scoreId: string, baseRevision: string, input: Parameters<ScoreRepository["publishReviewDecision"]>[2]): Promise<Score | null> {
    return prisma.$transaction(async (tx) => {
      await lockScore(tx, scoreId);
      const score = await tx.score.findUnique({ where: { id: scoreId } });
      if (!score || score.deletedAt || score.conversionStatus !== "converted" || !["needs_review", "approved"].includes(score.reviewStatus) || score.reviewRevision !== baseRevision || !score.musicxmlFilename) return null;
      if (await tx.conversionAttempt.count({ where: { scoreId, status: { in: ["queued", "processing"] } } })) return null;
      return mapScore(await tx.score.update({ where: { id: scoreId }, data: {
        musicxmlFilename: input.musicxmlFilename, reviewRevision: input.reviewRevision, validation: input.validation as Prisma.InputJsonValue,
        warnings: input.warnings, reviewStatus: input.deliveryApproved ? "approved" : "needs_review", reviewedAt: input.deliveryApproved ? new Date() : null, reviewedById: null
      } }));
    });
  }

  async failAttempt(scoreId: string, attemptId: string, claimToken: string, errorCode: string, message: string, automaticRetry: boolean): Promise<{ score: Score; retryAttempt: ConversionAttempt | null } | null> {
    return prisma.$transaction(async (tx) => {
      await lockScore(tx, scoreId);
      const current = await currentAttempt(tx, scoreId);
      if (current?.id !== attemptId || current.status !== "processing" || current.claimToken !== claimToken) return null;
      await tx.conversionAttempt.update({ where: { id: attemptId }, data: { status: "failed", errorCode, errorMessage: message, finishedAt: new Date() } });
      const existing = await tx.score.findUniqueOrThrow({ where: { id: scoreId } });
      const retryAttempt = automaticRetry && current.kind === "initial" ? await tx.conversionAttempt.create({ data: { scoreId, kind: "automatic" } }) : null;
      const score = await tx.score.update({ where: { id: scoreId }, data: { conversionPreview: Prisma.JsonNull, conversionProgress: retryAttempt ? preparingProgress(retryAttempt.id) : terminalProgress(attemptId, existing.conversionProgress as Score["conversionProgress"]), conversionStatus: existing.musicxmlFilename ? "converted" : retryAttempt ? "queued" : "failed", errorMessage: message, lastErrorCode: errorCode } });
      return { score: mapScore(score)!, retryAttempt: mapAttempt(retryAttempt) };
    });
  }
}

class PrismaEntitlementRepository implements EntitlementRepository {
  async getSummary(userId: string, freeScanLimit: number): Promise<EntitlementSummary> {
    const entitlement = await prisma.entitlement.upsert({
      where: { userId },
      create: { userId },
      update: {}
    });
    return entitlementSummary(entitlement, freeScanLimit);
  }

  async createScoreForUpload(input: CreateScoreInput, freeScanLimit: number): Promise<{ score: Score; debitedFreeScan: boolean }> {
    return prisma.$transaction(async (tx) => {
      const entitlement = await tx.entitlement.upsert({
        where: { userId: input.userId },
        create: { userId: input.userId },
        update: {}
      });

      let reason = "paid_scan";
      let debitedFreeScan = false;
      let freeScanNumber: number | null = null;

      if (entitlement.plan === "free") {
        const updated = await tx.entitlement.updateMany({
          where: {
            userId: input.userId,
            plan: "free",
            freeScansUsed: { lt: freeScanLimit }
          },
          data: { freeScansUsed: { increment: 1 } }
        });
        if (updated.count !== 1) {
          throw new AppError(402, "Limite gratuito atingido. Desbloqueie a versão paga para continuar.", "FREE_SCAN_LIMIT_REACHED");
        }
        reason = "free_scan";
        debitedFreeScan = true;
        freeScanNumber = entitlement.freeScansUsed + 1;
      }

      const score = await tx.score.create({ data: { ...input, attempts: { create: { kind: "initial" } } } });
      await tx.scanUsage.create({
        data: {
          userId: input.userId,
          scoreId: score.id,
          reason,
          metadata: freeScanNumber ? { freeScanNumber, freeScanLimit } : Prisma.JsonNull
        }
      });
      return { score: mapScore(score)!, debitedFreeScan };
    });
  }

  private async appleTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002")) continue;
        throw error;
      }
    }
  }

  async recordApplePurchase(input: ApplePurchaseRecord, freeScanLimit: number): Promise<EntitlementSummary> {
    const environment = input.environment ?? "sandbox";
    return this.appleTransaction(async (tx) => {
      const claim = await tx.applePurchase.upsert({
        where: { environment_originalTransactionId: { environment, originalTransactionId: input.originalTransactionId } },
        create: { userId: input.userId, environment, originalTransactionId: input.originalTransactionId, productId: input.productId, purchasedAt: input.purchasedAt },
        update: {}
      });
      if (claim.userId && claim.userId !== input.userId) throw new AppError(409, "Esta compra Apple já está vinculada a outra conta.", "APPLE_PURCHASE_ALREADY_CLAIMED");
      if (claim.revoked) throw new AppError(402, "Compra Apple revogada ou reembolsada.", "APPLE_PURCHASE_REVOKED");
      if (!claim.userId) await tx.applePurchase.update({ where: { id: claim.id }, data: { userId: input.userId, purchasedAt: input.purchasedAt } });
      const current = await tx.entitlement.findUnique({ where: { userId: input.userId } });
      if (environment === "sandbox" && current?.plan === "paid" && (current.source !== "apple" || current.appleEnvironment === "production")) return entitlementSummary(current, freeScanLimit);
      const data = { plan: "paid" as const, source: "apple" as const, appleOriginalTransactionId: input.originalTransactionId,
        appleEnvironment: environment, appleProductId: input.productId, purchasedAt: input.purchasedAt,
        googlePurchaseToken: null, googleProductId: null, grantedAt: null, grantedById: null, grantReason: null };
      const entitlement = await tx.entitlement.upsert({ where: { userId: input.userId }, create: { userId: input.userId, ...data }, update: data });
      return entitlementSummary(entitlement, freeScanLimit);
    });
  }

  async applyApplePurchaseNotification(input: ApplePurchaseNotification, freeScanLimit: number): Promise<{ entitlement: EntitlementSummary; userId: string } | null> {
    return this.appleTransaction(async (tx) => {
      const key = { environment: input.environment, originalTransactionId: input.originalTransactionId };
      const claim = await tx.applePurchase.upsert({ where: { environment_originalTransactionId: key },
        create: { ...key, productId: input.productId }, update: {} });
      if (claim.lastNotificationId === input.notificationId || (claim.lastNotificationSignedAt && claim.lastNotificationSignedAt >= input.signedAt)) return null;
      await tx.applePurchase.update({ where: { id: claim.id }, data: { revoked: input.revoked, lastNotificationId: input.notificationId, lastNotificationSignedAt: input.signedAt } });
      if (!claim.userId) return null;
      const current = await tx.entitlement.findUnique({ where: { userId: claim.userId } });
      if (!current || (current.source !== "apple" && current.source !== "free")) return null;
      if (input.revoked && (current.appleEnvironment !== input.environment || current.appleOriginalTransactionId !== input.originalTransactionId)) return null;
      if (!input.revoked && current.appleEnvironment === "production" && input.environment === "sandbox") return null;
      const active = await tx.applePurchase.findFirst({
        where: { userId: claim.userId, revoked: false, ...(input.environment === "production" ? { environment: "production" } : {}) },
        orderBy: [{ environment: "asc" }, { purchasedAt: "desc" }]
      });
      const data = active
        ? { plan: "paid" as const, source: "apple" as const, appleEnvironment: active.environment, appleOriginalTransactionId: active.originalTransactionId, appleProductId: active.productId, purchasedAt: active.purchasedAt }
        : { plan: "free" as const, source: "free" as const, appleEnvironment: null, appleOriginalTransactionId: null, appleProductId: null, purchasedAt: null };
      const entitlement = await tx.entitlement.update({ where: { userId: claim.userId }, data });
      return { entitlement: entitlementSummary(entitlement, freeScanLimit), userId: claim.userId };
    });
  }

  async recordGooglePurchase(input: { userId: string; productId: string; purchaseToken: string; purchasedAt: Date }, freeScanLimit: number): Promise<EntitlementSummary> {
    const entitlement = await prisma.entitlement.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId, plan: "paid", source: "google_play", googlePurchaseToken: input.purchaseToken, googleProductId: input.productId, purchasedAt: input.purchasedAt },
      update: { plan: "paid", source: "google_play", googlePurchaseToken: input.purchaseToken, googleProductId: input.productId, purchasedAt: input.purchasedAt, appleOriginalTransactionId: null, appleEnvironment: null, appleProductId: null, grantedAt: null, grantedById: null, grantReason: null }
    });
    return entitlementSummary(entitlement, freeScanLimit);
  }

  async grantAdminAccess(input: { userId: string; grantedById: string; reason?: string | null }, freeScanLimit: number): Promise<EntitlementSummary> {
    const entitlement = await prisma.entitlement.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        plan: "paid",
        source: "admin_grant",
        grantedAt: new Date(),
        grantedById: input.grantedById,
        grantReason: input.reason ?? null
      },
      update: {
        plan: "paid",
        source: "admin_grant",
        appleOriginalTransactionId: null,
        appleEnvironment: null,
        appleProductId: null,
        googlePurchaseToken: null,
        googleProductId: null,
        purchasedAt: null,
        grantedAt: new Date(),
        grantedById: input.grantedById,
        grantReason: input.reason ?? null
      }
    });
    return entitlementSummary(entitlement, freeScanLimit);
  }

  async revokeAdminAccess(userId: string, freeScanLimit: number): Promise<EntitlementSummary> {
    const existing = await prisma.entitlement.findUnique({ where: { userId } });
    if (!existing) throw new AppError(404, "Registro não encontrado.", "NOT_FOUND");
    if (existing.source !== "admin_grant") {
      throw new AppError(409, "Apenas concessões administrativas podem ser removidas por esta ação.", "ENTITLEMENT_NOT_ADMIN_GRANT");
    }
    const entitlement = await prisma.entitlement.update({
      where: { userId },
      data: {
        plan: "free",
        source: "free",
        grantedAt: null,
        grantedById: null,
        grantReason: null
      }
    });
    return entitlementSummary(entitlement, freeScanLimit);
  }

  async revokeApplePurchase(originalTransactionId: string, freeScanLimit: number, environment: "sandbox" | "production"): Promise<{ entitlement: EntitlementSummary; userId: string } | null> {
    return this.applyApplePurchaseNotification({ originalTransactionId, productId: "premium_unlock", environment, revoked: true, notificationId: randomUUID(), signedAt: new Date() }, freeScanLimit);
  }

  async revokeGooglePurchase(purchaseToken: string, freeScanLimit: number): Promise<{ entitlement: EntitlementSummary; userId: string } | null> {
    const existing = await prisma.entitlement.findFirst({ where: { googlePurchaseToken: purchaseToken, source: "google_play" } });
    if (!existing) return null;
    const entitlement = await prisma.entitlement.update({ where: { userId: existing.userId }, data: { plan: "free", source: "free", googlePurchaseToken: null, googleProductId: null, purchasedAt: null } });
    return { entitlement: entitlementSummary(entitlement, freeScanLimit), userId: entitlement.userId };
  }

  async findUserByGooglePurchaseToken(purchaseToken: string): Promise<string | null> {
    const existing = await prisma.entitlement.findUnique({ where: { googlePurchaseToken: purchaseToken } });
    return existing?.userId ?? null;
  }

  async claimGoogleNotification(input: { messageId: string; eventType: string; purchaseToken?: string | null }): Promise<boolean> {
    try {
      await prisma.googlePlayNotification.create({ data: input });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }
}

class PrismaAuditRepository implements AuditRepository {
  async create(input: Parameters<AuditRepository["create"]>[0]): Promise<AuditLog> {
    const log = await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        ipAddress: input.ipAddress,
        metadata: input.metadata ? input.metadata as Prisma.InputJsonObject : Prisma.JsonNull
      }
    });
    return mapAudit(log)!;
  }

  async list(): Promise<AuditLog[]> {
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    return logs.map((log) => mapAudit(log)!);
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: date } } });
    return result.count;
  }
}

export function createPrismaRepositories(): Repositories {
  return {
    users: new PrismaUserRepository(),
    sessions: new PrismaSessionRepository(),
    scores: new PrismaScoreRepository(),
    entitlements: new PrismaEntitlementRepository(),
    audits: new PrismaAuditRepository()
  };
}
