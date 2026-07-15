import { useState } from "react";
import { Download, X } from "lucide-react";
import { previewUrl } from "../api/client.js";
import type { Score } from "../types/domain.js";
import { StatusBadge } from "./StatusBadge.js";

export function ScoreDetails({
  score,
  onClose,
  onDownload,
  onRename
}: {
  score: Score;
  onClose: () => void;
  onDownload: (score: Score) => void;
  onRename: (score: Score, originalFilename: string) => void | Promise<void>;
}) {
  const extension = score.originalFilename.includes(".") ? `.${score.originalFilename.split(".").pop()}` : "";
  const baseName = extension ? score.originalFilename.slice(0, -extension.length) : score.originalFilename;
  const [name, setName] = useState(baseName);
  const [saving, setSaving] = useState(false);

  async function submitRename(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName === baseName) return;
    setSaving(true);
    try {
      await onRename(score, `${trimmedName}${extension}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="modal">
        <header>
          <div>
            <StatusBadge status={score.conversionStatus} />
          </div>
          <button className="icon-button" onClick={onClose} title="Fechar" aria-label="Fechar"><X size={18} /></button>
        </header>
        <form className="score-name-form" onSubmit={submitRename}>
          <label>
            Nome da partitura
            <span className="score-name-row">
              <input value={name} onChange={(event) => setName(event.target.value)} />
              {extension && <span>{extension}</span>}
            </span>
          </label>
          <button type="submit" disabled={saving || !name.trim() || name.trim() === baseName}>{saving ? "Salvando..." : "Salvar nome"}</button>
        </form>
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
