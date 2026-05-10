import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { useLocalSearchParams } from "expo-router";
import type { ComponentProps } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { API_URL, api } from "../../src/api/client";
import type { Score } from "../../src/api/types";
import { useAuth } from "../../src/auth/AuthProvider";
import { StatusBadge } from "../../src/components/StatusBadge";
import { colors, sharedStyles } from "../../src/theme/styles";

export default function ScoreDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();

  const scoreQuery = useQuery({
    queryKey: ["score", id],
    queryFn: () => api.score(token!, id),
    enabled: Boolean(token && id),
    refetchInterval: (query) => {
      const status = query.state.data?.score.conversionStatus;
      return status === "queued" || status === "processing" ? 3000 : false;
    }
  });

  const score = scoreQuery.data?.score;

  const shareMutation = useMutation({
    mutationFn: async () => {
      if (!score) return;
      const result = await api.downloadMusicXml(token!, score);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { mimeType: "application/vnd.recordare.musicxml+xml", UTI: "public.xml" });
      }
    }
  });

  if (scoreQuery.isLoading || !score) {
    return (
      <View style={{ alignItems: "center", flex: 1, justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const canDownload = score.conversionStatus === "converted";
  const reviewState = getReviewState(score);

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.content}>
      <View style={{ gap: 10 }}>
        <Text style={sharedStyles.title}>{score.originalFilename}</Text>
        <StatusBadge status={score.conversionStatus} />
      </View>

      {score.fileType === "image" ? (
        <Image
          resizeMode="contain"
          source={{ uri: `${API_URL}/api/scores/${score.id}/preview`, headers: { Authorization: `Bearer ${token}` } }}
          style={{ backgroundColor: "#fff", borderRadius: 8, height: 320, width: "100%" }}
        />
      ) : (
        <View style={[sharedStyles.panel, { alignItems: "center", minHeight: 160, justifyContent: "center" }]}>
          <Ionicons color={colors.primary} name="document-text-outline" size={42} />
          <Text style={sharedStyles.subtitle}>PDF enviado para conversao.</Text>
        </View>
      )}

      <View style={sharedStyles.panel}>
        <Info label="Tipo" value={score.mimeType} />
        <Info label="Tamanho" value={formatBytes(score.fileSize)} />
        <Info label="Criado em" value={new Date(score.createdAt).toLocaleString()} />
        <Info label="Confianca" value={score.confidence == null ? "Ainda nao calculada" : `${Math.round(score.confidence * 100)}%`} />
      </View>

      <View style={[sharedStyles.panel, { borderColor: reviewState.color }]}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
          <Ionicons color={reviewState.color} name={reviewState.icon} size={20} />
          <Text style={{ color: reviewState.color, fontSize: 16, fontWeight: "700" }}>{reviewState.title}</Text>
        </View>
        <Text style={sharedStyles.subtitle}>{reviewState.message}</Text>
        {reviewState.action ? <Text style={{ color: colors.ink, fontSize: 14, lineHeight: 20 }}>{reviewState.action}</Text> : null}
      </View>

      {score.errorMessage ? <Text style={sharedStyles.error}>{score.errorMessage}</Text> : null}
      {score.warnings?.length ? (
        <View style={sharedStyles.panel}>
          {score.warnings.map((warning) => <Text key={warning} style={{ color: colors.warning }}>{warning}</Text>)}
        </View>
      ) : null}

      <Pressable disabled={!canDownload || shareMutation.isPending} onPress={() => shareMutation.mutate()} style={[sharedStyles.button, (!canDownload || shareMutation.isPending) && { opacity: 0.55 }]}>
        {shareMutation.isPending ? <ActivityIndicator color="#fff" /> : <Ionicons color="#fff" name="share-outline" size={20} />}
        <Text style={sharedStyles.buttonText}>{canDownload ? "Compartilhar MusicXML" : "MusicXML ainda nao pronto"}</Text>
      </Pressable>

      {shareMutation.error ? <Text style={sharedStyles.error}>{shareMutation.error instanceof Error ? shareMutation.error.message : "Falha ao compartilhar."}</Text> : null}
    </ScrollView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 3 }}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 15 }}>{value}</Text>
    </View>
  );
}

function getReviewState(score: Score): { action?: string; color: string; icon: ComponentProps<typeof Ionicons>["name"]; message: string; title: string } {
  if (score.conversionStatus === "failed") {
    return {
      color: colors.danger,
      icon: "alert-circle-outline",
      title: "Conversao falhou",
      message: "O arquivo nao gerou MusicXML. Confira o erro abaixo e tente reenviar uma imagem mais nitida ou um PDF limpo.",
      action: "Prefira boa iluminacao, partitura reta, margens completas e sem sombras sobre as notas."
    };
  }

  if (score.conversionStatus !== "converted") {
    return {
      color: colors.primary,
      icon: "time-outline",
      title: "Conversao em andamento",
      message: "O app esta processando a partitura. Esta tela atualiza automaticamente ate o MusicXML ficar pronto.",
      action: "Arquivos maiores podem levar mais tempo, especialmente PDFs com varias paginas."
    };
  }

  const confidence = score.confidence ?? 0;
  const hasWarnings = Boolean(score.warnings?.length);

  if (confidence < 0.75 || hasWarnings) {
    return {
      color: colors.warning,
      icon: "warning-outline",
      title: "Convertido com alerta",
      message: "O MusicXML foi criado, mas precisa ser revisado no MuseScore ou em outro editor antes de usar como resultado final.",
      action: "Se notas, pausas ou compassos estiverem incorretos, reenvie uma foto mais clara, bem enquadrada e sem cortes nas bordas da partitura."
    };
  }

  return {
    color: colors.success,
    icon: "checkmark-circle-outline",
    title: "Convertido com alta confianca",
    message: "O MusicXML foi criado com boa confianca. Mesmo assim, abra no MuseScore ou em outro editor para uma revisao rapida.",
    action: "Confira especialmente armadura de clave, ritmo e repeticoes antes de compartilhar ou imprimir."
  };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
