import { t } from "../i18n";
import type { MidiValidationStatus, MusicalValidation, MusicalValidationIssue } from "../api/types";

type MidiStatus = MidiValidationStatus | "not_checked" | undefined;

export function midiValidationSummary(status: MidiStatus): { title: string; description: string } {
  switch (status) {
    case "passed":
      return {
        title: t("Execução em MIDI verificada", "MIDI playback checked"),
        description: t("As verificações disponíveis da execução passaram. Elas não conferem todas as notas e durações nem a fidelidade à imagem original.", "The available playback checks passed. They do not check every note and duration or accuracy against the original image.")
      };
    case "failed":
      return {
        title: t("Problemas na verificação de MIDI", "MIDI check issues"),
        description: t("A verificação encontrou problemas no MusicXML. A reprodução e o MIDI ficam indisponíveis até a correção.", "The check found issues in the MusicXML. Playback and MIDI are unavailable until they are corrected.")
      };
    case "unverified":
      return {
        title: t("Execução em MIDI não verificada", "MIDI playback not checked"),
        description: t("Não foi possível confirmar a execução em MIDI. Isso não confirma se as notas correspondem ao original.", "MIDI playback could not be confirmed. This does not confirm whether the notes match the original.")
      };
    default:
      return {
        title: t("Verificação de MIDI não informada", "MIDI check not reported"),
        description: t("Ainda não há um resultado dessa verificação para esta partitura.", "There is no result for this check for this score yet.")
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
    ? t("Conferi a prévia: finalizar com ressalvas", "I checked the preview: finish with caveats")
    : t("Conferi a prévia: finalizar", "I checked the preview: finish");
}

export function reviewIssueLocation(issue: MusicalValidationIssue): string {
  const page = Number.isSafeInteger(issue.page) && (issue.page ?? 0) > 0 ? issue.page : undefined;
  return [
    page ? t("Página {{page}}", "Page {{page}}", {page}) : "",
    issue.partName || (issue.partId ? t("Parte {{part}}", "Part {{part}}", {part: issue.partId}) : ""),
    issue.measure ? t("compasso {{measure}}", "measure {{measure}}", {measure: issue.measure}) + (page ? t(" nesta página", " on this page") : "") : "",
    issue.staff ? t("pauta {{staff}}", "staff {{staff}}", {staff: issue.staff}) : "",
    issue.voice ? t("voz {{voice}}", "voice {{voice}}", {voice: issue.voice}) : ""
  ].filter(Boolean).join(" · ");
}

export function reviewSourcePage(issue: MusicalValidationIssue, totalPages: number | undefined): number | undefined {
  return Number.isSafeInteger(issue.page) && (issue.page ?? 0) > 0
    && Number.isSafeInteger(totalPages) && (issue.page ?? 0) <= (totalPages ?? 0)
    ? issue.page : undefined;
}
