import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { AdaptiveText as Text } from "../src/adaptive/AdaptiveTypography";
import { api } from "../src/api/client";
import type { AuditLog, PublicUser } from "../src/api/types";
import { useAuth } from "../src/auth/AuthProvider";
import { AdaptiveScreen } from "../src/components/AdaptiveScreen";
import { getLocale, useTranslation } from "../src/i18n";
import { auditActionLabel, auditEntityLabel } from "../src/score/auditPresentation";
import { colors, sharedStyles } from "../src/theme/styles";

export default function LogsScreen() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const isAdmin = user?.role === "admin";

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.users(token!),
    enabled: Boolean(token && isAdmin)
  });

  const auditsQuery = useQuery({
    queryKey: ["admin-audits"],
    queryFn: () => api.audits(token!),
    enabled: Boolean(token && isAdmin)
  });

  if (!user || !token) return <Redirect href="/login" />;

  if (!isAdmin) {
    return (
      <AdaptiveScreen title={t("Logs", "Logs")}>
        <View style={[sharedStyles.content, styles.center]}>
          <Ionicons color={colors.faint} name="lock-closed-outline" size={38} />
          <Text style={sharedStyles.subtitle}>{t("Esta área está disponível apenas para administradores.", "This area is available to administrators only.")}</Text>
        </View>
      </AdaptiveScreen>
    );
  }

  const usersById = new Map((usersQuery.data?.users ?? []).map((item) => [item.id, item]));

  async function refresh() {
    await Promise.all([auditsQuery.refetch(), usersQuery.refetch()]);
  }

  return (
    <AdaptiveScreen title={t("Logs", "Logs")}>
      <FlatList
        contentContainerStyle={styles.content}
        data={auditsQuery.data?.audits ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={sharedStyles.subtitle}>{t("Eventos administrativos e operacionais do sistema.", "Administrative and operational system events.")}</Text>
          </View>
        }
        ListEmptyComponent={
          auditsQuery.isLoading ? <ActivityIndicator color={colors.primary} /> : <Text style={sharedStyles.subtitle}>{t("Nenhum log encontrado.", "No logs found.")}</Text>
        }
        refreshControl={<RefreshControl onRefresh={refresh} refreshing={auditsQuery.isFetching || usersQuery.isFetching} />}
        renderItem={({ item }) => <AuditRow audit={item} actor={item.actorId ? usersById.get(item.actorId) : undefined} />}
      />
    </AdaptiveScreen>
  );
}

function AuditRow({ actor, audit }: { actor?: PublicUser; audit: AuditLog }) {
  const { t } = useTranslation();
  return (
    <View style={sharedStyles.panel}>
      <View style={styles.rowTop}>
        <View style={styles.iconCircle}>
          <Ionicons color={colors.primaryDark} name="shield-checkmark-outline" size={18} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.action}>{auditActionLabel(audit.action)}</Text>
          <Text style={sharedStyles.subtitle}>{actor ? `${actor.name} · ${actor.email}` : t("Usuário não identificado", "Unknown user")}</Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>{t("Entidade", "Entity")}: {auditEntityLabel(audit.entity)}</Text>
        <Text style={styles.meta}>{t("Data", "Date")}: {new Date(audit.createdAt).toLocaleString(getLocale())}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 24
  },
  content: {
    gap: 14,
    padding: 20,
    paddingBottom: 24
  },
  header: {
    gap: 6
  },
  iconCircle: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  meta: {
    color: colors.muted,
    fontSize: 12
  },
  metaRow: {
    gap: 5
  },
  rowTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  }
});
