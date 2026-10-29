import { AdaptiveText as Text } from "../../src/adaptive/AdaptiveTypography";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { API_URL, api } from "../../src/api/client";
import { canDownloadMusicXml, canExportScoreMidi, canPlayScore, canPreviewMusicXml } from "../../src/api/scoreAvailability";
import type { MusicalValidationIssue, Score, ScoreType, ScoreVersion, VisualCorrectionProposal } from "../../src/api/types";
import { useAuth } from "../../src/auth/AuthProvider";
import { GuidedScoreReview } from "../../src/components/GuidedScoreReview";
import { ScoreVersionHistory } from "../../src/components/ScoreVersionHistory";
import type { PlayerReadingTarget } from "../../src/player/bridge";
import { ScoreReaderLayout } from "../../src/components/ScoreReaderLayout";
import { ScoreConversionProgress } from "../../src/components/ScoreConversionProgress";
import { FirstPagePreview } from "../../src/components/FirstPagePreview";
import { RecognitionQualityNotice } from "../../src/components/RecognitionQualityNotice";
import { ScoreTypePicker } from "../../src/components/ScoreTypePicker";
import { StatusBadge } from "../../src/components/StatusBadge";
import { ScorePlayerWebView } from "../../src/player/ScorePlayerWebView";
import { scoreDisplayName, scoreExtension } from "../../src/score/presentation";
import { scoreTypeLabel } from "../../src/score/scoreTypes";
import { currentFirstPagePreview } from "../../src/score/firstPagePreview";
import { shouldPollConversionScore } from "../../src/score/conversionProgressPresentation";
import { localizeMessage } from "../../src/score/localizedMessages";
import { useTranslation } from "../../src/i18n";
import { colors, sharedStyles } from "../../src/theme/styles";

