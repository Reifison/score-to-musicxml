import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { API_URL, api } from "../../src/api/client";
import { canDownloadMusicXml, canExportScoreMidi, canPlayScore, canPreviewMusicXml } from "../../src/api/scoreAvailability";
import type { Score, ScoreType } from "../../src/api/types";
import { useAuth } from "../../src/auth/AuthProvider";
import { BottomNav, bottomNavHeight } from "../../src/components/BottomNav";
import { ScoreTypePicker } from "../../src/components/ScoreTypePicker";
import { StatusBadge } from "../../src/components/StatusBadge";
import { ScorePlayerWebView } from "../../src/player/ScorePlayerWebView";
import { scoreDisplayName, scoreExtension } from "../../src/score/presentation";
import { scoreTypeLabel } from "../../src/score/scoreTypes";
import { colors, sharedStyles } from "../../src/theme/styles";

export default function ScoreDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [retryScoreType, setRetryScoreType] = useState<ScoreType | null>(null);

  const scoreQuery = useQuery({
    queryKey: ["score", id],
    queryFn: () => api.score(token!, id),
    enabled: Boolean(token && id),
    refetchInterval: (query) => {
      const score = query.state.data?.score;
      const conversionActive = score?.conversionStatus === "queued" || score?.conversionStatus === "processing";
      const attemptActive = score?.attempts?.some((attempt) => attempt.status === "queued" || attempt.status === "processing");
      return conversionActive || attemptActive || score?.reviewStatus === "needs_review" ? 3000 : false;
    }
  });

  const score = scoreQuery.data?.score;
  const [originalPage, setOriginalPage] = useState(1);
  const [originalError, setOriginalError] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const originalOffset = useRef(0);
  useEffect(() => {
    if (score?.scoreTypeSelected === true && score.scoreType) setRetryScoreType(score.scoreType);
    else if (score) setRetryScoreType(null);
  }, [score?.scoreType, score?.scoreTypeSelected, score?.id]);

  const retryMutation = useMutation({
    mutationFn: (scoreType?: ScoreType) => api.retryScore(token!, id, scoreType),
    onSuccess: async ({ score: updatedScore }) => {
      queryClient.setQueryData(["score", id], { score: updatedScore });
      await queryClient.invalidateQueries({ queryKey: ["scores"] });
    },
    onError: (error) => Alert.alert("Não foi possível iniciar uma nova tentativa", error instanceof Error ? error.message : "Tente novamente.")
  });

  const musicXmlShareMutation = useMutation({
    mutationFn: async () => {
      if (!score) return;
      let result;
      try {
        result = await api.downloadMusicXml(token!, score);
      } catch {
        throw new Error("Não foi possível baixar o MusicXML. Verifique sua conexão e tente novamente.");
      }

      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("O MusicXML foi baixado, mas o compartilhamento não está disponível neste dispositivo.");
      }

      try {
        await Sharing.shareAsync(result.uri, {
          dialogTitle: "Exportar MusicXML",
          mimeType: "application/vnd.recordare.musicxml+xml",
          UTI: "public.xml"
        });
      } catch {
        throw new Error("Não foi possível abrir o compartilhamento do MusicXML. Tente novamente.");
      }
    }
  });

  const midiShareMutation = useMutation({
    mutationFn: async () => {
      if (!score) return;
      let result;
      try {
        result = await api.downloadMidi(token!, score);
      } catch {
        throw new Error("Não foi possível baixar o MIDI. Verifique sua conexão e tente novamente.");
      }

      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("O MIDI foi baixado, mas o compartilhamento não está disponível neste dispositivo.");
      }

      try {
        await Sharing.shareAsync(result.uri, {
          dialogTitle: "Exportar MIDI",
          mimeType: "audio/midi",
          UTI: "public.midi-audio"
        });
      } catch {
        throw new Error("Não foi possível abrir o compartilhamento do MIDI. Tente novamente.");
      }
    }
  });

  if (scoreQuery.isLoading) {
    return (
      <View style={[sharedStyles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!score) {
    return (
      <View style={[sharedStyles.screen, styles.loadFailure]}>
        <Text style={sharedStyles.error}>Não foi possível abrir os dados desta partitura.</Text>
        <Pressable accessibilityRole="button" onPress={() => void scoreQuery.refetch()} style={sharedStyles.button}>
          <Text style={sharedStyles.buttonText}>Tentar novamente</Text>
        </Pressable>
        <BottomNav />
      </View>
    );
  }

  const canPreviewXml = canPreviewMusicXml(score);
  const canDownloadXml = canDownloadMusicXml(score);
  const canExportMidi = canExportScoreMidi(score);
  const canPlay = canPlayScore(score);
  const attemptInProgress = score.attempts?.some((attempt) => attempt.status === "queued" || attempt.status === "processing") ?? false;
  const manualRetryUsed = score.attempts?.some((attempt) => attempt.kind === "manual") ?? false;
  const hasRetryableResult = score.resultStatus === "complete" || score.resultStatus === "partial" || score.conversionStatus === "failed" || Boolean(score.lastErrorCode) || score.scoreTypeSelected === false;
  const showRetry = hasRetryableResult && !manualRetryUsed;
  const retryNeedsScoreType = score.scoreTypeSelected !== true;

  return (
    <View style={sharedStyles.screen}>
      <ScrollView ref={scrollRef} style={sharedStyles.screen} contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <StatusBadge status={score.conversionStatus} resultStatus={score.resultStatus} />
          <Text style={styles.typeLine}>
            {score.scoreTypeSelected === false ? `${scoreTypeLabel(score.scoreType)} · tipo padrão` : `${scoreTypeLabel(score.scoreType)} · tipo selecionado`}
          </Text>
          <View style={styles.nameRow}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.nameLabel}>Nome da partitura</Text>
              <Text numberOfLines={2} style={styles.scoreName}>{scoreDisplayName(score)}</Text>
            </View>
            {scoreExtension(score) ? <Text style={styles.extension}>{scoreExtension(score)}</Text> : null}
          </View>
        </View>

        {score.resultStatus === "partial" ? <PartialResultNotice score={score} /> : null}
        {showRetry ? (
          <View style={styles.retryPanel}>
            <Text style={styles.retryTitle}>{score.resultStatus === "complete" ? "Refazer conversão" : "Tentar converter novamente"}</Text>
            <Text style={styles.retryDescription}>{retryNeedsScoreType
              ? "Escolha o tipo da partitura para esta tentativa."
              : "Você pode tentar converter novamente e escolher o tipo da partitura."}</Text>
            <ScoreTypePicker onChange={setRetryScoreType} value={retryScoreType} />
            <Pressable
              accessibilityRole="button"
              disabled={retryMutation.isPending || attemptInProgress || retryScoreType === null}
              onPress={() => retryScoreType && retryMutation.mutate(retryScoreType)}
              style={[sharedStyles.button, (retryMutation.isPending || attemptInProgress || retryScoreType === null) && styles.disabled]}
            >
              {retryMutation.isPending || attemptInProgress ? <ActivityIndicator color={colors.onPrimary} /> : <Ionicons color={colors.onPrimary} name="refresh-outline" size={19} />}
              <Text style={sharedStyles.buttonText}>{attemptInProgress ? "Nova tentativa em andamento" : "Nova tentativa"}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.playerCard}>
          <View style={styles.sectionHeading}>
            <Ionicons color={colors.primary} name="musical-notes-outline" size={22} />
            <View style={styles.sectionHeadingText}>
              <Text style={styles.sectionTitle}>Partitura digital</Text>
              <Text style={styles.sectionSubtitle}>{canPlay
                ? score.resultStatus === "partial"
                  ? "Ouça e acompanhe os trechos convertidos. As páginas ausentes não serão tocadas. É necessária uma conexão com a internet."
                  : "Ouça a partitura e acompanhe as notas destacadas durante a reprodução. É necessária uma conexão com a internet."
                : "O áudio desta versão não pôde ser validado. A partitura digital continua acessível."}</Text>
            </View>
          </View>
          <View style={styles.playerFrame}>
            <ScorePlayerWebView score={score} token={token!} />
          </View>
        </View>

        <View style={styles.preview} onLayout={(event) => { originalOffset.current = event.nativeEvent.layout.y; }}>
          <View style={styles.previewHeading}>
            <Ionicons color={colors.muted} name="document-outline" size={20} />
            <Text style={styles.previewTitle}>Arquivo original</Text>
          </View>
          <Text accessibilityLiveRegion="polite" style={styles.originalPageLabel}>Página {originalPage} do original</Text>
          {originalError ? <Text style={sharedStyles.error}>Não foi possível carregar esta página do original. Abra a partitura novamente para tentar.</Text> : null}
          <Image
            key={`${score.id}:${originalPage}`}
            resizeMode="contain"
            source={{ uri: `${API_URL}/api/scores/${score.id}/preview-image?page=${originalPage}`, headers: { Authorization: `Bearer ${token}` } }}
            style={styles.previewImage}
            onError={() => setOriginalError(true)}
          />
        </View>

        <View style={styles.bottomActions}>
          <Text style={styles.exportHint}>MusicXML preserva melhor a notação para continuar editando a partitura.</Text>
          <Pressable
            accessibilityHint="Abre as opções para compartilhar ou salvar a partitura em MusicXML"
            accessibilityRole="button"
            disabled={!canDownloadXml || musicXmlShareMutation.isPending}
            onPress={() => musicXmlShareMutation.mutate()}
            style={[sharedStyles.button, styles.downloadButton, (!canDownloadXml || musicXmlShareMutation.isPending) && styles.disabled]}
          >
            {musicXmlShareMutation.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Ionicons color={colors.onPrimary} name="download-outline" size={20} />}
            <Text style={sharedStyles.buttonText}>
              {canDownloadXml
                ? score.resultStatus === "partial"
                ? "Exportar MusicXML parcial"
                  : "Exportar MusicXML"
                : "MusicXML ainda não pronto"}
            </Text>
          </Pressable>
          {musicXmlShareMutation.error ? <Text style={sharedStyles.error}>{musicXmlShareMutation.error instanceof Error ? musicXmlShareMutation.error.message : "Não foi possível exportar o MusicXML."}</Text> : null}

          <Text style={[styles.exportHint, styles.midiHint]}>{canExportMidi
            ? "Exporte a execução em MIDI para abrir em um app compatível."
            : "A exportação MIDI não está disponível para este resultado."}</Text>
          <Pressable
            accessibilityHint="Abre as opções para compartilhar ou salvar a execução em MIDI"
            accessibilityRole="button"
            disabled={!canExportMidi || midiShareMutation.isPending}
            onPress={() => midiShareMutation.mutate()}
            style={[sharedStyles.button, sharedStyles.buttonSecondary, styles.downloadButton, (!canExportMidi || midiShareMutation.isPending) && styles.disabled]}
          >
            {midiShareMutation.isPending ? <ActivityIndicator color={colors.primary} /> : <Ionicons color={colors.ink} name="musical-notes-outline" size={20} />}
            <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary]}>{canExportMidi ? "Exportar MIDI" : "MIDI indisponível"}</Text>
          </Pressable>
          {midiShareMutation.error ? <Text style={sharedStyles.error}>{midiShareMutation.error instanceof Error ? midiShareMutation.error.message : "Não foi possível exportar o MIDI."}</Text> : null}
        </View>
      </ScrollView>
      <BottomNav />
    </View>
  );
}

