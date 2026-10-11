import type { MidiValidationStatus, MusicalValidation, MusicalValidationIssue } from "../api/types";

type MidiStatus = MidiValidationStatus | "not_checked" | undefined;

export function midiValidationSummary(status: MidiStatus): { title: string; description: string } {
  switch (status) {
    case "passed":
      return {
        title: "Execução em MIDI verificada",
        description: "As verificações disponíveis da execução passaram. Elas não conferem todas as notas e durações nem a fidelidade à imagem original."
      };
    case "failed":
      return {
        title: "Problemas na verificação de MIDI",
        description: "A verificação encontrou problemas no MusicXML. A reprodução e o MIDI ficam indisponíveis até a correção."
      };
    case "unverified":
      return {
        title: "Execução em MIDI não verificada",
        description: "Não foi possível confirmar a execução em MIDI. Isso não confirma se as notas correspondem ao original."
      };
    default:
      return {
        title: "Verificação de MIDI não informada",
        description: "Ainda não há um resultado dessa verificação para esta partitura."
      };
  }
}

export function hasReviewReservations(validation: MusicalValidation | null | undefined, midiStatus?: MidiStatus): boolean {
  const visualReview = validation?.visualReview;
  const unresolvedVisualMeasures = visualReview
    ? visualReview.unknownMeasures
    : Math.max(1, validation?.checkedMeasures ?? 0);
  const visualReviewIncomplete = !visualReview
    || visualReview.status === "partial"
    || visualReview.status === "unavailable"
    || visualReview.status === "skipped";
  const keptVisualProposals = visualReview?.proposals.filter((proposal) => proposal.status === "rejected").length ?? 0;
  const effectiveMidiStatus = midiStatus ?? validation?.midiValidation?.status;

  return (validation?.issues.length ?? 0) > 0
    || (validation?.skippedMeasures ?? 0) > 0
    || unresolvedVisualMeasures > 0
    || visualReviewIncomplete
    || keptVisualProposals > 0
    || effectiveMidiStatus !== "passed";
}

export function reviewApprovalLabel(validation: MusicalValidation | null | undefined, midiStatus?: MidiStatus): string {
  return hasReviewReservations(validation, midiStatus)
    ? "Conferi a prévia: finalizar com ressalvas"
    : "Conferi a prévia: finalizar";
}

export function reviewIssueLocation(issue: MusicalValidationIssue): string {
  const page = Number.isSafeInteger(issue.page) && (issue.page ?? 0) > 0 ? issue.page : undefined;
  return [
    page ? `Página ${page}` : "",
    issue.partName || (issue.partId ? `Parte ${issue.partId}` : ""),
    issue.measure ? `compasso ${issue.measure}${page ? " nesta página" : ""}` : "",
    issue.staff ? `pauta ${issue.staff}` : "",
    issue.voice ? `voz ${issue.voice}` : ""
  ].filter(Boolean).join(" · ");
}

export function reviewSourcePage(issue: MusicalValidationIssue, totalPages: number | undefined): number | undefined {
  return Number.isSafeInteger(issue.page) && (issue.page ?? 0) > 0
    && Number.isSafeInteger(totalPages) && (issue.page ?? 0) <= (totalPages ?? 0)
    ? issue.page : undefined;
}
