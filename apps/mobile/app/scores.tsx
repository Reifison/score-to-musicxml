import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useIAP } from "expo-iap";
import type { Purchase } from "expo-iap";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, FlatList, Linking, Modal, PanResponder, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { AdaptiveText as Text } from "../src/adaptive/AdaptiveTypography";
import { ApiError, api } from "../src/api/client";
import { classifyIapPurchaseError } from "../src/api/purchaseErrors";
import { evaluatePurchaseOffer, type ProductCatalogState, type PurchaseOfferState } from "../src/api/purchaseOffer";
import type { Score, ScoreType } from "../src/api/types";
import { useAuth } from "../src/auth/AuthProvider";
import { AdaptiveScreen } from "../src/components/AdaptiveScreen";
import { ScoreConversionProgress } from "../src/components/ScoreConversionProgress";
import { ScoreTypePicker } from "../src/components/ScoreTypePicker";
import { StatusBadge } from "../src/components/StatusBadge";
import { createExclusiveOperation } from "../src/camera/capture";
import { captureFailureCopy, captureScoreDocument, releaseScannedDocument } from "../src/documentScanner/capture";
import { DocumentReviewModal } from "../src/documentScanner/DocumentReviewModal";
import type { ReviewableCapture } from "../src/documentScanner/types";
import { getLocale, useTranslation } from "../src/i18n";
import { isConversionProgressActive, shouldPollConversionScore } from "../src/score/conversionProgressPresentation";
import { localizeMessage } from "../src/score/localizedMessages";
import { colors, sharedStyles } from "../src/theme/styles";

const premiumProductId = "premium_unlock";
const premiumProductIds = [premiumProductId];
type PendingCapture = ReviewableCapture & { scoreType: ScoreType };
type Translate = ReturnType<typeof useTranslation>["t"];
type DeferredMessage = () => string;

type PurchaseRegistration = {
  productId: string;
  originalTransactionId?: string;
  purchaseToken?: string;
  packageName?: string;
  purchasedAt?: string;
  restored?: boolean;
  transactionId?: string;
  quantity?: number;
};

