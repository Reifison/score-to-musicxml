import type { ScoreType } from "../api/types";

export const scoreTypeOptions: Array<{ value: ScoreType; label: string; description: string }> = [
  { value: "melody", label: "Melodia", description: "Uma linha musical" },
  { value: "piano", label: "Piano", description: "Duas pautas" },
  { value: "guitar_solo", label: "Violão solo", description: "Uma parte de violão" },
  { value: "guitar_duo", label: "Violão duo", description: "Duas partes de violão" }
];

export function scoreTypeLabel(value: ScoreType | undefined): string {
  return scoreTypeOptions.find((option) => option.value === value)?.label ?? "Tipo não informado";
}
