import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { api } from "../src/api/client";
import type { AuditLog, PublicUser } from "../src/api/types";
import { useAuth } from "../src/auth/AuthProvider";
import { BottomNav, bottomNavHeight } from "../src/components/BottomNav";
import { colors, sharedStyles } from "../src/theme/styles";

export default function LogsScreen() {
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
      <View style={sharedStyles.screen}>
        <View style={[sharedStyles.content, styles.center]}>
          <Ionicons color={colors.faint} name="lock-closed-outline" size={38} />
          <Text style={sharedStyles.title}>Logs</Text>
          <Text style={sharedStyles.subtitle}>Esta area esta disponivel apenas para administradores.</Text>
        </View>
        <BottomNav />
      </View>
    );
  }

  const usersById = new Map((usersQuery.data?.users ?? []).map((item) => [item.id, item]));

  async function refresh() {
    await Promise.all([auditsQuery.refetch(), usersQuery.refetch()]);
  }

  return (
    <View style={sharedStyles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={auditsQuery.data?.audits ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={sharedStyles.title}>Logs</Text>
            <Text style={sharedStyles.subtitle}>Eventos administrativos e operacionais do sistema.</Text>
          </View>
        }
        ListEmptyComponent={
          auditsQuery.isLoading ? <ActivityIndicator color={colors.primary} /> : <Text style={sharedStyles.subtitle}>Nenhum log encontrado.</Text>
        }
        refreshControl={<RefreshControl onRefresh={refresh} refreshing={auditsQuery.isFetching || usersQuery.isFetching} />}
        renderItem={({ item }) => <AuditRow audit={item} actor={item.actorId ? usersById.get(item.actorId) : undefined} />}
      />
      <BottomNav />
    </View>
  );
}

function AuditRow({ actor, audit }: { actor?: PublicUser; audit: AuditLog }) {
  return (
    <View style={sharedStyles.panel}>
      <View style={styles.rowTop}>
        <View style={styles.iconCircle}>
          <Ionicons color={colors.primaryDark} name="shield-checkmark-outline" size={18} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={1} style={styles.action}>{audit.action}</Text>
          <Text numberOfLines={1} style={sharedStyles.subtitle}>{actor ? `${actor.name} · ${actor.email}` : "Usuario nao identificado"}</Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>Entidade: {audit.entity ?? "-"}</Text>
        <Text style={styles.meta}>Data: {new Date(audit.createdAt).toLocaleString()}</Text>
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
    paddingBottom: bottomNavHeight + 24
  },
  content: {
    gap: 14,
    padding: 20,
    paddingBottom: bottomNavHeight + 24
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
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  }
});
