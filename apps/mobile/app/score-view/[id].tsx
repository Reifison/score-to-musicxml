import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { useLocalSearchParams, router } from "expo-router";
import type { ComponentProps } from "react";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { API_URL, api } from "../../src/api/client";
import type { Score } from "../../src/api/types";
import { useAuth } from "../../src/auth/AuthProvider";
import { StatusBadge } from "../../src/components/StatusBadge";
import { useScoreStatus } from "../../src/hooks/useScoreStatus";
import { colors, radius, sharedStyles } from "../../src/theme/styles";

export default function ScoreViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const scoreQuery = useScoreStatus(token, id);
  const score = scoreQuery.data?.score;
  const [name, setName] = useState("");
  const extension = useMemo(() => (score ? fileExtension(score.originalFilename) : ""), [score?.originalFilename]);
  const trimmedName = name.trim();
  const canSave = Boolean(score && trimmedName.length > 0 && trimmedName !== displayNameWithoutExtension(score.originalFilename));

  useEffect(() => {
    if (score) setName(displayNameWithoutExtension(score.originalFilename));
  }, [score?.id, score?.originalFilename]);

  useEffect(() => {
    if (score && score.conversionStatus !== "converted") {
      router.replace(`/score/${score.id}`);
    }
  }, [score?.conversionStatus, score?.id]);

  const shareMutation = useMutation({
    mutationFn: async () => {
      if (!score || score.conversionStatus !== "converted") return;
      const result = await api.downloadMusicXml(token!, score);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { mimeType: "application/vnd.recordare.musicxml+xml", UTI: "public.xml" });
      }
    }
  });

  const renameMutation = useMutation({
    mutationFn: () => api.renameScore(token!, score!.id, trimmedName),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["score", id] }),
        queryClient.invalidateQueries({ queryKey: ["scores"] })
      ]);
    }
  });

  if (scoreQuery.isLoading || !score) {
    return (
      <View style={{ alignItems: "center", flex: 1, justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (score.conversionStatus !== "converted") {
    return null;
  }

  const reviewState = getReviewState(score);

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.content}>
      <View style={{ gap: 10 }}>
        <StatusBadge status={score.conversionStatus} />
      </View>

      <View style={sharedStyles.panel}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>Nome da partitura</Text>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          <TextInput
            onChangeText={setName}
            placeholder="Nome da partitura"
            style={[sharedStyles.input, { flex: 1 }]}
            value={name}
          />
          {extension ? <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "700" }}>{extension}</Text> : null}
        </View>
        <Pressable
          disabled={!canSave || renameMutation.isPending}
          onPress={() => renameMutation.mutate()}
          style={[sharedStyles.button, sharedStyles.buttonSecondary, (!canSave || renameMutation.isPending) && { opacity: 0.55 }]}
        >
          {renameMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={sharedStyles.buttonText}>Salvar nome</Text>}
        </Pressable>
        {renameMutation.error ? <Text style={sharedStyles.error}>{renameMutation.error instanceof Error ? renameMutation.error.message : "Falha ao renomear."}</Text> : null}
      </View>

      {score.fileType === "image" ? (
        <Image
          resizeMode="contain"
          source={{ uri: `${API_URL}/api/scores/${score.id}/preview`, headers: { Authorization: `Bearer ${token}` } }}
          style={{ backgroundColor: colors.panel, borderRadius: radius.lg, height: 320, width: "100%" }}
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

      <View style={[sharedStyles.panel, { borderColor: reviewState.color, borderWidth: 1 }]}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
          <Ionicons color={reviewState.color} name={reviewState.icon} size={20} />
          <Text style={{ color: reviewState.color, fontSize: 16, fontWeight: "700" }}>{reviewState.title}</Text>
        </View>
        <Text style={sharedStyles.subtitle}>{reviewState.message}</Text>
        {reviewState.action ? <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{reviewState.action}</Text> : null}
      </View>

      {score.warnings?.length ? (
        <View style={sharedStyles.panel}>
          {score.warnings.map((warning) => <Text key={warning} style={{ color: colors.warning }}>{warning}</Text>)}
        </View>
      ) : null}

      <Pressable disabled={shareMutation.isPending} onPress={() => shareMutation.mutate()} style={[sharedStyles.button, shareMutation.isPending && { opacity: 0.55 }]}>
        {shareMutation.isPending ? <ActivityIndicator color="#fff" /> : <Ionicons color="#fff" name="share-outline" size={20} />}
        <Text style={sharedStyles.buttonText}>Compartilhar MusicXML</Text>
      </Pressable>

      {shareMutation.error ? <Text style={sharedStyles.error}>{shareMutation.error instanceof Error ? shareMutation.error.message : "Falha ao compartilhar."}</Text> : null}
    </ScrollView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 3 }}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 15 }}>{value}</Text>
    </View>
  );
}

function getReviewState(score: Score): { action?: string; color: string; icon: ComponentProps<typeof Ionicons>["name"]; message: string; title: string } {
  const confidence = score.confidence ?? 0;
  const hasWarnings = Boolean(score.warnings?.length);

  if (confidence < 0.75 || hasWarnings) {
    return {
      color: colors.warning,
      icon: "warning-outline",
      title: "Convertido com alerta",
      message: "O MusicXML foi criado, mas precisa ser revisado no MuseScore ou em outro editor antes de usar como resultado final.",
      action: "Se notas, pausas ou compassos estiverem incorretos, reenvie uma imagem mais clara, bem enquadrada e sem cortes nas bordas da partitura."
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

function displayNameWithoutExtension(filename: string) {
  const clean = filename.split(/[\\/]/).pop() || filename;
  const dot = clean.lastIndexOf(".");
  return dot > 0 ? clean.slice(0, dot) : clean;
}

function fileExtension(filename: string) {
  const clean = filename.split(/[\\/]/).pop() || filename;
  const dot = clean.lastIndexOf(".");
  return dot > 0 ? clean.slice(dot) : "";
}
