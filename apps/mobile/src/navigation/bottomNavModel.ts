import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import type { Role } from "../api/types";

export type BottomNavItem = {
  key: "home" | "scores" | "profile" | "users" | "logs";
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  href: "/" | "/scores" | "/profile" | "/users" | "/logs";
};

export function bottomNavItemsForRole(role: Role | null | undefined): BottomNavItem[] {
  return [
    { key: "home", icon: "home-outline", label: "Início", href: "/" },
    { key: "scores", icon: "musical-notes-outline", label: "Partituras", href: "/scores" },
    { key: "profile", icon: "person-outline", label: "Perfil", href: "/profile" },
    ...(role === "admin"
      ? [
          { key: "users" as const, icon: "people-outline" as const, label: "Usuários", href: "/users" as const },
          { key: "logs" as const, icon: "shield-outline" as const, label: "Logs", href: "/logs" as const }
        ]
      : [])
  ];
}

export function activeBottomNavKey(pathname: string): BottomNavItem["key"] | "" {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/score") || pathname.startsWith("/scores")) return "scores";
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/users")) return "users";
  if (pathname.startsWith("/logs")) return "logs";
  return "";
}
