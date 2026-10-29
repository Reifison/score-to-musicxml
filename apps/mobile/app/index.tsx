import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Redirect, router } from "expo-router";
import type { ComponentProps } from "react";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AdaptiveText as Text } from "../src/adaptive/AdaptiveTypography";
import { ApiError, api } from "../src/api/client";
import type { ScoreType } from "../src/api/types";
import { useAdaptiveLayout } from "../src/adaptive/useAdaptiveLayout";
import { useAuth } from "../src/auth/AuthProvider";
import { AdaptiveScreen } from "../src/components/AdaptiveScreen";
import { BrandLockup } from "../src/components/BrandLockup";
import { ScoreTypePicker } from "../src/components/ScoreTypePicker";
import { createExclusiveOperation } from "../src/camera/capture";
import { captureFailureCopy, captureScoreDocument, releaseScannedDocument } from "../src/documentScanner/capture";
import { DocumentReviewModal } from "../src/documentScanner/DocumentReviewModal";
import type { ReviewableCapture } from "../src/documentScanner/types";
import { useTranslation } from "../src/i18n";
import { homeTilesForNavigationMode } from "../src/navigation/bottomNavModel";
import { getMeasuredGridItemBasis } from "../src/components/measuredGrid";
import { colors, sharedStyles } from "../src/theme/styles";

type UploadFile = { uri: string; name: string; type: string; scoreType: ScoreType };
type Tile = {
  key: "scores" | "favorites" | "trash" | "settings" | "profile";
  color: string;
  iconColor?: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
};

