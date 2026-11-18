import { describe, expect, it, vi } from "vitest";
import { scanDocumentWithNativeScanner } from "./scan";
import type { NativeDocumentScanner } from "./native";

const pages = [
  { uri: "file:///cache/page-1.jpg", width: 1200, height: 1600 },
  { uri: "file:///cache/page-2.jpg", width: 1200, height: 1600 }
];
const completeDocument = {
  uri: "file:///cache/partitura.pdf",
  name: "partitura.pdf",
  mimeType: "application/pdf",
  pageCount: 2,
  size: 842_190,
  scanId: "5d0d086e-8fce-4299-b9bb-408a0b4c0c76",
  pages
};

function scanner(scanAsync: () => Promise<unknown> = async () => completeDocument): NativeDocumentScanner {
  return {
    isAvailableAsync: vi.fn(async () => true),
    scanAsync: vi.fn(scanAsync),
    releaseAsync: vi.fn(async () => undefined)
  };
}

describe("native document scanner boundary", () => {
  it("reports a missing local native module without falling back to the photo camera", async () => {
    const requestPermission = vi.fn(async () => ({ granted: true, canAskAgain: true }));
    const result = await scanDocumentWithNativeScanner({ nativeScanner: null, requestPermission });

    expect(result).toEqual({ kind: "native-module-unavailable" });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("reports unsupported devices before requesting camera permission", async () => {
    const nativeScanner = scanner();
    vi.mocked(nativeScanner.isAvailableAsync).mockResolvedValue(false);
    const requestPermission = vi.fn(async () => ({ granted: true, canAskAgain: true }));

    const result = await scanDocumentWithNativeScanner({ nativeScanner, requestPermission });

    expect(result).toEqual({ kind: "unsupported" });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(nativeScanner.scanAsync).not.toHaveBeenCalled();
  });

  it.each([true, false])( "returns a denied camera permission and canAskAgain=%s without opening VisionKit", async (canAskAgain) => {
    const nativeScanner = scanner();
    const result = await scanDocumentWithNativeScanner({
      nativeScanner,
      requestPermission: async () => ({ granted: false, canAskAgain })
    });

    expect(result).toEqual({ kind: "permission-denied", canAskAgain });
    expect(nativeScanner.scanAsync).not.toHaveBeenCalled();
  });

  it("treats user cancellation as a normal outcome", async () => {
    const nativeScanner = scanner(async () => ({ cancelled: true }));
    const result = await scanDocumentWithNativeScanner({
      nativeScanner,
      requestPermission: async () => ({ granted: true, canAskAgain: true })
    });

    expect(result).toEqual({ kind: "cancelled" });
  });

  it("passes the full native PDF and every preview page through for confirmation", async () => {
    const nativeScanner = scanner();
    const result = await scanDocumentWithNativeScanner({
      nativeScanner,
      requestPermission: async () => ({ granted: true, canAskAgain: true })
    });

    expect(result).toEqual({
      kind: "success",
      document: {
        uri: completeDocument.uri,
        name: completeDocument.name,
        type: "application/pdf",
        pageCount: 2,
        pages,
        scanId: completeDocument.scanId
      }
    });
  });

  it.each([
    { ...completeDocument, pages: [pages[0]] },
    { ...completeDocument, pageCount: 0 },
    { ...completeDocument, uri: " " },
    { ...completeDocument, scanId: "../page" },
    { ...completeDocument, mimeType: "image/jpeg" },
    { ...completeDocument, pages: [{ ...pages[0], width: 0 }, pages[1]] }
  ])("rejects an incomplete or invalid native document result", async (nativeResult) => {
    const result = await scanDocumentWithNativeScanner({
      nativeScanner: scanner(async () => nativeResult),
      requestPermission: async () => ({ granted: true, canAskAgain: true })
    });

    expect(result).toEqual({ kind: "invalid-result" });
  });

  it("maps native camera permission and unsupported errors to recoverable results", async () => {
    const permissionError = Object.assign(new Error("Denied"), { code: "ERR_DOCUMENT_SCANNER_PERMISSION_DENIED" });
    const permissionResult = await scanDocumentWithNativeScanner({
      nativeScanner: scanner(async () => { throw permissionError; }),
      requestPermission: async () => ({ granted: true, canAskAgain: true })
    });
    const unsupportedResult = await scanDocumentWithNativeScanner({
      nativeScanner: scanner(async () => { throw Object.assign(new Error("Unsupported"), { code: "ERR_DOCUMENT_SCANNER_UNSUPPORTED" }); }),
      requestPermission: async () => ({ granted: true, canAskAgain: true })
    });

    expect(permissionResult).toEqual({ kind: "permission-denied", canAskAgain: false });
    expect(unsupportedResult).toEqual({ kind: "unsupported" });
  });

  it.each([
    ["ERR_DOCUMENT_SCANNER_PAGE_LIMIT", "too-many-pages"],
    ["ERR_DOCUMENT_SCANNER_FILE_TOO_LARGE", "too-large"]
  ] as const)("maps upload limits from native code %s", async (code, kind) => {
    const result = await scanDocumentWithNativeScanner({
      nativeScanner: scanner(async () => { throw Object.assign(new Error(code), { code }); }),
      requestPermission: async () => ({ granted: true, canAskAgain: true })
    });

    expect(result).toEqual({ kind });
  });

  it("returns other native errors without hiding them", async () => {
    const nativeError = new Error("PDF write failed");
    const result = await scanDocumentWithNativeScanner({
      nativeScanner: scanner(async () => { throw nativeError; }),
      requestPermission: async () => ({ granted: true, canAskAgain: true })
    });

    expect(result).toEqual({ kind: "error", error: nativeError });
  });
});
