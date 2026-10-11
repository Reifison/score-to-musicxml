import type { ConversionResultStatus, ScoreStatus } from "../types/domain.js";

const labels: Record<ScoreStatus, string> = {
  uploaded: "Enviado",
  queued: "Na fila",
  processing: "Processando",
  converted: "Convertido",
  failed: "Falhou"
};

export function StatusBadge({ status, resultStatus }: { status: ScoreStatus; resultStatus?: ConversionResultStatus | null }) {
  if (status === "converted" && resultStatus === "partial") {
    return <span className="status status-partial">Parcial</span>;
  }
  return <span className={`status status-${status}`}>{labels[status]}</span>;
}
