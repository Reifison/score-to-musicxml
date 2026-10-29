import { t, useTranslation } from "../i18n";
import { AdaptiveText as Text } from "../adaptive/AdaptiveTypography";
import { StyleSheet, View } from "react-native";
import { localizeMessage } from "../score/localizedMessages";
import type { RecognitionQuality, RecognitionQualityIssue } from "../api/types";
import { colors } from "../theme/styles";

export function RecognitionQualityNotice({ quality }: { quality?: RecognitionQuality | null }) {
  useTranslation();
  if (!quality) return null;

  const needsReview = quality.status === "needs_review";
  const title = needsReview ? t("Revisar partitura", "Review score") : t("Conferir original", "Compare with original");
  const summary = needsReview
    ? quality.issues.length
      ? t("Há trechos que precisam ser conferidos no arquivo original.", "Some passages need to be checked against the original file.")
      : t("Confira esta partitura com o arquivo original antes de usar.", "Check this score against the original file before using it.")
    : quality.issues.length
      ? t("Os avisos abaixo indicam limites da comparação com o original; eles não confirmam um erro musical. Confira a partitura antes de usar.", "The notices below describe limits of the comparison with the original; they do not confirm a musical error. Check the score before using it.")
      : unverifiedSummary(quality.sourceComparison);

  return (
    <View style={[styles.notice, needsReview ? styles.needsReview : styles.unverified]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.summary}>{summary}</Text>
      {quality.issues.length > 0 ? (
        <View style={styles.issueList}>
          {quality.issues.map((issue, index) => (
            <Text key={`${issue.code}:${issue.page ?? ""}:${issue.measure ?? ""}:${index}`} style={styles.issue}>
              <Text style={needsReview ? styles.location : styles.neutralLocation}>{recognitionIssueLocation(issue)}</Text>
              {localizeMessage(issue.message.trim(), issue.code) || t("Confira este trecho no arquivo original.", "Check this passage in the original file.")}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function unverifiedSummary(sourceComparison: RecognitionQuality["sourceComparison"]): string {
  switch (sourceComparison) {
    case "compared":
      return t("A comparação com o original não confirma a fidelidade da conversão. Confira a partitura antes de usar.", "Comparison with the original does not confirm the accuracy of the conversion. Check the score before using it.");
    case "partial":
      return t("A comparação cobriu apenas parte da partitura. Confira o restante no arquivo original antes de usar.", "The comparison covered only part of the score. Check the rest against the original file before using it.");
    case "unavailable":
      return t("Não foi possível comparar esta conversão com o original. Confira a partitura antes de usar.", "This conversion could not be compared with the original. Check the score before using it.");
    case "skipped":
      return t("Esta conversão ainda não foi comparada com o original. Confira a partitura antes de usar.", "This conversion has not yet been compared with the original. Check the score before using it.");
  }
}

function recognitionIssueLocation(issue: RecognitionQualityIssue): string {
  const page = Number.isInteger(issue.page) && (issue.page ?? 0) > 0 ? t("Página {{page}}", "Page {{page}}", { page: issue.page! }) : "";
  const measure = issue.measure?.trim();
  const location = [page, measure ? t("compasso {{measure}}", "measure {{measure}}", { measure }) : ""].filter(Boolean).join(" · ");
  return location ? `${location}: ` : t("Partitura: ", "Score: ");
}

const styles = StyleSheet.create({
  notice: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  needsReview: {
    backgroundColor: "#fff8e8",
    borderColor: "#e0c489"
  },
  unverified: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.line
  },
  title: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800"
  },
  summary: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 19
  },
  issueList: {
    gap: 8,
    marginTop: 2
  },
  issue: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 19
  },
  location: {
    color: colors.warning,
    fontWeight: "800"
  },
  neutralLocation: {
    color: colors.muted,
    fontWeight: "800"
  }
});