export default function ScoresScreen() {
  const { t } = useTranslation();
  const { paywall, view } = useLocalSearchParams<{ paywall?: string; view?: string }>();
  const favoritesOnly = view === "favorites";
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const mountedRef = useRef(true);
  const [cameraOperation] = useState(() => createExclusiveOperation((busy) => {
    if (mountedRef.current) setCameraBusy(busy);
  }));
  const [pendingCapture, setPendingCapture] = useState<PendingCapture | null>(null);
  const pendingCaptureRef = useRef<PendingCapture | null>(null);
  const [scoreType, setScoreType] = useState<ScoreType | null>(null);
  const [uploadError, setUploadError] = useState<DeferredMessage | null>(null);
  const [purchaseStatus, setPurchaseStatus] = useState<DeferredMessage | null>(null);
  const [productCatalogState, setProductCatalogState] = useState<ProductCatalogState>("idle");
  const [storeOperationPending, setStoreOperationPending] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const processedPurchases = useRef(new Set<string>());

  function setUploadErrorFrom(error: unknown, pt: string, en: string) {
    setUploadError(() => () => error instanceof ApiError ? error.message : error instanceof Error ? localizeMessage(error.message) : t(pt, en));
  }

  function setPurchaseStatusCopy(pt: string, en: string, params?: Record<string, string | number>) {
    setPurchaseStatus(() => () => t(pt, en, params));
  }

  function setPurchaseStatusFrom(error: unknown, pt: string, en: string) {
    setPurchaseStatus(() => () => error instanceof ApiError ? error.message : error instanceof Error ? localizeMessage(error.message) : t(pt, en));
  }

  useEffect(() => {
    if (paywall === "1") {
      setPaywallVisible(true);
      router.setParams({ paywall: undefined });
    }
  }, [paywall]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void releaseScannedDocument(pendingCaptureRef.current?.scanId);
    };
  }, []);

  const isAndroid = Platform.OS === "android";
  const storeName = isAndroid ? "Google Play" : "App Store";
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
      setPurchaseStatus(() => purchaseErrorMessage(error, t));
    },
    onPurchaseSuccess: (purchase) => {
      void completeStorePurchase(purchase, false);
    }
  });

  const entitlementQuery = useQuery({
    queryKey: ["entitlement"],
    queryFn: () => api.entitlement(token!),
    enabled: Boolean(token)
  });

  const scoresQuery = useQuery({
    queryKey: ["scores", user?.id ?? null],
    queryFn: () => api.scores(token!),
    enabled: Boolean(token && user?.id),
    refetchInterval: (query) => {
      const scores = query.state.data?.scores ?? [];
      if (scores.some((score) => isConversionProgressActive(score.conversionProgress))) return 10_000;
      return scores.some((score) => shouldPollConversionScore(score) || score.reviewStatus === "needs_review") ? 60_000 : false;
    }
  });

  const favoriteMutation = useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) => api.setScoreFavorite(token!, id, isFavorite),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["scores"] });
    },
    onError: (error) => Alert.alert(t("Não foi possível atualizar", "Couldn't update"), error instanceof Error ? error.message : t("Tente novamente.", "Please try again."))
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length > 1) await api.bulkScores(token!, ids, "delete");
      else await api.deleteScore(token!, ids[0]);
    },
    onSuccess: async () => {
      setSelectedIds(new Set());
      setSelectionMode(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["scores"] }),
        queryClient.invalidateQueries({ queryKey: ["trash-scores"] })
      ]);
    },
    onError: (error) => Alert.alert(t("Não foi possível mover para a lixeira", "Couldn't move to Trash"), error instanceof Error ? error.message : t("Tente novamente.", "Please try again."))
  });

  const entitlement = entitlementQuery.data?.entitlement;
  const hasUnlimitedConversions = entitlement?.plan === "paid";
  const canUpload = entitlement?.plan === "paid" || (entitlement?.freeScansRemaining ?? 0) > 0;

  const uploadMutation = useMutation({
    mutationFn: (file: { uri: string; name: string; type: string; scoreType: ScoreType }) => api.upload(token!, file, file.scoreType),
    onSuccess: async ({ score }) => {
      setUploadError(null);
      const reviewedCapture = pendingCaptureRef.current;
      pendingCaptureRef.current = null;
      setPendingCapture(null);
      if (reviewedCapture?.scanId) void releaseScannedDocument(reviewedCapture.scanId);
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
      setUploadErrorFrom(error, "Falha no upload.", "Upload failed.");
    }
  });

  const purchaseMutation = useMutation({
    mutationFn: (purchase: PurchaseRegistration) => {
      if (isAndroid) {
        if (!purchase.purchaseToken) throw new Error(t("A compra Google não forneceu um token válido.", "Google Play didn't provide a valid purchase token."));
        return api.registerGooglePurchase(token!, {
          productId: purchase.productId,
          purchaseToken: purchase.purchaseToken,
          packageName: purchase.packageName,
          purchasedAt: purchase.purchasedAt,
          restored: purchase.restored,
          transactionId: purchase.transactionId,
          quantity: purchase.quantity
        });
      }
      return api.registerApplePurchase(token!, {
        originalTransactionId: purchase.originalTransactionId!,
        productId: purchase.productId,
        purchaseToken: purchase.purchaseToken,
        purchasedAt: purchase.purchasedAt,
        restored: purchase.restored,
        transactionId: purchase.transactionId
      });
    },
    onSuccess: async () => {
      setPaywallVisible(false);
      setPurchaseStatus(null);
      await queryClient.invalidateQueries({ queryKey: ["entitlement"] });
    },
    onError: (error) => setUploadErrorFrom(error, "Falha ao desbloquear.", "Couldn't unlock.")
  });

  const premiumProduct = products.find((product) => product.id === premiumProductId);
  const canUseStore = connected;
  const purchaseOffer = evaluatePurchaseOffer({
    connected,
    catalogState: productCatalogState,
    product: premiumProduct,
    productId: premiumProductId,
    purchasePending: purchaseMutation.isPending || storeOperationPending
  });
  const canBuyPremium = Boolean(entitlement) && !hasUnlimitedConversions && purchaseOffer.canPurchase;

  const loadPremiumProduct = useCallback(async () => {
    if (!connected) {
      setProductCatalogState("idle");
      return;
    }
    setProductCatalogState("loading");
    try {
      await fetchProducts({ skus: premiumProductIds, type: "in-app" });
      setProductCatalogState("loaded");
    } catch {
      setProductCatalogState("failed");
    }
  }, [connected, fetchProducts]);

  useEffect(() => {
    void loadPremiumProduct();
  }, [loadPremiumProduct]);

  useEffect(() => {
    const restored = availablePurchases.find((purchase) => purchase.productId === premiumProductId);
    if (restored) void completeStorePurchase(restored, true);
  }, [availablePurchases]);

  const subtitle = !entitlement
    ? t("Carregando limite de uso...", "Loading usage limit...")
    : entitlement.plan === "paid"
      ? t("Conversões ilimitadas ativas", "Unlimited conversions active")
      : t("{{remaining}} de {{limit}} conversões gratuitas restantes", "{{remaining}} of {{limit}} free conversions remaining", {
      remaining: entitlement.freeScansRemaining ?? 0,
      limit: entitlement.freeScanLimit ?? 3
    });

  async function ensureUploadAllowed(): Promise<ScoreType | null> {
    if (!scoreType) {
      Alert.alert(t("Selecione o tipo de partitura", "Select a score type"), t("Escolha melodia, piano, violão solo ou violão duo antes de enviar.", "Choose melody, piano, solo guitar, or guitar duet before uploading."));
      return null;
    }
    if (canUpload) return scoreType;
    setPaywallVisible(true);
    return null;
  }

  async function completeStorePurchase(purchase: Purchase, restored: boolean) {
    if (!token || purchase.productId !== premiumProductId) return;
    const purchaseKey = purchase.purchaseToken || purchase.transactionId || purchase.id;
    if (processedPurchases.current.has(purchaseKey)) return;
    processedPurchases.current.add(purchaseKey);

    setPurchaseStatus(() => () => restored ? t("Restaurando compra...", "Restoring purchase...") : t("Validando compra...", "Verifying purchase..."));
    try {
      await purchaseMutation.mutateAsync({
        productId: purchase.productId,
        originalTransactionId: isAndroid ? undefined : getOriginalTransactionId(purchase),
        packageName: "packageNameAndroid" in purchase ? purchase.packageNameAndroid ?? undefined : undefined,
        purchaseToken: purchase.purchaseToken ?? undefined,
        purchasedAt: new Date(purchase.transactionDate).toISOString(),
        restored,
        transactionId: purchase.transactionId ?? undefined,
        quantity: purchase.quantity
      });
      await finishTransaction({ purchase, isConsumable: false });
      setPurchaseStatus(() => () => restored ? t("Compra restaurada.", "Purchase restored.") : t("Compra concluída.", "Purchase complete."));
    } catch (error) {
      processedPurchases.current.delete(purchaseKey);
      setPurchaseStatusFrom(error, "Falha ao validar compra.", "Couldn't verify purchase.");
    }
  }

  async function buyPremium() {
    setUploadError(null);
    setPurchaseStatus(null);
    if (!entitlement) {
      setPurchaseStatusCopy("Aguarde enquanto verificamos o plano desta conta.", "Please wait while we check this account's plan.");
      return;
    }
    if (hasUnlimitedConversions) {
      setPurchaseStatusCopy("As conversões ilimitadas já estão ativas nesta conta.", "Unlimited conversions are already active on this account.");
      return;
    }
    if (!purchaseOffer.canPurchase) {
      setPurchaseStatus(() => purchaseOfferUnavailableMessage(purchaseOffer.state, storeName, t));
      return;
    }
    setPurchaseStatusCopy("Abrindo {{store}}...", "Opening {{store}}...", { store: storeName });
    setStoreOperationPending(true);
    try {
      if (!token) {
        setPurchaseStatusCopy("Faça login para comprar.", "Sign in to make a purchase.");
        return;
      }
      const { binding } = await api.purchaseBinding(token);
      await requestPurchase({
        type: "in-app",
        request: isAndroid
          ? { google: { skus: premiumProductIds, obfuscatedAccountId: binding.googleObfuscatedAccountId } }
          : { apple: { sku: premiumProductId, appAccountToken: binding.appleAppAccountToken } }
      });
    } catch (error) {
      if (error instanceof ApiError) {
        setPurchaseStatus(() => () => error.message);
      } else if (classifyIapPurchaseError(error)) {
        setPurchaseStatus(() => purchaseErrorMessage(error, t));
      } else {
        setPurchaseStatus(() => () => error instanceof Error ? localizeMessage(error.message) : t("Não foi possível iniciar a compra na {{store}}.", "Couldn't start the purchase in {{store}}.", { store: storeName }));
      }
    } finally {
      setStoreOperationPending(false);
    }
  }

  async function restorePremium() {
    setUploadError(null);
    setPurchaseStatus(null);
    if (!canUseStore) {
      setPurchaseStatusCopy("Conectando com a {{store}}...", "Connecting to {{store}}...", { store: storeName });
      return;
    }
    setPurchaseStatusCopy("Buscando compras anteriores na {{store}}...", "Looking for previous purchases in {{store}}...", { store: storeName });
    setStoreOperationPending(true);
    try {
      await restorePurchases();
      setPurchaseStatusCopy("Busca concluída. Se houver uma compra compatível, o app validará os dados com a loja.", "Search complete. If a compatible purchase is found, the app will verify it with the store.");
    } catch (error) {
      setPurchaseStatus(() => () => error instanceof ApiError ? error.message : error instanceof Error ? localizeMessage(error.message) : t("Não foi possível consultar compras na {{store}}.", "Couldn't check purchases in {{store}}.", { store: storeName }));
    } finally {
      setStoreOperationPending(false);
    }
  }

  async function pickPdf() {
    const selectedType = await ensureUploadAllowed();
    if (!selectedType) return;
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: "application/pdf" });
    if (result.canceled) return;
    const asset = result.assets[0];
    uploadMutation.mutate({ uri: asset.uri, name: asset.name || "partitura.pdf", type: asset.mimeType || "application/pdf", scoreType: selectedType });
  }

  async function pickImage() {
    const selectedType = await ensureUploadAllowed();
    if (!selectedType) return;
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 });
    if (result.canceled) return;
    const asset = result.assets[0];
    const capture = {
      uri: asset.uri,
      name: asset.fileName || "partitura.jpg",
      type: asset.mimeType || "image/jpeg",
      scoreType: selectedType,
      pageCount: 1,
      pages: [{ uri: asset.uri, width: asset.width, height: asset.height }]
    };
    setPendingCapture(capture);
    pendingCaptureRef.current = capture;
  }

  async function scanWithCamera() {
    await cameraOperation.run(async () => {
      if (uploadMutation.isPending) return;
      const selectedType = await ensureUploadAllowed();
      if (!mountedRef.current || !selectedType) return;
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

      const capture = { ...result.document, scoreType: selectedType };
      setPendingCapture(capture);
      pendingCaptureRef.current = capture;
    });
  }

  function closePaywall() {
    setPaywallVisible(false);
    if (paywall === "1") router.setParams({ paywall: undefined });
  }

  function confirmCaptureUpload() {
    if (!pendingCapture || uploadMutation.isPending) return;
    setUploadError(null);
    const warnings = pendingCapture.type === "application/pdf" ? [] : imageQualityWarnings(pendingCapture.pages[0], t);
    if (warnings.length) {
      Alert.alert(t("Revisar imagem", "Review image"), `${warnings.join(" ")} ${t("Envie mesmo assim ou escolha outra imagem?", "Upload anyway or choose another image?")}`, [
        { text: t("Refazer", "Retake"), style: "cancel" },
        {
          text: t("Enviar", "Upload"),
          onPress: () => {
            uploadMutation.mutate({
              uri: pendingCapture.uri,
              name: pendingCapture.name,
              type: pendingCapture.type,
              scoreType: pendingCapture.scoreType
            });
          }
        }
      ]);
      return;
    }
    uploadMutation.mutate({
      uri: pendingCapture.uri,
      name: pendingCapture.name,
      type: pendingCapture.type,
      scoreType: pendingCapture.scoreType
    });
  }

  function discardCapture() {
    const scanId = pendingCaptureRef.current?.scanId;
    pendingCaptureRef.current = null;
    setPendingCapture(null);
    void releaseScannedDocument(scanId);
  }

  async function refresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([scoresQuery.refetch(), entitlementQuery.refetch()]);
    } finally {
      setIsRefreshing(false);
    }
  }

  const scores = scoresQuery.data?.scores ?? [];
  const visibleScores = favoritesOnly ? scores.filter((score) => score.isFavorite) : scores;
  const selectedCount = selectedIds.size;
  const allSelected = visibleScores.length > 0 && visibleScores.every((score) => selectedIds.has(score.id));

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(visibleScores.map((score) => score.id)));
  }

  function confirmDelete(ids: string[]) {
    if (!ids.length || deleteMutation.isPending) return;
    Alert.alert(
      t("Mover para a lixeira?", "Move to Trash?"),
      ids.length === 1
        ? t("Esta partitura ficará disponível para restauração por 7 dias. Depois, será excluída permanentemente.", "This score will be available for restoration for 7 days, then permanently deleted.")
        : t("{{count}} partituras ficarão disponíveis para restauração por 7 dias. Depois, serão excluídas permanentemente.", "{{count}} scores will be available for restoration for 7 days, then permanently deleted.", { count: ids.length }),
      [
        { text: t("Cancelar", "Cancel"), style: "cancel" },
        { text: t("Mover para a lixeira", "Move to Trash"), style: "destructive", onPress: () => deleteMutation.mutate(ids) }
      ]
    );
  }

  function toggleFavorite(score: Score) {
    if (favoriteMutation.isPending) return;
    favoriteMutation.mutate({ id: score.id, isFavorite: !score.isFavorite });
  }

  async function favoriteSelected() {
    if (!selectedCount || favoriteMutation.isPending || !token) return;
    try {
      await api.bulkScores(token, Array.from(selectedIds), "favorite", true);
      await queryClient.invalidateQueries({ queryKey: ["scores"] });
    } catch (error) {
      Alert.alert(t("Não foi possível favoritar", "Couldn't add to favorites"), error instanceof Error ? error.message : t("Tente novamente.", "Please try again."));
    }
  }

  return (
    <AdaptiveScreen title={favoritesOnly ? t("Favoritas", "Favorites") : t("Partituras", "Scores")}>
      <FlatList
        contentContainerStyle={[styles.scoreListContent, selectionMode && styles.scoreListContentWithSelection]}
        data={visibleScores}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            <View style={styles.scoreHeaderRow}>
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={sharedStyles.subtitle}>{user?.name} · {subtitle}</Text>
              </View>
              <Pressable
                accessibilityLabel={selectionMode ? t("Sair da seleção", "Exit selection") : t("Selecionar partituras", "Select scores")}
                accessibilityRole="button"
                onPress={selectionMode ? exitSelectionMode : () => setSelectionMode(true)}
                style={[styles.selectButton, selectionMode && styles.selectButtonActive]}
              >
                <Ionicons color={selectionMode ? colors.primary : colors.ink} name={selectionMode ? "close" : "checkmark-circle-outline"} size={18} />
                <Text style={[styles.selectButtonText, selectionMode && styles.selectButtonTextActive]}>{selectionMode ? t("Cancelar", "Cancel") : t("Selecionar", "Select")}</Text>
              </Pressable>
            </View>

            {selectionMode ? (
              <View style={styles.selectionHint}>
                <Text style={styles.selectionHintText}>{selectedCount ? selectedCount === 1 ? t("{{count}} selecionada", "{{count}} selected", { count: selectedCount }) : t("{{count}} selecionadas", "{{count}} selected", { count: selectedCount }) : t("Toque nas partituras para selecionar", "Tap scores to select them")}</Text>
                <Pressable accessibilityLabel={allSelected ? t("Limpar seleção", "Clear selection") : t("Selecionar todas", "Select all")} onPress={toggleSelectAll} style={styles.selectAllAction}>
                  <Text style={styles.selectAllText}>{allSelected ? t("Limpar", "Clear") : t("Selecionar todas", "Select all")}</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={sharedStyles.panel}>
              <ScoreTypePicker onChange={setScoreType} value={scoreType} />
              <Pressable disabled={cameraBusy || uploadMutation.isPending} onPress={scanWithCamera} style={[sharedStyles.button, styles.scanButton]}>
                {cameraBusy || uploadMutation.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Ionicons color={colors.onPrimary} name="camera-outline" size={20} />}
                <Text style={sharedStyles.buttonText}>{uploadMutation.isPending ? t("Enviando...", "Uploading...") : cameraBusy ? Platform.OS === "ios" ? t("Abrindo scanner...", "Opening scanner...") : t("Abrindo câmera...", "Opening camera...") : t("Escanear partitura", "Scan score")}</Text>
              </Pressable>
              <View style={styles.uploadChoices}>
                <Pressable disabled={cameraBusy || uploadMutation.isPending} onPress={pickPdf} style={[sharedStyles.button, sharedStyles.buttonSecondary, { flex: 1 }]}>
                  <Ionicons color={colors.ink} name="document-outline" size={18} />
                  <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary]}>PDF</Text>
                </Pressable>
                <Pressable disabled={cameraBusy || uploadMutation.isPending} onPress={pickImage} style={[sharedStyles.button, sharedStyles.buttonSecondary, { flex: 1 }]}>
                  <Ionicons color={colors.ink} name="image-outline" size={18} />
                  <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary]}>{t("Foto", "Photo")}</Text>
                </Pressable>
              </View>
              {uploadMutation.isPending ? <ActivityIndicator color={colors.primary} /> : null}
              {uploadError ? <Text style={sharedStyles.error}>{uploadError()}</Text> : null}
            </View>
          </View>
        }
        ListEmptyComponent={!scoresQuery.isLoading ? favoritesOnly ? (
          <View style={styles.emptyFavorites}>
            <Ionicons color={colors.primaryDark} name="heart-outline" size={30} />
            <Text style={styles.emptyFavoritesTitle}>{t("Suas favoritas aparecem aqui", "Your favorites will appear here")}</Text>
            <Text style={sharedStyles.subtitle}>{t("Marque uma partitura com o coração para encontrá-la rapidamente.", "Mark a score with the heart to find it quickly.")}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.replace("/scores")} style={styles.emptyFavoritesAction}>
              <Text style={styles.selectAllText}>{t("Ver todas as partituras", "View all scores")}</Text>
            </Pressable>
          </View>
        ) : <Text style={sharedStyles.subtitle}>{t("Nenhuma partitura enviada ainda.", "No scores uploaded yet.")}</Text> : null}
        refreshControl={<RefreshControl onRefresh={refresh} refreshing={isRefreshing} />}
        renderItem={({ item }) => (
          <ScoreRow
            onDelete={() => confirmDelete([item.id])}
            onPress={() => {
              if (selectionMode) toggleSelection(item.id); else router.push(`/score/${item.id}`);
            }}
            onToggleFavorite={() => toggleFavorite(item)}
            onToggleSelection={() => toggleSelection(item.id)}
            selectable={selectionMode}
            selected={selectedIds.has(item.id)}
            score={item}
          />
        )}
      />

      {selectionMode ? (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionBarLabel}>{selectedCount === 1 ? t("{{count}} selecionada", "{{count}} selected", { count: selectedCount }) : t("{{count}} selecionadas", "{{count}} selected", { count: selectedCount })}</Text>
          <View style={styles.selectionBarActions}>
            <Pressable accessibilityLabel={t("Favoritar selecionadas", "Add selected to favorites")} disabled={!selectedCount || favoriteMutation.isPending} onPress={favoriteSelected} style={styles.selectionAction}>
              <Ionicons color={selectedCount ? colors.primary : colors.muted} name="heart-outline" size={19} />
              <Text style={[styles.selectionActionText, !selectedCount && styles.selectionDisabled]}>{t("Favoritar", "Favorite")}</Text>
            </Pressable>
            <Pressable accessibilityLabel={t("Mover selecionadas para a lixeira", "Move selected to Trash")} disabled={!selectedCount || deleteMutation.isPending} onPress={() => confirmDelete(Array.from(selectedIds))} style={styles.selectionAction}>
              <Ionicons color={selectedCount ? colors.danger : colors.muted} name="trash-outline" size={19} />
              <Text style={[styles.selectionActionText, selectedCount ? styles.deleteActionText : styles.selectionDisabled]}>{t("Excluir", "Delete")}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Modal animationType="slide" onRequestClose={closePaywall} transparent visible={paywallVisible}>
        <AdaptiveScreen navigation={false}>
          <View style={styles.paywallBackdrop}>
            <ScrollView contentContainerStyle={styles.paywallContent} style={styles.paywallPanel}>
              <Text style={{ color: colors.ink, fontSize: 22, fontWeight: "700" }}>{t("Conversões ilimitadas", "Unlimited conversions")}</Text>
            <Text style={sharedStyles.subtitle}>{!entitlement ? t("Verificando o plano desta conta...", "Checking this account's plan...") : hasUnlimitedConversions ? t("As conversões ilimitadas já estão ativas nesta conta.", "Unlimited conversions are already active on this account.") : t("Desbloqueie conversões ilimitadas para esta conta.", "Unlock unlimited conversions for this account.")}</Text>
            {!hasUnlimitedConversions && purchaseOffer.state === "disconnected" ? <Text style={styles.offerMessage}>{t("Aguardando conexão com a {{store}}.", "Waiting to connect to {{store}}.", { store: storeName })}</Text> : null}
            {!hasUnlimitedConversions && purchaseOffer.state === "loading" ? <Text style={styles.offerMessage}>{t("Consultando o produto e o preço na {{store}}...", "Checking the product and price in {{store}}...", { store: storeName })}</Text> : null}
            {!hasUnlimitedConversions && purchaseOffer.state === "failed" ? <Text style={sharedStyles.error}>{t("Não foi possível consultar o preço na loja.", "Couldn't check the price in the store.")}</Text> : null}
            {!hasUnlimitedConversions && purchaseOffer.state === "unavailable" ? <Text style={sharedStyles.error}>{t("A loja não informou preço para este produto. A compra ficará indisponível até que o cadastro na loja esteja completo.", "The store hasn't provided a price for this product. Purchases will be unavailable until the store listing is complete.")}</Text> : null}
            {!hasUnlimitedConversions && purchaseOffer.state === "pending" ? <Text style={styles.offerMessage}>{t("Compra em andamento na {{store}}.", "Purchase in progress in {{store}}.", { store: storeName })}</Text> : null}
            {!hasUnlimitedConversions && (purchaseOffer.state === "failed" || purchaseOffer.state === "unavailable") ? (
              <Pressable accessibilityRole="button" disabled={!connected || storeOperationPending} onPress={() => void loadPremiumProduct()} style={[sharedStyles.button, sharedStyles.buttonSecondary, styles.offerRetry]}>
                <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary]}>{t("Consultar preço novamente", "Check price again")}</Text>
              </Pressable>
            ) : null}
            {purchaseStatus ? <Text style={sharedStyles.subtitle}>{purchaseStatus()}</Text> : null}
            <Pressable accessibilityRole="button" disabled={!canBuyPremium} onPress={buyPremium} style={[sharedStyles.button, !canBuyPremium && styles.offerDisabled]}>
              {purchaseOffer.state === "pending" ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={sharedStyles.buttonText}>{hasUnlimitedConversions ? t("Conversões ilimitadas ativas", "Unlimited conversions active") : !entitlement ? t("Verificando sua conta...", "Checking your account...") : purchaseOffer.displayPrice ? t("Desbloquear {{price}}", "Unlock {{price}}", { price: purchaseOffer.displayPrice }) : t("Preço indisponível", "Price unavailable")}</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" disabled={!connected || purchaseMutation.isPending || storeOperationPending} onPress={restorePremium} style={[sharedStyles.button, sharedStyles.buttonSecondary, (!connected || storeOperationPending) && styles.offerDisabled]}>
              <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary]}>{t("Restaurar compra", "Restore purchase")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={closePaywall} style={[sharedStyles.button, sharedStyles.buttonSecondary]}>
              <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary]}>{t("Agora não", "Not now")}</Text>
            </Pressable>
            </ScrollView>
          </View>
        </AdaptiveScreen>
      </Modal>

      <DocumentReviewModal
        busy={uploadMutation.isPending}
        capture={pendingCapture}
        error={uploadError?.() ?? null}
        onCancel={discardCapture}
        onConfirm={confirmCaptureUpload}
      />
    </AdaptiveScreen>
  );
}

