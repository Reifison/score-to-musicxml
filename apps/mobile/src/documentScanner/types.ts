export type DocumentPreviewPage = {
  uri: string;
  width: number;
  height: number;
};

export type ScannedDocument = {
  uri: string;
  name: string;
  mimeType: "application/pdf";
  pageCount: number;
  size: number;
  scanId: string;
  pages: DocumentPreviewPage[];
};

export type ReviewableCapture = {
  uri: string;
  name: string;
  type: string;
  pageCount: number;
  pages: DocumentPreviewPage[];
  scanId?: string;
};

export type CaptureDocumentResult =
  | { kind: "success"; document: ReviewableCapture }
  | { kind: "cancelled" }
  | { kind: "permission-denied"; canAskAgain: boolean }
  | { kind: "unsupported" }
  | { kind: "native-module-unavailable" }
  | { kind: "invalid-result" }
  | { kind: "too-many-pages" }
  | { kind: "too-large" }
  | { kind: "error"; error: unknown };

