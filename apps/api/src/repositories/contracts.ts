import type { AuditAction, AuditLog, EntitlementSummary, Role, Score, ScoreStatus, Session, User } from "../domain.js";

export type CreateUserInput = {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive?: boolean;
};

export type UpdateUserInput = Partial<Pick<User, "name" | "email" | "passwordHash" | "role" | "isActive">>;

export type CreateScoreInput = {
  userId: string;
  originalFilename: string;
  storedFilename: string;
  fileType: string;
  mimeType: string;
  fileSize: number;
  preprocessingProfile?: string | null;
  uploadStatus: ScoreStatus;
  conversionStatus: ScoreStatus;
};

export type UpdateScoreInput = Partial<Pick<Score, "originalFilename" | "uploadStatus" | "conversionStatus" | "errorMessage" | "warnings" | "confidence" | "musicxmlFilename" | "convertedAt" | "isFavorite">>;

export type ScoreFilters = {
  userId?: string;
  status?: ScoreStatus;
  favorite?: boolean;
  from?: Date;
  to?: Date;
};

export interface UserRepository {
  create(input: CreateUserInput): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  list(): Promise<User[]>;
  update(id: string, input: UpdateUserInput): Promise<User>;
  delete(id: string): Promise<void>;
}

export interface SessionRepository {
  create(input: { tokenHash: string; userId: string; expiresAt: Date }): Promise<Session>;
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  deleteExpired(now: Date): Promise<void>;
}

export interface ScoreRepository {
  create(input: CreateScoreInput): Promise<Score>;
  findById(id: string): Promise<Score | null>;
  findByIdIncludingDeleted(id: string): Promise<Score | null>;
  list(filters?: ScoreFilters): Promise<Score[]>;
  listTrash(filters?: ScoreFilters): Promise<Score[]>;
  listOlderThan(date: Date): Promise<Score[]>;
  listExpiredTrash(now: Date): Promise<Score[]>;
  update(id: string, input: UpdateScoreInput): Promise<Score>;
  softDelete(id: string, input: { deletedAt: Date; purgeAt: Date }): Promise<Score>;
  restore(id: string): Promise<Score>;
  delete(id: string): Promise<void>;
}

export interface EntitlementRepository {
  getSummary(userId: string, freeScanLimit: number): Promise<EntitlementSummary>;
  createScoreForUpload(input: CreateScoreInput, freeScanLimit: number): Promise<{ score: Score; debitedFreeScan: boolean }>;
  recordApplePurchase(input: {
    userId: string;
    productId: string;
    originalTransactionId: string;
    purchasedAt: Date;
    restored?: boolean;
  }, freeScanLimit: number): Promise<EntitlementSummary>;
  recordGooglePurchase(input: { userId: string; productId: string; purchaseToken: string; purchasedAt: Date }, freeScanLimit: number): Promise<EntitlementSummary>;
  grantAdminAccess(input: { userId: string; grantedById: string; reason?: string | null }, freeScanLimit: number): Promise<EntitlementSummary>;
  revokeAdminAccess(userId: string, freeScanLimit: number): Promise<EntitlementSummary>;
  revokeApplePurchase(originalTransactionId: string, freeScanLimit: number): Promise<{ entitlement: EntitlementSummary; userId: string } | null>;
  revokeGooglePurchase(purchaseToken: string, freeScanLimit: number): Promise<{ entitlement: EntitlementSummary; userId: string } | null>;
  findUserByGooglePurchaseToken(purchaseToken: string): Promise<string | null>;
  claimGoogleNotification(input: { messageId: string; eventType: string; purchaseToken?: string | null }): Promise<boolean>;
}

export interface AuditRepository {
  create(input: {
    actorId?: string | null;
    action: AuditAction;
    entity?: string | null;
    entityId?: string | null;
    ipAddress?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<AuditLog>;
  list(): Promise<AuditLog[]>;
  deleteOlderThan(date: Date): Promise<number>;
}

export type Repositories = {
  users: UserRepository;
  sessions: SessionRepository;
  scores: ScoreRepository;
  entitlements: EntitlementRepository;
  audits: AuditRepository;
};
