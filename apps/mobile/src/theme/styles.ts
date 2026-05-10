import { StyleSheet } from "react-native";

export const colors = {
  ink: "#202124",
  muted: "#687076",
  line: "#d8dee4",
  surface: "#f7f8f8",
  panel: "#ffffff",
  primary: "#146c5f",
  primaryDark: "#0f4f46",
  danger: "#b42318",
  warning: "#9a6700",
  success: "#207044"
};

export const sharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface
  },
  content: {
    flex: 1,
    padding: 20,
    gap: 16
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "700"
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21
  },
  panel: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12
  },
  input: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14
  },
  buttonSecondary: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700"
  },
  buttonTextSecondary: {
    color: colors.ink
  },
  error: {
    color: colors.danger,
    fontSize: 14
  }
});
