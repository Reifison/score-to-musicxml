import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { AdaptiveText as Text } from "../src/adaptive/AdaptiveTypography";
import { ApiError, api } from "../src/api/client";
import type { Score } from "../src/api/types";
import { useAuth } from "../src/auth/AuthProvider";
import { AdaptiveScreen } from "../src/components/AdaptiveScreen";
import { useTranslation } from "../src/i18n";
import { colors, sharedStyles } from "../src/theme/styles";

type TrashScore = Score & {
  deletedAt?: string | null;
  purgeAt?: string | null;
  expiresAt?: string | null;
  deletionExpiresAt?: string | null;
};

export default function TrashScreen() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const trashQuery = useQuery({
    queryKey: ["trash-scores"],
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
        ? t("Esta partitura já não está na lixeira.", "This score is no longer in Trash.")
        : error instanceof Error ? error.message : t("Tente novamente.", "Please try again.");
      Alert.alert(t("Não foi possível restaurar", "Couldn't restore"), message);
    }
  });

  const scores = (trashQuery.data?.scores ?? []) as TrashScore[];

  function restore(score: TrashScore) {
    if (restoreMutation.isPending) return;
    Alert.alert(t("Restaurar partitura?", "Restore score?"), t("“{{filename}}” voltará para Minhas partituras.", "“{{filename}}” will return to My scores.", { filename: score.originalFilename }), [
      { text: t("Cancelar", "Cancel"), style: "cancel" },
      { text: t("Restaurar", "Restore"), onPress: () => restoreMutation.mutate(score.id) }
    ]);
  }

  return (
    <AdaptiveScreen title={t("Lixeira", "Trash")} back>
      <FlatList
        contentContainerStyle={styles.content}
        data={scores}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <Text style={sharedStyles.subtitle}>{t("As partituras ficam aqui por 7 dias antes da exclusão permanente.", "Scores stay here for 7 days before permanent deletion.")}</Text>
        }
        ListEmptyComponent={!trashQuery.isLoading ? <EmptyTrash /> : null}
        refreshControl={<RefreshControl onRefresh={() => trashQuery.refetch()} refreshing={trashQuery.isFetching} />}
        renderItem={({ item }) => <TrashRow onRestore={() => restore(item)} restoring={restoreMutation.isPending && restoreMutation.variables === item.id} score={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />
    </AdaptiveScreen>
  );
}

function EmptyTrash() {
  const { t } = useTranslation();
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons color={colors.muted} name="trash-outline" size={30} /></View>
      <Text style={styles.emptyTitle}>{t("A lixeira está vazia", "Trash is empty")}</Text>
      <Text style={styles.emptyText}>{t("Partituras excluídas durante os próximos 7 dias aparecerão aqui.", "Scores deleted within the last 7 days will appear here.")}</Text>
    </View>
  );
}

function TrashRow({ onRestore, restoring, score }: { onRestore: () => void; restoring: boolean; score: TrashScore }) {
  const { t } = useTranslation();
  const expiration = score.expiresAt ?? score.purgeAt ?? score.deletionExpiresAt;
  const days = expiration ? Math.max(0, Math.ceil((new Date(expiration).getTime() - Date.now()) / 86_400_000)) : null;
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}><Ionicons color={colors.muted} name="document-text-outline" size={23} /></View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{score.originalFilename}</Text>
        <Text style={styles.rowMeta}>{days === null ? t("Disponível por 7 dias", "Available for 7 days") : days === 0 ? t("Exclusão em breve", "Deletion soon") : days === 1 ? t("Exclusão em 1 dia", "Deletion in 1 day") : t("Exclusão em {{days}} dias", "Deletion in {{days}} days", { days })}</Text>
      </View>
      <Pressable accessibilityLabel={t("Restaurar {{filename}}", "Restore {{filename}}", { filename: score.originalFilename })} disabled={restoring} onPress={onRestore} style={styles.restoreButton}>
        {restoring ? <ActivityIndicator color={colors.primary} size="small" /> : <Ionicons color={colors.primary} name="arrow-undo-outline" size={20} />}
        <Text style={styles.restoreText}>{t("Restaurar", "Restore")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 20, paddingBottom: 24 },
  empty: { alignItems: "center", backgroundColor: colors.surfaceSoft, borderRadius: 18, gap: 8, marginTop: 24, padding: 28 },
  emptyIcon: { alignItems: "center", backgroundColor: colors.panel, borderRadius: 28, height: 56, justifyContent: "center", width: 56 },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, maxWidth: 290, textAlign: "center" },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  restoreButton: { alignItems: "center", gap: 2, justifyContent: "center", minHeight: 52, minWidth: 88, paddingHorizontal: 8 },
  restoreText: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  row: { alignItems: "flex-start", backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 18, borderWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 11, padding: 13 },
  rowCopy: { flex: 1, gap: 5, minWidth: 140 },
  rowIcon: { alignItems: "center", backgroundColor: colors.surfaceSoft, borderRadius: 12, height: 44, justifyContent: "center", width: 44 },
  rowMeta: { color: colors.muted, fontSize: 12 },
  rowTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" }
});
