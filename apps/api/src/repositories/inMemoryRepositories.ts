import { nanoid } from "nanoid";
import type { AuditLog, EntitlementPlan, EntitlementSource, EntitlementSummary, Score, Session, User } from "../domain.js";
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

  async create(input: CreateScoreInput): Promise<Score> {
    const createdAt = now();
    const score: Score = {
      id: nanoid(),
      errorMessage: null,
      warnings: null,
      confidence: null,
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
