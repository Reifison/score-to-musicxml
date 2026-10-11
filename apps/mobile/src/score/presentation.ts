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
    ? `${scoreTypeLabel(score.scoreType)}${score.scoreTypeSelected === false ? " (padrão)" : ""}`
    : "Não informado";
  const coverage = score.coverage
    ? score.coverage.excludedPages !== undefined || score.coverage.pages.some(page => page.contentRole)
      ? coverageSummary(score.coverage)
      : `${score.coverage.processedPages.length} de ${score.coverage.totalPages} páginas${score.coverage.missingPages.length ? ` · ausentes: ${score.coverage.missingPages.join(", ")}` : ""}`
    : "Desconhecida";
  return [
    { label: "Envio", value: new Date(score.createdAt).toLocaleString() },
    { label: "Arquivo", value: score.mimeType },
    { label: "Partitura", value: type },
    { label: "Cobertura", value: coverage },
    { label: "Tamanho", value: formatBytes(score.fileSize) },
  ];
}

export function musicXmlActionLabel(score: Score) {
  return score.conversionStatus === "converted" ? "Baixar MusicXML" : "MusicXML ainda nao pronto";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
