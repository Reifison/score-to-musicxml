import type { ConversionResultStatus, RecognitionQuality, ScoreStatus } from "../types/domain.js";

const labels: Record<ScoreStatus, string> = {
  uploaded: "Enviado",
  queued: "Na fila",
  processing: "Processando",
  converted: "Convertido",
  failed: "Falhou"
};

export function StatusBadge({ status, resultStatus, recognitionQuality }: { status: ScoreStatus; resultStatus?: ConversionResultStatus | null; recognitionQuality?: RecognitionQuality | null }) {
  if (status === "converted" && resultStatus === "partial") {
    return <span className="status status-partial">Parcial</span>;
  }
  if (status === "converted" && recognitionQuality?.status === "needs_review") {
    return <span className="status status-quality-needs-review">Revisar partitura</span>;
  }
  if (status === "converted" && recognitionQuality?.status === "unverified") {
    return <span className="status status-quality-unverified">Conferir original</span>;
  }
  return <span className={`status status-${status}`}>{labels[status]}</span>;
}
