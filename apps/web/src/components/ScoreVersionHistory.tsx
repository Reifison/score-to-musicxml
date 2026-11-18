import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Download, ExternalLink, RefreshCw } from "lucide-react";
import { ApiError, downloadScoreVersionMusicXml, fetchScoreVersions, fetchScoreVersionMusicXml } from "../api/client.js";
import type { Score, ScoreVersion } from "../types/domain.js";
import "./guided-review.css";

export type ScoreVersionHistoryProps = {
  score: Score;
  onOpenVersion?: (version: ScoreVersion, musicXml: string) => void | Promise<void>;
};

type LoadState = "loading" | "ready" | "error";

export function ScoreVersionHistory({ score, onOpenVersion }: ScoreVersionHistoryProps) {
  const language = getBrowserLanguage();
  const text = (portuguese: string, english: string) => language === "en" ? english : portuguese;
  const [versions, setVersions] = useState<ScoreVersion[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [openingId, setOpeningId] = useState("");
  const [exportingId, setExportingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const scoreRef = useRef(score);
  const selectedIdRef = useRef(selectedId);
  const requestSequence = useRef(0);
  const exportSequence = useRef(0);
  const sessionEpochRef = useRef(0);
  const loadControllerRef = useRef<AbortController | null>(null);
  const openControllerRef = useRef<AbortController | null>(null);
  const exportControllerRef = useRef<AbortController | null>(null);
  scoreRef.current = score;
  selectedIdRef.current = selectedId;

  useLayoutEffect(() => () => {
    requestSequence.current += 1;
    exportSequence.current += 1;
    loadControllerRef.current?.abort();
    openControllerRef.current?.abort();
    exportControllerRef.current?.abort();
    loadControllerRef.current = null;
    openControllerRef.current = null;
    exportControllerRef.current = null;
  }, [score.id, score.updatedAt, score.reviewRevision, score.userId]);

  useEffect(() => {
    const handleSessionChange = () => {
      sessionEpochRef.current += 1;
      requestSequence.current += 1;
      exportSequence.current += 1;
      loadControllerRef.current?.abort();
      openControllerRef.current?.abort();
      exportControllerRef.current?.abort();
      setVersions([]);
      setSelectedId("");
      selectedIdRef.current = "";
      setLoadState("error");
      setOpeningId("");
      setExportingId("");
      setError(language === "en" ? "Sign in again to view version history." : "Entre novamente para consultar o histórico.");
    };
    window.addEventListener("score-to-musicxml:session-changed", handleSessionChange);
    return () => window.removeEventListener("score-to-musicxml:session-changed", handleSessionChange);
  }, [language]);

  useEffect(() => {
    const controller = new AbortController();
    loadControllerRef.current?.abort();
    loadControllerRef.current = controller;
    const sessionEpoch = sessionEpochRef.current;
    let current = true;
    setLoadState("loading");
    setError("");
    setNotice("");
    setOpeningId("");
    setExportingId("");
    void fetchScoreVersions(score.id, controller.signal)
      .then((loaded) => {
        if (!current || controller.signal.aborted || sessionEpochRef.current !== sessionEpoch) return;
        setVersions(loaded);
        setSelectedId((selected) => loaded.some((version) => version.id === selected)
          ? selected
          : loaded.find((version) => version.isCurrent)?.id ?? loaded[0]?.id ?? "");
        setLoadState("ready");
      })
      .catch((caught: unknown) => {
        if (!current || controller.signal.aborted || sessionEpochRef.current !== sessionEpoch) return;
        setError(caught instanceof Error ? caught.message : text("Não foi possível carregar o histórico.", "Couldn't load version history."));
        setLoadState("error");
      });
    return () => {
      current = false;
      controller.abort();
      if (loadControllerRef.current === controller) loadControllerRef.current = null;
      requestSequence.current += 1;
      exportSequence.current += 1;
      openControllerRef.current?.abort();
      exportControllerRef.current?.abort();
    };
  }, [score.id, score.reviewRevision, score.updatedAt, score.userId, retry]);

  async function openVersion(version: ScoreVersion) {
    if (!version.available || !onOpenVersion || openingId) return;
    setSelectedId(version.id);
    selectedIdRef.current = version.id;
    const sequence = ++requestSequence.current;
    const sessionEpoch = sessionEpochRef.current;
    const identity = `${score.id}:${score.userId}:${score.updatedAt}:${score.reviewRevision ?? ""}`;
    const controller = new AbortController();
    openControllerRef.current?.abort();
    openControllerRef.current = controller;
    const isCurrent = () => sequence === requestSequence.current
      && sessionEpochRef.current === sessionEpoch
      && identity === `${scoreRef.current.id}:${scoreRef.current.userId}:${scoreRef.current.updatedAt}:${scoreRef.current.reviewRevision ?? ""}`;
    setOpeningId(version.id);
    setError("");
    setNotice("");
    try {
      const musicXml = await fetchScoreVersionMusicXml(score.id, version.id, controller.signal);
      if (!isCurrent() || controller.signal.aborted || version.id !== selectedIdRef.current) return;
      await onOpenVersion(version, musicXml);
      if (isCurrent()) {
        setNotice(text(`Aberta: ${version.label}. A versão atual não foi alterada.`, `Opened: ${version.label}. The current version was not changed.`));
      }
    } catch (caught) {
      if (!isCurrent()) return;
      if (caught instanceof ApiError && caught.status === 410) {
        setVersions((current) => current.map((item) => item.id === version.id ? { ...item, available: false } : item));
        setError(text("Esta versão não está mais disponível.", "This version is no longer available."));
      } else {
        setError(caught instanceof Error ? caught.message : text("Não foi possível abrir esta versão.", "Couldn't open this version."));
      }
    } finally {
      if (sequence === requestSequence.current) {
        setOpeningId("");
        if (openControllerRef.current === controller) openControllerRef.current = null;
      }
    }
  }

  async function exportVersion(version: ScoreVersion) {
    if (!version.available || exportingId) return;
    const sequence = ++exportSequence.current;
    const sessionEpoch = sessionEpochRef.current;
    const identity = `${score.id}:${score.userId}:${score.updatedAt}:${score.reviewRevision ?? ""}`;
    const controller = new AbortController();
    exportControllerRef.current?.abort();
    exportControllerRef.current = controller;
    const isCurrent = () => sequence === exportSequence.current
      && sessionEpochRef.current === sessionEpoch
      && identity === `${scoreRef.current.id}:${scoreRef.current.userId}:${scoreRef.current.updatedAt}:${scoreRef.current.reviewRevision ?? ""}`;
    setExportingId(version.id);
    setError("");
    setNotice("");
    try {
      await downloadScoreVersionMusicXml(score.id, version.id, musicXmlFilename(score.originalFilename, version), controller.signal);
      if (!isCurrent() || controller.signal.aborted) return;
      setNotice(text(`Arquivo exportado: ${version.label}.`, `Exported: ${version.label}.`));
    } catch (caught) {
      if (!isCurrent()) return;
      if (caught instanceof ApiError && caught.status === 410) {
        setVersions((current) => current.map((item) => item.id === version.id ? { ...item, available: false } : item));
        setError(text("Esta versão não está mais disponível.", "This version is no longer available."));
      } else {
        setError(caught instanceof Error ? caught.message : text("Não foi possível exportar esta versão.", "Couldn't export this version."));
      }
    } finally {
      if (sequence === exportSequence.current) {
        setExportingId("");
        if (exportControllerRef.current === controller) exportControllerRef.current = null;
      }
    }
  }

  return (
    <section className="score-version-history" aria-label={text("Histórico de versões", "Version history")}>
      <header className="version-history-heading">
        <div>
          <h2>{text("Histórico de versões", "Version history")}</h2>
          <p>{text("Abra uma versão para compará-la no leitor. Isso não altera a versão atual.", "Open a version to compare it in the score reader. This does not change the current version.")}</p>
        </div>
        {loadState === "ready" ? <span className="guided-review-count">{text("{{count}} versões", "{{count}} versions").replace("{{count}}", String(versions.length))}</span> : null}
      </header>

      {loadState === "loading" ? <p className="version-history-message" role="status">{text("Carregando versões…", "Loading versions…")}</p> : null}
      {loadState === "error" ? <div className="version-history-row" role="alert"><span className="version-history-message is-error">{error}</span><button type="button" className="version-history-button" onClick={() => setRetry((value) => value + 1)}><RefreshCw aria-hidden="true" size={16} />{text("Tentar novamente", "Try again")}</button></div> : null}
      {loadState === "ready" && versions.length === 0 ? <p className="version-history-message">{text("Ainda não há versões salvas.", "No saved versions yet.")}</p> : null}
      {loadState === "ready" && versions.length ? (
        <ul className="version-history-list" aria-label={text("Versões disponíveis", "Available versions")}>
          {versions.map((version) => {
            const selectedRow = selectedId === version.id;
            const busy = openingId === version.id || exportingId === version.id;
            return (
              <li key={version.id} className={selectedRow ? "is-selected" : ""}>
                <button type="button" className="version-history-details" aria-pressed={selectedRow} onClick={() => setSelectedId(version.id)}>
                  <strong>{version.label}{version.isCurrent ? <span className="version-history-current"> · {text("Atual", "Current")}</span> : null}</strong>
                  <span>{formatDate(version.createdAt, language)} · {statusLabel(version.status, language)} · {version.kind === "correction" ? text("correção", "correction") : text("conversão", "conversion")}</span>
                  {version.coverage ? <small>{text("{{processed}} de {{total}} páginas", "{{processed}} of {{total}} pages").replace("{{processed}}", String(version.coverage.processedPages)).replace("{{total}}", String(version.coverage.totalPages))}{version.coverage.missingPages.length ? ` · ${text("{{count}} ausentes", "{{count}} missing").replace("{{count}}", String(version.coverage.missingPages.length))}` : ""}</small> : null}
                  {!version.available ? <small className="version-history-unavailable">{text("Arquivo indisponível", "File unavailable")}</small> : null}
                </button>
                <div className="version-history-actions">
                  <button type="button" className="version-history-button" disabled={!version.available || !onOpenVersion || Boolean(openingId)} onClick={() => void openVersion(version)}>
                    <ExternalLink aria-hidden="true" size={16} />{openingId === version.id ? text("Abrindo…", "Opening…") : text("Abrir", "Open")}
                  </button>
                  <button type="button" className="version-history-button" disabled={!version.available || Boolean(exportingId)} onClick={() => void exportVersion(version)}>
                    <Download aria-hidden="true" size={16} />{exportingId === version.id ? text("Exportando…", "Exporting…") : text("Exportar", "Export")}
                  </button>
                  {busy ? <span role="status" className="guided-review-count">{text("Aguarde", "Please wait")}</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {notice ? <p className="version-history-message" role="status">{notice}</p> : null}
      {error && loadState === "ready" ? <p className="version-history-message is-error" role="alert">{error}</p> : null}
    </section>
  );
}

function statusLabel(status: ScoreVersion["status"], language: "pt" | "en") {
  const labels: Record<ScoreVersion["status"], [string, string]> = {
    complete: ["completa", "complete"],
    partial: ["parcial", "partial"],
    needs_review: ["precisa de revisão", "needs review"],
    approved: ["disponível", "available"],
    unverified: ["não verificada", "unverified"]
  };
  return labels[status][language === "en" ? 1 : 0];
}

function formatDate(value: string, language: "pt" | "en") {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function musicXmlFilename(filename: string, version: ScoreVersion) {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._ -]/g, "_").trim() || "score";
  return `${base}-${version.kind}-${version.id.replace(/[^a-zA-Z0-9]/g, "-").slice(-12)}.musicxml`;
}

function getBrowserLanguage(): "pt" | "en" {
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("en") ? "en" : "pt";
}
