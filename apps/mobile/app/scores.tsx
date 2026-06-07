import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useIAP } from "expo-iap";
import type { Purchase } from "expo-iap";
import { Link, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Modal, Platform, Pressable, RefreshControl, Text, View } from "react-native";
import DocumentScanner, { ResponseType, ScanDocumentResponseStatus } from "react-native-document-scanner-plugin";
import { ApiError, api } from "../src/api/client";
import type { Score } from "../src/api/types";
import { useAuth } from "../src/auth/AuthProvider";
import { StatusBadge } from "../src/components/StatusBadge";
import { colors, radius, sharedStyles } from "../src/theme/styles";

const premiumProductId = "premium_unlock";
const premiumProductIds = [premiumProductId];

export default function ScoresScreen() {
  const { scan } = useLocalSearchParams<{ scan?: string }>();
  const { token, user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ uri: string; name: string; type: string; preprocessingProfile?: "document_scanner" } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [purchaseStatus, setPurchaseStatus] = useState<string | null>(null);
  const processedPurchases = useRef(new Set<string>());
  const autoScanStarted = useRef(false);

  const {
    availablePurchases,
    connected,
    fetchProducts,
    finishTransaction,
    products,
    requestPurchase,
    restorePurchases
  } = useIAP({
    onPurchaseError: (error) => {
      setPurchaseStatus(purchaseErrorMessage(error));
    },
    onPurchaseSuccess: (purchase) => {
      void completeApplePurchase(purchase, false);
    }
  });

  const entitlementQuery = useQuery({
    queryKey: ["entitlement"],
    queryFn: () => api.entitlement(token!),
    enabled: Boolean(token)
  });

  const scoresQuery = useQuery({
    queryKey: ["scores"],
    queryFn: () => api.scores(token!),
    enabled: Boolean(token),
    refetchInterval: (query) => {
      const scores = query.state.data?.scores ?? [];
      return scores.some((score) => score.conversionStatus === "queued" || score.conversionStatus === "processing") ? 3000 : false;
    }
  });

  const entitlement = entitlementQuery.data?.entitlement;
  const canUpload = entitlement?.plan === "paid" || (entitlement?.freeScansRemaining ?? 0) > 0;

  const uploadMutation = useMutation({
    mutationFn: (file: { uri: string; name: string; type: string }) => api.upload(token!, file),
    onSuccess: async ({ score }) => {
      setUploadError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["scores"] }),
        queryClient.invalidateQueries({ queryKey: ["entitlement"] })
      ]);
      router.push(`/score/${score.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "FREE_SCAN_LIMIT_REACHED") {
        setPaywallVisible(true);
      }
      setUploadError(error instanceof Error ? error.message : "Falha no upload.");
    }
  });

  const purchaseMutation = useMutation({
    mutationFn: (purchase: { originalTransactionId: string; productId: string; purchaseToken?: string; purchasedAt?: string; restored?: boolean; transactionId?: string }) => api.registerApplePurchase(token!, purchase),
    onSuccess: async () => {
      setPaywallVisible(false);
      setPurchaseStatus(null);
      await queryClient.invalidateQueries({ queryKey: ["entitlement"] });
    },
    onError: (error) => setUploadError(error instanceof Error ? error.message : "Falha ao desbloquear.")
  });

  const premiumProduct = products.find((product) => product.id === premiumProductId);
  const premiumPrice = premiumProduct?.displayPrice ?? "R$ 29,90";
  const canUseStoreKit = Platform.OS === "ios" && connected;

  useEffect(() => {
    if (Platform.OS === "ios" && connected) {
      void fetchProducts({ skus: premiumProductIds, type: "in-app" });
    }
  }, [connected, fetchProducts]);

  useEffect(() => {
    const restored = availablePurchases.find((purchase) => purchase.productId === premiumProductId);
    if (restored) void completeApplePurchase(restored, true);
  }, [availablePurchases]);

  useEffect(() => {
    if (scan !== "1" || autoScanStarted.current || !entitlementQuery.isFetched || uploadMutation.isPending) return;
    autoScanStarted.current = true;
    void scanWithCamera();
  }, [scan, entitlementQuery.isFetched, uploadMutation.isPending]);

  const subtitle = useMemo(() => {
    if (!entitlement) return "Carregando limite de uso...";
    if (entitlement.plan === "paid") return "Versao paga ativa";
    return `${entitlement.freeScansRemaining} de ${entitlement.freeScanLimit} scans gratis restantes`;
  }, [entitlement]);

  async function ensureUploadAllowed() {
    if (canUpload) return true;
    setPaywallVisible(true);
    return false;
  }

  async function completeApplePurchase(purchase: Purchase, restored: boolean) {
    if (!token || purchase.productId !== premiumProductId) return;
    const purchaseKey = purchase.purchaseToken || purchase.transactionId || purchase.id;
    if (processedPurchases.current.has(purchaseKey)) return;
    processedPurchases.current.add(purchaseKey);

    setPurchaseStatus(restored ? "Restaurando compra..." : "Validando compra...");
    try {
      const originalTransactionId = getOriginalTransactionId(purchase);
      await purchaseMutation.mutateAsync({
        productId: purchase.productId,
        originalTransactionId,
        purchaseToken: purchase.purchaseToken ?? undefined,
        purchasedAt: new Date(purchase.transactionDate).toISOString(),
        restored,
        transactionId: purchase.transactionId ?? undefined
      });
      await finishTransaction({ purchase, isConsumable: false });
      setPurchaseStatus(restored ? "Compra restaurada." : "Compra concluida.");
    } catch (error) {
      processedPurchases.current.delete(purchaseKey);
      setPurchaseStatus(error instanceof Error ? error.message : "Falha ao validar compra.");
    }
  }

  async function buyPremium() {
    setUploadError(null);
    setPurchaseStatus(null);
    if (!canUseStoreKit) {
      await purchaseMutation.mutateAsync({
        productId: premiumProductId,
        originalTransactionId: `local-${Date.now()}`,
        purchasedAt: new Date().toISOString()
      });
      return;
    }
    setPurchaseStatus("Abrindo App Store...");
    await requestPurchase({
      type: "in-app",
      request: { apple: { sku: premiumProductId } }
    });
  }

  async function restorePremium() {
    setUploadError(null);
    setPurchaseStatus(null);
    if (!canUseStoreKit) {
      await purchaseMutation.mutateAsync({
        productId: premiumProductId,
        originalTransactionId: `local-restore-${Date.now()}`,
        purchasedAt: new Date().toISOString(),
        restored: true
      });
      return;
    }
    setPurchaseStatus("Buscando compras anteriores...");
    await restorePurchases();
  }

  async function pickPdf() {
    if (!(await ensureUploadAllowed())) return;
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: "application/pdf" });
    if (result.canceled) return;
    const asset = result.assets[0];
    uploadMutation.mutate({ uri: asset.uri, name: asset.name || "partitura.pdf", type: asset.mimeType || "application/pdf" });
  }

  async function pickImage() {
    if (!(await ensureUploadAllowed())) return;
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setPendingImage({ uri: asset.uri, name: asset.fileName || "partitura.jpg", type: asset.mimeType || "image/jpeg" });
  }

  async function scanWithCamera() {
    if (!(await ensureUploadAllowed())) return;
    const proceed = await new Promise<boolean>((resolve) => {
      Alert.alert("Escanear partitura", "O scanner vai detectar as bordas da folha e corrigir a perspectiva. Mantenha a folha bem iluminada, sem sombras e ocupando quase toda a tela.", [
        { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
        { text: "Abrir scanner", onPress: () => resolve(true) }
      ]);
    });
    if (!proceed) return;
    try {
      const result = await DocumentScanner.scanDocument({
        croppedImageQuality: 90,
        maxNumDocuments: 1,
        responseType: ResponseType.ImageFilePath
      });
      const uri = result.scannedImages?.[0];
      if (result.status === ScanDocumentResponseStatus.Cancel || !uri) return;
      setPendingImage({ uri, name: "scan.jpg", type: "image/jpeg", preprocessingProfile: "document_scanner" });
    } catch (error) {
      Alert.alert("Scanner indisponivel", error instanceof Error ? error.message : "Nao foi possivel abrir o scanner de documentos.");
    }
  }

  function confirmImageUpload() {
    if (!pendingImage) return;
    uploadMutation.mutate(pendingImage);
    setPendingImage(null);
  }

  async function refresh() {
    await Promise.all([scoresQuery.refetch(), entitlementQuery.refetch()]);
  }

  return (
    <View style={sharedStyles.screen}>
      <FlatList
        contentContainerStyle={{ gap: 16, padding: 24 }}
        data={scoresQuery.data?.scores ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            <View style={{ flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text style={sharedStyles.title}>Partituras</Text>
                <Text style={sharedStyles.subtitle}>{user?.name} · {subtitle}</Text>
              </View>
              <Pressable onPress={logout} style={[sharedStyles.button, sharedStyles.buttonOutline, { width: 52, minHeight: 52, paddingHorizontal: 0 }]}>
                <Ionicons color={colors.text} name="log-out-outline" size={20} />
              </Pressable>
            </View>

            <View style={sharedStyles.panel}>
              <Pressable disabled={uploadMutation.isPending} onPress={scanWithCamera} style={sharedStyles.button}>
                <Ionicons color="#fff" name="camera-outline" size={20} />
                <Text style={sharedStyles.buttonText}>Escanear partitura</Text>
              </Pressable>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable disabled={uploadMutation.isPending} onPress={pickPdf} style={[sharedStyles.button, sharedStyles.buttonOutline, { flex: 1 }]}>
                  <Ionicons color={colors.text} name="document-outline" size={18} />
                  <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextOutline]}>PDF</Text>
                </Pressable>
                <Pressable disabled={uploadMutation.isPending} onPress={pickImage} style={[sharedStyles.button, sharedStyles.buttonOutline, { flex: 1 }]}>
                  <Ionicons color={colors.text} name="image-outline" size={18} />
                  <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextOutline]}>Foto</Text>
                </Pressable>
              </View>
              {uploadMutation.isPending ? <ActivityIndicator color={colors.primary} /> : null}
              {uploadError ? <Text style={sharedStyles.error}>{uploadError}</Text> : null}
            </View>
          </View>
        }
        ListEmptyComponent={!scoresQuery.isLoading ? <Text style={sharedStyles.subtitle}>Nenhuma partitura enviada ainda.</Text> : null}
        refreshControl={<RefreshControl onRefresh={refresh} refreshing={scoresQuery.isFetching || entitlementQuery.isFetching} />}
        renderItem={({ item }) => <ScoreRow score={item} />}
      />

      <Modal animationType="slide" transparent visible={paywallVisible}>
        <View style={{ backgroundColor: "rgba(47,42,51,0.35)", flex: 1, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.panel, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: 16, padding: 24 }}>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>Desbloquear scans</Text>
            <Text style={sharedStyles.subtitle}>Voce usou os 3 scans gratis. A versao paga libera novos envios nesta conta.</Text>
            {Platform.OS === "ios" && !connected ? <Text style={{ color: colors.warning }}>Conectando com a App Store...</Text> : null}
            {purchaseStatus ? <Text style={sharedStyles.subtitle}>{purchaseStatus}</Text> : null}
            <Pressable disabled={purchaseMutation.isPending} onPress={buyPremium} style={sharedStyles.button}>
              {purchaseMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={sharedStyles.buttonText}>Desbloquear {premiumPrice}</Text>}
            </Pressable>
            <Pressable disabled={purchaseMutation.isPending} onPress={restorePremium} style={[sharedStyles.button, sharedStyles.buttonSecondary]}>
              <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary]}>Restaurar compra</Text>
            </Pressable>
            <Pressable onPress={() => setPaywallVisible(false)} style={[sharedStyles.button, sharedStyles.buttonOutline]}>
              <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextOutline]}>Agora nao</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" visible={Boolean(pendingImage)}>
        <View style={[sharedStyles.screen, { padding: 24, gap: 16 }]}>
          <Text style={sharedStyles.title}>Conferir foto</Text>
          <Text style={sharedStyles.subtitle}>Envie apenas se a folha estiver reta, clara, recortada e ocupando quase toda a imagem.</Text>
          {pendingImage ? <Image resizeMode="contain" source={{ uri: pendingImage.uri }} style={{ backgroundColor: colors.panel, borderRadius: radius.lg, flex: 1, width: "100%" }} /> : null}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable onPress={() => setPendingImage(null)} style={[sharedStyles.button, sharedStyles.buttonOutline, { flex: 1 }]}>
              <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextOutline]}>Refazer</Text>
            </Pressable>
            <Pressable onPress={confirmImageUpload} style={[sharedStyles.button, { flex: 1 }]}>
              <Text style={sharedStyles.buttonText}>Enviar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ScoreRow({ score }: { score: Score }) {
  return (
    <Link asChild href={`/score/${score.id}`}>
      <Pressable style={sharedStyles.panel}>
        <View style={{ flexDirection: "row", gap: 10, justifyContent: "space-between" }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>{score.originalFilename}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{formatBytes(score.fileSize)} · {new Date(score.createdAt).toLocaleDateString()}</Text>
          </View>
          <StatusBadge status={score.conversionStatus} />
        </View>
      </Pressable>
    </Link>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getOriginalTransactionId(purchase: Purchase) {
  if ("originalTransactionIdentifierIOS" in purchase && purchase.originalTransactionIdentifierIOS) {
    return purchase.originalTransactionIdentifierIOS;
  }
  return purchase.transactionId || purchase.purchaseToken || purchase.id;
}

function purchaseErrorMessage(error: { code?: string; message?: string }) {
  if (error.code === "user-cancelled") return "Compra cancelada.";
  if (error.code === "deferred-payment") return "Compra pendente de aprovacao.";
  return error.message || "Falha na compra.";
}
