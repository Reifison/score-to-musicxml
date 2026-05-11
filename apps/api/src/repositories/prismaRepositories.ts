import { Prisma, type ScoreStatus as PrismaScoreStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type { AuditLog, EntitlementSummary, Score, Session, User } from "../domain.js";
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

function mapScore(score: Awaited<ReturnType<typeof prisma.score.findFirst>>): Score | null {
  if (!score) return null;
  return {
    ...score,
    warnings: Array.isArray(score.warnings) ? score.warnings.map(String) : null
  };
}

function mapAudit(log: Awaited<ReturnType<typeof prisma.auditLog.findFirst>>): AuditLog | null {
  if (!log) return null;
  const metadata = log.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata) ? log.metadata as Record<string, unknown> : null;
  return { ...log, metadata };
}

function entitlementSummary(input: {
  plan: "free" | "paid";
  source: "free" | "apple" | "legacy_grant" | "admin_grant";
  freeScansUsed: number;
  purchasedAt: Date | null;
  appleProductId: string | null;
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
    const score = await prisma.score.create({ data: input });
    return mapScore(score)!;
  }

  async findById(id: string): Promise<Score | null> {
    const score = await prisma.score.findUnique({ where: { id } });
    return mapScore(score);
  }

  async list(filters: ScoreFilters = {}): Promise<Score[]> {
    const where: Prisma.ScoreWhereInput = {};
    if (filters.userId) where.userId = filters.userId;
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

  async listOlderThan(date: Date): Promise<Score[]> {
    const scores = await prisma.score.findMany({ where: { createdAt: { lt: date } }, orderBy: { createdAt: "asc" } });
    return scores.map((score) => mapScore(score)!);
  }

  async update(id: string, input: UpdateScoreInput): Promise<Score> {
    const score = await prisma.score.update({
      where: { id },
      data: {
        ...input,
        warnings: input.warnings === undefined ? undefined : (input.warnings as Prisma.InputJsonArray | null) ?? Prisma.JsonNull
      }
    });
    return mapScore(score)!;
  }

  async delete(id: string): Promise<void> {
    await prisma.score.delete({ where: { id } });
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

      const score = await tx.score.create({ data: input });
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

  async recordApplePurchase(input: {
    userId: string;
    productId: string;
    originalTransactionId: string;
    purchasedAt: Date;
    restored?: boolean;
  }, freeScanLimit: number): Promise<EntitlementSummary> {
    const entitlement = await prisma.entitlement.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        plan: "paid",
        source: "apple",
        appleOriginalTransactionId: input.originalTransactionId,
        appleProductId: input.productId,
        purchasedAt: input.purchasedAt
      },
      update: {
        plan: "paid",
        source: "apple",
        appleOriginalTransactionId: input.originalTransactionId,
        appleProductId: input.productId,
        purchasedAt: input.purchasedAt,
        grantedAt: null,
        grantedById: null,
        grantReason: null
      }
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
        appleProductId: null,
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

  async revokeApplePurchase(originalTransactionId: string, freeScanLimit: number): Promise<{ entitlement: EntitlementSummary; userId: string } | null> {
    const existing = await prisma.entitlement.findFirst({
      where: {
        appleOriginalTransactionId: originalTransactionId,
        appleProductId: { not: null },
        source: "apple"
      }
    });
    if (!existing) return null;

    const entitlement = await prisma.entitlement.update({
      where: { userId: existing.userId },
      data: {
        plan: "free",
        source: "free",
        appleOriginalTransactionId: null,
        appleProductId: null,
        purchasedAt: null
      }
    });
    return { entitlement: entitlementSummary(entitlement, freeScanLimit), userId: entitlement.userId };
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
