import { t, getLanguage, getLocale } from "../i18n";
import type { SourceVisualReview, VisualNoteValue } from "../api/types";

const noteNames: Record<NonNullable<VisualNoteValue["step"]>, string> = {
  A: "Lá",
  B: "Si",
  C: "Dó",
  D: "Ré",
  E: "Mi",
  F: "Fá",
  G: "Sol"
};

const noteTypes: Record<string, string> = {
  maxima: "máxima",
  long: "longa",
  breve: "breve",
  whole: "semibreve",
  half: "mínima",
  quarter: "semínima",
  eighth: "colcheia",
  "16th": "semicolcheia",
  "32nd": "fusa",
  "64th": "semifusa",
  "128th": "quartifusa"
};

const englishNoteTypes: Record<string, string> = { maxima: "maxima", long: "longa", breve: "double whole note", whole: "whole note", half: "half note", quarter: "quarter note", eighth: "eighth note", "16th": "sixteenth note", "32nd": "thirty-second note", "64th": "sixty-fourth note", "128th": "128th note" };

export function formatVisualNoteValue(value: VisualNoteValue | null): { title: string; detail: string } {
  if (!value) return { title: t("Valor não identificado", "Value not identified"), detail: t("A leitura não registrou nota ou pausa.", "Recognition did not record a note or rest.") };

  const pitch = value.kind === "rest"
    ? t("Pausa", "Rest")
    : `${value.step ? (getLanguage() === "en" ? value.step : noteNames[value.step]) : t("Nota sem altura", "Note with unknown pitch")}${value.step ? accidentalLabel(value.alter ?? 0) : ""}${value.octave === undefined ? "" : value.octave}`;
  const type = value.type ? getLanguage() === "en" ? englishNoteTypes[value.type.toLowerCase()] ?? value.type : noteTypes[value.type.toLowerCase()] ?? value.type : t("tipo não identificado", "unknown note value");
  const dots = Math.max(0, value.dots ?? 0);
  const dotLabel = dots ? t(dots === 1 ? " · {{dots}} ponto" : " · {{dots}} pontos", dots === 1 ? " · {{dots}} dot" : " · {{dots}} dots", {dots}) : "";
  return {
    title: `${pitch} · ${type}${dotLabel}`,
    detail: t("Duração: {{duration}} tempos de semínima{{dots}}", value.duration === 1 ? "Duration: {{duration}} quarter-note beat{{dots}}" : "Duration: {{duration}} quarter-note beats{{dots}}", {duration: formatNumber(value.duration), dots: dotLabel})
  };
}

export function visualReviewPendingCount(review: SourceVisualReview | undefined): number {
  return review?.proposals.filter((proposal) => proposal.status === "pending").length ?? 0;
}

export function visualReviewPageLabel(page: number): string {
  return page > 0 ? t("Página {{page}}", "Page {{page}}", {page}) : t("Página não confirmada", "Page not confirmed");
}

export function visualReviewLocation(value: { page: number; partId: string; measure: string }): string {
  return t("{{page}} · Parte {{part}} · compasso {{measure}}", "{{page}} · Part {{part}} · measure {{measure}}", {page: visualReviewPageLabel(value.page), part: value.partId || t("sem nome", "unnamed"), measure: value.measure});
}

export function unknownVisualSourcePages(review: SourceVisualReview) {
  const proposalSegments = new Set(review.proposals.map((proposal) => proposal.segmentId));
  const pages = new Map<number, { page: number; count: number; sourceAsset?: string }>();

  for (const segment of review.segments) {
    if (segment.status !== "unknown" || proposalSegments.has(segment.id)) continue;
    const group = pages.get(segment.page) ?? { page: segment.page, count: 0, sourceAsset: segment.sourceAsset };
    group.count += 1;
    if (!group.sourceAsset && segment.sourceAsset) group.sourceAsset = segment.sourceAsset;
    pages.set(segment.page, group);
  }

  return [...pages.values()].sort((a, b) => a.page - b.page);
}

function accidentalLabel(alter: number): string {
  const labels: Record<number, string> = { [-2]: "♭♭", [-1]: "♭", 0: "", 1: "♯", 2: "♯♯" };
  return labels[alter] ?? ` (${alter > 0 ? "+" : ""}${formatNumber(alter)})`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 2 }).format(value);
}
