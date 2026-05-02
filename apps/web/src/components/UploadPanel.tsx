import { UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

export function UploadPanel({ onUpload }: { onUpload: (file: File) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await onUpload(file);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
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
      <div>
        <strong>{file ? file.name : "Envie PDF ou imagem da partitura"}</strong>
        <span>PNG, JPG, JPEG, WEBP ou PDF até 10 MB</span>
      </div>
      <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      <button onClick={() => inputRef.current?.click()} type="button">Selecionar</button>
      <button onClick={submit} disabled={!file || busy} type="button">{busy ? "Enviando..." : "Enviar"}</button>
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}
