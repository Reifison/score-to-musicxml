import { t } from "../i18n";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { captureImageFromCamera } from "../camera/capture";
import { getNativeDocumentScanner } from "./native";
import { scanDocumentWithNativeScanner } from "./scan";
import type { CaptureDocumentResult } from "./types";

export type CaptureDocumentDependencies = {
  platform?: string;
  nativeScanner?: ReturnType<typeof getNativeDocumentScanner>;
  requestCameraPermission?: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  launchAndroidCamera?: () => Promise<{ canceled: boolean; assets?: ImagePicker.ImagePickerAsset[] | null }>;
};

export async function captureScoreDocument(
  dependencies: CaptureDocumentDependencies = {}
): Promise<CaptureDocumentResult> {
  const platform = dependencies.platform ?? Platform.OS;
  const requestCameraPermission = dependencies.requestCameraPermission ?? ImagePicker.requestCameraPermissionsAsync;

  if (platform === "ios") {
    const nativeScanner = dependencies.nativeScanner === undefined ? getNativeDocumentScanner() : dependencies.nativeScanner;
    return scanDocumentWithNativeScanner({ nativeScanner, requestPermission: requestCameraPermission });
  }

  const result = await captureImageFromCamera({
    requestPermission: requestCameraPermission,
    launchCamera: dependencies.launchAndroidCamera ?? (() => ImagePicker.launchCameraAsync({
      allowsEditing: true,
      cameraType: ImagePicker.CameraType.back,
      mediaTypes: ["images"],
      presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
      quality: 0.9
    }))
  });

  if (result.kind === "cancelled" || result.kind === "permission-denied" || result.kind === "error") return result;
  if (result.kind === "invalid-asset") return { kind: "invalid-result" };

  // Android keeps the existing Expo camera photo flow; iOS always uses VisionKit.
  const asset = result.asset;
  return {
    kind: "success",
    document: {
      uri: asset.uri,
      name: asset.fileName || "partitura.jpg",
      type: asset.mimeType || "image/jpeg",
      pageCount: 1,
      pages: [{ uri: asset.uri, width: asset.width, height: asset.height }]
    }
  };
}

export async function releaseScannedDocument(scanId: string | undefined): Promise<void> {
  if (!scanId) return;
  try {
    await getNativeDocumentScanner()?.releaseAsync(scanId);
  } catch {
    // Cache cleanup is best effort; iOS can reclaim cache files under pressure.
  }
}

export function captureFailureCopy(result: Exclude<CaptureDocumentResult, { kind: "success" | "cancelled" }>) {
  switch (result.kind) {
    case "permission-denied":
      return result.canAskAgain
        ? { title: t("Acesso à câmera não autorizado", "Camera access not allowed"), message: t("Permita o acesso à câmera para usar o scanner de documentos. Toque em “Escanear partitura” para tentar novamente.", "Allow camera access to use the document scanner. Tap “Scan score” to try again.") }
        : { title: t("Acesso à câmera bloqueado", "Camera access blocked"), message: t("Para usar o scanner de documentos, permita o uso da câmera nos Ajustes do aparelho.", "To use the document scanner, allow camera access in your device settings.") };
    case "unsupported":
      return { title: t("Scanner de documentos indisponível", "Document scanner unavailable"), message: t("Este aparelho não oferece o scanner de documentos. Envie um PDF ou escolha uma foto da biblioteca.", "This device does not support document scanning. Upload a PDF or choose a photo from your library.") };
    case "native-module-unavailable":
      return { title: t("Scanner de documentos indisponível", "Document scanner unavailable"), message: t("Esta versão do app não inclui o scanner de documentos. Atualize o app e tente novamente.", "This app version does not include the document scanner. Update the app and try again.") };
    case "invalid-result":
      return { title: t("Documento incompleto", "Incomplete document"), message: t("O scanner não retornou todas as páginas em um PDF válido. Tente escanear novamente.", "The scanner did not return all pages in a valid PDF. Try scanning again.") };
    case "too-many-pages":
      return { title: t("Muitas páginas para um envio", "Too many pages for one upload"), message: t("Cada conversão aceita até 20 páginas. Escaneie no máximo 20 páginas por envio; nenhuma página foi removida pelo app.", "Each conversion supports up to 20 pages. Scan no more than 20 pages per upload; the app has not removed any pages.") };
    case "too-large":
      return { title: t("PDF acima do limite de envio", "PDF exceeds upload limit"), message: t("O PDF escaneado ultrapassou 10 MiB. Escaneie menos páginas por envio ou escolha um PDF menor; o app não reduziu a qualidade do documento.", "The scanned PDF exceeds 10 MiB. Scan fewer pages per upload or choose a smaller PDF; the app has not reduced the document quality.") };
    case "error":
      return { title: t("Não foi possível escanear", "Unable to scan"), message: t("Tente novamente. Se o problema continuar, envie um PDF ou escolha uma foto da biblioteca.", "Try again. If the problem continues, upload a PDF or choose a photo from your library.") };
  }
}

