import { Download, Eye, Trash2 } from "lucide-react";
import type { Score } from "../types/domain.js";
import { StatusBadge } from "./StatusBadge.js";

export function ScoreCard({ score, onOpen, onDelete, onDownload }: { score: Score; onOpen: (score: Score) => void; onDelete: (score: Score) => void; onDownload: (score: Score) => void }) {
  return (
    <article className="card score-card">
      <div>
        <h3>{score.originalFilename}</h3>
        <p>{score.fileType.toUpperCase()} · {formatBytes(score.fileSize)} · {new Date(score.createdAt).toLocaleDateString()}</p>
      </div>
      <StatusBadge status={score.conversionStatus} />
      {score.errorMessage && <p className="error-text">{score.errorMessage}</p>}
      <div className="card-actions">
        <button className="icon-button" title="Ver detalhes" onClick={() => onOpen(score)}><Eye size={18} /></button>
        <button className={`icon-button ${score.conversionStatus !== "converted" ? "disabled" : ""}`} title="Baixar MusicXML" onClick={() => onDownload(score)} disabled={score.conversionStatus !== "converted"}>
          <Download size={18} />
        </button>
        <button className="icon-button danger" title="Excluir" onClick={() => onDelete(score)}><Trash2 size={18} /></button>
      </div>
    </article>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
