import type { ScoreStatus } from "../types/domain.js";

const labels: Record<ScoreStatus, string> = {
  uploaded: "Enviado",
  queued: "Na fila",
  processing: "Processando",
  converted: "Convertido",
  failed: "Falhou"
};

export function StatusBadge({ status }: { status: ScoreStatus }) {
  return <span className={`status status-${status}`}>{labels[status]}</span>;
}
