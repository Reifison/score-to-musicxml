import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, MapPin, RotateCcw, X } from "lucide-react";
import { ApiError, api, decideVisualReviewProposal } from "../api/client.js";
import type { MusicalValidationIssue, Score, VisualCorrectionProposal, VisualNoteValue } from "../types/domain.js";
import "./guided-review.css";

export type GuidedScoreReviewProps = {
  score: Score;
  originalPreview?: ReactNode;
  resultPreview?: ReactNode;
  onLocateIssue?: (issue: MusicalValidationIssue) => void;
  onLocateProposal?: (proposal: VisualCorrectionProposal) => void;
  onScoreChange?: (score: Score) => void | Promise<void>;
};

type LocalScoreOverride = { scoreId: string; sourceRevision: string | null; sourceUpdatedAt: string; value: Score };
type DecisionAction = "accept" | "reject" | "undo";

export function GuidedScoreReview({ score, originalPreview, resultPreview, onLocateIssue, onLocateProposal, onScoreChange }: GuidedScoreReviewProps) {
  const language = getBrowserLanguage();
  const text = (portuguese: string, english: string) => language === "en" ? english : portuguese;
  const [localOverride, setLocalOverride] = useState<LocalScoreOverride | null>(null);
  const currentScore = localOverride?.scoreId === score.id && localOverride.sourceRevision === (score.reviewRevision ?? null) && localOverride.sourceUpdatedAt === score.updatedAt
    ? localOverride.value
    : score;
  const inputScoreRef = useRef(score);
  const currentScoreRef = useRef(currentScore);
  const sessionEpochRef = useRef(0);
  const decisionControllerRef = useRef<AbortController | null>(null);
  inputScoreRef.current = score;
  currentScoreRef.current = currentScore;
  const [pendingAction, setPendingAction] = useState<{ proposalId: string; decision: DecisionAction } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [locatedId, setLocatedId] = useState("");
  const issues = currentScore.validation?.issues ?? [];
  const review = currentScore.validation?.visualReview;
  const proposals = review?.proposals ?? [];
  const findingCount = issues.length + proposals.length;
  const pendingCount = proposals.filter((proposal) => proposal.status === "pending").length;

  useEffect(() => {
    const handleSessionChange = () => {
      sessionEpochRef.current += 1;
      decisionControllerRef.current?.abort();
      decisionControllerRef.current = null;
      setPendingAction(null);
    };
    window.addEventListener("score-to-musicxml:session-changed", handleSessionChange);
    return () => window.removeEventListener("score-to-musicxml:session-changed", handleSessionChange);
  }, []);

  useLayoutEffect(() => () => {
    decisionControllerRef.current?.abort();
    decisionControllerRef.current = null;
  }, [score.id, score.userId, score.updatedAt, score.reviewRevision]);

  useEffect(() => {
    setPendingAction(null);
  }, [score.id, score.userId, score.updatedAt, score.reviewRevision]);

  async function decide(proposal: VisualCorrectionProposal, decision: DecisionAction) {
    const requestScore = currentScoreRef.current;
    const currentProposal = requestScore.validation?.visualReview?.proposals.find((item) => item.id === proposal.id);
    const revision = requestScore.reviewRevision;
    if (!revision || !currentProposal || !isDecisionAllowed(currentProposal, decision) || pendingAction) return;
    const scoreId = requestScore.id;
    const userId = requestScore.userId;
    const updatedAt = requestScore.updatedAt;
    const sessionEpoch = sessionEpochRef.current;
    const controller = new AbortController();
    decisionControllerRef.current?.abort();
    decisionControllerRef.current = controller;
    const isSameContext = () => sessionEpochRef.current === sessionEpoch
      && inputScoreRef.current.id === scoreId
      && inputScoreRef.current.userId === userId;
    const isCurrentRequest = () => !controller.signal.aborted && isSameContext()
      && inputScoreRef.current.updatedAt === updatedAt
      && currentScoreRef.current.reviewRevision === revision;
    setPendingAction({ proposalId: proposal.id, decision });
    setError("");
    setNotice("");
    try {
      const updated = await decideVisualReviewProposal(scoreId, revision, currentProposal.id, decision, controller.signal);
      if (!isCurrentRequest()) return;
      setLocalOverride({ scoreId, sourceRevision: inputScoreRef.current.reviewRevision ?? null, sourceUpdatedAt: inputScoreRef.current.updatedAt, value: updated });
      await onScoreChange?.(updated);
    } catch (caught) {
      if (!isCurrentRequest()) return;
      if (caught instanceof ApiError && caught.status === 409) {
        try {
          const refreshed = (await api<{ score: Score }>(`/api/scores/${encodeURIComponent(scoreId)}`, { signal: controller.signal })).score;
          if (isCurrentRequest()) {
            setLocalOverride({ scoreId, sourceRevision: inputScoreRef.current.reviewRevision ?? null, sourceUpdatedAt: inputScoreRef.current.updatedAt, value: refreshed });
            await onScoreChange?.(refreshed);
            setNotice(text("A partitura mudou em outra sessão. Os dados foram atualizados; confira antes de continuar.", "This score changed in another session. The latest data is loaded; review it before continuing."));
          }
        } catch {
          if (isCurrentRequest()) setError(text("A revisão mudou. Atualize a partitura antes de tentar novamente.", "The review changed. Refresh the score before trying again."));
        }
      } else {
        setError(caught instanceof Error ? caught.message : text("Não foi possível salvar esta decisão.", "This decision could not be saved."));
      }
    } finally {
      if (!controller.signal.aborted && isSameContext()) {
        setPendingAction((current) => current?.proposalId === currentProposal.id && current.decision === decision ? null : current);
      }
      if (decisionControllerRef.current === controller) decisionControllerRef.current = null;
    }
  }

  function locateIssue(issue: MusicalValidationIssue, id: string) {
    setLocatedId(id);
    onLocateIssue?.(issue);
  }

  function locateProposal(proposal: VisualCorrectionProposal) {
    setLocatedId(proposal.id);
    onLocateProposal?.(proposal);
  }

  return (
    <section className="guided-score-review" aria-label={text("Conferência guiada", "Guided review")}>
      <header className="guided-review-heading">
        <div>
          <h2>{text("Conferir original e resultado", "Compare the original and result")}</h2>
          <p>{text("Use os apontamentos para localizar trechos. As sugestões disponíveis podem ser aceitas, recusadas ou desfeitas.", "Use the findings to locate passages. Available suggestions can be accepted, rejected, or undone.")}</p>
        </div>
        <span className="guided-review-count">{findingCount === 1 ? text("1 apontamento", "1 finding") : text("{{count}} apontamentos", "{{count}} findings").replace("{{count}}", String(findingCount))}</span>
      </header>

      <div className="guided-review-previews">
        <section className="guided-review-preview" aria-label={text("Original", "Original")}>
          <h3>{text("Original", "Original")}</h3>
          {originalPreview ?? <p className="guided-review-empty">{text("Prévia do arquivo original indisponível.", "The original file preview is unavailable.")}</p>}
        </section>
        <section className="guided-review-preview" aria-label={text("Resultado convertido", "Converted result")}>
          <h3>{text("Resultado convertido", "Converted result")}</h3>
          {resultPreview ?? <p className="guided-review-empty">{text("Prévia da partitura indisponível.", "The score preview is unavailable.")}</p>}
        </section>
      </div>

      <div className={`guided-review-findings${issues.length ? "" : " is-proposals-only"}`}>
        {issues.length ? <section aria-labelledby="guided-review-issues-heading">
          <h3 id="guided-review-issues-heading">{text("Apontamentos", "Findings")}</h3>
          {issues.length ? (
            <ul className="guided-review-list">
              {issues.map((issue, index) => {
                const id = `issue:${index}:${issue.code}`;
                const location = issueLocation(issue, language);
                return (
                  <li key={id} className={locatedId === id ? "is-located" : ""}>
                    <div className="guided-review-copy">
                      <strong>{issue.severity === "error" ? text("Verificar", "Check") : text("Atenção", "Review")}</strong>
                      <span>{issue.message}</span>
                      {location ? <small>{location}</small> : null}
                    </div>
                    <button type="button" className="guided-review-locate" aria-pressed={locatedId === id} onClick={() => locateIssue(issue, id)}>
                      <MapPin aria-hidden="true" size={16} /> {text("Localizar", "Locate")}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section> : null}

        <section aria-labelledby="guided-review-proposals-heading">
          <div className="guided-review-subheading">
            <h3 id="guided-review-proposals-heading">{text("Sugestões de nota ou pausa", "Note or rest suggestions")}</h3>
            {review ? <span>{pendingCount === 1 ? text("1 pendente", "1 pending") : text("{{count}} pendentes", "{{count}} pending").replace("{{count}}", String(pendingCount))}</span> : null}
          </div>
          {proposals.length ? (
            <ul className="guided-review-list guided-review-proposals">
              {proposals.map((proposal) => {
                const safe = isSafeProposal(proposal);
                const canUndo = proposal.status === "rejected" || (proposal.status === "accepted" && safe);
                const automaticRejection = proposal.status === "rejected" && isAutomaticRejection(proposal, review?.history ?? []);
                const location = visualLocation(proposal, language);
                const action = pendingAction?.proposalId === proposal.id ? pendingAction.decision : null;
                return (
                  <li key={proposal.id} className={locatedId === proposal.id ? "is-located" : ""}>
                    <div className="guided-review-copy">
                      <strong>{location}</strong>
                      <span>{formatNote(proposal.before, language)} <span aria-hidden="true">→</span> {formatNote(proposal.after, language)}</span>
                      <small>{proposal.reason || (safe ? text("Sugestão ligada à fonte.", "Source-linked suggestion.") : text("Esta sugestão exige conferência manual.", "This suggestion needs manual review."))}</small>
                      {proposal.status !== "pending" ? <small className="guided-review-status">{proposal.status === "accepted" ? text("Aceita", "Accepted") : automaticRejection ? text("Não aplicada automaticamente", "Not applied automatically") : text("Recusada", "Rejected")}</small> : null}
                    </div>
                    <div className="guided-review-actions">
                      <button type="button" className="guided-review-locate" aria-pressed={locatedId === proposal.id} onClick={() => locateProposal(proposal)}>
                        <MapPin aria-hidden="true" size={16} /> {text("Localizar", "Locate")}
                      </button>
                      {safe && proposal.status === "pending" ? <>
                        <button type="button" className="guided-review-action is-accept" disabled={!currentScore.reviewRevision || Boolean(pendingAction)} onClick={() => void decide(proposal, "accept")}>
                          <Check aria-hidden="true" size={16} /> {action === "accept" ? text("Salvando…", "Saving…") : text("Aceitar", "Accept")}
                        </button>
                      </> : null}
                      {proposal.status === "pending" ? <>
                        <button type="button" className="guided-review-action" disabled={!currentScore.reviewRevision || Boolean(pendingAction)} onClick={() => void decide(proposal, "reject")}>
                          <X aria-hidden="true" size={16} /> {action === "reject" ? text("Salvando…", "Saving…") : text("Recusar", "Reject")}
                        </button>
                      </> : null}
                      {canUndo ? (
                        <button type="button" className="guided-review-action" disabled={!currentScore.reviewRevision || Boolean(pendingAction)} onClick={() => void decide(proposal, "undo")}>
                          <RotateCcw aria-hidden="true" size={16} /> {action === "undo" ? text("Desfazendo…", "Undoing…") : automaticRejection ? text("Reavaliar sugestão", "Reconsider suggestion") : text("Desfazer", "Undo")}
                        </button>
                      ) : null}
                    </div>
                    {!safe && proposal.status === "pending" ? <small className="guided-review-unsafe">{text("Aceitar não está disponível: esta sugestão exige conferência manual.", "Accept is unavailable: this suggestion needs manual review.")}</small> : null}
                  </li>
                );
              })}
            </ul>
          ) : <p className="guided-review-empty">{text("Nenhuma sugestão de nota ou pausa disponível.", "No note or rest suggestions are available.")}</p>}
        </section>
      </div>

      {notice ? <p className="guided-review-notice" role="status">{notice}</p> : null}
      {error ? <p className="guided-review-error" role="alert">{error}</p> : null}
    </section>
  );
}

function isSafeProposal(proposal: VisualCorrectionProposal): boolean {
  const validValue = (value: VisualNoteValue | null) => value !== null
    && (value.kind === "note" || value.kind === "rest")
    && Number.isFinite(value.duration) && value.duration > 0
    && (value.kind === "rest" || Boolean(value.step && Number.isInteger(value.octave)));
  return proposal.applicable && validValue(proposal.before) && validValue(proposal.after);
}

function isDecisionAllowed(proposal: VisualCorrectionProposal, decision: DecisionAction): boolean {
  if (decision === "accept") return proposal.status === "pending" && isSafeProposal(proposal);
  if (decision === "reject") return proposal.status === "pending";
  return proposal.status === "rejected" || (proposal.status === "accepted" && isSafeProposal(proposal));
}

function isAutomaticRejection(proposal: VisualCorrectionProposal, history: Array<{ proposalId: string; decision: string; actorId: string }>): boolean {
  const lastDecision = [...history].reverse().find((entry) => entry.proposalId === proposal.id);
  return lastDecision?.decision === "reject" && lastDecision.actorId.startsWith("system:automatic_delivery");
}

function visualLocation(proposal: VisualCorrectionProposal, language: "pt" | "en") {
  return language === "en"
    ? `Page ${proposal.page} · Part ${proposal.partId || "unnamed"} · measure ${proposal.measure}`
    : `Página ${proposal.page} · Parte ${proposal.partId || "sem nome"} · compasso ${proposal.measure}`;
}

function issueLocation(issue: MusicalValidationIssue, language: "pt" | "en") {
  const page = Number.isSafeInteger(issue.page) && (issue.page ?? 0) > 0 ? issue.page : undefined;
  const pageLabel = page ? language === "en" ? `Page ${page}` : `Página ${page}` : "";
  const part = issue.partName || (issue.partId ? `${language === "en" ? "Part" : "Parte"} ${issue.partId}` : "");
  const measure = issue.measure
    ? `${language === "en" ? "measure" : "compasso"} ${issue.measure}${page ? language === "en" ? " on this page" : " nesta página" : ""}`
    : "";
  const staff = issue.staff ? `${language === "en" ? "staff" : "pauta"} ${issue.staff}` : "";
  const voice = issue.voice ? `${language === "en" ? "voice" : "voz"} ${issue.voice}` : "";
  return [pageLabel, part, measure, staff, voice].filter(Boolean).join(" · ");
}

function formatNote(value: VisualNoteValue | null, language: "pt" | "en") {
  if (!value) return language === "en" ? "Value not identified" : "Valor não identificado";
  const pitchNames: Record<string, string> = language === "en"
    ? { A: "A", B: "B", C: "C", D: "D", E: "E", F: "F", G: "G" }
    : { A: "Lá", B: "Si", C: "Dó", D: "Ré", E: "Mi", F: "Fá", G: "Sol" };
  const names: Record<string, string> = language === "en"
    ? { maxima: "maxima", long: "longa", breve: "double whole", whole: "whole", half: "half", quarter: "quarter", eighth: "eighth", "16th": "sixteenth", "32nd": "32nd", "64th": "64th", "128th": "128th" }
    : { maxima: "máxima", long: "longa", breve: "breve", whole: "semibreve", half: "mínima", quarter: "semínima", eighth: "colcheia", "16th": "semicolcheia", "32nd": "fusa", "64th": "semifusa", "128th": "quartifusa" };
  const accidental = ({ "-2": "♭♭", "-1": "♭", "0": "", "1": "♯", "2": "♯♯" } as Record<string, string>)[String(value.alter ?? 0)] ?? "";
  const pitch = value.kind === "rest" ? language === "en" ? "Rest" : "Pausa" : `${pitchNames[value.step ?? ""] ?? (language === "en" ? "Note" : "Nota")}${accidental}${value.octave ?? ""}`;
  const type = names[value.type?.toLowerCase() ?? ""] ?? (language === "en" ? "value" : "valor");
  const dots = Math.max(0, value.dots ?? 0);
  return `${pitch} · ${type}${dots ? ` · ${dots} ${language === "en" ? dots === 1 ? "dot" : "dots" : dots === 1 ? "ponto" : "pontos"}` : ""}`;
}

function getBrowserLanguage(): "pt" | "en" {
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("en") ? "en" : "pt";
}
