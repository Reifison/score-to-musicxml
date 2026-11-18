import type { ScannedDocument } from "./types";

export function isScannedDocument(value: unknown): value is ScannedDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<ScannedDocument>;
  const isScanId = typeof document.scanId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(document.scanId);
  if (
    typeof document.uri !== "string" || !document.uri.startsWith("file://") ||
    typeof document.name !== "string" || !document.name.toLowerCase().endsWith(".pdf") ||
    document.mimeType !== "application/pdf" ||
    !Number.isInteger(document.pageCount) || (document.pageCount ?? 0) < 1 ||
    !Number.isFinite(document.size) || (document.size ?? 0) < 1 ||
    !isScanId ||
    !Array.isArray(document.pages) || document.pages.length !== document.pageCount
  ) {
    return false;
  }

  return document.pages.every((page) => (
    Boolean(page) &&
    typeof page.uri === "string" && page.uri.startsWith("file://") &&
    Number.isInteger(page.width) && page.width > 0 &&
    Number.isInteger(page.height) && page.height > 0
  ));
}
