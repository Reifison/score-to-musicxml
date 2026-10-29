import type { ScoreType } from "../api/types";
import { t } from "../i18n";

// Keep the source labels available for callers that need stable Portuguese copy.
export const scoreTypeOptions: Array<{ value: ScoreType; label: string; description: string }> = [
  { value: "melody", label: "Melodia", description: "Uma linha musical" },
  { value: "piano", label: "Piano", description: "Duas pautas" },
  { value: "guitar_solo", label: "Violão solo", description: "Uma parte de violão" },
  { value: "guitar_duo", label: "Violão duo", description: "Duas partes de violão" }
];

export function getScoreTypeOptions() {
  const english = {
    melody: ["Melody", "One musical line"],
    piano: ["Piano", "Two staves"],
    guitar_solo: ["Solo guitar", "One guitar part"],
    guitar_duo: ["Guitar duet", "Two guitar parts"]
  };
  return scoreTypeOptions.map(option => ({ ...option,
    label: t(option.label, english[option.value][0]),
    description: t(option.description, english[option.value][1])
  }));
}

export function scoreTypeLabel(value: ScoreType | undefined): string {
  return getScoreTypeOptions().find((option) => option.value === value)?.label ?? t("Tipo não informado", "Type not specified");
}