export default function ScoreDetailsScreen() {
  const { t, language } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [retryScoreType, setRetryScoreType] = useState<ScoreType | null>(null);
  const activeSessionRef = useRef({ userId: user?.id ?? null, token: token ?? null, scoreId: id });
  activeSessionRef.current = { userId: user?.id ?? null, token: token ?? null, scoreId: id };

  const scoreQuery = useQuery({
    queryKey: ["score", user?.id ?? null, id],
    queryFn: () => api.score(token!, id),
    enabled: Boolean(token && user?.id && id),
    refetchInterval: (query) => {
      const score = query.state.data?.score;
      return shouldPollConversionScore(score) || score?.reviewStatus === "needs_review" ? 3000 : false;
    }
  });

  const score = token && user?.id ? scoreQuery.data?.score : undefined;
  const [originalPage, setOriginalPage] = useState(1);
  const [workspace, setWorkspace] = useState<"reading" | "review" | "versions">("reading");
  const [historicalVersion, setHistoricalVersion] = useState<{ version: ScoreVersion; musicXml: string; userId: string; scoreId: string } | null>(null);
  const [readingTarget, setReadingTarget] = useState<PlayerReadingTarget>();
  const locationSequence = useRef(0);
  useEffect(() => {
    setOriginalPage(1);
    setWorkspace("reading");
    setHistoricalVersion(null);
    setReadingTarget(undefined);
  }, [id, user?.id, token]);
  useEffect(() => setOriginalError(false), [id, originalPage]);

  const updateReviewedScore = useCallback(async (updatedScore: Score) => {
    if (!user?.id || !token || activeSessionRef.current.userId !== user.id
      || activeSessionRef.current.token !== token || activeSessionRef.current.scoreId !== id || updatedScore.id !== id) return;
    queryClient.setQueryData(["score", user.id, id], { score: updatedScore });
    await queryClient.invalidateQueries({ queryKey: ["scores", user.id] });
  }, [id, queryClient, token, user?.id]);

  const locateReviewItem = useCallback((item: MusicalValidationIssue | VisualCorrectionProposal) => {
    if (item.page && item.page > 0) setOriginalPage(item.page);
    if (item.measure) {
      locationSequence.current += 1;
      setReadingTarget({ id: `review-${locationSequence.current}`, measure: item.measure });
    }
  }, []);
  const [originalError, setOriginalError] = useState(false);
  useEffect(() => {
    if (score?.scoreTypeSelected === true && score.scoreType) setRetryScoreType(score.scoreType);
    else if (score) setRetryScoreType(null);
  }, [score?.scoreType, score?.scoreTypeSelected, score?.id]);

  const retryMutation = useMutation({
    mutationFn: ({ scoreType, scoreId, sessionToken }: { scoreType: ScoreType; scoreId: string; sessionUserId: string; sessionToken: string }) => api.retryScore(sessionToken, scoreId, scoreType),
    onSuccess: async ({ score: updatedScore }, variables) => {
      if (activeSessionRef.current.userId !== variables.sessionUserId
        || activeSessionRef.current.token !== variables.sessionToken
        || activeSessionRef.current.scoreId !== variables.scoreId) return;
      queryClient.setQueryData(["score", variables.sessionUserId, variables.scoreId], { score: updatedScore });
      await queryClient.invalidateQueries({ queryKey: ["scores", variables.sessionUserId] });
    },
    onError: (error) => Alert.alert(t("Não foi possível iniciar uma nova tentativa", "Couldn't start a new attempt"), error instanceof Error ? error.message : t("Tente novamente.", "Please try again."))
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
          dialogTitle: t("Exportar MusicXML", "Export MusicXML"),
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
          dialogTitle: t("Exportar MIDI", "Export MIDI"),
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
      <ScoreReaderLayout title={t("Partitura", "Score")} details={<Text style={sharedStyles.subtitle}>{t("Carregando os dados da partitura.", "Loading score data.")}</Text>}>
        {() => <View style={styles.loadFailure}><ActivityIndicator color={colors.primary} /></View>}
      </ScoreReaderLayout>
    );
  }

  if (!score) {
    return (
      <ScoreReaderLayout title={t("Partitura", "Score")} details={<Text style={sharedStyles.error}>{t("Os dados ainda não estão disponíveis.", "The data isn't available yet.")}</Text>}>
        {() => <View style={[sharedStyles.screen, styles.loadFailure]}>
        <Text style={sharedStyles.error}>{t("Não foi possível abrir os dados desta partitura.", "Couldn't open this score's data.")}</Text>
        <Pressable accessibilityRole="button" onPress={() => void scoreQuery.refetch()} style={sharedStyles.button}>
          <Text style={sharedStyles.buttonText}>{t("Tentar novamente", "Try again")}</Text>
        </Pressable>
        </View>}
      </ScoreReaderLayout>
    );
  }

  const canDownloadXml = canDownloadMusicXml(score);
  const canExportMidi = canExportScoreMidi(score);
  const canPlay = canPlayScore(score);
  const hasFinalMusicXml = canPreviewMusicXml(score);
  const currentPreview = currentFirstPagePreview(score);
  const attemptInProgress = score.attempts?.some((attempt) => attempt.status === "queued" || attempt.status === "processing") ?? false;
  const manualRetryUsed = score.attempts?.some((attempt) => attempt.kind === "manual") ?? false;
  const hasRetryableResult = score.resultStatus === "complete" || score.resultStatus === "partial" || score.conversionStatus === "failed" || Boolean(score.lastErrorCode) || score.scoreTypeSelected === false;
  const showRetry = hasRetryableResult && !manualRetryUsed;
  const retryNeedsScoreType = score.scoreTypeSelected !== true;

  const totalSourcePages = Math.max(1, score.coverage?.totalPages ?? 1);
  const originalPreview = (
    <View style={[styles.preview, workspace === "review" && styles.reviewOriginal]}>
      {workspace !== "review" ? <View style={styles.previewHeading}>
        <Ionicons color={colors.muted} name="document-outline" size={20} />
        <Text style={styles.previewTitle}>{t("Arquivo original", "Original file")}</Text>
      </View> : null}
      <View style={styles.sourcePages}>
        <Pressable accessibilityLabel={t("Página anterior do original", "Previous original page")} accessibilityRole="button" disabled={originalPage <= 1}
          onPress={() => setOriginalPage((page) => Math.max(1, page - 1))} style={styles.sourcePageButton}>
          <Ionicons name="chevron-back" size={20} color={originalPage <= 1 ? colors.faint : colors.ink} />
        </Pressable>
        <Text accessibilityLiveRegion="polite" style={styles.originalPageLabel}>{t("Página {{page}} de {{total}} do original", "Original page {{page}} of {{total}}", { page: originalPage, total: totalSourcePages })}</Text>
        <Pressable accessibilityLabel={t("Próxima página do original", "Next original page")} accessibilityRole="button" disabled={originalPage >= totalSourcePages}
          onPress={() => setOriginalPage((page) => Math.min(totalSourcePages, page + 1))} style={styles.sourcePageButton}>
          <Ionicons name="chevron-forward" size={20} color={originalPage >= totalSourcePages ? colors.faint : colors.ink} />
        </Pressable>
      </View>
      {originalError ? <Text style={sharedStyles.error}>{t("Não foi possível carregar esta página. Verifique sua conexão e abra outra página para tentar novamente.", "Couldn't load this page. Check your connection and open another page to try again.")}</Text> : null}
      <Image key={`${score.id}:${originalPage}`} resizeMode="contain"
        source={{ uri: `${API_URL}/api/scores/${score.id}/preview-image?page=${originalPage}`, headers: { Authorization: `Bearer ${token}` } }}
        style={[styles.previewImage, workspace === "review" && styles.reviewPreviewImage]} onError={() => setOriginalError(true)} />
    </View>
  );
  const visibleHistoricalVersion = historicalVersion?.userId === user?.id && historicalVersion?.scoreId === id ? historicalVersion : null;

  return (
    <ScoreReaderLayout
      title={scoreDisplayName(score)}
      notice={(openDetails) => <>
        {hasFinalMusicXml ? (
          <View accessibilityRole="tablist" style={styles.workspaceTabs}>
            {([
              ["reading", t("Partitura", "Score")],
              ["review", t("Conferir", "Review")],
              ["versions", t("Versões", "Versions")]
            ] as const).map(([mode, label]) => (
              <Pressable key={mode} accessibilityRole="tab" accessibilityState={{ selected: workspace === mode }}
                onPress={() => setWorkspace(mode)} style={[styles.workspaceTab, workspace === mode && styles.workspaceTabSelected]}>
                <Text style={[styles.workspaceTabText, workspace === mode && styles.workspaceTabTextSelected]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {historicalVersion && historicalVersion.userId === user?.id && historicalVersion.scoreId === id && workspace === "reading" ? (
          <View style={styles.versionBanner}>
            <Text style={styles.versionBannerText}>{t("Versão anterior · somente visualização", "Previous version · view only")}</Text>
            <Pressable accessibilityRole="button" onPress={() => setHistoricalVersion(null)} style={styles.returnCurrent}>
              <Text style={styles.workspaceTabTextSelected}>{t("Voltar à atual", "Back to current")}</Text>
            </Pressable>
          </View>
        ) : null}
        {currentPreview && hasFinalMusicXml ? (
        <Pressable accessibilityHint={t("Abre a prévia provisória da primeira página", "Opens the provisional first-page preview")} accessibilityRole="button" onPress={openDetails} style={styles.readingNotice}>
          <Ionicons color={colors.primaryDark} name="document-text-outline" size={21} />
          <Text style={styles.readingNoticeText}>{t("Prévia da página 1 de {{pages}} · conversão continua · abrir detalhes", "Page 1 of {{pages}} preview · conversion continues · open details", { pages: currentPreview.totalPages })}</Text>
          <Ionicons color={colors.primaryDark} name="chevron-forward" size={19} />
        </Pressable>
      ) : workspace === "reading" && (score.resultStatus === "partial" || score.recognitionQuality?.status === "needs_review") ? (
        <Pressable accessibilityHint={t("Abre os avisos completos e o arquivo original", "Opens all notices and the original file")} accessibilityRole="button" onPress={openDetails} style={styles.readingNotice}>
          <Ionicons color={colors.warning} name="information-circle-outline" size={21} />
          <Text style={styles.readingNoticeText}>{score.resultStatus === "partial" ? t("Conversão parcial · conferir detalhes", "Partial conversion · review details") : score.recognitionQuality?.status === "needs_review" ? t("Revisar partitura com o original", "Review the score against the original") : t("Conferir partitura com o original", "Check the score against the original")}</Text>
          <Ionicons color={colors.warning} name="chevron-forward" size={19} />
        </Pressable>
      ) : null}
      </>}
      details={<>
        <View style={styles.headerCard}>
          <StatusBadge status={score.conversionStatus} resultStatus={score.resultStatus} recognitionQuality={score.recognitionQuality} />
          <Text style={styles.typeLine}>
            {score.scoreTypeSelected === false ? t("{{type}} · tipo padrão", "{{type}} · default type", { type: scoreTypeLabel(score.scoreType) }) : t("{{type}} · tipo selecionado", "{{type}} · selected type", { type: scoreTypeLabel(score.scoreType) })}
          </Text>
          <View style={styles.nameRow}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.nameLabel}>{t("Nome da partitura", "Score name")}</Text>
              <Text style={styles.scoreName}>{scoreDisplayName(score)}</Text>
            </View>
            {scoreExtension(score) ? <Text style={styles.extension}>{scoreExtension(score)}</Text> : null}
          </View>
        </View>

        <ScoreConversionProgress language={language} score={score} />
        {hasFinalMusicXml ? <FirstPagePreview score={score} sessionUserId={user?.id ?? ""} token={token!} /> : null}
        {score.resultStatus === "partial" ? <PartialResultNotice score={score} /> : null}
        {score.conversionStatus === "converted" ? <RecognitionQualityNotice quality={score.recognitionQuality} /> : null}
        <Text style={styles.sectionSubtitle}>{canPlay
          ? score.resultStatus === "partial"
            ? t("Ouça e acompanhe os trechos convertidos. As páginas ausentes não serão tocadas. É necessária uma conexão com a internet.", "Listen to and follow the converted sections. Missing pages won't play. An internet connection is required.")
            : t("Ouça a partitura e acompanhe as notas destacadas durante a reprodução. É necessária uma conexão com a internet.", "Listen to the score and follow the highlighted notes during playback. An internet connection is required.")
          : t("O áudio desta versão não pôde ser validado. A partitura digital continua acessível.", "The audio for this version couldn't be validated. The digital score is still available.")}</Text>
        {showRetry ? (
          <View style={styles.retryPanel}>
            <Text style={styles.retryTitle}>{score.resultStatus === "complete" ? t("Refazer conversão", "Convert again") : t("Tentar converter novamente", "Try converting again")}</Text>
            <Text style={styles.retryDescription}>{retryNeedsScoreType
              ? t("Escolha o tipo da partitura para esta tentativa.", "Choose a score type for this attempt.")
              : t("Você pode tentar converter novamente e escolher o tipo da partitura.", "You can try converting again and choose a score type.")}</Text>
            <ScoreTypePicker onChange={setRetryScoreType} value={retryScoreType} />
            <Pressable
              accessibilityRole="button"
              disabled={retryMutation.isPending || attemptInProgress || retryScoreType === null}
              onPress={() => retryScoreType && token && user?.id && retryMutation.mutate({
                scoreType: retryScoreType,
                scoreId: id,
                sessionUserId: user.id,
                sessionToken: token
              })}
              style={[sharedStyles.button, (retryMutation.isPending || attemptInProgress || retryScoreType === null) && styles.disabled]}
            >
              {retryMutation.isPending || attemptInProgress ? <ActivityIndicator color={colors.onPrimary} /> : <Ionicons color={colors.onPrimary} name="refresh-outline" size={19} />}
              <Text style={sharedStyles.buttonText}>{attemptInProgress ? t("Nova tentativa em andamento", "New attempt in progress") : t("Nova tentativa", "New attempt")}</Text>
            </Pressable>
          </View>
        ) : null}

        {originalPreview}


        <View style={styles.bottomActions}>
          {visibleHistoricalVersion ? <Text style={styles.exportHint}>{t("Os botões abaixo exportam a versão atual. Para exportar uma versão anterior, use Versões.", "The buttons below export the current version. To export an earlier version, use Versions.")}</Text> : null}
          <Text style={styles.exportHint}>{t("MusicXML preserva melhor a notação para continuar editando a partitura.", "MusicXML better preserves notation for further score editing.")}</Text>
          <Pressable
            accessibilityHint={t("Abre as opções para compartilhar ou salvar a partitura em MusicXML", "Opens options to share or save the score as MusicXML")}
            accessibilityRole="button"
            disabled={!canDownloadXml || musicXmlShareMutation.isPending}
            onPress={() => musicXmlShareMutation.mutate()}
            style={[sharedStyles.button, styles.downloadButton, (!canDownloadXml || musicXmlShareMutation.isPending) && styles.disabled]}
          >
            {musicXmlShareMutation.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Ionicons color={colors.onPrimary} name="download-outline" size={20} />}
            <Text style={sharedStyles.buttonText}>
              {canDownloadXml
                ? score.resultStatus === "partial"
                ? t("Exportar MusicXML parcial", "Export partial MusicXML")
                  : t("Exportar MusicXML", "Export MusicXML")
                : t("MusicXML ainda não pronto", "MusicXML isn't ready yet")}
            </Text>
          </Pressable>
          {musicXmlShareMutation.error ? <Text style={sharedStyles.error}>{musicXmlShareMutation.error instanceof Error ? localizeMessage(musicXmlShareMutation.error.message) : t("Não foi possível exportar o MusicXML.", "Couldn't export MusicXML.")}</Text> : null}

          <Text style={[styles.exportHint, styles.midiHint]}>{canExportMidi
            ? t("Exporte a execução em MIDI para abrir em um app compatível.", "Export the performance as MIDI to open it in a compatible app.")
            : t("A exportação MIDI não está disponível para este resultado.", "MIDI export isn't available for this result.")}</Text>
          <Pressable
            accessibilityHint={t("Abre as opções para compartilhar ou salvar a execução em MIDI", "Opens options to share or save the performance as MIDI")}
            accessibilityRole="button"
            disabled={!canExportMidi || midiShareMutation.isPending}
            onPress={() => midiShareMutation.mutate()}
            style={[sharedStyles.button, sharedStyles.buttonSecondary, styles.downloadButton, (!canExportMidi || midiShareMutation.isPending) && styles.disabled]}
          >
            {midiShareMutation.isPending ? <ActivityIndicator color={colors.primary} /> : <Ionicons color={colors.ink} name="musical-notes-outline" size={20} />}
            <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary]}>{canExportMidi ? t("Exportar MIDI", "Export MIDI") : t("MIDI indisponível", "MIDI unavailable")}</Text>
          </Pressable>
          {midiShareMutation.error ? <Text style={sharedStyles.error}>{midiShareMutation.error instanceof Error ? localizeMessage(midiShareMutation.error.message) : t("Não foi possível exportar o MIDI.", "Couldn't export MIDI.")}</Text> : null}
        </View>
      </>}
    >
      {({ height, suspended, fontScale }) => currentPreview && !hasFinalMusicXml ? (
        <FirstPagePreview fontScale={fontScale} height={height} score={score} scrollable sessionUserId={user?.id ?? ""} suspended={suspended} token={token!} />
      ) : workspace === "review" && hasFinalMusicXml ? (
        <ScrollView contentContainerStyle={styles.workspaceContent} keyboardShouldPersistTaps="handled">
          <GuidedScoreReview key={`${user?.id}:${score.id}`} score={score} originalPreview={originalPreview}
            resultPreview={<ScorePlayerWebView height={420} fontScale={fontScale} score={score} sessionUserId={user?.id ?? ""} suspended={suspended} token={token!} readingTarget={readingTarget} />}
            onLocateIssue={locateReviewItem} onLocateProposal={locateReviewItem} onScoreChange={updateReviewedScore} />
        </ScrollView>
      ) : workspace === "versions" && hasFinalMusicXml ? (
        <ScrollView contentContainerStyle={styles.workspaceContent} keyboardShouldPersistTaps="handled">
          <ScoreVersionHistory key={`${user?.id}:${score.id}`} score={score} onOpenVersion={(version, musicXml) => {
            if (!user?.id || activeSessionRef.current.userId !== user.id || activeSessionRef.current.token !== token || activeSessionRef.current.scoreId !== id) return;
            setHistoricalVersion(version.isCurrent ? null : { version, musicXml, userId: user.id, scoreId: id });
            setWorkspace("reading");
          }} />
        </ScrollView>
      ) : (
        <ScorePlayerWebView fontScale={fontScale} height={height} score={score} sessionUserId={user?.id ?? ""} suspended={suspended} token={token!}
          versionPreview={visibleHistoricalVersion ? { versionId: visibleHistoricalVersion.version.id, revision: visibleHistoricalVersion.version.revision ?? visibleHistoricalVersion.version.id, musicXml: visibleHistoricalVersion.musicXml } : undefined} />
      )}
    </ScoreReaderLayout>
  );
}

function PartialResultNotice({ score }: { score: Score }) {
  const { t } = useTranslation();
  const missingPages = score.coverage?.missingPages ?? [];
  const pageList = missingPages.join(", ");
  return (
    <View style={styles.partialNotice}>
      <Text style={styles.partialNoticeText}>
        {pageList
          ? missingPages.length === 1
            ? t("Conversão parcial. Página ausente: {{pages}}.", "Partial conversion. Missing page: {{pages}}.", { pages: pageList })
            : t("Conversão parcial. Páginas ausentes: {{pages}}.", "Partial conversion. Missing pages: {{pages}}.", { pages: pageList })
          : t("A conversão ficou parcial e pode ter páginas ausentes.", "The conversion is partial and may have missing pages.")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  reviewOriginal: { borderWidth: 0, borderRadius: 0, minHeight: 0, backgroundColor: colors.panel },
  reviewPreviewImage: { height: 300 },
  workspaceContent: { padding: 16, gap: 16, paddingBottom: 32 },
  workspaceTabs: { flexDirection: "row", gap: 4, paddingHorizontal: 8, borderBottomColor: colors.line, borderBottomWidth: 1 },
  workspaceTab: { flex: 1, minHeight: 44, paddingHorizontal: 8, paddingVertical: 10, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  workspaceTabSelected: { backgroundColor: colors.primarySoft },
  workspaceTabText: { color: colors.muted, fontSize: 14, fontWeight: "700" },
  workspaceTabTextSelected: { color: colors.primaryDark, fontSize: 14, fontWeight: "700" },
  versionBanner: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, paddingHorizontal: 12, backgroundColor: colors.surfaceSoft },
  versionBannerText: { color: colors.ink, fontSize: 13, flexGrow: 1 },
  returnCurrent: { minHeight: 44, paddingHorizontal: 8, justifyContent: "center" },
  sourcePages: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sourcePageButton: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  bottomActions: {
    gap: 10
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
    gap: 12
  },
  loadFailure: {
    alignItems: "center",
    flex: 1,
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
  readingNotice: {
    alignItems: "center",
    backgroundColor: "#fff9ec",
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  readingNoticeText: {
    color: colors.ink,
    flex: 1,
    fontSize: 13,
    lineHeight: 19
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
    borderTopColor: colors.line,
    borderTopWidth: 1,
    gap: 12,
    paddingTop: 20
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
});
