export type VisualNoteValue = {
  kind: "note" | "rest";
  step?: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  alter?: number;
  octave?: number;
  /** Duration in quarter-note units, without changing the document divisions. */
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
  /** Bounds on the exact source raster, normalized to [0,1]. */
  rectangle?: { left: number; top: number; width: number; height: number };
};

/** Source observations on a page whose measures cannot be aligned with XML. */
export type VisualUnmappedSourceMeasure = {
  id: string;
  page: number;
  partIndex: number;
  /** Index in this page's independent reading, never an editable XML index. */
  sourceMeasureIndex: number;
  association: "ambiguous";
  sourceAsset: string;
  sourceImageSHA256: string;
  rectangle?: { left: number; top: number; width: number; height: number };
  contextOnly: boolean;
  readable: boolean;
  keyFifths?: number;
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
  sourceMeasures?: VisualUnmappedSourceMeasure[];
  proposals: VisualCorrectionProposal[];
  limitations: string[];
  diagnostics?: Array<{ code: string; page?: number; measure?: string; partId?: string; message: string }>;
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

/** Stage-generated files only; never accept paths from the HTTP client/reader. */
export type VisualEvidenceAsset = { name: string; path: string; sha256: string };
