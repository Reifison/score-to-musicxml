import { useEffect, useRef, useState } from "react";
import { Download, FileImage, Music2, X } from "lucide-react";
import { previewUrl } from "../api/client.js";
import type { Score } from "../types/domain.js";
import { ScorePlayer } from "./ScorePlayer.js";
import { StatusBadge } from "./StatusBadge.js";

export function ScoreDetails({
  score,
  onClose,
  onDownload,
  onDownloadMidi,
  onRename
}: {
  score: Score;
  onClose: () => void;
  onDownload: (score: Score) => void;
  onDownloadMidi: (score: Score) => void;
  onRename: (score: Score, originalFilename: string) => void | Promise<void>;
}) {
  const extension = score.originalFilename.includes(".") ? `.${score.originalFilename.split(".").pop()}` : "";
  const baseName = extension ? score.originalFilename.slice(0, -extension.length) : score.originalFilename;
  const canShowNotation = score.conversionStatus === "converted";
  const [name, setName] = useState(baseName);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<"notation" | "original">(canShowNotation ? "notation" : "original");
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

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
      <section className="modal score-details-modal" role="dialog" aria-modal="true" aria-label={`Detalhes de ${score.originalFilename}`}>
        <header>
          <div>
            <StatusBadge status={score.conversionStatus} />
          </div>
          <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} title="Fechar" aria-label="Fechar"><X size={18} /></button>
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
        <div className="score-view-tabs" role="tablist" aria-label="Visualização da partitura">
          <button
            id={`notation-tab-${score.id}`}
            className={previewMode === "notation" ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={previewMode === "notation"}
            aria-controls={`notation-panel-${score.id}`}
            disabled={!canShowNotation}
            onClick={() => setPreviewMode("notation")}
          >
            <Music2 aria-hidden="true" size={18} /> Partitura digital
          </button>
          <button
            id={`original-tab-${score.id}`}
            className={previewMode === "original" ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={previewMode === "original"}
            aria-controls={`original-panel-${score.id}`}
            onClick={() => setPreviewMode("original")}
          >
            <FileImage aria-hidden="true" size={18} /> Arquivo original
          </button>
        </div>

        {previewMode === "notation" && canShowNotation ? (
          <div id={`notation-panel-${score.id}`} role="tabpanel" aria-labelledby={`notation-tab-${score.id}`}>
            <ScorePlayer scoreId={score.id} scoreName={score.originalFilename} />
            <p className="score-view-hint">Visualização criada a partir do reconhecimento automático. Compare com o original antes de editar ou compartilhar.</p>
          </div>
        ) : (
          <div id={`original-panel-${score.id}`} role="tabpanel" aria-labelledby={`original-tab-${score.id}`} className="original-score-panel">
            <div className="preview">
              {score.fileType === "image" ? <img src={previewUrl(score.id)} alt={score.originalFilename} /> : <iframe src={previewUrl(score.id)} title={score.originalFilename} />}
            </div>
          </div>
        )}
        <div className="score-download-actions" aria-label="Formatos para download">
          <button className={`primary-link ${score.conversionStatus !== "converted" ? "disabled" : ""}`} onClick={() => onDownload(score)} disabled={score.conversionStatus !== "converted"}>
            <Download aria-hidden="true" size={18} /> Baixar MusicXML
          </button>
          <button className="secondary-button" onClick={() => onDownloadMidi(score)} disabled={score.conversionStatus !== "converted"}>
            <Music2 aria-hidden="true" size={18} /> Baixar MIDI
          </button>
        </div>
      </section>
    </div>
  );
}
