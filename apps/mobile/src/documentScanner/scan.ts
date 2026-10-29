import type { NativeDocumentScanner } from "./native";
import { isScannedDocument } from "./validation";
import type { CaptureDocumentResult } from "./types";

export type CameraPermission = { granted: boolean; canAskAgain: boolean };

export type ScanDocumentDependencies = {
  nativeScanner: NativeDocumentScanner | null;
  requestPermission: () => Promise<CameraPermission>;
};

function nativeErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export async function scanDocumentWithNativeScanner(
  dependencies: ScanDocumentDependencies
): Promise<CaptureDocumentResult> {
  const { nativeScanner } = dependencies;
  if (!nativeScanner) return { kind: "native-module-unavailable" };

  try {
    if (!(await nativeScanner.isAvailableAsync())) return { kind: "unsupported" };

    const permission = await dependencies.requestPermission();
    if (!permission.granted) {
      return { kind: "permission-denied", canAskAgain: permission.canAskAgain };
    }

    const result = await nativeScanner.scanAsync();
    if (isCancelledNativeResult(result)) return { kind: "cancelled" };
    if (!isScannedDocument(result)) return { kind: "invalid-result" };

    return {
      kind: "success",
      document: {
        uri: result.uri,
        name: result.name,
        type: result.mimeType,
        pageCount: result.pageCount,
        pages: result.pages,
        scanId: result.scanId
      }
    };
  } catch (error) {
    const code = nativeErrorCode(error);
    if (code === "ERR_DOCUMENT_SCANNER_CANCELLED") return { kind: "cancelled" };
    if (code === "ERR_DOCUMENT_SCANNER_UNSUPPORTED" || code === "ERR_DOCUMENT_SCANNER_UNAVAILABLE") {
      return { kind: "unsupported" };
    }
    if (code === "ERR_DOCUMENT_SCANNER_INVALID_RESULT") return { kind: "invalid-result" };
    if (code === "ERR_DOCUMENT_SCANNER_PAGE_LIMIT") return { kind: "too-many-pages" };
    if (code === "ERR_DOCUMENT_SCANNER_FILE_TOO_LARGE") return { kind: "too-large" };
    if (code === "ERR_DOCUMENT_SCANNER_PERMISSION_DENIED") {
      const canAskAgain = Boolean((error as { canAskAgain?: unknown })?.canAskAgain);
      return { kind: "permission-denied", canAskAgain };
    }
    return { kind: "error", error };
  }
}

function isCancelledNativeResult(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const result = value as { cancelled?: unknown; canceled?: unknown };
  return result.cancelled === true || result.canceled === true;
}

