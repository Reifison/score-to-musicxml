import type { ImagePickerAsset } from "expo-image-picker";

export type CameraCaptureResult =
  | { kind: "success"; asset: ImagePickerAsset }
  | { kind: "cancelled" }
  | { kind: "permission-denied"; canAskAgain: boolean }
  | { kind: "invalid-asset" }
  | { kind: "error"; error: unknown };

export type CameraCaptureDependencies = {
  requestPermission: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  launchCamera: () => Promise<{ canceled: boolean; assets?: ImagePickerAsset[] | null }>;
};

export async function captureImageFromCamera(dependencies: CameraCaptureDependencies): Promise<CameraCaptureResult> {
  try {
    const permission = await dependencies.requestPermission();
    if (!permission.granted) {
      return { kind: "permission-denied", canAskAgain: permission.canAskAgain };
    }

    const result = await dependencies.launchCamera();
    if (result.canceled) return { kind: "cancelled" };

    const asset = result.assets?.[0];
    if (!asset?.uri?.trim() || asset.type === "video" || asset.type === "pairedVideo") {
      return { kind: "invalid-asset" };
    }

    return { kind: "success", asset };
  } catch (error) {
    return { kind: "error", error };
  }
}

export function createExclusiveOperation(onBusyChange: (busy: boolean) => void) {
  let busy = false;

  return {
    isBusy: () => busy,
    async run<T>(operation: () => Promise<T>): Promise<T | undefined> {
      if (busy) return undefined;
      busy = true;
      onBusyChange(true);
      try {
        return await operation();
      } finally {
        busy = false;
        onBusyChange(false);
      }
    }
  };
}
