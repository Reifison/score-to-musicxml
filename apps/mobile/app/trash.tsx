import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ApiError, api } from "../src/api/client";
import type { Score } from "../src/api/types";
import { useAuth } from "../src/auth/AuthProvider";
import { BottomNav, bottomNavHeight } from "../src/components/BottomNav";
import { colors, sharedStyles } from "../src/theme/styles";

type TrashScore = Score & {
  deletedAt?: string | null;
  purgeAt?: string | null;
  expiresAt?: string | null;
  deletionExpiresAt?: string | null;
};

export default function TrashScreen() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const trashQuery = useQuery({
    queryKey: ["trash-scores", user?.id],
    queryFn: () => api.trashScores(token!),
    enabled: Boolean(token)
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.restoreScore(token!, id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trash-scores"] }),
        queryClient.invalidateQueries({ queryKey: ["scores"] })
      ]);
    },
    onError: (error) => {
      const message = error instanceof ApiError && error.code === "SCORE_NOT_IN_TRASH"
        ? "Esta partitura já não está na lixeira."
        : error instanceof Error ? error.message : "Tente novamente.";
      Alert.alert("Não foi possível restaurar", message);
    }
  });

  const scores = (trashQuery.data?.scores ?? []) as TrashScore[];

  function restore(score: TrashScore) {
    if (restoreMutation.isPending) return;
    Alert.alert("Restaurar partitura?", `“${score.originalFilename}” voltará para Minhas partituras.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Restaurar", onPress: () => restoreMutation.mutate(score.id) }
    ]);
  }

  return (
    <View style={sharedStyles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={scores}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Pressable accessibilityLabel="Voltar" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={styles.backButton}>
              <Ionicons color={colors.ink} name="arrow-back" size={22} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={sharedStyles.title}>Lixeira</Text>
              <Text style={sharedStyles.subtitle}>As partituras ficam aqui por 7 dias antes da exclusão permanente.</Text>
            </View>
          </View>
        }
        ListEmptyComponent={!trashQuery.isLoading ? <EmptyTrash /> : null}
        refreshControl={<RefreshControl onRefresh={() => trashQuery.refetch()} refreshing={trashQuery.isFetching} />}
        renderItem={({ item }) => <TrashRow onRestore={() => restore(item)} restoring={restoreMutation.isPending && restoreMutation.variables === item.id} score={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />
      <BottomNav />
    </View>
  );
}

function EmptyTrash() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons color={colors.muted} name="trash-outline" size={30} /></View>
      <Text style={styles.emptyTitle}>A lixeira está vazia</Text>
      <Text style={styles.emptyText}>Partituras excluídas durante os próximos 7 dias aparecerão aqui.</Text>
    </View>
  );
}

function TrashRow({ onRestore, restoring, score }: { onRestore: () => void; restoring: boolean; score: TrashScore }) {
  const expiration = score.expiresAt ?? score.purgeAt ?? score.deletionExpiresAt;
  const days = expiration ? Math.max(0, Math.ceil((new Date(expiration).getTime() - Date.now()) / 86_400_000)) : null;
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}><Ionicons color={colors.muted} name="document-text-outline" size={23} /></View>
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>{score.originalFilename}</Text>
        <Text style={styles.rowMeta}>{days === null ? "Disponível por 7 dias" : days === 0 ? "Exclusão em breve" : `Exclusão em ${days} ${days === 1 ? "dia" : "dias"}`}</Text>
      </View>
      <Pressable accessibilityLabel={`Restaurar ${score.originalFilename}`} disabled={restoring} onPress={onRestore} style={styles.restoreButton}>
        {restoring ? <ActivityIndicator color={colors.primary} size="small" /> : <Ionicons color={colors.primary} name="arrow-undo-outline" size={20} />}
        <Text style={styles.restoreText}>Restaurar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: { alignItems: "center", minHeight: 44, minWidth: 44, justifyContent: "center" },
  content: { gap: 14, padding: 20, paddingBottom: bottomNavHeight + 24 },
  empty: { alignItems: "center", backgroundColor: colors.surfaceSoft, borderRadius: 18, gap: 8, marginTop: 24, padding: 28 },
  emptyIcon: { alignItems: "center", backgroundColor: colors.panel, borderRadius: 28, height: 56, justifyContent: "center", width: 56 },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, maxWidth: 290, textAlign: "center" },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  header: { alignItems: "flex-start", flexDirection: "row", gap: 6, marginBottom: 8 },
  headerCopy: { flex: 1, gap: 6 },
  restoreButton: { alignItems: "center", gap: 2, justifyContent: "center", minHeight: 52, minWidth: 64, paddingHorizontal: 4 },
  restoreText: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  row: { alignItems: "center", backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 18, borderWidth: 1, flexDirection: "row", gap: 11, padding: 13 },
  rowCopy: { flex: 1, gap: 5 },
  rowIcon: { alignItems: "center", backgroundColor: colors.surfaceSoft, borderRadius: 12, height: 44, justifyContent: "center", width: 44 },
  rowMeta: { color: colors.muted, fontSize: 12 },
  rowTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" }
});
