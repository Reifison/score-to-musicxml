import { nanoid } from "nanoid";
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
      convertedAt: null,
      createdAt,
      updatedAt: createdAt,
      ...input
    };
    this.scores.set(score.id, score);
    return score;
  }

  async findById(id: string): Promise<Score | null> {
    return this.scores.get(id) ?? null;
  }

  async list(filters: ScoreFilters = {}): Promise<Score[]> {
    return [...this.scores.values()]
      .filter((score) => !filters.userId || score.userId === filters.userId)
      .filter((score) => !filters.status || score.conversionStatus === filters.status)
      .filter((score) => !filters.from || score.createdAt >= filters.from)
      .filter((score) => !filters.to || score.createdAt <= filters.to)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async update(id: string, input: UpdateScoreInput): Promise<Score> {
    const existing = this.scores.get(id);
    if (!existing) throw new Error("Score not found");
    const updated = { ...existing, ...input, updatedAt: now() };
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
}

export function createInMemoryRepositories(): Repositories {
  return {
    users: new InMemoryUserRepository(),
    sessions: new InMemorySessionRepository(),
    scores: new InMemoryScoreRepository(),
    audits: new InMemoryAuditRepository()
  };
}
