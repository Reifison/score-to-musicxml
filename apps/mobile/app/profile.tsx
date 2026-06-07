import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { api } from "../src/api/client";
import { useAuth } from "../src/auth/AuthProvider";
import { colors, sharedStyles } from "../src/theme/styles";

export default function ProfileScreen() {
  const { token, user } = useAuth();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const passwordMutation = useMutation({
    mutationFn: () => api.updatePassword(token!, password),
    onSuccess: () => {
      setPassword("");
      setMessage("Senha atualizada.");
    },
    onError: () => setMessage("")
  });

  const error = passwordMutation.error instanceof Error ? passwordMutation.error.message : null;

  return (
    <View style={[sharedStyles.screen, sharedStyles.content]}>
      <View style={{ gap: 6 }}>
        <Text style={sharedStyles.title}>Perfil</Text>
        <Text style={sharedStyles.subtitle}>Dados da sua conta no converter Partitura.</Text>
      </View>

      <View style={sharedStyles.panel}>
        <Text style={profileStyles.label}>Nome</Text>
        <TextInput editable={false} style={sharedStyles.input} value={user?.name ?? ""} />

        <Text style={profileStyles.label}>E-mail</Text>
        <TextInput editable={false} style={sharedStyles.input} value={user?.email ?? ""} />

        <Text style={profileStyles.label}>Nova senha</Text>
        <TextInput
          onChangeText={setPassword}
          placeholder="Minimo de 8 caracteres"
          secureTextEntry
          style={sharedStyles.input}
          value={password}
        />

        <Pressable
          disabled={!token || password.length < 8 || passwordMutation.isPending}
          onPress={() => passwordMutation.mutate()}
          style={[sharedStyles.button, (!token || password.length < 8 || passwordMutation.isPending) && profileStyles.disabled]}
        >
          {passwordMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={sharedStyles.buttonText}>Salvar senha</Text>}
        </Pressable>

        {message ? <Text style={{ color: colors.success }}>{message}</Text> : null}
        {error ? <Text style={sharedStyles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const profileStyles = {
  disabled: {
    opacity: 0.55
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700" as const
  }
};
