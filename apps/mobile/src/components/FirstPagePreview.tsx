import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { api, ApiError } from "../api/client";
import type { Score } from "../api/types";
import { currentFirstPagePreview } from "../score/firstPagePreview";
import { useTranslation } from "../i18n";
import { colors, sharedStyles } from "../theme/styles";
import { AdaptiveText as Text } from "../adaptive/AdaptiveTypography";
import { ScorePlayerWebView } from "../player/ScorePlayerWebView";

type PreviewLoadState =
  | { identity: string; status: "loading" }
  | { identity: string; status: "ready"; musicXml: string }
  | { identity: string; status: "error" | "removed" };

export function FirstPagePreview({
  score,
  token,
  sessionUserId,
  height = 420,
  suspended = false,
  fontScale = 1,
  scrollable = false
}: {
  score: Score;
  token: string;
  sessionUserId: string;
  height?: number;
  suspended?: boolean;
  fontScale?: number;
  scrollable?: boolean;
}) {
  const { t } = useTranslation();
  const preview = currentFirstPagePreview(score);
  const identity = preview
    ? JSON.stringify([sessionUserId, score.userId, score.id, preview.attemptId, preview.revision])
    : "";
  const [loadState, setLoadState] = useState<PreviewLoadState>({ identity: "", status: "loading" });
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!preview || !token || !sessionUserId) {
      setLoadState({ identity: "", status: "loading" });
      return;
    }

    const requestIdentity = JSON.stringify([sessionUserId, score.userId, score.id, preview.attemptId, preview.revision]);
    const controller = new AbortController();
    let current = true;
    setLoadState({ identity: requestIdentity, status: "loading" });
    void api.firstPagePreview(token, score.id, preview.revision, controller.signal)
      .then((musicXml) => {
        if (current) setLoadState({ identity: requestIdentity, status: "ready", musicXml });
      })
      .catch((error: unknown) => {
        if (!current || controller.signal.aborted) return;
        setLoadState({
          identity: requestIdentity,
          status: error instanceof ApiError && [404, 409, 410].includes(error.status) ? "removed" : "error"
        });
      });

    return () => {
      current = false;
      controller.abort();
    };
  }, [preview?.attemptId, preview?.revision, retryCount, score.id, score.userId, sessionUserId, token]);

  if (!preview || !token || !sessionUserId) return null;

  const visibleState = loadState.identity === identity ? loadState : { identity, status: "loading" as const };
  const playerHeight = Math.max(120, height - 156);
  const content = (
    <>
      <View style={styles.heading}>
        <Ionicons color={colors.primaryDark} name="document-text-outline" size={20} />
        <View style={styles.headingCopy}>
          <Text style={styles.title}>{t("Prévia da primeira página", "First-page preview")}</Text>
          <Text style={styles.pageLabel}>{t("Página 1 de {{pages}}", "Page 1 of {{pages}}", { pages: preview.totalPages })}</Text>
        </View>
      </View>
      <Text style={styles.provisional}>
        {t(
          "A conversão continua. Esta prévia é provisória e ainda não foi conferida com o original.",
          "Conversion is continuing. This preview is provisional and has not yet been checked against the original."
        )}
      </Text>
      {preview.warnings.map((warning, index) => (
        <Text key={`${index}:${warning}`} style={styles.warning}>{warning}</Text>
      ))}
      {visibleState.status === "ready" ? (
        <ScorePlayerWebView
          key={identity}
          firstPagePreview={{ attemptId: preview.attemptId, revision: preview.revision, musicXml: visibleState.musicXml }}
          height={playerHeight}
          suspended={suspended}
          fontScale={fontScale}
          score={score}
          sessionUserId={sessionUserId}
          token={token}
        />
      ) : visibleState.status === "loading" ? (
        <View accessibilityLiveRegion="polite" accessibilityLabel={t("Carregando a prévia", "Loading the preview")} style={[styles.loadingSurface, { minHeight: playerHeight }]}>
          <Text style={styles.loadingText}>{t("Carregando a prévia…", "Loading the preview…")}</Text>
          <View style={styles.skeletonLines}>
            <View style={[styles.skeletonLine, styles.skeletonLineLong]} />
            <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
            <View style={[styles.skeletonLine, styles.skeletonLineMedium]} />
          </View>
        </View>
      ) : visibleState.status === "removed" ? (
        <Text accessibilityLiveRegion="polite" style={styles.removed}>
          {t("Esta prévia não está mais disponível. A conversão continua.", "This preview is no longer available. Conversion is continuing.")}
        </Text>
      ) : (
        <View accessibilityLiveRegion="polite" style={styles.errorRow}>
          <Text style={styles.error}>
            {t("Não foi possível carregar a prévia. Verifique sua conexão e tente novamente.", "Couldn't load the preview. Check your connection and try again.")}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRetryCount((count) => count + 1)}
            style={[sharedStyles.button, sharedStyles.buttonSecondary, styles.retryButton]}
          >
            <Ionicons color={colors.ink} name="refresh-outline" size={18} />
            <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextSecondary]}>{t("Tentar novamente", "Try again")}</Text>
          </Pressable>
        </View>
      )}
    </>
  );
  return scrollable ? (
    <ScrollView
      accessibilityLabel={t("Prévia da primeira página", "First-page preview")}
      contentContainerStyle={styles.scrollContent}
      nestedScrollEnabled
      scrollEnabled
      style={[styles.scrollCard, { height }]}
    >{content}</ScrollView>
  ) : (
    <View accessibilityLabel={t("Prévia da primeira página", "First-page preview")} style={styles.card}>{content}</View>
  );
}

const cardSurfaceStyles = {
  alignSelf: "stretch" as const,
  backgroundColor: colors.panel,
  borderColor: colors.line,
  borderRadius: 18,
  borderWidth: 1,
  minWidth: 0,
  width: "100%" as const
};
const cardContentStyles = { gap: 10, padding: 14 };

const styles = StyleSheet.create({
  card: { ...cardSurfaceStyles, ...cardContentStyles },
  scrollCard: { ...cardSurfaceStyles, overflow: "hidden" },
  scrollContent: {
    alignSelf: "stretch",
    flexGrow: 1,
    ...cardContentStyles,
    minWidth: 0,
    width: "100%"
  },
  heading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9
  },
  headingCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  title: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22
  },
  pageLabel: {
    color: colors.muted,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    lineHeight: 19
  },
  provisional: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  warning: {
    color: colors.warning,
    fontSize: 13,
    lineHeight: 19
  },
  loadingSurface: {
    alignItems: "center",
    backgroundColor: colors.surfaceSoft,
    borderRadius: 14,
    gap: 10,
    justifyContent: "center",
    minHeight: 120,
    padding: 18
  },
  loadingText: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center"
  },
  skeletonLines: {
    alignItems: "center",
    alignSelf: "stretch",
    gap: 9
  },
  skeletonLine: {
    backgroundColor: colors.line,
    borderRadius: 4,
    height: 7
  },
  skeletonLineLong: { width: "92%" },
  skeletonLineMedium: { width: "72%" },
  skeletonLineShort: { width: "48%" },
  removed: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  errorRow: {
    alignItems: "flex-start",
    gap: 10
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20
  },
  retryButton: {
    minHeight: 46
  }
});