function ScoreRow({
  onDelete,
  onPress,
  onToggleFavorite,
  onToggleSelection,
  selectable,
  selected,
  score
}: {
  onDelete: () => void;
  onPress: () => void;
  onToggleFavorite: () => void;
  onToggleSelection: () => void;
  selectable: boolean;
  selected: boolean;
  score: Score;
}) {
  const { t, language } = useTranslation();
  const translateX = useRef(new Animated.Value(0)).current;
  const [actionsOpen, setActionsOpen] = useState(false);
  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_, gesture) => {
      const next = actionsOpen ? Math.min(0, -154 + gesture.dx) : Math.min(0, gesture.dx);
      translateX.setValue(Math.max(-154, next));
    },
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx < -45) {
        setActionsOpen(true);
        Animated.timing(translateX, { duration: 180, toValue: -154, useNativeDriver: true }).start();
      } else if (gesture.dx > 35) {
        setActionsOpen(false);
        Animated.timing(translateX, { duration: 180, toValue: 0, useNativeDriver: true }).start();
      } else {
        Animated.timing(translateX, { duration: 140, toValue: actionsOpen ? -154 : 0, useNativeDriver: true }).start();
      }
    }
  })).current;

  function handlePress() {
    if (actionsOpen) {
      setActionsOpen(false);
      Animated.timing(translateX, { duration: 180, toValue: 0, useNativeDriver: true }).start();
      return;
    }
    onPress();
  }

  return (
    <View style={styles.swipeShell}>
      <View accessibilityElementsHidden={!actionsOpen} style={styles.swipeActions}>
        <Pressable accessibilityLabel={score.isFavorite ? t("Desmarcar favorita", "Remove from favorites") : t("Marcar como favorita", "Add to favorites")} onPress={onToggleFavorite} style={styles.swipeActionButton}>
          <Ionicons color={colors.primary} name={score.isFavorite ? "heart" : "heart-outline"} size={21} />
          <Text style={styles.swipeActionLabel}>{t("Favorito", "Favorite")}</Text>
        </Pressable>
        <Pressable accessibilityLabel={t("Mover para a lixeira", "Move to Trash")} onPress={onDelete} style={[styles.swipeActionButton, styles.swipeDeleteButton]}>
          <Ionicons color={colors.danger} name="trash-outline" size={21} />
          <Text style={[styles.swipeActionLabel, styles.deleteActionText]}>{t("Excluir", "Delete")}</Text>
        </Pressable>
      </View>
      <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX }] }}>
        <Pressable accessibilityHint={t("Deslize para a esquerda para mostrar favorito e excluir", "Swipe left to show favorite and delete actions")} accessibilityRole="button" onPress={handlePress} style={[sharedStyles.panel, styles.scoreRow, selected && styles.scoreRowSelected]}>
          <View style={styles.scoreRowContent}>
            {selectable ? (
              <Pressable accessibilityLabel={selected ? t("Desmarcar partitura", "Deselect score") : t("Selecionar partitura", "Select score")} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} hitSlop={8} onPress={onToggleSelection} onPressIn={(event) => event.stopPropagation()} style={[styles.checkbox, selected && styles.checkboxSelected]}>
                {selected ? <Ionicons color={colors.onPrimary} name="checkmark" size={15} /> : null}
              </Pressable>
            ) : null}
            <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
              <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}>{score.originalFilename}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>{formatBytes(score.fileSize)} · {new Date(score.createdAt).toLocaleDateString(getLocale())}</Text>
              <ScoreConversionProgress language={language} score={score} />
            </View>
            <View style={styles.scoreRowTrailing}>
              <StatusBadge status={score.conversionStatus} resultStatus={score.resultStatus} recognitionQuality={score.recognitionQuality} />
              <Pressable accessibilityLabel={score.isFavorite ? t("Desmarcar favorita", "Remove from favorites") : t("Marcar como favorita", "Add to favorites")} accessibilityRole="button" hitSlop={8} onPress={onToggleFavorite} onPressIn={(event) => event.stopPropagation()} style={styles.heartButton}>
                <Ionicons color={score.isFavorite ? colors.primary : colors.muted} name={score.isFavorite ? "heart" : "heart-outline"} size={22} />
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  checkbox: {
    alignItems: "center",
    borderColor: colors.lineStrong,
    borderRadius: 7,
    borderWidth: 1.5,
    height: 25,
    justifyContent: "center",
    width: 25
  },
  checkboxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  deleteActionText: { color: colors.danger },
  emptyFavorites: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    marginTop: 12,
    maxWidth: 520,
    padding: 22,
    width: "100%"
  },
  emptyFavoritesAction: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44
  },
  emptyFavoritesTitle: { color: colors.ink, fontSize: 17, fontWeight: "800", textAlign: "center" },
  heartButton: { alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 44 },
  offerDisabled: { opacity: 0.55 },
  offerMessage: { color: colors.warning, fontSize: 14, lineHeight: 20 },
  offerRetry: { minHeight: 48 },
  paywallBackdrop: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.35)", flex: 1, justifyContent: "flex-end" },
  paywallPanel: { alignSelf: "center", backgroundColor: colors.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "92%", maxWidth: 560, width: "100%" },
  paywallContent: { gap: 14, padding: 20 },
  scoreListContent: { alignSelf: "center", gap: 14, maxWidth: 900, padding: 20, paddingBottom: 24, width: "100%" },
  scoreListContentWithSelection: { paddingBottom: 100 },
  scoreHeaderRow: { alignItems: "flex-start", flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" },
  scoreRow: { minHeight: 106, padding: 14 },
  scoreRowContent: { alignItems: "flex-start", flexDirection: "row", flexWrap: "wrap", gap: 10 },
  scoreRowSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  scoreRowTrailing: { alignItems: "flex-end", gap: 4 },
  selectAllText: { color: colors.primary, fontSize: 13, fontWeight: "800" },
  selectAllAction: { justifyContent: "center", minHeight: 44, paddingHorizontal: 4 },
  selectButton: { alignItems: "center", borderColor: colors.lineStrong, borderRadius: 12, borderWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 5, justifyContent: "center", minHeight: 44, paddingHorizontal: 11 },
  selectButtonActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  selectButtonText: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  selectButtonTextActive: { color: colors.primary },
  selectionAction: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 5, minHeight: 44, paddingHorizontal: 8 },
  selectionActionText: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  selectionBar: { alignItems: "center", backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 18, borderWidth: 1, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", left: 12, paddingHorizontal: 10, paddingVertical: 6, position: "absolute", right: 12, bottom: 8, shadowColor: "#4c2e22", shadowOpacity: 0.12, shadowRadius: 18 },
  selectionBarActions: { flexDirection: "row", flexWrap: "wrap" },
  selectionBarLabel: { color: colors.ink, flex: 1, fontSize: 13, fontWeight: "800", paddingLeft: 6 },
  selectionDisabled: { color: colors.muted },
  selectionHint: { alignItems: "flex-start", backgroundColor: colors.primarySoft, borderRadius: 12, flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10 },
  scanButton: { flexWrap: "wrap" },
  uploadChoices: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  selectionHintText: { color: colors.muted, flex: 1, fontSize: 13 },
  swipeActionButton: { alignItems: "center", backgroundColor: colors.primarySoft, gap: 3, justifyContent: "center", width: 76 },
  swipeActionLabel: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  swipeActions: { alignItems: "stretch", borderRadius: 18, flexDirection: "row", height: "100%", justifyContent: "flex-end", overflow: "hidden", position: "absolute", right: 0, top: 0, width: 154 },
  swipeDeleteButton: { backgroundColor: "#fbecea" },
  swipeShell: { overflow: "hidden" }
});

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}

