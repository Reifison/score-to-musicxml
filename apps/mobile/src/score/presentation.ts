import type { Score } from "../api/types";

export function scoreDisplayName(score: Score) {
  return score.originalFilename.replace(/\.[^.]+$/, "") || score.originalFilename;
}

export function scoreExtension(score: Score) {
  const match = score.originalFilename.match(/\.([^.]+)$/);
  return match ? `.${match[1]}` : "";
}

export function scoreDetails(score: Score) {
  return [
    { label: "Envio", value: new Date(score.createdAt).toLocaleString() },
    { label: "Tipo", value: score.mimeType },
    { label: "Tamanho", value: formatBytes(score.fileSize) },
    { label: "Confianca", value: score.confidence == null ? "Aguardando" : `${Math.round(score.confidence * 100)}%` }
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
