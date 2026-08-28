import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { api } from "../src/api/client";
import type { PublicUser } from "../src/api/types";
import { useAuth } from "../src/auth/AuthProvider";
import { BottomNav, bottomNavHeight } from "../src/components/BottomNav";
import { colors, sharedStyles } from "../src/theme/styles";

export default function UsersScreen() {
  const { token, user } = useAuth();
  const isAdmin = user?.role === "admin";

  const usersQuery = useQuery({
    queryKey: ["admin-users", user?.id],
    queryFn: () => api.users(token!),
    enabled: Boolean(token && isAdmin)
  });

  if (!user || !token) return <Redirect href="/login" />;

  if (!isAdmin) {
    return (
      <View style={sharedStyles.screen}>
        <View style={[sharedStyles.content, styles.center]}>
          <Ionicons color={colors.faint} name="lock-closed-outline" size={38} />
          <Text style={sharedStyles.title}>Usuarios</Text>
          <Text style={sharedStyles.subtitle}>Esta area esta disponivel apenas para administradores.</Text>
        </View>
        <BottomNav />
      </View>
    );
  }

  return (
    <View style={sharedStyles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={usersQuery.data?.users ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={sharedStyles.title}>Usuarios</Text>
            <Text style={sharedStyles.subtitle}>Consulta segura dos usuarios cadastrados.</Text>
          </View>
        }
        ListEmptyComponent={
          usersQuery.isLoading ? <ActivityIndicator color={colors.primary} /> : <Text style={sharedStyles.subtitle}>Nenhum usuario encontrado.</Text>
        }
        refreshControl={<RefreshControl onRefresh={() => void usersQuery.refetch()} refreshing={usersQuery.isFetching} />}
        renderItem={({ item }) => <UserRow user={item} />}
      />
      <BottomNav />
    </View>
  );
}

function UserRow({ user }: { user: PublicUser }) {
  return (
    <View style={sharedStyles.panel}>
      <View style={styles.rowTop}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={1} style={styles.name}>{user.name}</Text>
          <Text numberOfLines={1} style={sharedStyles.subtitle}>{user.email}</Text>
        </View>
        <View style={[styles.badge, user.isActive ? styles.activeBadge : styles.inactiveBadge]}>
          <Text style={[styles.badgeText, user.isActive ? styles.activeText : styles.inactiveText]}>{user.isActive ? "Ativo" : "Inativo"}</Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>Perfil: {user.role === "admin" ? "Admin" : "Usuario"}</Text>
        <Text style={styles.meta}>Criado: {new Date(user.createdAt).toLocaleDateString()}</Text>
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
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  }
});
