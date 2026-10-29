import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { AdaptiveText as Text, AdaptiveTextInput as TextInput } from "../src/adaptive/AdaptiveTypography";
import { api } from "../src/api/client";
import { useAuth } from "../src/auth/AuthProvider";
import { AdaptiveScreen } from "../src/components/AdaptiveScreen";
import { useTranslation } from "../src/i18n";
import { colors, sharedStyles } from "../src/theme/styles";

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const [password, setPassword] = useState("");
  const [passwordUpdated, setPasswordUpdated] = useState(false);

  const passwordMutation = useMutation({
    mutationFn: () => api.updatePassword(token!, password),
    onSuccess: () => {
      setPassword("");
      setPasswordUpdated(true);
    },
    onError: () => setPasswordUpdated(false)
  });

  const error = passwordMutation.error instanceof Error ? passwordMutation.error.message : null;

  return (
    <AdaptiveScreen title={t("Perfil", "Profile")} back>
      <ScrollView contentContainerStyle={[sharedStyles.content, profileStyles.content]}>
        <Text style={sharedStyles.subtitle}>{t("Dados da sua conta no Conversor de Partituras.", "Your Score Converter account details.")}</Text>

        <View style={sharedStyles.panel}>
          <Text style={profileStyles.label}>{t("Nome", "Name")}</Text>
          <Text accessibilityLabel={`${t("Nome", "Name")}: ${user?.name ?? ""}`} selectable style={[sharedStyles.input, profileStyles.value]}>{user?.name ?? ""}</Text>

          <Text style={profileStyles.label}>{t("E-mail", "Email")}</Text>
          <Text accessibilityLabel={`${t("E-mail", "Email")}: ${user?.email ?? ""}`} selectable style={[sharedStyles.input, profileStyles.value]}>{user?.email ?? ""}</Text>

          <Text style={profileStyles.label}>{t("Nova senha", "New password")}</Text>
          <TextInput
            accessibilityLabel={t("Nova senha", "New password")}
            onChangeText={setPassword}
            placeholder={t("Mínimo de 8 caracteres", "At least 8 characters")}
            secureTextEntry
            style={sharedStyles.input}
            value={password}
          />

          <Pressable
            disabled={!token || password.length < 8 || passwordMutation.isPending}
            onPress={() => passwordMutation.mutate()}
            style={[sharedStyles.button, (!token || password.length < 8 || passwordMutation.isPending) && profileStyles.disabled]}
          >
            {passwordMutation.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={sharedStyles.buttonText}>{t("Salvar senha", "Save password")}</Text>}
          </Pressable>

          {passwordUpdated ? <Text style={{ color: colors.success }}>{t("Senha atualizada.", "Password updated.")}</Text> : null}
          {error ? <Text style={sharedStyles.error}>{error}</Text> : null}
        </View>
      </ScrollView>
    </AdaptiveScreen>
  );
}

const profileStyles = {
  content: {
    alignSelf: "center" as const,
    maxWidth: 680,
    paddingBottom: 24,
    width: "100%" as const
  },
  disabled: {
    opacity: 0.55
  },
  value: {
    paddingVertical: 12
  },
  label: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700" as const
  }
};
