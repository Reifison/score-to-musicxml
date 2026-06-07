import { Platform, StyleSheet } from "react-native";

export const colors = {
  text: "#2F2A33",
  ink: "#2F2A33",
  muted: "#8D98A7",
  line: "#E8EDF3",
  background: "#F6F8FB",
  surface: "#F6F8FB",
  panel: "#FFFFFF",
  primary: "#44CFB7",
  primaryLight: "#82D5CF",
  primaryDark: "#2FA896",
  secondary: "#9282CE",
  accentWarm: "#EB9937",
  accentCoral: "#D3988D",
  info: "#1983AD",
  danger: "#C23A3A",
  warning: "#EB9937",
  success: "#44CFB7"
};

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  xl: 32,
  pill: 999
};

export const cardShadow = Platform.select({
  ios: {
    shadowColor: "#2F2A33",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 30
  },
  android: {
    elevation: 4
  },
  default: {}
});

export const sharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    flex: 1,
    padding: space.lg,
    gap: space.md
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700"
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 21
  },
  panel: {
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm + 4,
    ...cardShadow
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 44,
    paddingHorizontal: space.md
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: space.sm,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: space.lg
  },
  buttonSecondary: {
    backgroundColor: colors.secondary
  },
  buttonOutline: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700"
  },
  buttonTextSecondary: {
    color: "#FFFFFF"
  },
  buttonTextOutline: {
    color: colors.text
  },
  error: {
    color: colors.danger,
    fontSize: 14
  }
});
