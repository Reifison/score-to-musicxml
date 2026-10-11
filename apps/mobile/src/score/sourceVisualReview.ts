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

export function formatVisualNoteValue(value: VisualNoteValue | null): { title: string; detail: string } {
  if (!value) return { title: "Valor não identificado", detail: "A leitura não registrou nota ou pausa." };

  const pitch = value.kind === "rest"
    ? "Pausa"
    : `${value.step ? noteNames[value.step] : "Nota sem altura"}${value.step ? accidentalLabel(value.alter ?? 0) : ""}${value.octave === undefined ? "" : value.octave}`;
  const type = value.type ? noteTypes[value.type.toLowerCase()] ?? value.type : "tipo não identificado";
  const dots = Math.max(0, value.dots ?? 0);
  const dotLabel = dots ? ` · ${dots} ${dots === 1 ? "ponto" : "pontos"}` : "";
  return {
    title: `${pitch} · ${type}${dotLabel}`,
    detail: `Duração: ${formatNumber(value.duration)} tempos de semínima${dotLabel}`
  };
}

export function visualReviewPendingCount(review: SourceVisualReview | undefined): number {
  return review?.proposals.filter((proposal) => proposal.status === "pending").length ?? 0;
}

export function visualReviewPageLabel(page: number): string {
  return page > 0 ? `Página ${page}` : "Página não confirmada";
}

export function visualReviewLocation(value: { page: number; partId: string; measure: string }): string {
  return `${visualReviewPageLabel(value.page)} · Parte ${value.partId || "sem nome"} · compasso ${value.measure}`;
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
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}
