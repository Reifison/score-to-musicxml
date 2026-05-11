export type Role = "admin" | "user";
export type ScoreStatus = "uploaded" | "queued" | "processing" | "converted" | "failed";
export type EntitlementPlan = "free" | "paid";
export type EntitlementSource = "free" | "apple" | "legacy_grant" | "admin_grant";

export type User = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicUser = Omit<User, "passwordHash">;

export type Session = {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
};

export type Score = {
  id: string;
  userId: string;
  originalFilename: string;
  storedFilename: string;
  fileType: string;
  mimeType: string;
  fileSize: number;
  uploadStatus: ScoreStatus;
  conversionStatus: ScoreStatus;
  errorMessage: string | null;
  warnings: string[] | null;
  confidence: number | null;
  musicxmlFilename: string | null;
  createdAt: Date;
  updatedAt: Date;
  convertedAt: Date | null;
};

export type AuditAction =
  | "login_success"
  | "login_failed"
  | "logout"
  | "user_created"
  | "user_updated"
  | "user_deactivated"
  | "user_deleted"
  | "password_changed"
  | "role_changed"
  | "score_uploaded"
  | "conversion_queued"
  | "conversion_started"
  | "conversion_completed"
  | "conversion_failed"
  | "score_downloaded"
  | "score_deleted"
  | "purchase_started"
  | "purchase_completed"
  | "purchase_failed"
  | "purchase_restored"
  | "purchase_revoked"
  | "entitlement_changed"
  | "free_scan_used";

export type EntitlementSummary = {
  plan: EntitlementPlan;
  source: EntitlementSource;
  freeScanLimit: number;
  freeScansUsed: number;
  freeScansRemaining: number | null;
  purchasedAt: Date | null;
  appleProductId: string | null;
  grantedAt: Date | null;
  grantedById: string | null;
  grantReason: string | null;
};

export type AuditLog = {
  id: string;
  actorId: string | null;
  action: AuditAction;
  entity: string | null;
  entityId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}
