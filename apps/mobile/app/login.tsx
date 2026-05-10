import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { ApiError, API_URL, api } from "../src/api/client";
import { useAuth } from "../src/auth/AuthProvider";
import { colors, sharedStyles } from "../src/theme/styles";

const loginBuild = "login-fix-2026-05-10-2";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<"checking" | "ok" | "failed">("checking");

  useEffect(() => {
    api.health()
      .then(() => setHealth("ok"))
      .catch(() => setHealth("failed"));
  }, []);

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
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={sharedStyles.screen}>
      <View style={[sharedStyles.content, { justifyContent: "center" }]}>
        <View style={{ gap: 8 }}>
          <Text style={sharedStyles.title}>Score to MusicXML</Text>
          <Text style={sharedStyles.subtitle}>Entre para escanear partituras e exportar MusicXML.</Text>
        </View>

        <View style={sharedStyles.panel}>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            inputMode="email"
            keyboardType="email-address"
            onChangeText={(value) => setEmail(value.trim())}
            placeholder="E-mail"
            textContentType="username"
            style={sharedStyles.input}
            value={email}
          />
          <View style={{ gap: 8 }}>
            <TextInput
              autoCapitalize="none"
              autoComplete="password"
              autoCorrect={false}
              onChangeText={setPassword}
              placeholder="Senha"
              secureTextEntry={!showPassword}
              style={sharedStyles.input}
              textContentType="password"
              value={password}
            />
            <Pressable
              onPress={() => setShowPassword((visible) => !visible)}
              style={{
                alignItems: "center",
                borderColor: colors.primary,
                borderRadius: 8,
                borderWidth: 1,
                minHeight: 40,
                justifyContent: "center"
              }}
            >
              <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "700" }}>{showPassword ? "Ocultar senha" : "Mostrar senha"}</Text>
            </Pressable>
          </View>
          {error ? <Text style={sharedStyles.error}>{error}</Text> : null}
          <Pressable disabled={busy || !email || !password} onPress={submit} style={[sharedStyles.button, (busy || !email || !password) && { opacity: 0.55 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={sharedStyles.buttonText}>Entrar</Text>}
          </Pressable>
        </View>

        <Text style={{ color: health === "ok" ? colors.success : health === "failed" ? colors.danger : colors.muted, fontSize: 12, textAlign: "center" }}>
          API: {API_URL} · {health === "checking" ? "verificando" : health === "ok" ? "online" : "indisponivel"}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: "center" }}>
          Diagnostico: {API_URL}/debug/auth
        </Text>
        <Text style={{ color: colors.muted, fontSize: 11, textAlign: "center" }}>{loginBuild}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}
