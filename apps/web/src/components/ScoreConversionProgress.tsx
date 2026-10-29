import type { ConversionProgressLanguage } from "../score/conversionProgressPresentation.js";
import { conversionProgressPresentation } from "../score/conversionProgressPresentation.js";
import type { Score } from "../types/domain.js";

export function ScoreConversionProgress({
  score,
  language = getBrowserLanguage()
}: {
  score: Score;
  language?: ConversionProgressLanguage;
}) {
  const presentation = conversionProgressPresentation(score, language);
  if (!presentation) return null;

  return (
    <section
      aria-atomic="true"
      aria-label={presentation.announcement}
      aria-live="polite"
      lang={language === "en" ? "en-US" : "pt-BR"}
      role="status"
      style={{
        borderTop: "1px solid var(--line)",
        display: "grid",
        gap: 4,
        minWidth: 0,
        overflowWrap: "anywhere",
        paddingBlock: 10
      }}
    >
      <strong style={{ color: presentation.interrupted ? "var(--danger)" : "var(--brand-2)", fontSize: 14, lineHeight: 1.4 }}>
        {presentation.stageLabel}
      </strong>
      <span style={{ color: "var(--text)", fontSize: 14, lineHeight: 1.45 }}>{presentation.summary}</span>
      {presentation.currentPageLabel ? <span style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.4 }}>{presentation.currentPageLabel}</span> : null}
      {presentation.details.length ? (
        <span style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.4, overflowWrap: "anywhere" }}>
          {presentation.details.join(" · ")}
        </span>
      ) : null}
    </section>
  );
}

function getBrowserLanguage(): ConversionProgressLanguage {
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("en") ? "en" : "pt";
}
