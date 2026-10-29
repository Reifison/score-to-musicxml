import { useEffect, useRef, useState } from "react";
import { Download, FileImage, Music2, X } from "lucide-react";
import { previewUrl } from "../api/client.js";
import { canDownloadScoreMusicXml, canExportScoreMidi, canPlayScore } from "../score/availability.js";
import type { MusicalValidationIssue, Score, ScoreType, ScoreVersion, VisualCorrectionProposal } from "../types/domain.js";
import { GuidedScoreReview } from "./GuidedScoreReview.js";
import { ScoreVersionHistory } from "./ScoreVersionHistory.js";
import "./ScoreStudyWorkspace.css";
import { RecognitionQualityNotice } from "./RecognitionQualityNotice.js";
import { FirstPagePreview } from "./FirstPagePreview.js";
import { ScoreConversionProgress } from "./ScoreConversionProgress.js";
import { ScorePlayer } from "./ScorePlayer.js";
import { StatusBadge } from "./StatusBadge.js";

export function ScoreDetails({
  score: inputScore,
  onClose,
  onDownload,
  onDownloadMidi,
  onRename,
  detailError,
  onRetry,
  onRefreshDetail
}: {
  score: Score;
  onClose: () => void;
  onDownload: (score: Score) => void;
  onDownloadMidi: (score: Score) => void;
  onRename: (score: Score, originalFilename: string) => void | Promise<void>;
  detailError: string;
  onRetry: (scoreId: string, scoreType?: ScoreType) => Promise<Score>;
  onRefreshDetail: (scoreId: string) => Promise<Score | null>;
}) {
  const [reviewOverride, setReviewOverride] = useState<{ sourceId: string; sourceRevision: string | null; sourceUpdatedAt: string; value: Score } | null>(null);
  const score = reviewOverride?.sourceId === inputScore.id && reviewOverride.sourceRevision === (inputScore.reviewRevision ?? null) && reviewOverride.sourceUpdatedAt === inputScore.updatedAt
    ? reviewOverride.value : inputScore;
  const inputScoreRef = useRef(inputScore);
  inputScoreRef.current = inputScore;
  const extension = score.originalFilename.includes(".") ? `.${score.originalFilename.split(".").pop()}` : "";
  const baseName = extension ? score.originalFilename.slice(0, -extension.length) : score.originalFilename;
  const canShowNotation = score.conversionStatus === "converted" && Boolean(score.musicxmlFilename);
  const canPlay = canPlayScore(score);
  const canExportMidi = canExportScoreMidi(score);
  const canDownloadXml = canDownloadScoreMusicXml(score);
  const coverage = score.coverage;
  const attempts = [...(score.attempts ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const hasActiveAttempt = attempts.some((attempt) => attempt.status === "queued" || attempt.status === "processing");
  const manualRetryUsed = attempts.some((attempt) => attempt.kind === "manual");
  const latestAttempt = attempts[0];
  const canRetry = score.attempts !== undefined
    && !hasActiveAttempt
    && !manualRetryUsed
    && (score.conversionStatus === "failed" || Boolean(score.musicxmlFilename) || latestAttempt?.status === "failed");
  const [name, setName] = useState(baseName);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryScoreType, setRetryScoreType] = useState<ScoreType | "">(score.scoreTypeSelected === false ? "" : score.scoreType ?? "melody");
  const [renameError, setRenameError] = useState("");
  const [retryError, setRetryError] = useState("");
  const [previewMode, setPreviewMode] = useState<"notation" | "original" | "review" | "versions">(canShowNotation ? "notation" : "original");
  const [originalPage, setOriginalPage] = useState(1);
  const [historicalVersion, setHistoricalVersion] = useState<{ version: ScoreVersion; musicXml: string } | null>(null);
  const [readingTarget, setReadingTarget] = useState<{ id: string; measure?: string }>();
  const locationSequence = useRef(0);
  const currentScoreRef = useRef(score.id);
  currentScoreRef.current = score.id;
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const backdrop = dialog?.parentElement;
    const appShell = backdrop?.parentElement;
    const backgroundElements = appShell
      ? Array.from(appShell.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== backdrop)
      : [];
    const previousInert = backgroundElements.map((element) => element.inert);
    backgroundElements.forEach((element) => { element.inert = true; });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), iframe, [tabindex]:not([tabindex="-1"])'
      )).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && activeIndex <= 0) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeIndex === -1 || activeIndex === focusable.length - 1)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      backgroundElements.forEach((element, index) => { element.inert = previousInert[index]; });
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    setPreviewMode(canShowNotation ? "notation" : "original");
    setOriginalPage(1);
    setHistoricalVersion(null);
    setReadingTarget(undefined);
  }, [score.id, canShowNotation]);

  async function submitRename(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName === baseName) return;
    setSaving(true);
    setRenameError("");
    try {
      await onRename(score, `${trimmedName}${extension}`);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Não foi possível salvar o nome.");
    } finally {
      setSaving(false);
    }
  }

  async function retryConversion() {
    if (score.scoreTypeSelected === false && !retryScoreType) {
      setRetryError("Escolha o tipo de partitura antes de tentar novamente.");
      return;
    }
    setRetryError("");
    setRetrying(true);
    dialogRef.current?.focus({ preventScroll: true });
    try {
      await onRetry(score.id, score.scoreTypeSelected === false ? retryScoreType as ScoreType : undefined);
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Não foi possível iniciar uma nova tentativa.");
    } finally {
      setRetrying(false);
    }
  }

  const sourceTypeLabel = scoreTypeLabel(score.scoreType);
  const totalSourcePages = Math.max(1, score.coverage?.totalPages ?? 1);
  const originalImageUrl = new URL(previewUrl(score.id));
  originalImageUrl.pathname += "-image";
  originalImageUrl.searchParams.set("page", String(originalPage));
  const originalReviewPreview = <section className="review-original-page" aria-label="Página do arquivo original">
    <div className="review-source-navigation">
      <button type="button" className="secondary-button" disabled={originalPage <= 1} onClick={() => setOriginalPage((page) => Math.max(1, page - 1))} aria-label="Página anterior do original">Anterior</button>
      <span aria-live="polite">Página {originalPage} de {totalSourcePages}</span>
      <button type="button" className="secondary-button" disabled={originalPage >= totalSourcePages} onClick={() => setOriginalPage((page) => Math.min(totalSourcePages, page + 1))} aria-label="Próxima página do original">Próxima</button>
    </div>
    <img src={originalImageUrl.toString()} alt={`Página ${originalPage} do original de ${score.originalFilename}`} />
  </section>;
  const locateReviewItem = (item: MusicalValidationIssue | VisualCorrectionProposal) => {
    if (item.page && item.page > 0) setOriginalPage(item.page);
    if (item.measure) {
      locationSequence.current += 1;
      setReadingTarget({ id: `review-${locationSequence.current}`, measure: item.measure });
    }
  };
  const refreshReviewedScore = async (updated: Score) => {
    if (currentScoreRef.current !== updated.id) return;
    setReviewOverride({ sourceId: updated.id, sourceRevision: inputScoreRef.current.reviewRevision ?? null, sourceUpdatedAt: inputScoreRef.current.updatedAt, value: updated });
    await onRefreshDetail(updated.id);
  };

  return (
    <div className="modal-backdrop">
      <section ref={dialogRef} className="modal score-details-modal" role="dialog" aria-modal="true" aria-label={`Detalhes de ${score.originalFilename}`} tabIndex={-1}>
        <header>
          <div>
            <StatusBadge status={score.conversionStatus} resultStatus={score.resultStatus} recognitionQuality={score.recognitionQuality} />
          </div>
          <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} title="Fechar" aria-label="Fechar"><X size={18} /></button>
        </header>
        <ScoreConversionProgress score={score} />
        <FirstPagePreview score={score} />
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
        {renameError && <p className="error-text" role="alert">{renameError}</p>}
        {detailError && <div className="refresh-error" role="alert"><span>{detailError}</span><button className="secondary-button" type="button" onClick={() => void onRefreshDetail(score.id)}>Atualizar detalhes</button></div>}
        {score.scoreType && <p className="score-type-summary">Tipo de partitura: {sourceTypeLabel}{score.scoreTypeSelected === false ? " (padrão do sistema; sem escolha registrada)" : ""}</p>}
        {score.errorMessage && (
          <div className="score-conversion-error" role="status">
            <strong>{score.conversionStatus === "converted" && latestAttempt?.status === "failed" ? "A nova tentativa falhou; o resultado anterior continua disponível." : "Não foi possível concluir a conversão."}</strong>
            <p>{score.errorMessage}</p>
          </div>
        )}
        {score.resultStatus === "partial" && (
          <p className="partial-midi-note" role="status">A partitura está incompleta.{coverage?.missingPages.length ? ` Páginas ausentes: ${coverage.missingPages.join(", ")}.` : ""}</p>
        )}
        {score.conversionStatus === "converted" ? <RecognitionQualityNotice quality={score.recognitionQuality} /> : null}
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
          <button id={`review-tab-${score.id}`} className={previewMode === "review" ? "active" : ""} type="button" role="tab"
            aria-selected={previewMode === "review"} aria-controls={`review-panel-${score.id}`} disabled={!canShowNotation} onClick={() => setPreviewMode("review")}>Conferir</button>
          <button id={`versions-tab-${score.id}`} className={previewMode === "versions" ? "active" : ""} type="button" role="tab"
            aria-selected={previewMode === "versions"} aria-controls={`versions-panel-${score.id}`} disabled={!canShowNotation} onClick={() => setPreviewMode("versions")}>Versões</button>
        </div>

        {previewMode === "review" && canShowNotation ? (
          <div id={`review-panel-${score.id}`} role="tabpanel" aria-labelledby={`review-tab-${score.id}`}>
            <GuidedScoreReview score={score} originalPreview={originalReviewPreview}
              resultPreview={<ScorePlayer scoreId={score.id} scoreRevision={score.reviewRevision ?? score.musicxmlFilename ?? undefined} scoreName={score.originalFilename} allowPlayback={canPlay} previewOnly={!canDownloadXml} readingTarget={readingTarget} />}
              onLocateIssue={locateReviewItem} onLocateProposal={locateReviewItem} onScoreChange={refreshReviewedScore} />
          </div>
        ) : previewMode === "versions" && canShowNotation ? (
          <div id={`versions-panel-${score.id}`} role="tabpanel" aria-labelledby={`versions-tab-${score.id}`}>
            <ScoreVersionHistory score={score} onOpenVersion={(version, musicXml) => {
              if (currentScoreRef.current !== score.id) return;
              setHistoricalVersion(version.isCurrent ? null : { version, musicXml });
              setPreviewMode("notation");
            }} />
          </div>
        ) : previewMode === "notation" && canShowNotation ? (
          <div id={`notation-panel-${score.id}`} role="tabpanel" aria-labelledby={`notation-tab-${score.id}`}>
            {historicalVersion ? <div className="historical-version-banner" role="status">
              <span><strong>{historicalVersion.version.label}</strong> · versão anterior, somente visualização</span>
              <button className="secondary-button" type="button" onClick={() => setHistoricalVersion(null)}>Voltar à versão atual</button>
            </div> : null}
            <ScorePlayer
              key={`${score.id}:${historicalVersion?.version.id ?? score.musicxmlFilename ?? ""}:${score.convertedAt ?? ""}:${canDownloadXml}:${canPlay}`}
              scoreId={historicalVersion ? undefined : score.id}
              musicXml={historicalVersion?.musicXml}
              scoreRevision={historicalVersion?.version.revision ?? score.reviewRevision ?? undefined}
              scoreName={score.originalFilename}
              allowPlayback={!historicalVersion && canPlay}
              previewOnly={Boolean(historicalVersion) || !canDownloadXml}
            />
            {!historicalVersion && canPlay && score.resultStatus === "partial" && <p className="playback-message">Reprodução dos trechos convertidos. As páginas ausentes não serão tocadas.</p>}
            <p className="score-view-hint">{historicalVersion ? "A versão atual foi preservada. Você pode exportar esta versão no histórico." : "Visualização da notação convertida para MusicXML."}</p>
          </div>
        ) : (
          <div id={`original-panel-${score.id}`} role="tabpanel" aria-labelledby={`original-tab-${score.id}`} className="original-score-panel">
            <div className="preview">
              {score.fileType === "image" ? <img src={previewUrl(score.id)} alt={score.originalFilename} /> : <iframe src={previewUrl(score.id)} title={score.originalFilename} />}
            </div>
          </div>
        )}
        {retrying && <p className="retry-status" role="status" aria-live="polite">Enviando a conversão para a fila...</p>}
        {retryError && <p className="error-text" role="alert">{retryError}</p>}
        {canRetry && score.scoreTypeSelected === false && (
          <label className="retry-type-control" htmlFor={`retry-score-type-${score.id}`}>
            Escolha o tipo para esta nova tentativa
            <select id={`retry-score-type-${score.id}`} value={retryScoreType} onChange={(event) => setRetryScoreType(event.target.value as ScoreType | "")} required>
              <option value="">Selecione o tipo da partitura</option>
              <option value="melody">Melodia</option>
              <option value="piano">Piano</option>
              <option value="guitar_solo">Violão solo</option>
              <option value="guitar_duo">Violão duo</option>
            </select>
          </label>
        )}
        {canRetry && <button className="secondary-button retry-conversion-button" type="button" disabled={retrying || (score.scoreTypeSelected === false && !retryScoreType)} onClick={() => void retryConversion()}>{retrying ? "Enfileirando..." : "Tentar novamente"}</button>}
        <div className="score-download-actions" aria-label="Formatos para download">
          <button className={`primary-link ${!canDownloadXml ? "disabled" : ""}`} onClick={() => onDownload(score)} disabled={!canDownloadXml}>
            <Download aria-hidden="true" size={18} /> {canDownloadXml
              ? historicalVersion ? "Baixar MusicXML atual" : score.resultStatus === "partial" ? "Baixar MusicXML parcial" : score.resultStatus == null ? "Baixar MusicXML · cobertura desconhecida" : "Baixar MusicXML"
              : "MusicXML ainda não disponível"}
          </button>
          <button className="secondary-button" onClick={() => onDownloadMidi(score)} disabled={score.conversionStatus !== "converted" || !canExportMidi}>
            <Music2 aria-hidden="true" size={18} /> {historicalVersion ? "Baixar MIDI atual" : "Baixar MIDI"}
          </button>
        </div>
        {score.resultStatus === "partial" && <p className="partial-midi-note">O download em MIDI fica indisponível para conversões parciais.</p>}
      </section>
    </div>
  );
}

function scoreTypeLabel(scoreType: Score["scoreType"]): string {
  switch (scoreType) {
    case "melody": return "Melodia";
    case "piano": return "Piano";
    case "guitar_solo": return "Violão solo";
    case "guitar_duo": return "Violão duo";
    default: return "Melodia";
  }
}
