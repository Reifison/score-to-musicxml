import { Prisma, type ScoreStatus as PrismaScoreStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type { AuditLog, Score, Session, User } from "../domain.js";
import type {
  AuditRepository,
  CreateScoreInput,
  CreateUserInput,
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
}

export function createPrismaRepositories(): Repositories {
  return {
    users: new PrismaUserRepository(),
    sessions: new PrismaSessionRepository(),
    scores: new PrismaScoreRepository(),
    audits: new PrismaAuditRepository()
  };
}
