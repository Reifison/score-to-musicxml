import { Ionicons } from "@expo/vector-icons";
import { Redirect, router } from "expo-router";
import type { ComponentProps } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useAuth } from "../src/auth/AuthProvider";
import { colors, sharedStyles } from "../src/theme/styles";

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
    <ScrollView contentContainerStyle={{ gap: 22, padding: 20, paddingTop: 28 }} style={sharedStyles.screen}>
      <View style={{ gap: 6 }}>
        <Text style={sharedStyles.title}>converter Partitura</Text>
        <Text style={sharedStyles.subtitle}>{user.name} · {isAdmin ? "Admin" : "Usuario"}</Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {actions.map((action) => (
          <Pressable key={action.label} onPress={action.onPress} style={homeStyles.actionButton}>
            <View style={homeStyles.iconCircle}>
              <Ionicons color={colors.primaryDark} name={action.icon} size={28} />
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
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: "47%" as const,
    gap: 12,
    justifyContent: "center" as const,
    padding: 14
  },
  actionText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700" as const,
    textAlign: "center" as const
  },
  iconCircle: {
    alignItems: "center" as const,
    backgroundColor: "#e8f3f0",
    borderRadius: 20,
    height: 54,
    justifyContent: "center" as const,
    width: 54
  }
};
