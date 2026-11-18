import { nanoid } from "nanoid";
import { randomUUID } from "node:crypto";
import { scoreAvailability } from "../services/MusicalReview.js";
import { preparingProgress, terminalProgress, validConversionProgress } from "../services/ConversionProgress.js";
import { validConversionPreview } from "../services/FirstPagePreview.js";
import type { AuditLog, ConversionAttempt, ConversionAttemptKind, EntitlementPlan, EntitlementSource, EntitlementSummary, Score, Session, User } from "../domain.js";
import { AppError } from "../errors/AppError.js";
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
      conversionProgress: null,
      conversionPreview: null,
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
    const updated = { ...existing, ...input, conversionPreview: null, updatedAt: now() };
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
    this.scores.set(scoreId, { ...existing, conversionPreview: null, conversionProgress: preparingProgress(attempt.id), ...(scoreType ? { scoreType, scoreTypeSelected: true } : {}), ...(!existing.musicxmlFilename ? { conversionStatus: "queued" as const } : {}), updatedAt: now() });
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
    this.scores.set(score.id, { ...score, conversionPreview: null, conversionProgress: preparingProgress(id),
      ...(!score.musicxmlFilename ? { conversionStatus: "processing" as const, errorMessage: null, lastErrorCode: null } : {}), updatedAt: now() });
    return token;
  }
  async updateConversionProgress(scoreId: string, attemptId: string, claimToken: string, progress: NonNullable<Score["conversionProgress"]>): Promise<boolean> {
    const current = this.currentAttempt(scoreId);
    const score = this.scores.get(scoreId);
    if (!score || score.deletedAt || current?.id !== attemptId || current.status !== "processing"
      || this.claimTokens.get(attemptId) !== claimToken || !validConversionProgress(progress, attemptId)) return false;
    this.scores.set(scoreId, { ...score, conversionProgress: structuredClone(progress), updatedAt: now() });
    return true;
  }
  async publishConversionPreview(scoreId: string, attemptId: string, claimToken: string, preview: NonNullable<Score["conversionPreview"]>): Promise<boolean> {
    const current = this.currentAttempt(scoreId);
    const score = this.scores.get(scoreId);
    if (!score || score.deletedAt || current?.id !== attemptId || current.status !== "processing"
      || this.claimTokens.get(attemptId) !== claimToken || !validConversionPreview(preview, attemptId)) return false;
    this.scores.set(scoreId, { ...score, conversionPreview: structuredClone(preview), updatedAt: now() });
    return true;
  }
  async requeueStaleAttempts(before: Date): Promise<number> {
    let count = 0;
    for (const [id, attempt] of this.attempts) if (attempt.status === "processing" && attempt.startedAt && attempt.startedAt < before && this.currentAttempt(attempt.scoreId)?.id === id) {
      this.attempts.set(id, { ...attempt, status: "queued", startedAt: null });
      this.claimTokens.delete(id);
      const score = this.scores.get(attempt.scoreId)!;
      this.scores.set(score.id, { ...score, conversionPreview: null, conversionProgress: preparingProgress(id),
        ...(!score.musicxmlFilename ? { conversionStatus: "queued" as const } : {}), updatedAt: now() });
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
    const updatedBase: Score = { ...score, conversionPreview: null, conversionProgress: terminalProgress(attemptId, score.conversionProgress, input.coverage), conversionStatus: "converted", resultStatus: input.resultStatus, coverage: input.coverage, musicxmlFilename: input.musicxmlFilename, warnings: input.warnings, confidence: null, errorMessage: null, lastErrorCode: null, convertedAt: now(), updatedAt: now(), reviewStatus: "needs_review", reviewRevision: input.reviewRevision ?? null, validation: input.validation ?? null, reviewedAt: null, reviewedById: null };
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
    if (!score || score.deletedAt || score.conversionStatus !== "converted" || !["needs_review", "approved"].includes(score.reviewStatus ?? "") || score.reviewRevision !== baseRevision || !score.musicxmlFilename
      || [...this.attempts.values()].some((attempt) => attempt.scoreId === scoreId && ["queued", "processing"].includes(attempt.status))) return null;
    const { deliveryApproved, ...publication } = input;
    const updatedBase: Score = { ...score, ...publication, updatedAt: now(), reviewedAt: deliveryApproved ? now() : null,
      reviewedById: null, reviewStatus: deliveryApproved ? "approved" : "needs_review" };
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
    const updated = { ...score, conversionPreview: null, conversionProgress: retryAttempt ? preparingProgress(retryAttempt.id) : terminalProgress(attemptId, score.conversionProgress), conversionStatus: (score.musicxmlFilename ? "converted" : retryAttempt ? "queued" : "failed") as Score["conversionStatus"], errorMessage: message, lastErrorCode: errorCode, updatedAt: now() };
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
  private applePurchases = new Map<string, {
    userId: string | null; environment: "sandbox" | "production"; originalTransactionId: string;
    productId: string; purchasedAt: Date | null; revoked: boolean;
    lastNotificationId?: string; lastNotificationSignedAt?: Date;
  }>();
  private entitlements = new Map<string, {
    plan: EntitlementPlan;
    source: EntitlementSource;
    freeScansUsed: number;
    purchasedAt: Date | null;
    appleProductId: string | null;
    appleOriginalTransactionId: string | null;
    appleEnvironment: "sandbox" | "production" | null;
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

  async recordApplePurchase(input: ApplePurchaseRecord, freeScanLimit: number): Promise<EntitlementSummary> {
    const environment = input.environment ?? "sandbox";
    const key = `${environment}:${input.originalTransactionId}`;
    const claim = this.applePurchases.get(key);
    if (claim?.userId && claim.userId !== input.userId) throw new AppError(409, "Esta compra Apple já está vinculada a outra conta.", "APPLE_PURCHASE_ALREADY_CLAIMED");
    if (claim?.revoked) throw new AppError(402, "Compra Apple revogada ou reembolsada.", "APPLE_PURCHASE_REVOKED");
    this.applePurchases.set(key, { ...claim, ...input, environment, revoked: false });
    const entitlement = this.ensure(input.userId);
    // Review/test transactions must never replace a real paid entitlement.
    if (environment === "sandbox" && entitlement.plan === "paid" && (entitlement.source !== "apple" || entitlement.appleEnvironment === "production")) return this.summary(input.userId, freeScanLimit);
    entitlement.plan = "paid";
    entitlement.source = "apple";
    entitlement.appleProductId = input.productId;
    entitlement.appleOriginalTransactionId = input.originalTransactionId;
    entitlement.appleEnvironment = environment;
    entitlement.googlePurchaseToken = null;
    entitlement.googleProductId = null;
    entitlement.purchasedAt = input.purchasedAt;
    entitlement.grantedAt = null;
    entitlement.grantedById = null;
    entitlement.grantReason = null;
    return this.summary(input.userId, freeScanLimit);
  }

  async applyApplePurchaseNotification(input: ApplePurchaseNotification, freeScanLimit: number): Promise<{ entitlement: EntitlementSummary; userId: string } | null> {
    const key = `${input.environment}:${input.originalTransactionId}`;
    const claim = this.applePurchases.get(key);
    if (claim?.lastNotificationId === input.notificationId || (claim?.lastNotificationSignedAt && claim.lastNotificationSignedAt >= input.signedAt)) return null;
    const updated = { ...claim, userId: claim?.userId ?? null, environment: input.environment, originalTransactionId: input.originalTransactionId,
      productId: input.productId, purchasedAt: claim?.purchasedAt ?? null, revoked: input.revoked,
      lastNotificationId: input.notificationId, lastNotificationSignedAt: input.signedAt };
    this.applePurchases.set(key, updated);
    if (!updated.userId) return null;
    const entitlement = this.ensure(updated.userId);
    if (entitlement.source !== "apple" && entitlement.source !== "free") return null;
    if (input.revoked && (entitlement.appleEnvironment !== input.environment || entitlement.appleOriginalTransactionId !== input.originalTransactionId)) return null;
    if (!input.revoked && entitlement.appleEnvironment === "production" && input.environment === "sandbox") return null;
    const active = [...this.applePurchases.values()].filter(p => p.userId === updated.userId && !p.revoked)
      .filter(p => input.environment === "sandbox" || p.environment === "production")
      .sort((a, b) => Number(b.environment === "production") - Number(a.environment === "production"))[0];
    if (active) {
      entitlement.plan = "paid"; entitlement.source = "apple";
      entitlement.appleEnvironment = active.environment; entitlement.appleOriginalTransactionId = active.originalTransactionId;
      entitlement.appleProductId = active.productId; entitlement.purchasedAt = active.purchasedAt;
    } else {
      entitlement.plan = "free"; entitlement.source = "free"; entitlement.appleEnvironment = null;
      entitlement.appleOriginalTransactionId = null; entitlement.appleProductId = null; entitlement.purchasedAt = null;
    }
    return { entitlement: this.summary(updated.userId, freeScanLimit), userId: updated.userId };
  }

  async recordGooglePurchase(input: { userId: string; productId: string; purchaseToken: string; purchasedAt: Date }, freeScanLimit: number): Promise<EntitlementSummary> {
    const entitlement = this.ensure(input.userId);
    entitlement.plan = "paid";
    entitlement.source = "google_play";
    entitlement.googleProductId = input.productId;
    entitlement.googlePurchaseToken = input.purchaseToken;
    entitlement.appleProductId = null;
    entitlement.appleOriginalTransactionId = null;
    entitlement.appleEnvironment = null;
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
    entitlement.appleEnvironment = null;
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

  async revokeApplePurchase(originalTransactionId: string, freeScanLimit: number, environment: "sandbox" | "production"): Promise<{ entitlement: EntitlementSummary; userId: string } | null> {
    return this.applyApplePurchaseNotification({ originalTransactionId, productId: "premium_unlock", environment, revoked: true, notificationId: randomUUID(), signedAt: now() }, freeScanLimit);
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
      appleEnvironment: null,
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
