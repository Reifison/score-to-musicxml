import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { AdaptiveText as Text } from "../src/adaptive/AdaptiveTypography";
import { api } from "../src/api/client";
import type { PublicUser } from "../src/api/types";
import { useAuth } from "../src/auth/AuthProvider";
import { AdaptiveScreen } from "../src/components/AdaptiveScreen";
import { getLocale, useTranslation } from "../src/i18n";
import { colors, sharedStyles } from "../src/theme/styles";

export default function UsersScreen() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const isAdmin = user?.role === "admin";

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.users(token!),
    enabled: Boolean(token && isAdmin)
  });

  if (!user || !token) return <Redirect href="/login" />;

  if (!isAdmin) {
    return (
      <AdaptiveScreen title={t("Usuários", "Users")}>
        <View style={[sharedStyles.content, styles.center]}>
          <Ionicons color={colors.faint} name="lock-closed-outline" size={38} />
          <Text style={sharedStyles.subtitle}>{t("Esta área está disponível apenas para administradores.", "This area is available to administrators only.")}</Text>
        </View>
      </AdaptiveScreen>
    );
  }

  return (
    <AdaptiveScreen title={t("Usuários", "Users")}>
      <FlatList
        contentContainerStyle={styles.content}
        data={usersQuery.data?.users ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={sharedStyles.subtitle}>{t("Consulta segura dos usuários cadastrados.", "Secure view of registered users.")}</Text>
          </View>
        }
        ListEmptyComponent={
          usersQuery.isLoading ? <ActivityIndicator color={colors.primary} /> : <Text style={sharedStyles.subtitle}>{t("Nenhum usuário encontrado.", "No users found.")}</Text>
        }
        refreshControl={<RefreshControl onRefresh={() => void usersQuery.refetch()} refreshing={usersQuery.isFetching} />}
        renderItem={({ item }) => <UserRow user={item} />}
      />
    </AdaptiveScreen>
  );
}

function UserRow({ user }: { user: PublicUser }) {
  const { t } = useTranslation();
  return (
    <View style={sharedStyles.panel}>
      <View style={styles.rowTop}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={sharedStyles.subtitle}>{user.email}</Text>
        </View>
        <View style={[styles.badge, user.isActive ? styles.activeBadge : styles.inactiveBadge]}>
          <Text style={[styles.badgeText, user.isActive ? styles.activeText : styles.inactiveText]}>{user.isActive ? t("Ativo", "Active") : t("Inativo", "Inactive")}</Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>{t("Perfil", "Role")}: {user.role === "admin" ? t("Admin", "Administrator") : t("Usuário", "User")}</Text>
        <Text style={styles.meta}>{t("Criado", "Created")}: {new Date(user.createdAt).toLocaleDateString(getLocale())}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  activeBadge: {
    backgroundColor: colors.primarySoft
  },
  activeText: {
    color: colors.primaryDark
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  badgeText: {
    fontSize: 12,
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
  inactiveBadge: {
    backgroundColor: "#fff1f0"
  },
  inactiveText: {
    color: colors.danger
  },
  meta: {
    color: colors.muted,
    fontSize: 12
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  name: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800"
  },
  rowTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  }
});
