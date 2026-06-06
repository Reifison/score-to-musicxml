import { Download, Eye, Heart, Trash2 } from "lucide-react";
import type { Score } from "../types/domain.js";
import { StatusBadge } from "./StatusBadge.js";

export function ScoreCard({
  score,
  onOpen,
  onDelete,
  onDownload,
  onToggleFavorite
}: {
  score: Score;
  onOpen: (score: Score) => void;
  onDelete: (score: Score) => void;
  onDownload: (score: Score) => void;
  onToggleFavorite: (score: Score) => void;
}) {
  const hasLongError = score.errorMessage && score.errorMessage.length > 120;

  return (
    <article className="card score-card">
      <div className="score-card-header">
        <div>
          <h3>{score.originalFilename}</h3>
          <p>{score.fileType.toUpperCase()} · {formatBytes(score.fileSize)} · {new Date(score.createdAt).toLocaleDateString()}</p>
        </div>
        <button
          aria-label={score.isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          aria-pressed={score.isFavorite}
          className={`favorite-button ${score.isFavorite ? "active" : ""}`}
          onClick={() => onToggleFavorite(score)}
          title={score.isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          type="button"
        >
          <Heart fill={score.isFavorite ? "currentColor" : "none"} size={20} />
        </button>
      </div>
      <StatusBadge status={score.conversionStatus} />
      {score.errorMessage && (
        <div className="card-error">
          <p className="error-text">{score.errorMessage}</p>
          {hasLongError && (
            <button className="text-button" type="button" onClick={() => onOpen(score)}>
              Ler erro completo
            </button>
          )}
        </div>
      )}
      <div className="card-actions">
        <button className="icon-button" title="Ver detalhes" aria-label="Ver detalhes" onClick={() => onOpen(score)}>
          <Eye size={18} />
          <span>Detalhes</span>
        </button>
        <button className={`icon-button ${score.conversionStatus !== "converted" ? "disabled" : ""}`} title="Baixar MusicXML" aria-label="Baixar MusicXML" onClick={() => onDownload(score)} disabled={score.conversionStatus !== "converted"}>
          <Download size={18} />
          <span>Baixar</span>
        </button>
        <button className="icon-button danger" title="Excluir" aria-label="Excluir" onClick={() => onDelete(score)}>
          <Trash2 size={18} />
          <span>Excluir</span>
        </button>
      </div>
    </article>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
