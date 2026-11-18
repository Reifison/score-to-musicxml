import { t, useTranslation } from "../i18n";
import { AdaptiveText as Text } from "../adaptive/AdaptiveTypography";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { ScoreType } from "../api/types";
import { getScoreTypeOptions } from "../score/scoreTypes";
import { colors } from "../theme/styles";
import { getMeasuredGridItemBasis } from "./measuredGrid";

type ScoreTypePickerProps = {
  value: ScoreType | null;
  onChange: (value: ScoreType) => void;
};

export function ScoreTypePicker({ onChange, value }: ScoreTypePickerProps) {
  useTranslation();
  const [optionsWidth, setOptionsWidth] = useState(0);
  const optionBasis = getMeasuredGridItemBasis(optionsWidth, 8);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t("Tipo de partitura", "Score type")}</Text>
      {value === null ? <Text style={styles.requiredHint}>{t("Escolha uma opção para orientar a conversão.", "Choose an option to guide the conversion.")}</Text> : null}
      <View
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          setOptionsWidth((currentWidth) => Math.abs(currentWidth - width) > 0.5 ? width : currentWidth);
        }}
        style={styles.options}
      >
        {getScoreTypeOptions().map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.option, { width: optionBasis }, selected && styles.optionSelected]}
            >
              <Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>{option.label}</Text>
              <Text style={styles.description}>{option.description}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  description: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  label: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  requiredHint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  option: {
    backgroundColor: colors.panel,
    borderColor: colors.lineStrong,
    borderRadius: 14,
    borderWidth: 1,
    boxSizing: "border-box",
    maxWidth: "100%",
    flexGrow: 0,
    flexShrink: 0,
    gap: 3,
    justifyContent: "center",
    minHeight: 60,
    paddingHorizontal: 11,
    paddingVertical: 8
  },
  optionSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  optionTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  optionTitleSelected: { color: colors.primaryDark },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 }
});
