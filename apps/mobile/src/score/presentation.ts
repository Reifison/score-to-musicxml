import { t, getLocale } from "../i18n";
import type { Score } from "../api/types";
import { coverageSummary } from "./coveragePresentation";
import { scoreTypeLabel } from "./scoreTypes";

export function scoreDisplayName(score: Score) {
  return score.originalFilename.replace(/\.[^.]+$/, "") || score.originalFilename;
}

export function scoreExtension(score: Score) {
  const match = score.originalFilename.match(/\.([^.]+)$/);
  return match ? `.${match[1]}` : "";
}

export function scoreDetails(score: Score) {
  const type = score.scoreType
    ? `${scoreTypeLabel(score.scoreType)}${score.scoreTypeSelected === false ? t(" (padrão)", " (default)") : ""}`
    : t("Não informado", "Not specified");
  const coverage = score.coverage
    ? score.coverage.excludedPages !== undefined || score.coverage.pages.some(page => page.contentRole)
      ? coverageSummary(score.coverage)
      : t("{{processed}} de {{total}} páginas", "{{processed}} of {{total}} pages", {processed: score.coverage.processedPages.length, total: score.coverage.totalPages}) + (score.coverage.missingPages.length ? t(" · ausentes: {{pages}}", " · missing: {{pages}}", {pages: score.coverage.missingPages.join(", ")}) : "")
    : t("Desconhecida", "Unknown");
  return [
    { label: t("Envio", "Uploaded"), value: new Date(score.createdAt).toLocaleString(getLocale()) },
    { label: t("Arquivo", "File"), value: score.mimeType },
    { label: t("Partitura", "Score"), value: type },
    { label: t("Cobertura", "Coverage"), value: coverage },
    { label: t("Tamanho", "Size"), value: formatBytes(score.fileSize) },
  ];
}

export function musicXmlActionLabel(score: Score) {
  return score.conversionStatus === "converted" ? t("Baixar MusicXML", "Download MusicXML") : t("MusicXML ainda não pronto", "MusicXML not ready yet");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}
