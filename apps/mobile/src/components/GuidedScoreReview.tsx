import { Ionicons } from "@expo/vector-icons";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ApiError, api } from "../api/client";
import type { MusicalValidationIssue, Score, VisualCorrectionProposal, VisualNoteValue } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { AdaptiveText as Text } from "../adaptive/AdaptiveTypography";
import { useTranslation } from "../i18n";
import { reviewIssueLocation } from "../score/reviewPresentation";
import { formatVisualNoteValue, visualReviewLocation } from "../score/sourceVisualReview";
import { colors } from "../theme/styles";

export type GuidedScoreReviewProps = {
  score: Score;
  originalPreview?: ReactNode;
  resultPreview?: ReactNode;
  onLocateIssue?: (issue: MusicalValidationIssue) => void;
  onLocateProposal?: (proposal: VisualCorrectionProposal) => void;
  onScoreChange?: (score: Score) => void | Promise<void>;
};

type LocalScoreOverride = { scoreId: string; sourceRevision: string | null; sourceUpdatedAt: string; value: Score };
type DecisionAction = "accept" | "reject" | "undo";

export function GuidedScoreReview({ score, originalPreview, resultPreview, onLocateIssue, onLocateProposal, onScoreChange }: GuidedScoreReviewProps) {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const [localOverride, setLocalOverride] = useState<LocalScoreOverride | null>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  const currentScore = localOverride?.scoreId === score.id && localOverride.sourceRevision === (score.reviewRevision ?? null) && localOverride.sourceUpdatedAt === score.updatedAt
    ? localOverride.value
    : score;
  const inputScoreRef = useRef(score);
  const currentScoreRef = useRef(currentScore);
  const tokenRef = useRef(token);
  const userIdRef = useRef(user?.id ?? null);
  const mountedRef = useRef(true);
  const decisionControllerRef = useRef<AbortController | null>(null);
  inputScoreRef.current = score;
  currentScoreRef.current = currentScore;
  tokenRef.current = token;
  userIdRef.current = user?.id ?? null;
  const [pendingAction, setPendingAction] = useState<{ proposalId: string; decision: DecisionAction } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [locatedId, setLocatedId] = useState("");
  const issues = currentScore.validation?.issues ?? [];
  const review = currentScore.validation?.visualReview;
  const proposals = review?.proposals ?? [];
  const findingCount = issues.length + proposals.length;
  const pendingCount = proposals.filter((proposal) => proposal.status === "pending").length;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setPendingAction(null);
    setError("");
    setNotice("");
  }, [token, user?.id]);

  useLayoutEffect(() => () => {
    decisionControllerRef.current?.abort();
    decisionControllerRef.current = null;
  }, [score.id, score.userId, score.updatedAt, score.reviewRevision, token, user?.id]);

  useEffect(() => {
    setPendingAction(null);
  }, [score.id, score.userId, score.updatedAt, score.reviewRevision]);

  async function decide(proposal: VisualCorrectionProposal, decision: DecisionAction) {
    const requestScore = currentScoreRef.current;
    const currentProposal = requestScore.validation?.visualReview?.proposals.find((item) => item.id === proposal.id);
    const requestToken = token;
    const requestUserId = user?.id ?? null;
    const revision = requestScore.reviewRevision;
    if (!requestToken || !revision || !currentProposal || !isDecisionAllowed(currentProposal, decision) || pendingAction) return;
    const scoreId = requestScore.id;
    const updatedAt = requestScore.updatedAt;
    const controller = new AbortController();
    decisionControllerRef.current?.abort();
    decisionControllerRef.current = controller;
    const isSameContext = () => mountedRef.current
      && tokenRef.current === requestToken
      && userIdRef.current === requestUserId
      && inputScoreRef.current.id === scoreId
      && inputScoreRef.current.userId === requestScore.userId;
    const isCurrentRequest = () => !controller.signal.aborted && isSameContext()
      && inputScoreRef.current.updatedAt === updatedAt
      && currentScoreRef.current.reviewRevision === revision;
    setPendingAction({ proposalId: proposal.id, decision });
    setError("");
    setNotice("");
    try {
      const response = await api.decideVisualReviewProposal(requestToken, scoreId, revision, currentProposal.id, decision, controller.signal);
      if (!isCurrentRequest()) return;
      setLocalOverride({ scoreId, sourceRevision: inputScoreRef.current.reviewRevision ?? null, sourceUpdatedAt: inputScoreRef.current.updatedAt, value: response.score });
      await onScoreChange?.(response.score);
    } catch (caught) {
      if (!isCurrentRequest()) return;
      if (caught instanceof ApiError && caught.status === 409) {
        try {
          const refreshed = (await api.score(requestToken, scoreId, controller.signal)).score;
          if (isCurrentRequest()) {
            setLocalOverride({ scoreId, sourceRevision: inputScoreRef.current.reviewRevision ?? null, sourceUpdatedAt: inputScoreRef.current.updatedAt, value: refreshed });
            await onScoreChange?.(refreshed);
            setNotice(t("A partitura mudou em outra sessão. Os dados foram atualizados; confira antes de continuar.", "This score changed in another session. The latest data is loaded; review it before continuing."));
          }
        } catch {
          if (isCurrentRequest()) setError(t("A revisão mudou. Atualize a partitura antes de tentar novamente.", "The review changed. Refresh the score before trying again."));
        }
      } else {
        setError(caught instanceof Error ? caught.message : t("Não foi possível salvar esta decisão.", "This decision could not be saved."));
      }
    } finally {
      if (!controller.signal.aborted && isSameContext()) {
        setPendingAction((current) => current?.proposalId === currentProposal.id && current.decision === decision ? null : current);
      }
      if (decisionControllerRef.current === controller) decisionControllerRef.current = null;
    }
  }

  return (
    <View accessibilityLabel={t("Conferência guiada", "Guided review")} style={styles.container}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>{t("Conferir original e resultado", "Compare the original and result")}</Text>
          <Text style={styles.description}>{t("Use os apontamentos para localizar trechos. As sugestões disponíveis podem ser aceitas, recusadas ou desfeitas.", "Use the findings to locate passages. Available suggestions can be accepted, rejected, or undone.")}</Text>
        </View>
        <Text style={styles.count}>{findingCount === 1 ? t("1 apontamento", "1 finding") : t("{{count}} apontamentos", "{{count}} findings", { count: findingCount })}</Text>
      </View>

      <View
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          setPreviewWidth((previous) => previous === width ? previous : width);
        }}
        testID="guided-review-previews"
        style={[styles.previews, previewWidth >= 800 && styles.previewsWide]}
      >
        <View testID="guided-review-preview-section" style={[styles.previewSection, previewWidth >= 800 && { ...styles.previewSectionWide, width: (previewWidth - 14) / 2 }]}>
          <Text style={styles.sectionTitle}>{t("Original", "Original")}</Text>
          {originalPreview ?? <Text style={styles.empty}>{t("Prévia do arquivo original indisponível.", "The original file preview is unavailable.")}</Text>}
        </View>
        <View testID="guided-review-preview-section" style={[styles.previewSection, previewWidth >= 800 && { ...styles.previewSectionWide, width: (previewWidth - 14) / 2 }]}>
          <Text style={styles.sectionTitle}>{t("Resultado convertido", "Converted result")}</Text>
          {resultPreview ?? <Text style={styles.empty}>{t("Prévia da partitura indisponível.", "The score preview is unavailable.")}</Text>}
        </View>
      </View>

      <View style={styles.findings}>
        {issues.length ? <View style={styles.findingSection}>
          <Text style={styles.sectionTitle}>{t("Apontamentos", "Findings")}</Text>
          {issues.map((issue, index) => {
            const id = `issue:${index}:${issue.code}`;
            const isLocated = locatedId === id;
            return (
              <View key={id} style={[styles.entry, isLocated && styles.entryLocated]}>
                <View style={styles.entryCopy}>
                  <Text style={styles.entryTitle}>{issue.severity === "error" ? t("Verificar", "Check") : t("Atenção", "Review")}</Text>
                  <Text style={styles.entryBody}>{issue.message}</Text>
                  {!!reviewIssueLocation(issue) && <Text style={styles.entryDetail}>{reviewIssueLocation(issue)}</Text>}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isLocated }}
                  onPress={() => { setLocatedId(id); onLocateIssue?.(issue); }}
                  style={({ pressed }) => [styles.outlineButton, isLocated && styles.selectedButton, pressed && styles.pressed]}
                >
                  <Ionicons color={isLocated ? colors.primaryDark : colors.ink} name="location-outline" size={18} />
                  <Text style={[styles.buttonText, isLocated && styles.selectedButtonText]}>{t("Localizar", "Locate")}</Text>
                </Pressable>
              </View>
            );
          })}
        </View> : null}

        <View style={styles.findingSection}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>{t("Sugestões de nota ou pausa", "Note or rest suggestions")}</Text>
            {review ? <Text style={styles.count}>{pendingCount === 1 ? t("1 pendente", "1 pending") : t("{{count}} pendentes", "{{count}} pending", { count: pendingCount })}</Text> : null}
          </View>
          {proposals.length ? proposals.map((proposal) => {
            const safe = isSafeProposal(proposal);
            const canUndo = proposal.status === "rejected" || (proposal.status === "accepted" && safe);
            const automaticRejection = proposal.status === "rejected" && isAutomaticRejection(proposal, review?.history ?? []);
            const action = pendingAction?.proposalId === proposal.id ? pendingAction.decision : null;
            const isLocated = locatedId === proposal.id;
            return (
              <View key={proposal.id} style={[styles.entry, isLocated && styles.entryLocated]}>
                <View style={styles.entryCopy}>
                  <Text style={styles.entryTitle}>{visualReviewLocation(proposal)}</Text>
                  <Text style={styles.entryBody}>{formatVisualNoteValue(proposal.before).title} → {formatVisualNoteValue(proposal.after).title}</Text>
                  <Text style={styles.entryDetail}>{proposal.reason || (safe ? t("Sugestão ligada à fonte.", "Source-linked suggestion.") : t("Esta sugestão exige conferência manual.", "This suggestion needs manual review."))}</Text>
                  {proposal.status !== "pending" ? <Text style={styles.status}>{proposal.status === "accepted" ? t("Aceita", "Accepted") : automaticRejection ? t("Não aplicada automaticamente", "Not applied automatically") : t("Recusada", "Rejected")}</Text> : null}
                </View>
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isLocated }}
                    onPress={() => { setLocatedId(proposal.id); onLocateProposal?.(proposal); }}
                    style={({ pressed }) => [styles.outlineButton, isLocated && styles.selectedButton, pressed && styles.pressed]}
                  >
                    <Ionicons color={isLocated ? colors.primaryDark : colors.ink} name="location-outline" size={18} />
                    <Text style={[styles.buttonText, isLocated && styles.selectedButtonText]}>{t("Localizar", "Locate")}</Text>
                  </Pressable>
                  {safe && proposal.status === "pending" ? <>
                    <ActionButton icon="checkmark" title={action === "accept" ? t("Salvando…", "Saving…") : t("Aceitar", "Accept")} disabled={!token || !currentScore.reviewRevision || Boolean(pendingAction)} primary onPress={() => void decide(proposal, "accept")} />
                  </> : null}
                  {proposal.status === "pending" ? <>
                    <ActionButton icon="close" title={action === "reject" ? t("Salvando…", "Saving…") : t("Recusar", "Reject")} disabled={!token || !currentScore.reviewRevision || Boolean(pendingAction)} onPress={() => void decide(proposal, "reject")} />
                  </> : null}
                  {canUndo ? <ActionButton icon="arrow-undo-outline" title={action === "undo" ? t("Desfazendo…", "Undoing…") : automaticRejection ? t("Reavaliar sugestão", "Reconsider suggestion") : t("Desfazer", "Undo")} disabled={!token || !currentScore.reviewRevision || Boolean(pendingAction)} onPress={() => void decide(proposal, "undo")} /> : null}
                </View>
                {!safe && proposal.status === "pending" ? <Text style={styles.unsafe}>{t("Aceitar não está disponível: esta sugestão exige conferência manual.", "Accept is unavailable: this suggestion needs manual review.")}</Text> : null}
              </View>
            );
          }) : <Text style={styles.empty}>{t("Nenhuma sugestão de nota ou pausa disponível.", "No note or rest suggestions are available.")}</Text>}
        </View>
      </View>

      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
      {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function ActionButton({ icon, title, disabled, primary, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; disabled: boolean; primary?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.outlineButton, primary && styles.primaryButton, disabled && styles.disabledButton, pressed && styles.pressed]}>
      <Ionicons color={primary ? colors.onPrimary : colors.ink} name={icon} size={18} />
      <Text style={[styles.buttonText, primary && styles.primaryButtonText]}>{title}</Text>
    </Pressable>
  );
}

