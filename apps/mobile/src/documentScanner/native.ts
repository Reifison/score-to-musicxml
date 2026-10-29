import { requireOptionalNativeModule } from "expo-modules-core";
import type { ScannedDocument } from "./types";

export type NativeDocumentScanner = {
  isAvailableAsync: () => Promise<boolean>;
  scanAsync: () => Promise<unknown>;
  releaseAsync: (scanId: string) => Promise<void>;
};

export function getNativeDocumentScanner(): NativeDocumentScanner | null {
  return requireOptionalNativeModule<NativeDocumentScanner>("DocumentScanner");
}

