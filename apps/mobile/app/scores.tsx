import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useIAP } from "expo-iap";
import type { Purchase } from "expo-iap";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, FlatList, Image, Modal, PanResponder, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ApiError, api } from "../src/api/client";
import type { Score } from "../src/api/types";
import { useAuth } from "../src/auth/AuthProvider";
import { BottomNav, bottomNavHeight } from "../src/components/BottomNav";
import { StatusBadge } from "../src/components/StatusBadge";
import { colors, sharedStyles } from "../src/theme/styles";

const premiumProductId = "premium_unlock";
const premiumProductIds = [premiumProductId];

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
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ uri: string; name: string; type: string; width?: number; height?: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [purchaseStatus, setPurchaseStatus] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const processedPurchases = useRef(new Set<string>());

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
      setPurchaseStatus(purchaseErrorMessage(error));
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
    queryKey: ["scores"],
    queryFn: () => api.scores(token!),
    enabled: Boolean(token),
    refetchInterval: (query) => {
      const scores = query.state.data?.scores ?? [];
      return scores.some((score) => score.conversionStatus === "queued" || score.conversionStatus === "processing") ? 3000 : false;
    }
  });

  const favoriteMutation = useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) => api.setScoreFavorite(token!, id, isFavorite),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["scores"] });
    },
    onError: (error) => Alert.alert("Não foi possível atualizar", error instanceof Error ? error.message : "Tente novamente.")
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
    onError: (error) => Alert.alert("Não foi possível mover para a lixeira", error instanceof Error ? error.message : "Tente novamente.")
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
    mutationFn: (purchase: PurchaseRegistration) => {
      if (isAndroid) {
        if (!purchase.purchaseToken) throw new Error("A compra Google não forneceu um token válido.");
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
    onError: (error) => setUploadError(error instanceof Error ? error.message : "Falha ao desbloquear.")
  });

  const premiumProduct = products.find((product) => product.id === premiumProductId);
  const premiumPrice = premiumProduct?.displayPrice ?? "R$ 29,90";
  const canUseStore = connected;

  useEffect(() => {
    if (connected) {
      void fetchProducts({ skus: premiumProductIds, type: "in-app" });
    }
  }, [connected, fetchProducts]);

  useEffect(() => {
    const restored = availablePurchases.find((purchase) => purchase.productId === premiumProductId);
    if (restored) void completeStorePurchase(restored, true);
  }, [availablePurchases]);

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

  async function completeStorePurchase(purchase: Purchase, restored: boolean) {
    if (!token || purchase.productId !== premiumProductId) return;
    const purchaseKey = purchase.purchaseToken || purchase.transactionId || purchase.id;
    if (processedPurchases.current.has(purchaseKey)) return;
    processedPurchases.current.add(purchaseKey);

    setPurchaseStatus(restored ? "Restaurando compra..." : "Validando compra...");
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
      setPurchaseStatus(restored ? "Compra restaurada." : "Compra concluida.");
    } catch (error) {
      processedPurchases.current.delete(purchaseKey);
      setPurchaseStatus(error instanceof Error ? error.message : "Falha ao validar compra.");
    }
  }

  async function buyPremium() {
    setUploadError(null);
    setPurchaseStatus(null);
    if (!canUseStore) {
      setPurchaseStatus(`Conectando com a ${storeName}...`);
      return;
    }
    setPurchaseStatus(`Abrindo ${storeName}...`);
    if (!token) return;
    const { binding } = await api.purchaseBinding(token);
    await requestPurchase({
      type: "in-app",
      request: isAndroid
        ? { google: { skus: premiumProductIds, obfuscatedAccountId: binding.googleObfuscatedAccountId } }
        : { apple: { sku: premiumProductId, appAccountToken: binding.appleAppAccountToken } }
    });
  }

  async function restorePremium() {
    setUploadError(null);
    setPurchaseStatus(null);
    if (!canUseStore) {
      setPurchaseStatus(`Conectando com a ${storeName}...`);
      return;
    }
    setPurchaseStatus(`Buscando compras anteriores na ${storeName}...`);
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
    setPendingImage({ uri: asset.uri, name: asset.fileName || "partitura.jpg", type: asset.mimeType || "image/jpeg", width: asset.width, height: asset.height });
  }

  async function scanWithCamera() {
    if (!(await ensureUploadAllowed())) return;
    const proceed = await new Promise<boolean>((resolve) => {
      Alert.alert("Escanear partitura", "Use o modo documento/scan quando o aparelho oferecer essa opcao. Mantenha a folha reta, bem iluminada, sem sombras e ocupando quase toda a tela.", [
        { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
        { text: "Abrir camera", onPress: () => resolve(true) }
      ]);
    });
    if (!proceed) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera indisponivel", "Autorize o uso da camera para escanear partituras.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, cameraType: ImagePicker.CameraType.back, quality: 0.9 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setPendingImage({ uri: asset.uri, name: asset.fileName || "scan.jpg", type: asset.mimeType || "image/jpeg", width: asset.width, height: asset.height });
  }

  function confirmImageUpload() {
    if (!pendingImage) return;
    const warnings = imageQualityWarnings(pendingImage);
    if (warnings.length) {
      Alert.alert("Revisar foto", `${warnings.join(" ")} Envie mesmo assim ou refaca a foto/recorte?`, [
        { text: "Refazer", style: "cancel" },
        {
          text: "Enviar",
          onPress: () => {
            uploadMutation.mutate(pendingImage);
            setPendingImage(null);
          }
        }
      ]);
      return;
    }
    uploadMutation.mutate(pendingImage);
    setPendingImage(null);
  }

  async function refresh() {
    await Promise.all([scoresQuery.refetch(), entitlementQuery.refetch()]);
  }

  const scores = scoresQuery.data?.scores ?? [];
  const selectedCount = selectedIds.size;
  const allSelected = scores.length > 0 && scores.every((score) => selectedIds.has(score.id));

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
    setSelectedIds(allSelected ? new Set() : new Set(scores.map((score) => score.id)));
  }

  function confirmDelete(ids: string[]) {
    if (!ids.length || deleteMutation.isPending) return;
    const label = ids.length === 1 ? "esta partitura" : `${ids.length} partituras`;
    Alert.alert(
      "Mover para a lixeira?",
      `${label} ficará disponível para restauração por 7 dias. Depois, será excluída permanentemente.`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Mover para a lixeira", style: "destructive", onPress: () => deleteMutation.mutate(ids) }
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
      Alert.alert("Não foi possível favoritar", error instanceof Error ? error.message : "Tente novamente.");
    }
  }

  return (
    <View style={sharedStyles.screen}>
      <FlatList
        contentContainerStyle={{ gap: 14, padding: 20, paddingBottom: bottomNavHeight + 24 }}
        data={scores}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            <View style={{ flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={sharedStyles.title}>Partituras</Text>
                <Text style={sharedStyles.subtitle}>{user?.name} · {subtitle}</Text>
              </View>
              <Pressable
                accessibilityLabel={selectionMode ? "Sair da seleção" : "Selecionar partituras"}
                accessibilityRole="button"
                onPress={selectionMode ? exitSelectionMode : () => setSelectionMode(true)}
                style={[styles.selectButton, selectionMode && styles.selectButtonActive]}
              >
                <Ionicons color={selectionMode ? colors.primary : colors.ink} name={selectionMode ? "close" : "checkmark-circle-outline"} size={18} />
                <Text style={[styles.selectButtonText, selectionMode && styles.selectButtonTextActive]}>{selectionMode ? "Cancelar" : "Selecionar"}</Text>
              </Pressable>
            </View>

            {selectionMode ? (
              <View style={styles.selectionHint}>
                <Text style={styles.selectionHintText}>{selectedCount ? `${selectedCount} selecionada${selectedCount === 1 ? "" : "s"}` : "Toque nas partituras para selecionar"}</Text>
                <Pressable accessibilityLabel={allSelected ? "Limpar seleção" : "Selecionar todas"} onPress={toggleSelectAll}>
                  <Text style={styles.selectAllText}>{allSelected ? "Limpar" : "Selecionar todas"}</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={sharedStyles.panel}>
              <Pressable disabled={uploadMutation.isPending} onPress={scanWithCamera} style={sharedStyles.button}>
                <Ionicons color={colors.onPrimary} name="camera-outline" size={20} />
                <Text style={sharedStyles.buttonText}>Escanear partitura</Text>
              </Pressable>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable disabled={uploadMutation.isPending} onPress={pickPdf} style={[sharedStyles.button, sharedStyles.buttonSecondary, { flex: 1 }]}>
                  <Ionicons color={colors.ink} name="document-outline" size={18} />
                  <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary]}>PDF</Text>
                </Pressable>
                <Pressable disabled={uploadMutation.isPending} onPress={pickImage} style={[sharedStyles.button, sharedStyles.buttonSecondary, { flex: 1 }]}>
                  <Ionicons color={colors.ink} name="image-outline" size={18} />
                  <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary]}>Foto</Text>
                </Pressable>
              </View>
              {uploadMutation.isPending ? <ActivityIndicator color={colors.primary} /> : null}
              {uploadError ? <Text style={sharedStyles.error}>{uploadError}</Text> : null}
            </View>
          </View>
        }
        ListEmptyComponent={!scoresQuery.isLoading ? <Text style={sharedStyles.subtitle}>Nenhuma partitura enviada ainda.</Text> : null}
        refreshControl={<RefreshControl onRefresh={refresh} refreshing={scoresQuery.isFetching || entitlementQuery.isFetching} />}
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
        <View style={[styles.selectionBar, { bottom: bottomNavHeight }]}>
          <Text style={styles.selectionBarLabel}>{selectedCount} selecionada{selectedCount === 1 ? "" : "s"}</Text>
          <View style={styles.selectionBarActions}>
            <Pressable accessibilityLabel="Favoritar selecionadas" disabled={!selectedCount || favoriteMutation.isPending} onPress={favoriteSelected} style={styles.selectionAction}>
              <Ionicons color={selectedCount ? colors.primary : colors.muted} name="heart-outline" size={19} />
              <Text style={[styles.selectionActionText, !selectedCount && styles.selectionDisabled]}>Favoritar</Text>
            </Pressable>
            <Pressable accessibilityLabel="Mover selecionadas para a lixeira" disabled={!selectedCount || deleteMutation.isPending} onPress={() => confirmDelete(Array.from(selectedIds))} style={styles.selectionAction}>
              <Ionicons color={selectedCount ? colors.danger : colors.muted} name="trash-outline" size={19} />
              <Text style={[styles.selectionActionText, selectedCount ? styles.deleteActionText : styles.selectionDisabled]}>Excluir</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Modal animationType="slide" transparent visible={paywallVisible}>
        <View style={{ backgroundColor: "rgba(0,0,0,0.35)", flex: 1, justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.panel, borderTopLeftRadius: 16, borderTopRightRadius: 16, gap: 14, padding: 20 }}>
            <Text style={{ color: colors.ink, fontSize: 22, fontWeight: "700" }}>Desbloquear scans</Text>
            <Text style={sharedStyles.subtitle}>Voce usou os 3 scans gratis. A versao paga libera novos envios nesta conta.</Text>
            {!connected ? <Text style={{ color: colors.warning }}>Conectando com a {storeName}...</Text> : null}
            {purchaseStatus ? <Text style={sharedStyles.subtitle}>{purchaseStatus}</Text> : null}
            <Pressable disabled={purchaseMutation.isPending} onPress={buyPremium} style={sharedStyles.button}>
              {purchaseMutation.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={sharedStyles.buttonText}>Desbloquear {premiumPrice}</Text>}
            </Pressable>
            <Pressable disabled={purchaseMutation.isPending} onPress={restorePremium} style={[sharedStyles.button, sharedStyles.buttonSecondary]}>
              <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary]}>Restaurar compra</Text>
            </Pressable>
            <Pressable onPress={() => setPaywallVisible(false)} style={[sharedStyles.button, sharedStyles.buttonSecondary]}>
              <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary]}>Agora nao</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" visible={Boolean(pendingImage)}>
        <View style={[sharedStyles.screen, { padding: 20, gap: 16 }]}>
          <Text style={sharedStyles.title}>Conferir foto</Text>
          <Text style={sharedStyles.subtitle}>Envie apenas se a folha estiver reta, clara, recortada e ocupando quase toda a imagem.</Text>
          {pendingImage ? <Image resizeMode="contain" source={{ uri: pendingImage.uri }} style={{ backgroundColor: colors.panel, borderRadius: 8, flex: 1, width: "100%" }} /> : null}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable onPress={() => setPendingImage(null)} style={[sharedStyles.button, sharedStyles.buttonSecondary, { flex: 1 }]}>
              <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary]}>Refazer</Text>
            </Pressable>
            <Pressable onPress={confirmImageUpload} style={[sharedStyles.button, { flex: 1 }]}>
              <Text style={sharedStyles.buttonText}>Enviar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <BottomNav />
    </View>
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
        <Pressable accessibilityLabel={score.isFavorite ? "Desmarcar favorita" : "Marcar como favorita"} onPress={onToggleFavorite} style={styles.swipeActionButton}>
          <Ionicons color={colors.primary} name={score.isFavorite ? "heart" : "heart-outline"} size={21} />
          <Text style={styles.swipeActionLabel}>Favorito</Text>
        </Pressable>
        <Pressable accessibilityLabel="Mover para a lixeira" onPress={onDelete} style={[styles.swipeActionButton, styles.swipeDeleteButton]}>
          <Ionicons color={colors.danger} name="trash-outline" size={21} />
          <Text style={[styles.swipeActionLabel, styles.deleteActionText]}>Excluir</Text>
        </Pressable>
      </View>
      <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX }] }}>
        <Pressable accessibilityHint="Deslize para a esquerda para mostrar favorito e excluir" accessibilityRole="button" onPress={handlePress} style={[sharedStyles.panel, styles.scoreRow, selected && styles.scoreRowSelected]}>
          <View style={styles.scoreRowContent}>
            {selectable ? (
              <Pressable accessibilityLabel={selected ? "Desmarcar partitura" : "Selecionar partitura"} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} hitSlop={8} onPress={onToggleSelection} onPressIn={(event) => event.stopPropagation()} style={[styles.checkbox, selected && styles.checkboxSelected]}>
                {selected ? <Ionicons color={colors.onPrimary} name="checkmark" size={15} /> : null}
              </Pressable>
            ) : null}
            <View style={{ flex: 1, gap: 6 }}>
              <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}>{score.originalFilename}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>{formatBytes(score.fileSize)} · {new Date(score.createdAt).toLocaleDateString()}</Text>
            </View>
            <View style={styles.scoreRowTrailing}>
              <StatusBadge status={score.conversionStatus} />
              <Pressable accessibilityLabel={score.isFavorite ? "Desmarcar favorita" : "Marcar como favorita"} accessibilityRole="button" hitSlop={8} onPress={onToggleFavorite} onPressIn={(event) => event.stopPropagation()} style={styles.heartButton}>
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
  heartButton: { alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 44 },
  scoreRow: { minHeight: 106, padding: 14 },
  scoreRowContent: { alignItems: "center", flexDirection: "row", gap: 10 },
  scoreRowSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  scoreRowTrailing: { alignItems: "flex-end", gap: 4 },
  selectAllText: { color: colors.primary, fontSize: 13, fontWeight: "800" },
  selectButton: { alignItems: "center", borderColor: colors.lineStrong, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 5, minHeight: 44, paddingHorizontal: 11 },
  selectButtonActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  selectButtonText: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  selectButtonTextActive: { color: colors.primary },
  selectionAction: { alignItems: "center", flexDirection: "row", gap: 5, minHeight: 44, paddingHorizontal: 8 },
  selectionActionText: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  selectionBar: { alignItems: "center", backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 18, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", left: 12, paddingHorizontal: 10, position: "absolute", right: 12, shadowColor: "#4c2e22", shadowOpacity: 0.12, shadowRadius: 18, bottom: 0 },
  selectionBarActions: { flexDirection: "row" },
  selectionBarLabel: { color: colors.ink, fontSize: 13, fontWeight: "800", paddingLeft: 6 },
  selectionDisabled: { color: colors.muted },
  selectionHint: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 12, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10 },
  selectionHintText: { color: colors.muted, flex: 1, fontSize: 13 },
  swipeActionButton: { alignItems: "center", backgroundColor: colors.primarySoft, gap: 3, justifyContent: "center", width: 76 },
  swipeActionLabel: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  swipeActions: { alignItems: "stretch", borderRadius: 18, flexDirection: "row", height: "100%", justifyContent: "flex-end", overflow: "hidden", position: "absolute", right: 0, top: 0, width: 154 },
  swipeDeleteButton: { backgroundColor: "#fbecea" },
  swipeShell: { overflow: "hidden" }
});

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function imageQualityWarnings(image: { width?: number; height?: number }) {
  const warnings: string[] = [];
  if ((image.width && image.width < 1200) || (image.height && image.height < 1200)) {
    warnings.push("A imagem pode ter pouca resolucao para OMR.");
  }
  if (image.width && image.height) {
    const ratio = Math.max(image.width, image.height) / Math.min(image.width, image.height);
    if (ratio > 2.4) warnings.push("O recorte parece muito estreito para uma pagina de partitura.");
  }
  return warnings;
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
