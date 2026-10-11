import type { SourceVisualReview } from "./services/SourceVisualReviewTypes.js";
import type { MidiValidation } from "./services/MidiExportService.js";

export type Role = "admin" | "user";
export type ScoreStatus = "uploaded" | "queued" | "processing" | "converted" | "failed";
export type ScoreType = "melody" | "piano" | "guitar_solo" | "guitar_duo";
export type ConversionResultStatus = "complete" | "partial";
export type ReviewStatus = "unverified" | "needs_review" | "approved";
export type MusicalValidation = {
  version: 1;
  visualReview?: SourceVisualReview;
  midiValidation?: MidiValidation;
  referenceReuse?: {
    scope: "notes_rhythm";
    sourceSHA256: string;
    referenceScoreId: string;
    referenceRevision: string;
    referenceXmlSHA256: string;
    kind: "assisted_visual_revision";
    accuracyVerified: false;
    trainingEligible: false;
  };
  reviewAcceptance?: {
    kind: "accepted" | "accepted_with_reservations";
    method?: "automatic_delivery_v1";
    revision: string;
    acceptedAt: string;
    unresolvedVisualMeasures: number;
    keptVisualProposals: number;
    validationIssueCount: number;
    midiStatus: "passed" | "failed" | "unverified" | "not_checked";
    accuracyVerified: false;
    trainingEligible: false;
  };
  issues: Array<{ code: string; severity: "warning" | "error"; message: string; partId?: string; partName?: string; measure?: string; page?: number; staff?: number; voice?: string; differences?: string[]; candidateIds?: number[] }>;
  checkedMeasures: number;
  skippedMeasures: number;
  requiresReview: boolean;
  limitations?: string[];
  voiceCheckedMeasures?: number;
  voiceSkippedMeasures?: number;
  voiceChecks?: Array<{ partId: string; measure: string; staff: number; voice: string; start: number; end: number; durationsTotal: number; implicitGaps: Array<{ start: number; end: number }> }>;
};
export type ConversionAttemptKind = "initial" | "automatic" | "manual";
export type ConversionAttemptStatus = "queued" | "processing" | "complete" | "partial" | "failed";
export type PageContentRole = "musical" | "nonmusical" | "uncertain";
export type PageClassification = {
  method: "staff_evidence_v1" | "verified_manual_v1" | "unavailable";
  evidence: string[];
  decision?: "musical" | "nonmusical";
  reviewer?: string;
  reason?: string;
  sourceSHA256?: string;
  originalImageSHA256?: string;
  sourceLayout?: {
    method: "horizontal_staff_bands_v1";
    status: "observed" | "unknown";
    width: number;
    height: number;
    staffBands: Array<{ top: number; bottom: number }>;
    sourceImageSHA256?: string;
    evidence?: string[];
    limitations?: string[];
  };
};
export type PageCoverage = {
  page: number;
  status: "processed" | "missing" | "excluded";
  contentRole?: PageContentRole;
  supportStatus?: "unsupported";
  classification?: PageClassification;
  parts: Array<{ id: string; name: string; staffCount: number; staves: number[]; clefs?: Array<{ staff: number; sign: string }>; voices?: string[] }>;
  errorCode?: string;
};
export type ConversionCoverage = {
  totalPages: number;
  processedPages: number[];
  missingPages: number[];
  excludedPages?: number[];
  uncertainPages?: number[];
  unsupportedPages?: number[];
  pages: PageCoverage[];
};
export type ConversionAttempt = {
  id: string;
  scoreId: string;
  kind: ConversionAttemptKind;
  status: ConversionAttemptStatus;
  errorCode: string | null;
  errorMessage: string | null;
  coverage: ConversionCoverage | null;
  musicxmlFilename: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};
export type EntitlementPlan = "free" | "paid";
export type EntitlementSource = "free" | "apple" | "google_play" | "legacy_grant" | "admin_grant";

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
  preprocessingProfile: string | null;
  scoreType?: ScoreType;
  scoreTypeSelected?: boolean;
  resultStatus?: ConversionResultStatus | null;
  coverage?: ConversionCoverage | null;
  lastErrorCode?: string | null;
  attempts?: ConversionAttempt[];
  canPlay?: boolean;
  canExportMidi?: boolean;
  canDownloadMusicXml?: boolean;
  reviewStatus?: ReviewStatus;
  reviewRevision?: string | null;
  validation?: MusicalValidation | null;
  reviewedAt?: Date | null;
  reviewedById?: string | null;
  uploadStatus: ScoreStatus;
  conversionStatus: ScoreStatus;
  errorMessage: string | null;
  warnings: string[] | null;
  confidence: number | null;
  musicxmlFilename: string | null;
  isFavorite: boolean;
  deletedAt: Date | null;
  purgeAt: Date | null;
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
  | "score_restored"
  | "score_renamed"
  | "score_reviewed"
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
  googleProductId: string | null;
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
