import { describe, expect, it, vi } from "vitest";
import { captureImageFromCamera, createExclusiveOperation } from "./capture";

const imageAsset = { uri: "file:///score.jpg", type: "image" as const, width: 1200, height: 1600 };

describe("camera image capture boundary", () => {
  it.each([true, false])("reports a denied permission and canAskAgain=%s without launching the camera", async (canAskAgain) => {
    const launchCamera = vi.fn();
    const result = await captureImageFromCamera({
      requestPermission: async () => ({ granted: false, canAskAgain }),
      launchCamera
    });

    expect(result).toEqual({ kind: "permission-denied", canAskAgain });
    expect(launchCamera).not.toHaveBeenCalled();
  });

  it("treats a camera cancellation as a normal outcome", async () => {
    const result = await captureImageFromCamera({
      requestPermission: async () => ({ granted: true, canAskAgain: true }),
      launchCamera: async () => ({ canceled: true, assets: null })
    });

    expect(result).toEqual({ kind: "cancelled" });
  });

  it.each([
    { canceled: false, assets: null },
    { canceled: false, assets: [] },
    { canceled: false, assets: [{ ...imageAsset, uri: " " }] },
    { canceled: false, assets: [{ ...imageAsset, type: "video" as const }] }
  ])("rejects a capture without a usable image", async (cameraResult) => {
    const result = await captureImageFromCamera({
      requestPermission: async () => ({ granted: true, canAskAgain: true }),
      launchCamera: async () => cameraResult
    });

    expect(result).toEqual({ kind: "invalid-asset" });
  });

  it("returns the captured image when the native picker succeeds", async () => {
    const result = await captureImageFromCamera({
      requestPermission: async () => ({ granted: true, canAskAgain: true }),
      launchCamera: async () => ({ canceled: false, assets: [imageAsset] })
    });

    expect(result).toEqual({ kind: "success", asset: imageAsset });
  });

  it("converts permission or native picker failures into a recoverable error result", async () => {
    const nativeError = new Error("Native picker failed");
    const result = await captureImageFromCamera({
      requestPermission: async () => ({ granted: true, canAskAgain: true }),
      launchCamera: async () => { throw nativeError; }
    });

    expect(result).toEqual({ kind: "error", error: nativeError });
  });
});

describe("exclusive camera operation", () => {
  it("blocks duplicate starts and releases busy state after an error", async () => {
    let rejectFirst!: (error: Error) => void;
    const pending = new Promise<never>((_resolve, reject) => { rejectFirst = reject; });
    const busyChanges: boolean[] = [];
    const operation = createExclusiveOperation((busy) => busyChanges.push(busy));
    const first = operation.run(() => pending);
    const duplicate = await operation.run(async () => "duplicate");

    expect(duplicate).toBeUndefined();
    expect(operation.isBusy()).toBe(true);
    expect(busyChanges).toEqual([true]);

    rejectFirst(new Error("native failure"));
    await expect(first).rejects.toThrow("native failure");
    expect(operation.isBusy()).toBe(false);
    expect(busyChanges).toEqual([true, false]);

    await expect(operation.run(async () => "retry")).resolves.toBe("retry");
    expect(busyChanges).toEqual([true, false, true, false]);
  });
});
