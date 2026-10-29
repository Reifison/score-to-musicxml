import type { AuditAction, AuditLog, ConversionAttempt, ConversionAttemptKind, ConversionAttemptStatus, ConversionCoverage, ConversionProgress, ConversionResultStatus, EntitlementSummary, Role, Score, ScoreStatus, ScoreType, Session, User } from "../domain.js";

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
  scoreType?: ScoreType;
  scoreTypeSelected?: boolean;
  uploadStatus: ScoreStatus;
  conversionStatus: ScoreStatus;
};

export type UpdateScoreInput = Partial<Pick<Score, "originalFilename" | "uploadStatus" | "conversionStatus" | "errorMessage" | "warnings" | "confidence" | "musicxmlFilename" | "convertedAt" | "isFavorite" | "resultStatus" | "coverage" | "lastErrorCode" | "scoreType" | "scoreTypeSelected" | "reviewStatus" | "reviewRevision" | "validation" | "reviewedAt" | "reviewedById">>;

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
  createAttempt(scoreId: string, kind: ConversionAttemptKind): Promise<ConversionAttempt>;
  createManualAttempt(scoreId: string, scoreType?: ScoreType): Promise<ConversionAttempt>;
  getAttempt(id: string): Promise<ConversionAttempt | null>;
  listAttempts(scoreId: string): Promise<ConversionAttempt[]>;
  listPendingAttempts(limit: number): Promise<ConversionAttempt[]>;
  claimAttempt(id: string): Promise<string | null>;
  updateConversionProgress(scoreId: string, attemptId: string, claimToken: string, progress: ConversionProgress): Promise<boolean>;
  publishConversionPreview(scoreId: string, attemptId: string, claimToken: string, preview: NonNullable<Score["conversionPreview"]>): Promise<boolean>;
  requeueStaleAttempts(before: Date): Promise<number>;
  finishAttempt(id: string, input: { status: ConversionAttemptStatus; errorCode?: string | null; errorMessage?: string | null; coverage?: ConversionCoverage | null; musicxmlFilename?: string | null }): Promise<ConversionAttempt>;
  publishResult(scoreId: string, attemptId: string, claimToken: string, input: { resultStatus: ConversionResultStatus; coverage: ConversionCoverage; musicxmlFilename: string; warnings: string[]; reviewRevision?: string; validation?: NonNullable<Score["validation"]> }): Promise<Score | null>;
  approveReview(scoreId: string, revision: string, reviewerId: string, validation?: NonNullable<Score["validation"]>): Promise<Score | null>;
  approveAutomatic(scoreId: string, revision: string, validation: NonNullable<Score["validation"]>): Promise<Score | null>;
  publishReviewDecision(scoreId: string, baseRevision: string, input: { musicxmlFilename: string; reviewRevision: string; validation: NonNullable<Score["validation"]>; warnings: string[]; deliveryApproved?: boolean }): Promise<Score | null>;
  failAttempt(scoreId: string, attemptId: string, claimToken: string, errorCode: string, message: string, automaticRetry: boolean): Promise<{ score: Score; retryAttempt: ConversionAttempt | null } | null>;
}

export type ApplePurchaseEnvironment = "sandbox" | "production";
export type ApplePurchaseRecord = {
  userId: string;
  productId: string;
  originalTransactionId: string;
  purchasedAt: Date;
  environment?: ApplePurchaseEnvironment;
  restored?: boolean;
};
export type ApplePurchaseNotification = {
  originalTransactionId: string;
  productId: string;
  environment: ApplePurchaseEnvironment;
  notificationId: string;
  signedAt: Date;
  revoked: boolean;
};

export interface EntitlementRepository {
  getSummary(userId: string, freeScanLimit: number): Promise<EntitlementSummary>;
  createScoreForUpload(input: CreateScoreInput, freeScanLimit: number): Promise<{ score: Score; debitedFreeScan: boolean }>;
  recordApplePurchase(input: ApplePurchaseRecord, freeScanLimit: number): Promise<EntitlementSummary>;
  applyApplePurchaseNotification(input: ApplePurchaseNotification, freeScanLimit: number): Promise<{ entitlement: EntitlementSummary; userId: string } | null>;
  recordGooglePurchase(input: { userId: string; productId: string; purchaseToken: string; purchasedAt: Date }, freeScanLimit: number): Promise<EntitlementSummary>;
  grantAdminAccess(input: { userId: string; grantedById: string; reason?: string | null }, freeScanLimit: number): Promise<EntitlementSummary>;
  revokeAdminAccess(userId: string, freeScanLimit: number): Promise<EntitlementSummary>;
  revokeApplePurchase(originalTransactionId: string, freeScanLimit: number, environment: "sandbox" | "production"): Promise<{ entitlement: EntitlementSummary; userId: string } | null>;
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
