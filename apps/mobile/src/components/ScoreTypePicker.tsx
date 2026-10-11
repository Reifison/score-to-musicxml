import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ScoreType } from "../api/types";
import { scoreTypeOptions } from "../score/scoreTypes";
import { colors } from "../theme/styles";

type ScoreTypePickerProps = {
  value: ScoreType | null;
  onChange: (value: ScoreType) => void;
};

export function ScoreTypePicker({ onChange, value }: ScoreTypePickerProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Tipo de partitura</Text>
      {value === null ? <Text style={styles.requiredHint}>Escolha uma opção para orientar a conversão.</Text> : null}
      <View style={styles.options}>
        {scoreTypeOptions.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.option, selected && styles.optionSelected]}
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
    flexBasis: "47%",
    flexGrow: 1,
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
