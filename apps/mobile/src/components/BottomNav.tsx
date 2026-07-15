import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import type { ComponentProps } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/AuthProvider";
import { colors } from "../theme/styles";

export const bottomNavHeight = 92;

type NavItem = {
  key: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
};

export function BottomNav() {
  const pathname = usePathname();
  const { logout, user } = useAuth();
  const isAdmin = user?.role === "admin";

  const items: NavItem[] = [
    { key: "home", icon: "home-outline", label: "Inicio", onPress: () => router.replace("/") },
    { key: "scores", icon: "musical-notes-outline", label: "Partituras", onPress: () => router.push("/scores") },
    { key: "profile", icon: "person-outline", label: "Perfil", onPress: () => router.push("/profile") },
    ...(isAdmin
      ? [
          { key: "users", icon: "people-outline" as const, label: "Usuarios", onPress: () => router.push("/users") },
          { key: "logs", icon: "shield-outline" as const, label: "Logs", onPress: () => router.push("/logs") }
        ]
      : []),
    {
      key: "logout",
      icon: "log-out-outline",
      label: "Sair",
      onPress: () => {
        void logout().finally(() => router.replace("/login"));
      }
    }
  ];

  const activeKey = pathname === "/" ? "home" : pathname.startsWith("/score") || pathname.startsWith("/scores") ? "scores" : pathname.startsWith("/profile") ? "profile" : pathname.startsWith("/users") ? "users" : pathname.startsWith("/logs") ? "logs" : "";

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <Pressable key={item.key} onPress={item.onPress} style={[styles.item, active && styles.itemActive]}>
              <Ionicons color={active ? colors.primaryDark : colors.faint} name={item.icon} size={23} />
              <Text numberOfLines={1} style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 254, 0.98)",
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 4,
    justifyContent: "space-around",
    paddingBottom: Platform.OS === "ios" ? 18 : 10,
    paddingHorizontal: 8,
    paddingTop: 8,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.12,
    shadowRadius: 24
  },
  item: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: 24,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    justifyContent: "center",
    minHeight: 62,
    minWidth: 0,
    paddingHorizontal: 3
  },
  itemActive: {
    backgroundColor: colors.primarySoft,
    borderColor: "#bdeee5"
  },
  label: {
    color: colors.faint,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    textAlign: "center"
  },
  labelActive: {
    color: colors.primaryDark
  },
  wrap: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 20
  }
});
