import { Camera, FolderOpen, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import type { Score, ScoreType } from "../types/domain.js";
import { StatusBadge } from "./StatusBadge.js";

export function UploadPanel({
  onUpload,
  recentUpload,
  onOpenScore
}: {
  onUpload: (file: File, scoreType: ScoreType) => Promise<Score>;
  recentUpload: Score | null;
  onOpenScore: (score: Score) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [scoreType, setScoreType] = useState<ScoreType | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!file || !scoreType) return;
    setBusy(true);
    setError("");
    try {
      await onUpload(file, scoreType);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no upload.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="upload-panel" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault();
      setFile(event.dataTransfer.files?.[0] ?? null);
    }}>
      <UploadCloud size={28} />
      <div className="upload-copy">
        <strong>{file ? file.name : "Envie PDF ou imagem da partitura"}</strong>
        <span>PNG, JPG, JPEG, WEBP ou PDF até 10 MB</span>
      </div>
      <label className="score-type-control" htmlFor="score-type">
        Tipo de partitura
        <select id="score-type" value={scoreType} onChange={(event) => setScoreType(event.target.value as ScoreType | "")} required>
          <option value="">Selecione o tipo da partitura</option>
          <option value="melody">Melodia</option>
          <option value="piano">Piano</option>
          <option value="guitar_solo">Violão solo</option>
          <option value="guitar_duo">Violão duo</option>
        </select>
      </label>
      <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      <button className="secondary-button" onClick={() => cameraInputRef.current?.click()} type="button"><Camera size={18} /> Câmera</button>
      <button className="secondary-button" onClick={() => inputRef.current?.click()} type="button"><FolderOpen size={18} /> Selecionar</button>
      <button onClick={() => void submit()} disabled={!file || !scoreType || busy} type="button"><UploadCloud size={18} /> {busy ? "Enviando..." : error ? "Tentar novamente" : "Enviar"}</button>
      {busy && <p className="upload-progress" role="status" aria-live="polite">Enviando {file?.name}...</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      {recentUpload && (
        <div className="upload-result" role="status" aria-live="polite">
          <div>
            <strong>Envio recebido: {recentUpload.originalFilename}</strong>
            <span>Acompanhe a conversão. Situação atual:</span>
            <StatusBadge status={recentUpload.conversionStatus} resultStatus={recentUpload.resultStatus} />
          </div>
          <button className="secondary-button" type="button" onClick={() => onOpenScore(recentUpload)}>
            Ver andamento
          </button>
        </div>
      )}
    </section>
  );
}
