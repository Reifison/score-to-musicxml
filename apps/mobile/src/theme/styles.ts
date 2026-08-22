import { StyleSheet } from "react-native";

export const colors = {
  ink: "#3c332f",
  muted: "#766963",
  faint: "#7a6d66",
  line: "#e5ddd5",
  lineStrong: "#d6cbc1",
  surface: "#faf8f4",
  surfaceSoft: "#f3efe9",
  panel: "#fffdf9",
  primary: "#c64225",
  primaryDark: "#a83220",
  primarySoft: "#fff0e7",
  accentGold: "#d9992f",
  accentCoral: "#d96a54",
  accentBlue: "#4d7d91",
  danger: "#b73d32",
  warning: "#a96513",
  success: "#277a57",
  onPrimary: "#fffaf5"
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
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: "#4c2e22",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    padding: 16,
    gap: 12
  },
  input: {
    backgroundColor: colors.panel,
    borderColor: colors.lineStrong,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 18
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 14,
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
    color: colors.onPrimary,
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
