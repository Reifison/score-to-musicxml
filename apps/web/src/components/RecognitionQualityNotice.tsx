import type { RecognitionQuality, RecognitionQualityIssue } from "../types/domain.js";

export function RecognitionQualityNotice({ quality }: { quality?: RecognitionQuality | null }) {
  if (!quality) return null;

  const needsReview = quality.status === "needs_review";
  const title = needsReview ? "Revisar partitura" : "Conferir original";
  const summary = needsReview
    ? quality.issues.length
      ? "Há trechos que precisam ser conferidos no arquivo original."
      : "Confira esta partitura com o arquivo original antes de usar."
    : quality.issues.length
      ? "Os avisos abaixo indicam limites da comparação com o original; eles não confirmam um erro musical. Confira a partitura antes de usar."
      : unverifiedSummary(quality.sourceComparison);

  return (
    <section className={`recognition-quality-notice ${needsReview ? "recognition-quality-needs-review" : "recognition-quality-unverified"}`} role="status" aria-label={title}>
      <strong>{title}</strong>
      <p>{summary}</p>
      {quality.issues.length > 0 ? (
        <ul>
          {quality.issues.map((issue, index) => (
            <li key={`${issue.code}:${issue.page ?? ""}:${issue.measure ?? ""}:${index}`}>
              <strong>{recognitionIssueLocation(issue)}</strong>
              <span>{issue.message.trim() || "Confira este trecho no arquivo original."}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function unverifiedSummary(sourceComparison: RecognitionQuality["sourceComparison"]): string {
  switch (sourceComparison) {
    case "compared":
      return "A comparação com o original não confirma a fidelidade da conversão. Confira a partitura antes de usar.";
    case "partial":
      return "A comparação cobriu apenas parte da partitura. Confira o restante no arquivo original antes de usar.";
    case "unavailable":
      return "Não foi possível comparar esta conversão com o original. Confira a partitura antes de usar.";
    case "skipped":
      return "Esta conversão ainda não foi comparada com o original. Confira a partitura antes de usar.";
  }
}

function recognitionIssueLocation(issue: RecognitionQualityIssue): string {
  const page = Number.isInteger(issue.page) && (issue.page ?? 0) > 0 ? `Página ${issue.page}` : "";
  const measure = issue.measure?.trim();
  const location = [page, measure ? `compasso ${measure}` : ""].filter(Boolean).join(" · ");
  return location ? `${location}: ` : "Partitura: ";
}
