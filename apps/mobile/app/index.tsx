import { Ionicons } from "@expo/vector-icons";
import { Redirect, router } from "expo-router";
import type { ComponentProps } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useAuth } from "../src/auth/AuthProvider";
import { colors, radius, sharedStyles } from "../src/theme/styles";

type HomeAction = {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  adminOnly?: boolean;
};

export default function IndexScreen() {
  const { loading, logout, user } = useAuth();

  if (loading) {
    return (
      <View style={{ alignItems: "center", flex: 1, justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;

  const isAdmin = user.role === "admin";
  const allActions: HomeAction[] = [
    { icon: "musical-notes-outline", label: "Partituras", onPress: () => router.push("/scores") },
    { icon: "person-outline", label: "Perfil", onPress: () => router.push("/profile") },
    { icon: "people-outline", label: "Usuarios", adminOnly: true, onPress: unavailableAdminAction },
    { icon: "shield-checkmark-outline", label: "Todas", adminOnly: true, onPress: unavailableAdminAction },
    { icon: "reader-outline", label: "Logs", adminOnly: true, onPress: unavailableAdminAction },
    { icon: "log-out-outline", label: "Sair", onPress: logout }
  ];
  const actions = allActions.filter((action) => !action.adminOnly || isAdmin);

  return (
    <ScrollView contentContainerStyle={{ gap: 24, padding: 24, paddingTop: 32 }} style={sharedStyles.screen}>
      <View style={{ gap: 6 }}>
        <Text style={sharedStyles.title}>converter Partitura</Text>
        <Text style={sharedStyles.subtitle}>{user.name} · {isAdmin ? "Admin" : "Usuario"}</Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {actions.map((action) => (
          <Pressable key={action.label} onPress={action.onPress} style={homeStyles.actionButton}>
            <View style={homeStyles.iconCircle}>
              <Ionicons color={colors.primary} name={action.icon} size={28} />
            </View>
            <Text numberOfLines={2} style={homeStyles.actionText}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function unavailableAdminAction() {
  Alert.alert("Ainda nao disponivel no iPhone", "Esta area administrativa ainda esta disponivel apenas no desktop.");
}

const homeStyles = {
  actionButton: {
    alignItems: "center" as const,
    aspectRatio: 1,
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    flexBasis: "47%" as const,
    gap: 12,
    justifyContent: "center" as const,
    padding: 16,
    shadowColor: "#2F2A33",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
    elevation: 4
  },
  actionText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700" as const,
    textAlign: "center" as const
  },
  iconCircle: {
    alignItems: "center" as const,
    backgroundColor: "#E6F9F5",
    borderRadius: radius.pill,
    height: 56,
    justifyContent: "center" as const,
    width: 56
  }
};
