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
        {score.errorMessage && <p className="error-text">{score.errorMessage}</p>}
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