function isSafeProposal(proposal: VisualCorrectionProposal): boolean {
  const validValue = (value: VisualNoteValue | null) => value !== null
    && (value.kind === "note" || value.kind === "rest")
    && Number.isFinite(value.duration) && value.duration > 0
    && (value.kind === "rest" || Boolean(value.step && Number.isInteger(value.octave)));
  return proposal.applicable && validValue(proposal.before) && validValue(proposal.after);
}

function isDecisionAllowed(proposal: VisualCorrectionProposal, decision: DecisionAction): boolean {
  if (decision === "accept") return proposal.status === "pending" && isSafeProposal(proposal);
  if (decision === "reject") return proposal.status === "pending";
  return proposal.status === "rejected" || (proposal.status === "accepted" && isSafeProposal(proposal));
}

function isAutomaticRejection(proposal: VisualCorrectionProposal, history: Array<{ proposalId: string; decision: string; actorId: string }>): boolean {
  const lastDecision = [...history].reverse().find((entry) => entry.proposalId === proposal.id);
  return lastDecision?.decision === "reject" && lastDecision.actorId.startsWith("system:automatic_delivery");
}

const styles = StyleSheet.create({
  container: { alignSelf: "stretch", backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 18, borderWidth: 1, gap: 16, minWidth: 0, padding: 14, width: "100%" },
  heading: { alignItems: "flex-start", flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" },
  headingCopy: { flex: 1, gap: 4, minWidth: 220 },
  title: { color: colors.ink, fontSize: 20, fontWeight: "800", lineHeight: 26 },
  description: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  count: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  previews: { flexDirection: "column", gap: 14, minWidth: 0, width: "100%" },
  previewsWide: { flexDirection: "row" },
  previewSection: { gap: 8, minWidth: 0, width: "100%" },
  previewSectionWide: { flexShrink: 1, minWidth: 0 },
  findings: { gap: 20, minWidth: 0 },
  findingSection: { gap: 7, minWidth: 0 },
  sectionHeading: { alignItems: "baseline", flexDirection: "row", flexWrap: "wrap", gap: 4, justifyContent: "space-between" },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800", lineHeight: 22 },
  entry: { alignItems: "flex-start", borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between", minWidth: 0, paddingVertical: 10 },
  entryLocated: { backgroundColor: colors.surfaceSoft },
  entryCopy: { flex: 1, gap: 3, minWidth: 190 },
  entryTitle: { color: colors.ink, fontSize: 13, fontWeight: "800", lineHeight: 19 },
  entryBody: { color: colors.ink, fontSize: 14, lineHeight: 20 },
  entryDetail: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  status: { color: colors.primaryDark, fontSize: 12, fontWeight: "800", lineHeight: 17 },
  actions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 6 },
  outlineButton: { alignItems: "center", backgroundColor: colors.panel, borderColor: colors.lineStrong, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 44, paddingHorizontal: 10 },
  selectedButton: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  selectedButtonText: { color: colors.primaryDark },
  primaryButton: { backgroundColor: colors.primary, borderColor: colors.primary, minWidth: 92 },
  primaryButtonText: { color: colors.onPrimary },
  buttonText: { color: colors.ink, fontSize: 13, fontWeight: "800", lineHeight: 18 },
  pressed: { opacity: 0.72 },
  disabledButton: { opacity: 0.5 },
  unsafe: { color: colors.muted, flexBasis: "100%", fontSize: 12, lineHeight: 17 },
  empty: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  notice: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, color: colors.muted, paddingTop: 9 },
  error: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, color: colors.danger, paddingTop: 9 }
});
