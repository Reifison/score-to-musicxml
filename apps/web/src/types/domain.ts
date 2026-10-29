export type Role = "admin" | "user";
export type ScoreStatus = "uploaded" | "queued" | "processing" | "converted" | "failed";
export type ScoreType = "melody" | "piano" | "guitar_solo" | "guitar_duo";
export type ConversionResultStatus = "complete" | "partial";
export type ReviewStatus = "unverified" | "needs_review" | "approved";
export type RecognitionQualityIssue = {
  code: string;
  message: string;
  page?: number;
  measure?: string;
};
export type RecognitionQuality = {
  status: "needs_review" | "unverified";
  sourceComparison: "compared" | "partial" | "unavailable" | "skipped";
  checkedMeasures: number;
  accuracyVerified: false;
  issues: RecognitionQualityIssue[];
};
export type VisualNoteValue = {
  kind: "note" | "rest";
  step?: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  alter?: number;
  octave?: number;
  duration: number;
  type?: string;
  dots?: number;
};
export type VisualSourceSegment = {
  id: string;
  page: number;
  partIndex: number;
  partId: string;
  measureIndex: number;
  measure: string;
  status: "compared" | "suspected" | "unknown";
  reason?: string;
  sourceAsset?: string;
  cropAsset?: string;
  sourceImageSHA256?: string;
  rectangle?: { left: number; top: number; width: number; height: number };
};
export type VisualCorrectionProposal = {
  id: string;
  status: "pending" | "accepted" | "rejected";
  segmentId: string;
  page: number;
  partId: string;
  partIndex: number;
  measureIndex: number;
  measure: string;
  noteIndex: number;
  before: VisualNoteValue | null;
  after: VisualNoteValue | null;
  applicable: boolean;
  reason: string;
  differences: string[];
};
export type SourceVisualReview = {
  version: 1;
  status: "completed" | "partial" | "unavailable" | "skipped";
  sourceSHA256: string;
  xmlSHA256: string;
  reader: { name: string; sourceFirst: boolean; version?: string; model?: string } | null;
  checkedMeasures: number;
  unknownMeasures: number;
  segments: VisualSourceSegment[];
  proposals: VisualCorrectionProposal[];
  limitations: string[];
  diagnostics?: Array<{ code: string; page?: number; message: string }>;
  accuracyVerified: false;
  trainingEligible: false;
  history: Array<{
    proposalId: string;
    decision: "accept" | "reject" | "undo";
    baseRevision: string;
    revision: string;
    actorId: string;
    at: string;
    exportFilename?: string;
    previousExportFilename?: string;
  }>;
};
export type MusicalValidationIssue = {
  code: string;
  severity: "warning" | "error";
  message: string;
  partId?: string;
  partName?: string;
  measure?: string;
  page?: number;
  staff?: number;
  voice?: string;
  differences?: string[];
  candidateIds?: number[];
};
export type MidiValidationStatus = "passed" | "failed" | "unverified";
export type MidiValidation = {
  status: MidiValidationStatus;
  checkedNotes: number;
  issues: Array<{ code: string; message: string }>;
  limitations: string[];
  xmlSHA256: string;
};
export type ReviewAcceptance = {
  kind: "accepted" | "accepted_with_reservations";
  revision: string;
  acceptedAt: string;
  unresolvedVisualMeasures: number;
  keptVisualProposals: number;
  validationIssueCount: number;
  midiStatus: MidiValidationStatus | "not_checked";
  accuracyVerified: false;
  trainingEligible: false;
};
export type MusicalValidation = {
  version: 1;
  visualReview?: SourceVisualReview;
  midiValidation?: MidiValidation;
  issues: MusicalValidationIssue[];
  checkedMeasures: number;
  skippedMeasures: number;
  requiresReview: boolean;
};
export type AttemptKind = "initial" | "automatic" | "manual";
export type AttemptStatus = "queued" | "processing" | "complete" | "partial" | "failed";

export type PageCoverage = {
  page: number;
  status: "processed" | "missing" | "excluded";
  contentRole?: "musical" | "nonmusical" | "uncertain";
  supportStatus?: "unsupported";
  classification?: { method: string; evidence: string[]; decision?: "musical" | "nonmusical"; reviewer?: string; reason?: string; sourceSHA256?: string; originalImageSHA256?: string };
  parts: Array<{
    id: string;
    name: string;
    staffCount: number;
    staves: number[];
    clefs?: Array<{ staff: number; sign: string }>;
    voices?: string[];
  }>;
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
  kind: AttemptKind;
  status: AttemptStatus;
  errorCode: string | null;
  errorMessage: string | null;
  coverage: ConversionCoverage | null;
  musicxmlFilename: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type ScoreVersion = {
  id: string;
  label: string;
  createdAt: string;
  kind: "conversion" | "correction";
  revision: string | null;
  isCurrent: boolean;
  status: "complete" | "partial" | "needs_review" | "approved" | "unverified";
  coverage: { totalPages: number; processedPages: number; missingPages: number[] } | null;
  available: boolean;
  attemptId?: string;
};

export type ConversionProgress = {
  attemptId: string;
  stage: "preparing" | "recognizing" | "validating" | "complete" | "interrupted";
  totalPages: number | null;
  currentPage: number | null;
  completedPages: number[];
  failedPages: number[];
  excludedPages: number[];
  reusedPages: number[];
  updatedAt: string;
};

export type ConversionPreview = {
  attemptId: string;
  revision: string;
  page: 1;
  totalPages: number;
  createdAt: string;
  warnings: string[];
  xmlSHA256?: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
  scoreType?: ScoreType;
  scoreTypeSelected?: boolean;
  resultStatus?: ConversionResultStatus | null;
  coverage?: ConversionCoverage | null;
  conversionProgress?: ConversionProgress | null;
  conversionPreview?: ConversionPreview | null;
  lastErrorCode?: string | null;
  attempts?: ConversionAttempt[];
  canPlay?: boolean;
  canExportMidi?: boolean;
  canDownloadMusicXml?: boolean;
  reviewStatus?: ReviewStatus;
  reviewRevision?: string | null;
  reviewAcceptance?: ReviewAcceptance | null;
  validation?: MusicalValidation | null;
  recognitionQuality?: RecognitionQuality | null;
  reviewedAt?: string | null;
  errorMessage: string | null;
  warnings: string[] | null;
  confidence: number | null;
  musicxmlFilename: string | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  convertedAt: string | null;
};

export type AuditLog = {
  id: string;
  actorId: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
};
