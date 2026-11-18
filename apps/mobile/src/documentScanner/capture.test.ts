import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  CameraType: { back: "back" },
  UIImagePickerPresentationStyle: { FULL_SCREEN: "fullScreen" }
}));
vi.mock("expo-modules-core", () => ({ requireOptionalNativeModule: () => null }));
import { captureFailureCopy, captureScoreDocument } from "./capture";

const scannedDocument = {
  uri: "file:///cache/partitura.pdf",
  name: "partitura.pdf",
  mimeType: "application/pdf" as const,
  pageCount: 1,
  size: 350_000,
  scanId: "5d0d086e-8fce-4299-b9bb-408a0b4c0c76",
  pages: [{ uri: "file:///cache/page-1.jpg", width: 1200, height: 1600 }]
};

describe("platform document capture", () => {
  it("uses the native scanner on iOS and never calls the photo camera", async () => {
    const nativeScanner = {
      isAvailableAsync: vi.fn(async () => true),
      scanAsync: vi.fn(async () => scannedDocument),
      releaseAsync: vi.fn(async () => undefined)
    };
    const launchAndroidCamera = vi.fn(async () => ({ canceled: true }));

    const result = await captureScoreDocument({
      platform: "ios",
      nativeScanner,
      requestCameraPermission: async () => ({ granted: true, canAskAgain: true }),
      launchAndroidCamera
    });

    expect(result.kind).toBe("success");
    expect(nativeScanner.scanAsync).toHaveBeenCalledOnce();
    expect(launchAndroidCamera).not.toHaveBeenCalled();
  });

  it("explains the 20-page and 10 MiB limits without suggesting that scan pages were dropped", () => {
    const pageLimit = captureFailureCopy({ kind: "too-many-pages" });
    const fileLimit = captureFailureCopy({ kind: "too-large" });

    expect(pageLimit.message).toMatch(/até 20 páginas/i);
    expect(pageLimit.message).toMatch(/nenhuma página foi removida/i);
    expect(fileLimit.message).toMatch(/10 MiB/i);
    expect(fileLimit.message).toMatch(/não reduziu a qualidade/i);
  });

  it("keeps the existing single-photo camera capture on Android", async () => {
    const launchAndroidCamera = vi.fn(async () => ({
      canceled: false,
      assets: [{ uri: "file:///cache/photo.jpg", type: "image" as const, width: 1500, height: 2000 }]
    }));
    const nativeScanner = {
      isAvailableAsync: vi.fn(async () => true),
      scanAsync: vi.fn(async () => scannedDocument),
      releaseAsync: vi.fn(async () => undefined)
    };

    const result = await captureScoreDocument({
      platform: "android",
      nativeScanner,
      requestCameraPermission: async () => ({ granted: true, canAskAgain: true }),
      launchAndroidCamera
    });

    expect(result).toMatchObject({ kind: "success", document: { type: "image/jpeg", pageCount: 1 } });
    expect(launchAndroidCamera).toHaveBeenCalledOnce();
    expect(nativeScanner.scanAsync).not.toHaveBeenCalled();
  });
});
