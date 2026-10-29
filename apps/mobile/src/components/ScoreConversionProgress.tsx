import { AdaptiveText as Text } from "../adaptive/AdaptiveTypography";
import type { ConversionProgressLanguage } from "../score/conversionProgressPresentation";
import { conversionProgressPresentation } from "../score/conversionProgressPresentation";
import type { Score } from "../api/types";
import { colors } from "../theme/styles";
import { StyleSheet, View } from "react-native";

export function ScoreConversionProgress({
  score,
  language
}: {
  score: Score;
  language: ConversionProgressLanguage;
}) {
  const presentation = conversionProgressPresentation(score, language);
  if (!presentation) return null;

  return (
    <View
      accessible
      accessibilityLabel={presentation.announcement}
      accessibilityLiveRegion="polite"
      style={styles.container}
    >
      <Text style={[styles.stage, presentation.interrupted && styles.interrupted]}>{presentation.stageLabel}</Text>
      <Text style={styles.summary}>{presentation.summary}</Text>
      {presentation.currentPageLabel ? <Text style={styles.detail}>{presentation.currentPageLabel}</Text> : null}
      {presentation.details.length ? <Text style={styles.detail}>{presentation.details.join(" · ")}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "stretch",
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexShrink: 1,
    gap: 3,
    minWidth: 0,
    paddingTop: 9,
    width: "100%"
  },
  stage: {
    color: colors.primaryDark,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  interrupted: { color: colors.danger },
  summary: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20
  },
  detail: {
    color: colors.muted,
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18
  }
});
