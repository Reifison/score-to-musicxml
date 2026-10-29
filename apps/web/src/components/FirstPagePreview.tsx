import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, fetchFirstPagePreview } from "../api/client.js";
import { currentFirstPagePreview } from "../score/firstPagePreview.js";
import type { Score } from "../types/domain.js";
import { ScorePlayer } from "./ScorePlayer.js";

type PreviewLoadState =
  | { identity: string; status: "loading" }
  | { identity: string; status: "ready"; musicXml: string }
  | { identity: string; status: "error" | "removed" };

export function FirstPagePreview({ score }: { score: Score }) {
  const preview = currentFirstPagePreview(score);
  const identity = preview
    ? JSON.stringify([score.userId, score.id, preview.attemptId, preview.revision])
    : "";
  const [loadState, setLoadState] = useState<PreviewLoadState>({ identity: "", status: "loading" });
  const [retryCount, setRetryCount] = useState(0);
  const language = getBrowserLanguage();

  useEffect(() => {
    if (!preview) {
      setLoadState({ identity: "", status: "loading" });
      return;
    }

    const requestIdentity = JSON.stringify([score.userId, score.id, preview.attemptId, preview.revision]);
    const controller = new AbortController();
    let current = true;
    setLoadState({ identity: requestIdentity, status: "loading" });
    void fetchFirstPagePreview(score.id, preview.revision, controller.signal)
      .then((musicXml) => {
        if (current) setLoadState({ identity: requestIdentity, status: "ready", musicXml });
      })
      .catch((error: unknown) => {
        if (!current || controller.signal.aborted) return;
        setLoadState({
          identity: requestIdentity,
          status: error instanceof ApiError && error.status !== null && [404, 409, 410].includes(error.status) ? "removed" : "error"
        });
      });

    return () => {
      current = false;
      controller.abort();
    };
  }, [preview?.attemptId, preview?.revision, retryCount, score.id, score.userId]);

  if (!preview) return null;

  const visibleState = loadState.identity === identity ? loadState : { identity, status: "loading" as const };
  const text = (portuguese: string, english: string) => language === "en" ? english : portuguese;

  return (
    <section
      aria-label={text("Prévia da primeira página", "First-page preview")}
      className="first-page-preview"
      style={{
        background: "var(--surface, #fffdf9)",
        border: "1px solid var(--line, #e5ddd5)",
        borderRadius: 18,
        display: "grid",
        gap: 10,
        marginBlock: 14,
        minWidth: 0,
        padding: 16
      }}
    >
      <div style={{ alignItems: "baseline", display: "flex", flexWrap: "wrap", gap: "6px 12px", justifyContent: "space-between" }}>
        <h3 style={{ color: "var(--text, #3c332f)", fontSize: 16, lineHeight: 1.35, margin: 0 }}>
          {text("Prévia da primeira página", "First-page preview")}
        </h3>
        <span style={{ color: "var(--muted, #766963)", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
          {language === "en" ? `Page 1 of ${preview.totalPages}` : `Página 1 de ${preview.totalPages}`}
        </span>
      </div>
      <p style={{ color: "var(--muted, #766963)", fontSize: 14, lineHeight: 1.5, margin: 0, maxWidth: "70ch" }}>
        {text(
          "A conversão continua. Esta prévia é provisória e ainda não foi conferida com o original.",
          "Conversion is continuing. This preview is provisional and has not yet been checked against the original."
        )}
      </p>
      {preview.warnings.length > 0 ? (
        <ul style={{ color: "var(--text, #3c332f)", display: "grid", gap: 5, margin: 0, paddingInlineStart: 20 }}>
          {preview.warnings.map((warning, index) => <li key={`${index}:${warning}`}>{warning}</li>)}
        </ul>
      ) : null}
      {visibleState.status === "ready" ? (
        <ScorePlayer
          key={identity}
          allowPlayback={false}
          musicXml={visibleState.musicXml}
          previewOnly
          scoreName={score.originalFilename}
        />
      ) : visibleState.status === "loading" ? (
        <div
          aria-live="polite"
          role="status"
          style={{ background: "var(--surface-muted, #f3efe9)", borderRadius: 12, display: "grid", gap: 12, minHeight: 150, padding: 16 }}
        >
          <span style={{ color: "var(--muted, #766963)", fontSize: 14 }}>{text("Carregando a prévia…", "Loading the preview…")}</span>
          <span aria-hidden="true" style={{ background: "var(--line, #e5ddd5)", borderRadius: 3, height: 8, maxWidth: "68%" }} />
          <span aria-hidden="true" style={{ background: "var(--line, #e5ddd5)", borderRadius: 3, height: 8, maxWidth: "86%" }} />
          <span aria-hidden="true" style={{ background: "var(--line, #e5ddd5)", borderRadius: 3, height: 8, maxWidth: "54%" }} />
        </div>
      ) : visibleState.status === "removed" ? (
        <p role="status" style={{ color: "var(--muted, #766963)", margin: 0 }}>
          {text("Esta prévia não está mais disponível. A conversão continua.", "This preview is no longer available. Conversion is continuing.")}
        </p>
      ) : (
        <div role="alert" style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 10 }}>
          <span style={{ color: "var(--danger, #b73d32)", fontSize: 14 }}>
            {text("Não foi possível carregar a prévia. Verifique sua conexão e tente novamente.", "Couldn't load the preview. Check your connection and try again.")}
          </span>
          <button className="secondary-button" type="button" onClick={() => setRetryCount((count) => count + 1)}>
            <RefreshCw aria-hidden="true" size={16} /> {text("Tentar novamente", "Try again")}
          </button>
        </div>
      )}
    </section>
  );
}

function getBrowserLanguage(): "pt" | "en" {
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("en") ? "en" : "pt";
}
