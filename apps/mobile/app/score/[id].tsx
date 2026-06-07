import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useAuth } from "../../src/auth/AuthProvider";
import { StatusBadge } from "../../src/components/StatusBadge";
import { useScoreStatus } from "../../src/hooks/useScoreStatus";
import { colors, sharedStyles } from "../../src/theme/styles";

export default function ScoreProcessingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const scoreQuery = useScoreStatus(token, id);
  const score = scoreQuery.data?.score;
  const status = score?.conversionStatus;

  useEffect(() => {
    if (score?.conversionStatus === "converted") {
      router.replace(`/score-view/${score.id}`);
    }
  }, [score?.conversionStatus, score?.id]);

  if (scoreQuery.isLoading || !score) {
    return (
      <View style={[sharedStyles.screen, { alignItems: "center", justifyContent: "center", padding: 24 }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (status === "failed") {
    return (
      <View style={[sharedStyles.screen, { justifyContent: "center", padding: 20 }]}>
        <View style={[sharedStyles.panel, { alignItems: "center", gap: 16 }]}>
          <Ionicons color={colors.danger} name="alert-circle-outline" size={44} />
          <View style={{ alignItems: "center", gap: 8 }}>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700", textAlign: "center" }}>Nao foi possivel ler a partitura</Text>
            <Text style={[sharedStyles.subtitle, { textAlign: "center" }]}>
              A imagem pode estar ilegivel para o reconhecimento musical. Tente escanear novamente com a folha bem iluminada, sem sombras e com as bordas completas.
            </Text>
          </View>
          {score.errorMessage ? <Text style={[sharedStyles.error, { textAlign: "center" }]}>{score.errorMessage}</Text> : null}
          <Pressable onPress={() => router.replace("/scores?scan=1")} style={sharedStyles.button}>
            <Ionicons color="#fff" name="camera-outline" size={20} />
            <Text style={sharedStyles.buttonText}>Tentar Novamente</Text>
          </Pressable>
          <Pressable onPress={() => router.replace("/scores")} style={[sharedStyles.button, sharedStyles.buttonOutline]}>
            <Ionicons color={colors.text} name="arrow-back-outline" size={20} />
            <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextOutline]}>Voltar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[sharedStyles.screen, { justifyContent: "center", padding: 20 }]}>
      <View style={[sharedStyles.panel, { alignItems: "center", gap: 16 }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <View style={{ alignItems: "center", gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700", textAlign: "center" }}>Lendo as notas musicais...</Text>
          <Text style={[sharedStyles.subtitle, { textAlign: "center" }]}>Isso pode levar alguns segundos. A tela atualiza automaticamente quando o MusicXML estiver pronto.</Text>
        </View>
        <StatusBadge status={status ?? "processing"} />
        <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center" }}>{score.originalFilename}</Text>
        <Pressable onPress={() => router.replace("/scores")} style={[sharedStyles.button, sharedStyles.buttonOutline]}>
          <Ionicons color={colors.text} name="arrow-back-outline" size={20} />
          <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextOutline]}>Voltar</Text>
        </Pressable>
      </View>
    </View>
  );
}