function PartialResultNotice({ score }: { score: Score }) {
  const missingPages = score.coverage?.missingPages ?? [];
  const pageList = missingPages.join(", ");
  return (
    <View style={styles.partialNotice}>
      <Text style={styles.partialNoticeText}>
        {pageList
          ? `Conversão parcial. ${missingPages.length === 1 ? "Página ausente" : "Páginas ausentes"}: ${pageList}.`
          : "A conversão ficou parcial e pode ter páginas ausentes."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomActions: {
    gap: 10
  },
  content: {
    alignSelf: "center",
    flexGrow: 1,
    gap: 18,
    maxWidth: 960,
    padding: 20,
    paddingBottom: bottomNavHeight + 28,
    width: "100%"
  },
  disabled: {
    opacity: 0.55
  },
  downloadButton: {
    minHeight: 58
  },
  extension: {
    color: colors.faint,
    fontSize: 16,
    fontWeight: "800"
  },
  exportHint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  headerCard: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    gap: 16,
    padding: 16,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.05,
    shadowRadius: 18
  },
  loadFailure: {
    alignItems: "center",
    gap: 16,
    justifyContent: "center",
    padding: 24
  },
  nameLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800"
  },
  nameRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8
  },
  midiHint: {
    marginTop: 8
  },
  partialNotice: {
    backgroundColor: "#fff9ec",
    borderColor: "#d8b878",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14
  },
  partialNoticeText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20
  },
  preview: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 300,
    overflow: "hidden"
  },
  previewHeading: {
    alignItems: "center",
    backgroundColor: colors.panel,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  previewTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800"
  },
  previewImage: {
    backgroundColor: colors.surfaceSoft,
    height: 460,
    width: "100%"
  },
  playerCard: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden"
  },
  playerFrame: {
    borderTopColor: colors.line,
    borderTopWidth: 1
  },
  scoreName: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 27
  },
  retryDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  retryPanel: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 16
  },
  retryTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800"
  },
  originalPageLabel: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19
  },
  sectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    padding: 16
  },
  sectionHeadingText: {
    flex: 1,
    gap: 3
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  typeLine: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: "800"
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800"
  },
});
