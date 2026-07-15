import { StyleSheet } from "react-native";

export const colors = {
  ink: "#2f2a38",
  muted: "#6f7782",
  faint: "#98a2b3",
  line: "#e4eaf2",
  lineStrong: "#d7e0ea",
  surface: "#f4f7fb",
  surfaceSoft: "#f7f9fc",
  panel: "#fffffe",
  primary: "#48c9b9",
  primaryDark: "#12856f",
  primarySoft: "#e1faf6",
  danger: "#c23a3a",
  warning: "#a15c06",
  success: "#12856f"
};

export const sharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface
  },
  content: {
    flexGrow: 1,
    padding: 24,
    gap: 18
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 34
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19
  },
  panel: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    padding: 16,
    gap: 12
  },
  input: {
    backgroundColor: colors.panel,
    borderColor: colors.lineStrong,
    borderRadius: 999,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 18
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 999,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 18
  },
  buttonSecondary: {
    backgroundColor: colors.panel,
    borderColor: colors.lineStrong,
    borderWidth: 1
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800"
  },
  buttonTextSecondary: {
    color: colors.ink
  },
  error: {
    color: colors.danger,
    fontSize: 14
  }
});
