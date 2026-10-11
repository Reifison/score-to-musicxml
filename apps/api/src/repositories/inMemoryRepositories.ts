import { nanoid } from "nanoid";
import { randomUUID } from "node:crypto";
import { scoreAvailability } from "../services/MusicalReview.js";
import type { AuditLog, ConversionAttempt, ConversionAttemptKind, EntitlementPlan, EntitlementSource, EntitlementSummary, Score, Session, User } from "../domain.js";
import { AppError } from "../errors/AppError.js";
import type {
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

const now = () => new Date();

export class InMemoryUserRepository implements UserRepository {
  private users = new Map<string, User>();

  async create(input: CreateUserInput): Promise<User> {
    if ([...this.users.values()].some((user) => user.email === input.email.toLowerCase())) {
      throw new Error("Unique constraint failed");
    }
    const createdAt = now();
    const user: User = {
      id: nanoid(),
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      role: input.role,
      isActive: input.isActive ?? true,
      createdAt,
      updatedAt: createdAt
    };
    this.users.set(user.id, user);
    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return [...this.users.values()].find((user) => user.email === email.toLowerCase()) ?? null;
  }

  async list(): Promise<User[]> {
    return [...this.users.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async update(id: string, input: UpdateUserInput): Promise<User> {
    const existing = this.users.get(id);
    if (!existing) throw new Error("User not found");
    const updated = { ...existing, ...input, email: input.email?.toLowerCase() ?? existing.email, updatedAt: now() };
    this.users.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.users.delete(id);
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private sessions = new Map<string, Session>();

  async create(input: { tokenHash: string; userId: string; expiresAt: Date }): Promise<Session> {
    const session = { id: nanoid(), createdAt: now(), ...input };
    this.sessions.set(session.tokenHash, session);
    return session;
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    return this.sessions.get(tokenHash) ?? null;
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  async deleteExpired(date: Date): Promise<void> {
    for (const [hash, session] of this.sessions) {
      if (session.expiresAt < date) this.sessions.delete(hash);
    }
  }
}

export class InMemoryScoreRepository implements ScoreRepository {
  private scores = new Map<string, Score>();
  private attempts = new Map<string, ConversionAttempt>();
  private claimTokens = new Map<string, string>();

  private currentAttempt(scoreId: string): ConversionAttempt | null {
    const attempts = [...this.attempts.values()].filter((attempt) => attempt.scoreId === scoreId);
    return attempts.find((attempt) => attempt.kind === "manual")
      ?? attempts.find((attempt) => attempt.kind === "automatic")
      ?? attempts.find((attempt) => attempt.kind === "initial")
      ?? null;
  }

  private newAttempt(scoreId: string, kind: ConversionAttemptKind): ConversionAttempt {
    if ([...this.attempts.values()].some((attempt) => attempt.scoreId === scoreId && attempt.kind === kind)) throw new Error("Duplicate conversion attempt kind");
    const attempt: ConversionAttempt = { id: nanoid(), scoreId, kind, status: "queued", errorCode: null, errorMessage: null, coverage: null, musicxmlFilename: null, createdAt: now(), startedAt: null, finishedAt: null };
    this.attempts.set(attempt.id, attempt);
    return attempt;
  }

  async create(input: CreateScoreInput): Promise<Score> {
    const createdAt = now();
    const score: Score = {
      id: nanoid(),
      errorMessage: null,
      warnings: null,
      confidence: null,
      scoreType: input.scoreType ?? "melody",
      scoreTypeSelected: input.scoreTypeSelected ?? false,
      resultStatus: null,
      coverage: null,
      lastErrorCode: null,
      reviewStatus: "unverified",
      reviewRevision: null,
      validation: null,
      reviewedAt: null,
      reviewedById: null,
      canDownloadMusicXml: false,
      canPlay: false,
      canExportMidi: false,
      musicxmlFilename: null,
      isFavorite: false,
      deletedAt: null,
      purgeAt: null,
      convertedAt: null,
      createdAt,
      updatedAt: createdAt,
      ...input,
      preprocessingProfile: input.preprocessingProfile ?? null
    };
    this.scores.set(score.id, score);
    this.newAttempt(score.id, "initial");
    return score;
  }

  async findById(id: string): Promise<Score | null> {
    const score = this.scores.get(id);
    return score && !score.deletedAt ? score : null;
  }

  async findByIdIncludingDeleted(id: string): Promise<Score | null> {
    return this.scores.get(id) ?? null;
  }

  async list(filters: ScoreFilters = {}): Promise<Score[]> {
    return [...this.scores.values()]
      .filter((score) => !score.deletedAt)
      .filter((score) => !filters.userId || score.userId === filters.userId)
      .filter((score) => filters.favorite === undefined || score.isFavorite === filters.favorite)
      .filter((score) => !filters.status || score.conversionStatus === filters.status)
      .filter((score) => !filters.from || score.createdAt >= filters.from)
      .filter((score) => !filters.to || score.createdAt <= filters.to)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listTrash(filters: ScoreFilters = {}): Promise<Score[]> {
    return [...this.scores.values()]
      .filter((score) => Boolean(score.deletedAt))
      .filter((score) => !filters.userId || score.userId === filters.userId)
      .filter((score) => filters.favorite === undefined || score.isFavorite === filters.favorite)
      .filter((score) => !filters.status || score.conversionStatus === filters.status)
      .filter((score) => !filters.from || score.deletedAt! >= filters.from)
      .filter((score) => !filters.to || score.deletedAt! <= filters.to)
      .sort((a, b) => a.purgeAt!.getTime() - b.purgeAt!.getTime());
  }

  async listOlderThan(date: Date): Promise<Score[]> {
    return [...this.scores.values()]
      .filter((score) => !score.deletedAt)
      .filter((score) => score.createdAt < date)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async listExpiredTrash(date: Date): Promise<Score[]> {
    return [...this.scores.values()]
      .filter((score) => Boolean(score.deletedAt && score.purgeAt && score.purgeAt <= date))
      .sort((a, b) => a.purgeAt!.getTime() - b.purgeAt!.getTime());
  }

  async update(id: string, input: UpdateScoreInput): Promise<Score> {
    const existing = this.scores.get(id);
    if (!existing) throw new Error("Score not found");
    const updated = { ...existing, ...input, updatedAt: now() };
    Object.assign(updated, scoreAvailability(updated));
    this.scores.set(id, updated);
    return updated;
  }

  async softDelete(id: string, input: { deletedAt: Date; purgeAt: Date }): Promise<Score> {
    const existing = this.scores.get(id);
    if (!existing) throw new Error("Score not found");
    const updated = { ...existing, ...input, updatedAt: now() };
    this.scores.set(id, updated);
    return updated;
  }

  async restore(id: string): Promise<Score> {
    const existing = this.scores.get(id);
    if (!existing) throw new Error("Score not found");
    const updated = { ...existing, deletedAt: null, purgeAt: null, updatedAt: now() };
    this.scores.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.scores.delete(id);
    for (const [attemptId, attempt] of this.attempts) if (attempt.scoreId === id) this.attempts.delete(attemptId);
  }

  async createAttempt(scoreId: string, kind: ConversionAttemptKind): Promise<ConversionAttempt> {
    const current = this.currentAttempt(scoreId);
    if (current && ["queued", "processing"].includes(current.status)) throw new AppError(409, "Conversão em andamento.", "CONVERSION_IN_PROGRESS");
    return this.newAttempt(scoreId, kind);
  }
  async createManualAttempt(scoreId: string, scoreType?: Score["scoreType"]): Promise<ConversionAttempt> {
    const current = this.currentAttempt(scoreId);
    if (current && ["queued", "processing"].includes(current.status)) throw new AppError(409, "Conversão em andamento.", "CONVERSION_IN_PROGRESS");
    const attempt = this.newAttempt(scoreId, "manual");
    const existing = this.scores.get(scoreId)!;
    this.scores.set(scoreId, { ...existing, ...(scoreType ? { scoreType, scoreTypeSelected: true } : {}), ...(!existing.musicxmlFilename ? { conversionStatus: "queued" as const } : {}), updatedAt: now() });
    return attempt;
  }

  async getAttempt(id: string): Promise<ConversionAttempt | null> { return this.attempts.get(id) ?? null; }
  async listAttempts(scoreId: string): Promise<ConversionAttempt[]> { return [...this.attempts.values()].filter((item) => item.scoreId === scoreId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()); }
  async listPendingAttempts(limit: number): Promise<ConversionAttempt[]> { return [...this.attempts.values()].filter((item) => item.status === "queued" && !this.scores.get(item.scoreId)?.deletedAt && this.currentAttempt(item.scoreId)?.id === item.id).slice(0, limit); }
  async claimAttempt(id: string): Promise<string | null> {
    const attempt = this.attempts.get(id);
    if (!attempt || attempt.status !== "queued" || this.currentAttempt(attempt.scoreId)?.id !== id || this.scores.get(attempt.scoreId)?.deletedAt) return null;
    const token = randomUUID();
    this.attempts.set(id, { ...attempt, status: "processing", startedAt: now() });
    this.claimTokens.set(id, token);
    const score = this.scores.get(attempt.scoreId)!;
    if (!score.musicxmlFilename) this.scores.set(score.id, { ...score, conversionStatus: "processing", errorMessage: null, lastErrorCode: null, updatedAt: now() });
    return token;
  }
  async requeueStaleAttempts(before: Date): Promise<number> {
    let count = 0;
    for (const [id, attempt] of this.attempts) if (attempt.status === "processing" && attempt.startedAt && attempt.startedAt < before && this.currentAttempt(attempt.scoreId)?.id === id) {
      this.attempts.set(id, { ...attempt, status: "queued", startedAt: null });
      this.claimTokens.delete(id);
      count += 1;
    }
    return count;
  }
  async finishAttempt(id: string, input: Parameters<ScoreRepository["finishAttempt"]>[1]): Promise<ConversionAttempt> {
    const attempt = this.attempts.get(id);
    if (!attempt) throw new Error("Attempt not found");
    const updated = { ...attempt, ...input, finishedAt: now() };
    this.attempts.set(id, updated);
    return updated;
  }
  async publishResult(scoreId: string, attemptId: string, claimToken: string, input: Parameters<ScoreRepository["publishResult"]>[3]): Promise<Score | null> {
    const current = this.currentAttempt(scoreId);
    if (current?.id !== attemptId || current.status !== "processing" || this.claimTokens.get(attemptId) !== claimToken) return null;
    this.claimTokens.delete(attemptId);
    this.attempts.set(attemptId, { ...current, status: input.resultStatus, coverage: input.coverage, musicxmlFilename: input.musicxmlFilename, finishedAt: now() });
    const score = this.scores.get(scoreId)!;
    const updatedBase: Score = { ...score, conversionStatus: "converted", resultStatus: input.resultStatus, coverage: input.coverage, musicxmlFilename: input.musicxmlFilename, warnings: input.warnings, confidence: null, errorMessage: null, lastErrorCode: null, convertedAt: now(), updatedAt: now(), reviewStatus: "needs_review", reviewRevision: input.reviewRevision ?? null, validation: input.validation ?? null, reviewedAt: null, reviewedById: null };
    const updated: Score = { ...updatedBase, ...scoreAvailability(updatedBase) };
    this.scores.set(scoreId, updated);
    return updated;
  }
  async approveReview(scoreId: string, revision: string, reviewerId: string, validation?: NonNullable<Score["validation"]>): Promise<Score | null> {
    const score = this.scores.get(scoreId);
    if (!score || score.deletedAt || score.reviewRevision !== revision || !score.musicxmlFilename ||
      [...this.attempts.values()].some((attempt) => attempt.scoreId === scoreId && ["queued", "processing"].includes(attempt.status))) return null;
    if (score.reviewStatus === "approved") return score;
    if (score.reviewStatus !== "needs_review") return null;
    if (score.validation?.visualReview?.proposals.some((proposal) => proposal.status === "pending")) return null;
    return this.update(scoreId, { reviewStatus: "approved", reviewedAt: now(), reviewedById: reviewerId,
      ...(validation ? { validation: structuredClone(validation) } : {}) });
  }
  async approveAutomatic(scoreId: string, revision: string, validation: NonNullable<Score["validation"]>): Promise<Score | null> {
    const score = this.scores.get(scoreId);
    if (!score || score.deletedAt || score.conversionStatus !== "converted" || score.reviewStatus !== "needs_review"
      || score.reviewRevision !== revision || !score.musicxmlFilename
      || [...this.attempts.values()].some((attempt) => attempt.scoreId === scoreId && ["queued", "processing"].includes(attempt.status))
      || validation.visualReview?.proposals.some((proposal) => proposal.status === "pending")) return null;
    return this.update(scoreId, { reviewStatus: "approved", reviewedAt: now(), reviewedById: null,
      validation: structuredClone(validation) });
  }
  async publishReviewDecision(scoreId: string, baseRevision: string, input: Parameters<ScoreRepository["publishReviewDecision"]>[2]): Promise<Score | null> {
    const score = this.scores.get(scoreId);
    if (!score || score.deletedAt || score.conversionStatus !== "converted" || score.reviewStatus !== "needs_review" || score.reviewRevision !== baseRevision || !score.musicxmlFilename
      || [...this.attempts.values()].some((attempt) => attempt.scoreId === scoreId && ["queued", "processing"].includes(attempt.status))) return null;
    const updatedBase: Score = { ...score, ...input, updatedAt: now(), reviewedAt: null, reviewedById: null, reviewStatus: "needs_review" };
    const updated: Score = { ...updatedBase, ...scoreAvailability(updatedBase) };
    this.scores.set(scoreId, updated);
    return updated;
  }
  async failAttempt(scoreId: string, attemptId: string, claimToken: string, errorCode: string, message: string, automaticRetry: boolean): Promise<{ score: Score; retryAttempt: ConversionAttempt | null } | null> {
    const current = this.currentAttempt(scoreId);
    if (current?.id !== attemptId || current.status !== "processing" || this.claimTokens.get(attemptId) !== claimToken) return null;
    this.claimTokens.delete(attemptId);
    this.attempts.set(attemptId, { ...current, status: "failed", errorCode, errorMessage: message, finishedAt: now() });
    const retryAttempt = automaticRetry && current.kind === "initial" ? this.newAttempt(scoreId, "automatic") : null;
    const score = this.scores.get(scoreId)!;
    const updated = { ...score, conversionStatus: (score.musicxmlFilename ? "converted" : retryAttempt ? "queued" : "failed") as Score["conversionStatus"], errorMessage: message, lastErrorCode: errorCode, updatedAt: now() };
    this.scores.set(scoreId, updated);
    return { score: updated, retryAttempt };
  }
}

export class InMemoryAuditRepository implements AuditRepository {
  private logs: AuditLog[] = [];

  async create(input: Parameters<AuditRepository["create"]>[0]): Promise<AuditLog> {
    const log: AuditLog = {
      id: nanoid(),
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity ?? null,
      entityId: input.entityId ?? null,
      ipAddress: input.ipAddress ?? null,
      metadata: input.metadata ?? null,
      createdAt: now()
    };
    this.logs.push(log);
    return log;
  }

  async list(): Promise<AuditLog[]> {
    return [...this.logs].reverse();
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const before = this.logs.length;
    this.logs = this.logs.filter((log) => log.createdAt >= date);
    return before - this.logs.length;
  }
}

export class InMemoryEntitlementRepository implements EntitlementRepository {
  private googleNotifications = new Set<string>();
  private entitlements = new Map<string, {
    plan: EntitlementPlan;
    source: EntitlementSource;
    freeScansUsed: number;
    purchasedAt: Date | null;
    appleProductId: string | null;
    appleOriginalTransactionId: string | null;
    googlePurchaseToken: string | null;
    googleProductId: string | null;
    grantedAt: Date | null;
    grantedById: string | null;
    grantReason: string | null;
  }>();

  constructor(private scores: ScoreRepository) {}

  async getSummary(userId: string, freeScanLimit: number): Promise<EntitlementSummary> {
    return this.summary(userId, freeScanLimit);
  }

  async createScoreForUpload(input: CreateScoreInput, freeScanLimit: number): Promise<{ score: Score; debitedFreeScan: boolean }> {
    const entitlement = this.ensure(input.userId);
    let debitedFreeScan = false;
    if (entitlement.plan === "free") {
      if (entitlement.freeScansUsed >= freeScanLimit) {
        throw new AppError(402, "Limite gratuito atingido. Desbloqueie a versão paga para continuar.", "FREE_SCAN_LIMIT_REACHED");
      }
      entitlement.freeScansUsed += 1;
      debitedFreeScan = true;
    }
    const score = await this.scores.create(input);
    return { score, debitedFreeScan };
  }

  async recordApplePurchase(input: {
    userId: string;
    productId: string;
    originalTransactionId: string;
    purchasedAt: Date;
    restored?: boolean;
  }, freeScanLimit: number): Promise<EntitlementSummary> {
    const entitlement = this.ensure(input.userId);
    entitlement.plan = "paid";
    entitlement.source = "apple";
    entitlement.appleProductId = input.productId;
    entitlement.appleOriginalTransactionId = input.originalTransactionId;
    entitlement.googlePurchaseToken = null;
    entitlement.googleProductId = null;
    entitlement.purchasedAt = input.purchasedAt;
    entitlement.grantedAt = null;
    entitlement.grantedById = null;
    entitlement.grantReason = null;
    return this.summary(input.userId, freeScanLimit);
  }

  async recordGooglePurchase(input: { userId: string; productId: string; purchaseToken: string; purchasedAt: Date }, freeScanLimit: number): Promise<EntitlementSummary> {
    const entitlement = this.ensure(input.userId);
    entitlement.plan = "paid";
    entitlement.source = "google_play";
    entitlement.googleProductId = input.productId;
    entitlement.googlePurchaseToken = input.purchaseToken;
    entitlement.appleProductId = null;
    entitlement.appleOriginalTransactionId = null;
    entitlement.purchasedAt = input.purchasedAt;
    entitlement.grantedAt = null;
    entitlement.grantedById = null;
    entitlement.grantReason = null;
    return this.summary(input.userId, freeScanLimit);
  }

  async grantAdminAccess(input: { userId: string; grantedById: string; reason?: string | null }, freeScanLimit: number): Promise<EntitlementSummary> {
    const entitlement = this.ensure(input.userId);
    entitlement.plan = "paid";
    entitlement.source = "admin_grant";
    entitlement.appleProductId = null;
    entitlement.appleOriginalTransactionId = null;
    entitlement.googlePurchaseToken = null;
    entitlement.googleProductId = null;
    entitlement.purchasedAt = null;
    entitlement.grantedAt = now();
    entitlement.grantedById = input.grantedById;
    entitlement.grantReason = input.reason ?? null;
    return this.summary(input.userId, freeScanLimit);
  }

  async revokeAdminAccess(userId: string, freeScanLimit: number): Promise<EntitlementSummary> {
    const entitlement = this.ensure(userId);
    if (entitlement.source !== "admin_grant") {
      throw new AppError(409, "Apenas concessões administrativas podem ser removidas por esta ação.", "ENTITLEMENT_NOT_ADMIN_GRANT");
    }
    entitlement.plan = "free";
    entitlement.source = "free";
    entitlement.grantedAt = null;
    entitlement.grantedById = null;
    entitlement.grantReason = null;
    return this.summary(userId, freeScanLimit);
  }

  async revokeApplePurchase(originalTransactionId: string, freeScanLimit: number): Promise<{ entitlement: EntitlementSummary; userId: string } | null> {
    for (const [userId, entitlement] of this.entitlements) {
      if (entitlement.appleOriginalTransactionId !== originalTransactionId || entitlement.source !== "apple") continue;
      entitlement.plan = "free";
      entitlement.source = "free";
      entitlement.appleProductId = null;
      entitlement.appleOriginalTransactionId = null;
      entitlement.googlePurchaseToken = null;
      entitlement.googleProductId = null;
      entitlement.purchasedAt = null;
      return { entitlement: await this.summary(userId, freeScanLimit), userId };
    }
    return null;
  }

  async revokeGooglePurchase(purchaseToken: string, freeScanLimit: number): Promise<{ entitlement: EntitlementSummary; userId: string } | null> {
    for (const [userId, entitlement] of this.entitlements) {
      if (entitlement.googlePurchaseToken !== purchaseToken || entitlement.source !== "google_play") continue;
      entitlement.plan = "free";
      entitlement.source = "free";
      entitlement.googlePurchaseToken = null;
      entitlement.googleProductId = null;
      entitlement.purchasedAt = null;
      return { entitlement: await this.summary(userId, freeScanLimit), userId };
    }
    return null;
  }

  async findUserByGooglePurchaseToken(purchaseToken: string): Promise<string | null> {
    for (const [userId, entitlement] of this.entitlements) if (entitlement.googlePurchaseToken === purchaseToken) return userId;
    return null;
  }

  async claimGoogleNotification(input: { messageId: string; eventType: string; purchaseToken?: string | null }): Promise<boolean> {
    if (this.googleNotifications.has(input.messageId)) return false;
    this.googleNotifications.add(input.messageId);
    return true;
  }

  private ensure(userId: string) {
    const existing = this.entitlements.get(userId);
    if (existing) return existing;
    const entitlement = {
      plan: "free" as EntitlementPlan,
      source: "free" as EntitlementSource,
      freeScansUsed: 0,
      purchasedAt: null,
      appleProductId: null,
      appleOriginalTransactionId: null,
      googlePurchaseToken: null,
      googleProductId: null,
      grantedAt: null,
      grantedById: null,
      grantReason: null
    };
    this.entitlements.set(userId, entitlement);
    return entitlement;
  }

  private summary(userId: string, freeScanLimit: number): EntitlementSummary {
    const entitlement = this.ensure(userId);
    return {
      plan: entitlement.plan,
      source: entitlement.source,
      freeScanLimit,
      freeScansUsed: entitlement.freeScansUsed,
      freeScansRemaining: entitlement.plan === "paid" ? null : Math.max(0, freeScanLimit - entitlement.freeScansUsed),
      purchasedAt: entitlement.purchasedAt,
      appleProductId: entitlement.appleProductId,
      googleProductId: entitlement.googleProductId,
      grantedAt: entitlement.grantedAt,
      grantedById: entitlement.grantedById,
      grantReason: entitlement.grantReason
    };
  }
}

export function createInMemoryRepositories(): Repositories {
  const scores = new InMemoryScoreRepository();
  return {
    users: new InMemoryUserRepository(),
    sessions: new InMemorySessionRepository(),
    scores,
    entitlements: new InMemoryEntitlementRepository(scores),
    audits: new InMemoryAuditRepository()
  };
}
