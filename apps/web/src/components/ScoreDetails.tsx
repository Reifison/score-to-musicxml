import { Download, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  onRename: (score: Score, originalFilename: string) => Promise<void>;
}) {
  const [name, setName] = useState(() => displayNameWithoutExtension(score.originalFilename));
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState("");
  const extension = useMemo(() => fileExtension(score.originalFilename), [score.originalFilename]);
  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0 && trimmedName !== displayNameWithoutExtension(score.originalFilename);

  useEffect(() => {
    setName(displayNameWithoutExtension(score.originalFilename));
    setRenameError("");
  }, [score.id, score.originalFilename]);

  async function saveName() {
    if (!canSave) return;
    setSaving(true);
    setRenameError("");
    try {
      await onRename(score, trimmedName);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Não foi possível renomear a partitura.");
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

        <label>
          Nome da partitura
          <div className="rename-field">
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} />
            {extension ? <span className="rename-extension">{extension}</span> : null}
          </div>
        </label>
        <div className="rename-actions">
          <button className="secondary-button" disabled={!canSave || saving} onClick={saveName} type="button">
            {saving ? "Salvando..." : "Salvar nome"}
          </button>
        </div>
        {renameError ? <p className="error-text">{renameError}</p> : null}

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

function displayNameWithoutExtension(filename: string) {
  const clean = filename.split(/[\\/]/).pop() || filename;
  const dot = clean.lastIndexOf(".");
  return dot > 0 ? clean.slice(0, dot) : clean;
}

function fileExtension(filename: string) {
  const clean = filename.split(/[\\/]/).pop() || filename;
  const dot = clean.lastIndexOf(".");
  return dot > 0 ? clean.slice(dot) : "";
}
