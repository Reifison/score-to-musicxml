import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AdaptiveText as Text, AdaptiveTextInput as TextInput } from "../src/adaptive/AdaptiveTypography";
import { ApiError } from "../src/api/client";
import { useAuth } from "../src/auth/AuthProvider";
import { AdaptiveScreen } from "../src/components/AdaptiveScreen";
import { BrandLockup } from "../src/components/BrandLockup";
import { useTranslation } from "../src/i18n";
import { colors } from "../src/theme/styles";

export default function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace("/scores");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdaptiveScreen navigation={false}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <BrandLockup />
            <Text style={styles.intro}>{t("Entre para converter e acompanhar suas partituras.", "Sign in to convert and keep track of your scores.")}</Text>

            <View style={styles.field}>
              <Text style={styles.label}>{t("E-mail", "Email")}</Text>
              <TextInput
                accessibilityLabel={t("E-mail", "Email")}
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                inputMode="email"
                keyboardType="email-address"
                onChangeText={(value) => setEmail(value.trim())}
                textContentType="username"
                style={styles.input}
                value={email}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t("Senha", "Password")}</Text>
              <TextInput
                accessibilityLabel={t("Senha", "Password")}
                autoCapitalize="none"
                autoComplete="password"
                autoCorrect={false}
                onChangeText={setPassword}
                secureTextEntry
                style={styles.input}
                textContentType="password"
                value={password}
              />
            </View>

            {error ? <Text style={styles.error}>{error instanceof ApiError ? error.message : t("Não foi possível entrar.", "Couldn't sign in.")}</Text> : null}

            <Pressable disabled={busy || !email || !password} onPress={submit} style={[styles.button, (busy || !email || !password) && styles.buttonDisabled]}>
              {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>{t("Entrar", "Sign in")}</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AdaptiveScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.surface,
    flex: 1
  },
  scrollContent: {
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "center",
    padding: 24
  },
  card: {
    alignSelf: "center",
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    gap: 20,
    maxWidth: 420,
    marginVertical: 12,
    padding: 30,
    shadowColor: "#4c2e22",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.1,
    shadowRadius: 34,
    width: "100%"
  },
  intro: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 2
  },
  field: {
    gap: 7
  },
  label: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  input: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 58,
    paddingHorizontal: 18
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 14,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 58,
    paddingHorizontal: 14
  },
  buttonDisabled: {
    opacity: 0.45
  },
  buttonText: {
    color: colors.onPrimary,
    fontSize: 17,
    fontWeight: "800"
  },
  error: {
    color: colors.danger,
    fontSize: 13
  }
});