export default function IndexScreen() {
  const { t } = useTranslation();
  const { loading, token, user } = useAuth();
  const adaptiveLayout = useAdaptiveLayout();
  const queryClient = useQueryClient();
  const [scoreType, setScoreType] = useState<ScoreType | null>(null);
  const [tileGridWidth, setTileGridWidth] = useState(0);
  const [cameraBusy, setCameraBusy] = useState(false);
  const mountedRef = useRef(true);
  const [cameraOperation] = useState(() => createExclusiveOperation((busy) => {
    if (mountedRef.current) setCameraBusy(busy);
  }));
  const [pendingCapture, setPendingCapture] = useState<(ReviewableCapture & { scoreType: ScoreType }) | null>(null);
  const pendingCaptureRef = useRef<typeof pendingCapture>(null);
  pendingCaptureRef.current = pendingCapture;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void releaseScannedDocument(pendingCaptureRef.current?.scanId);
    };
  }, []);

  const uploadMutation = useMutation({
    mutationFn: (file: UploadFile) => api.upload(token!, file, file.scoreType),
    onSuccess: async ({ score }) => {
      await queryClient.invalidateQueries({ queryKey: ["scores"] });
      await queryClient.invalidateQueries({ queryKey: ["entitlement"] });
      router.push(`/score/${score.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "FREE_SCAN_LIMIT_REACHED") {
        router.push("/scores?paywall=1");
        return;
      }
      Alert.alert(t("Não foi possível enviar", "Couldn't upload"), error instanceof Error ? error.message : t("Tente novamente.", "Please try again."));
    }
  });

  if (loading) {
    return (
      <AdaptiveScreen navigation={false}>
        <View style={styles.loading}>
          <ActivityIndicator accessibilityLabel={t("Abrindo suas partituras", "Opening your scores")} color={colors.primary} />
        </View>
      </AdaptiveScreen>
    );
  }

  if (!user || !token) return <Redirect href="/login" />;

  const tiles = homeTilesForNavigationMode<Tile>([
    { key: "scores", color: colors.primary, icon: "musical-notes-outline", label: t("Minhas partituras", "My scores"), onPress: () => router.push("/scores") },
    { key: "favorites", color: colors.accentCoral, icon: "heart-outline", label: t("Favoritas", "Favorites"), onPress: () => router.push("/scores?view=favorites") },
    { key: "trash", color: colors.surfaceSoft, iconColor: colors.muted, icon: "trash-outline", label: t("Lixeira", "Trash"), onPress: () => router.push("/trash") },
    { key: "settings", color: colors.accentGold, iconColor: colors.ink, icon: "settings-outline", label: t("Configurações", "Settings"), onPress: () => router.push("/settings") },
    { key: "profile", color: colors.accentBlue, icon: "person-outline", label: t("Perfil", "Profile"), onPress: () => router.push("/profile") }
  ], adaptiveLayout.navigationMode);
  const tileBasis = getMeasuredGridItemBasis(tileGridWidth, 14);

  async function pickFile() {
    const selectedType = requireSelectedScoreType();
    if (!selectedType) return;
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: "application/pdf"
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    uploadMutation.mutate({
      uri: asset.uri,
      name: asset.name || "partitura.pdf",
      type: asset.mimeType || "application/pdf",
      scoreType: selectedType
    });
  }

  async function pickPhoto() {
    const selectedType = requireSelectedScoreType();
    if (!selectedType) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setPendingCapture({
      uri: asset.uri,
      name: asset.fileName || "partitura.jpg",
      type: asset.mimeType || "image/jpeg",
      scoreType: selectedType,
      pageCount: 1,
      pages: [{ uri: asset.uri, width: asset.width, height: asset.height }]
    });
  }

  async function scanWithCamera() {
    await cameraOperation.run(async () => {
      if (uploadMutation.isPending) return;
      const selectedType = requireSelectedScoreType();
      if (!selectedType) return;

      const result = await captureScoreDocument();
      if (!mountedRef.current) {
        if (result.kind === "success") void releaseScannedDocument(result.document.scanId);
        return;
      }
      if (result.kind === "cancelled") return;
      if (result.kind !== "success") {
        const message = captureFailureCopy(result);
        if (result.kind === "permission-denied" && !result.canAskAgain) {
          Alert.alert(message.title, message.message, [
          { text: t("Agora não", "Not now"), style: "cancel" },
          {
            text: t("Abrir Ajustes", "Open Settings"),
            onPress: () => {
              void Linking.openSettings().catch(() => Alert.alert(t("Não foi possível abrir os Ajustes", "Couldn't open Settings"), t("Abra os Ajustes do aparelho e permita o uso da câmera para este app.", "Open your device Settings and allow this app to use the camera.")));
            }
          }
          ]);
        } else {
          Alert.alert(message.title, message.message);
        }
        return;
      }

      setPendingCapture({
        ...result.document,
        scoreType: selectedType
      });
    });
  }

  async function confirmCaptureUpload() {
    if (!pendingCapture || uploadMutation.isPending) return;
    try {
      await uploadMutation.mutateAsync({
        uri: pendingCapture.uri,
        name: pendingCapture.name,
        type: pendingCapture.type,
        scoreType: pendingCapture.scoreType
      });
      await releaseScannedDocument(pendingCapture.scanId);
      setPendingCapture(null);
    } catch {
      // The mutation already presents its error; keep the local capture for retry.
    }
  }

  function discardCapture() {
    void releaseScannedDocument(pendingCapture?.scanId);
    setPendingCapture(null);
  }

  function requireSelectedScoreType(): ScoreType | null {
    if (scoreType) return scoreType;
    Alert.alert(t("Selecione o tipo de partitura", "Select a score type"), t("Escolha melodia, piano, violão solo ou violão duo antes de enviar.", "Choose melody, piano, solo guitar, or guitar duet before uploading."));
    return null;
  }

  return (
    <AdaptiveScreen>
      <ScrollView contentContainerStyle={styles.content} style={styles.scroller}>
        <BrandLockup />
        <View style={styles.uploadPanel}>
          <ScoreTypePicker onChange={setScoreType} value={scoreType} />
          <Pressable disabled={cameraBusy || uploadMutation.isPending} onPress={scanWithCamera} style={[sharedStyles.button, styles.scanButton]}>
            {cameraBusy || uploadMutation.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Ionicons color={colors.onPrimary} name="camera-outline" size={22} />}
            <Text style={sharedStyles.buttonText}>{uploadMutation.isPending ? t("Enviando...", "Uploading...") : cameraBusy ? Platform.OS === "ios" ? t("Abrindo scanner...", "Opening scanner...") : t("Abrindo câmera...", "Opening camera...") : t("Escanear partitura", "Scan score")}</Text>
          </Pressable>
          <View style={styles.uploadActions}>
            <Pressable disabled={cameraBusy || uploadMutation.isPending} onPress={pickFile} style={[sharedStyles.button, sharedStyles.buttonSecondary, styles.uploadChoice]}>
              <Ionicons color={colors.ink} name="document-outline" size={22} />
              <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary, styles.choiceText]}>PDF</Text>
            </Pressable>
            <Pressable disabled={cameraBusy || uploadMutation.isPending} onPress={pickPhoto} style={[sharedStyles.button, sharedStyles.buttonSecondary, styles.uploadChoice]}>
              <Ionicons color={colors.ink} name="image-outline" size={22} />
              <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary, styles.choiceText]}>{t("Foto", "Photo")}</Text>
            </Pressable>
          </View>
        </View>

        <View
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            setTileGridWidth((currentWidth) => Math.abs(currentWidth - width) > 0.5 ? width : currentWidth);
          }}
          style={styles.tileGrid}
        >
          {tiles.map((tile) => (
            <Pressable key={tile.key} onPress={tile.onPress} style={[styles.tile, { width: tileBasis }]}>
              <View style={[styles.tileIcon, { backgroundColor: tile.color }]}>
                <Ionicons color={tile.iconColor ?? colors.onPrimary} name={tile.icon} size={34} />
              </View>
              <Text style={styles.tileText}>{tile.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <DocumentReviewModal
        busy={uploadMutation.isPending}
        capture={pendingCapture}
        error={null}
        onCancel={discardCapture}
        onConfirm={confirmCaptureUpload}
      />
    </AdaptiveScreen>
  );
}

const styles = StyleSheet.create({
  choiceText: {
    fontSize: 18
  },
  content: {
    alignSelf: "center",
    flexGrow: 1,
    gap: 28,
    maxWidth: 960,
    padding: 20,
    paddingBottom: 24,
    paddingTop: 28,
    width: "100%"
  },
  loading: {
    alignItems: "center",
    backgroundColor: colors.surface,
    flex: 1,
    justifyContent: "center"
  },
  scroller: {
    backgroundColor: colors.surface,
    flex: 1
  },
  scanButton: {
    flexWrap: "wrap"
  },
  tile: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    boxSizing: "border-box",
    maxWidth: "100%",
    gap: 18,
    flexGrow: 0,
    flexShrink: 0,
    justifyContent: "center",
    minHeight: 144,
    padding: 16,
    shadowColor: "#4c2e22",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.06,
    shadowRadius: 24
  },
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    justifyContent: "space-between"
  },
  tileIcon: {
    alignItems: "center",
    borderRadius: 18,
    height: 72,
    justifyContent: "center",
    shadowColor: "#4c2e22",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    width: 72
  },
  tileText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  uploadActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  uploadChoice: {
    flex: 1,
    minHeight: 58
  },
  uploadPanel: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
    padding: 18,
    shadowColor: "#4c2e22",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.05,
    shadowRadius: 18
  }
});
