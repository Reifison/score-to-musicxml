import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError } from "../src/api/client";
import { useAuth } from "../src/auth/AuthProvider";
import { BrandLockup } from "../src/components/BrandLockup";
import { colors } from "../src/theme/styles";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace("/scores");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Nao foi possivel entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <View style={styles.card}>
        <BrandLockup />
        <Text style={styles.intro}>Entre para converter e acompanhar suas partituras.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>E-mail</Text>
          <TextInput
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
          <Text style={styles.label}>Senha</Text>
            <TextInput
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

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable disabled={busy || !email || !password} onPress={submit} style={[styles.button, (busy || !email || !password) && styles.buttonDisabled]}>
          {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>Entrar</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    backgroundColor: colors.surface,
    flex: 1,
    justifyContent: "center",
    padding: 24
  },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    gap: 20,
    maxWidth: 420,
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