function imageQualityWarnings(image: { width?: number; height?: number }, t: Translate) {
  const warnings: string[] = [];
  if ((image.width && image.width < 1200) || (image.height && image.height < 1200)) {
    warnings.push(t("A imagem pode ter pouca resolução para OMR.", "The image may be too low-resolution for OMR."));
  }
  if (image.width && image.height) {
    const ratio = Math.max(image.width, image.height) / Math.min(image.width, image.height);
    if (ratio > 2.4) warnings.push(t("O recorte parece muito estreito para uma página de partitura.", "The crop looks too narrow for a score page."));
  }
  return warnings;
}

function getOriginalTransactionId(purchase: Purchase) {
  if ("originalTransactionIdentifierIOS" in purchase && purchase.originalTransactionIdentifierIOS) {
    return purchase.originalTransactionIdentifierIOS;
  }
  return purchase.transactionId || purchase.purchaseToken || purchase.id;
}

function purchaseErrorMessage(error: unknown, t: Translate): DeferredMessage {
  const kind = classifyIapPurchaseError(error);
  if (kind === "cancelled") return () => t("Compra cancelada.", "Purchase canceled.");
  if (kind === "deferred") return () => t("Compra pendente de aprovação.", "Purchase pending approval.");
  const message = error && typeof error === "object" && "message" in error ? error.message : undefined;
  return typeof message === "string" && message ? () => localizeMessage(message) : () => t("Falha na compra.", "Purchase failed.");
}

function purchaseOfferUnavailableMessage(state: PurchaseOfferState, storeName: string, t: Translate): DeferredMessage {
  if (state === "disconnected") return () => t("Aguardando conexão com a {{store}}.", "Waiting to connect to {{store}}.", { store: storeName });
  if (state === "loading") return () => t("Consultando o produto na {{store}}.", "Checking the product in {{store}}.", { store: storeName });
  if (state === "failed") return () => t("Não foi possível consultar o produto na {{store}}.", "Couldn't check the product in {{store}}.", { store: storeName });
  if (state === "unavailable") return () => t("O produto ou o preço não está disponível na {{store}}.", "The product or price isn't available in {{store}}.", { store: storeName });
  if (state === "pending") return () => t("Já existe uma compra em andamento.", "A purchase is already in progress.");
  return () => t("O preço informado pela loja não está disponível.", "The price provided by the store isn't available.");
}
