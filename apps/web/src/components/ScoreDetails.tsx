import { Download, X } from "lucide-react";
import { previewUrl } from "../api/client.js";
import type { Score } from "../types/domain.js";
import { StatusBadge } from "./StatusBadge.js";

export function ScoreDetails({ score, onClose, onDownload }: { score: Score; onClose: () => void; onDownload: (score: Score) => void }) {
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <header>
          <div>
            <h2>{score.originalFilename}</h2>
            <StatusBadge status={score.conversionStatus} />
          </div>
          <button className="icon-button" onClick={onClose} title="Fechar" aria-label="Fechar"><X size={18} /></button>
        </header>
        <dl className="details-grid">
          <dt>Envio</dt><dd>{new Date(score.createdAt).toLocaleString()}</dd>
          <dt>Tipo</dt><dd>{score.mimeType}</dd>
          <dt>Tamanho</dt><dd>{(score.fileSize / 1024).toFixed(1)} KB</dd>
          <dt>Confiança</dt><dd>{score.confidence == null ? "Aguardando" : `${Math.round(score.confidence * 100)}%`}</dd>
        </dl>
        {score.errorMessage && <p className="error-text">{score.errorMessage}</p>}
        {!!score.warnings?.length && <div className="notice">{score.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
        <div className="preview">
          {score.fileType === "image" ? <img src={previewUrl(score.id)} alt={score.originalFilename} /> : <iframe src={previewUrl(score.id)} title={score.originalFilename} />}
        </div>
        <button className={`primary-link ${score.conversionStatus !== "converted" ? "disabled" : ""}`} onClick={() => onDownload(score)} disabled={score.conversionStatus !== "converted"}>
          <Download size={18} /> Baixar MusicXML
        </button>
      </section>
    </div>
  );
}
