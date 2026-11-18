import type { ConversionAttempt, ConversionProgress, Score } from "../types/domain.js";

export type ConversionProgressLanguage = "pt" | "en";

export type ConversionProgressPresentation = {
  stageLabel: string;
  summary: string;
  currentPageLabel?: string;
  details: string[];
  announcement: string;
  interrupted: boolean;
};

type ScoreProgressState = Pick<Score, "conversionProgress" | "conversionStatus" | "attempts">;

const activeProgressStages = new Set<ConversionProgress["stage"]>(["preparing", "recognizing", "validating"]);

export function isConversionProgressActive(progress: ConversionProgress | null | undefined): boolean {
  return Boolean(progress && activeProgressStages.has(progress.stage));
}

export function hasActiveConversionAttempt(attempts: ConversionAttempt[] | undefined): boolean {
  return Boolean(attempts?.some((attempt) => attempt.status === "queued" || attempt.status === "processing"));
}

export function shouldPollConversionScore(score: ScoreProgressState | undefined): boolean {
  if (!score) return false;
  return score.conversionStatus === "uploaded"
    || score.conversionStatus === "queued"
    || score.conversionStatus === "processing"
    || hasActiveConversionAttempt(score.attempts)
    || isConversionProgressActive(score.conversionProgress);
}

export function conversionProgressPresentation(
  score: ScoreProgressState,
  language: ConversionProgressLanguage
): ConversionProgressPresentation | null {
  const progress = score.conversionProgress;
  if (!progress || !progress.attemptId) return null;
  if (progress.stage === "complete") return null;
  if (hasKnownNewerAttempt(score.attempts, progress.attemptId)) return null;

  const interrupted = progress.stage === "interrupted";
  const scoreIsActive = score.conversionStatus === "uploaded"
    || score.conversionStatus === "queued"
    || score.conversionStatus === "processing"
    || hasActiveConversionAttempt(score.attempts)
    || isConversionProgressActive(progress);
  if (!interrupted && !scoreIsActive) return null;

  const totalPages = validPage(progress.totalPages) ? progress.totalPages : null;
  const completed = pageSet(progress.completedPages, totalPages);
  const reused = pageSet(progress.reusedPages, totalPages);
  const recognizedCount = new Set([...completed, ...reused]).size;
  const failedCount = pageSet(progress.failedPages, totalPages).size;
  const excludedCount = pageSet(progress.excludedPages, totalPages).size;
  const locale = language === "en" ? "en-US" : "pt-BR";
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);

  const stageLabel = getStageLabel(progress.stage, language);
  let summary: string;
  if (interrupted) {
    if (recognizedCount === 0) {
      summary = language === "en"
        ? "No pages were recognized before the interruption."
        : "Nenhuma página reconhecida antes da interrupção.";
    } else if (totalPages) {
      summary = language === "en"
        ? `${number(recognizedCount)} of ${number(totalPages)} pages recognized before the interruption.`
        : `${number(recognizedCount)} de ${number(totalPages)} páginas reconhecidas antes da interrupção.`;
    } else {
      summary = language === "en"
        ? `${number(recognizedCount)} ${plural(recognizedCount, "page", "pages")} recognized before the interruption.`
        : `${number(recognizedCount)} ${plural(recognizedCount, "página", "páginas")} reconhecidas antes da interrupção.`;
    }
  } else if (recognizedCount === 0) {
    summary = language === "en" ? "No pages recognized yet." : "Nenhuma página reconhecida até agora.";
  } else if (totalPages) {
    summary = language === "en"
      ? `${number(recognizedCount)} of ${number(totalPages)} pages recognized.`
      : `${number(recognizedCount)} de ${number(totalPages)} páginas reconhecidas.`;
  } else {
    summary = language === "en"
      ? `${number(recognizedCount)} ${plural(recognizedCount, "page", "pages")} recognized.`
      : `${number(recognizedCount)} ${plural(recognizedCount, "página", "páginas")} reconhecidas.`;
  }

  const currentPage = validPage(progress.currentPage) && (!totalPages || progress.currentPage <= totalPages) ? progress.currentPage : null;
  const currentPageLabel = currentPage
    ? totalPages
      ? language === "en" ? `Page ${number(currentPage)} of ${number(totalPages)}` : `Página ${number(currentPage)} de ${number(totalPages)}`
      : language === "en" ? `Page ${number(currentPage)}` : `Página ${number(currentPage)}`
    : undefined;
  const details = [
    reused.size ? countLabel(reused.size, "reused", language, number) : "",
    failedCount ? countLabel(failedCount, "failed", language, number) : "",
    excludedCount ? countLabel(excludedCount, "excluded", language, number) : ""
  ].filter(Boolean);
  const announcement = [stageLabel, summary.replace(/[.!?]+$/, ""), currentPageLabel, ...details].filter(Boolean).join(". ");

  return { stageLabel, summary, currentPageLabel, details, announcement, interrupted };
}

function hasKnownNewerAttempt(attempts: ConversionAttempt[] | undefined, attemptId: string): boolean {
  if (!attempts?.length) return false;
  const latest = [...attempts].sort((left, right) => {
    const dateOrder = safeDate(right.createdAt) - safeDate(left.createdAt);
    return dateOrder || attemptKindPriority(right.kind) - attemptKindPriority(left.kind);
  })[0];
  return Boolean(latest && latest.id !== attemptId);
}

function attemptKindPriority(kind: ConversionAttempt["kind"]): number {
  return kind === "manual" ? 2 : kind === "automatic" ? 1 : 0;
}

function safeDate(value: string): number {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function validPage(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function pageSet(pages: number[] | undefined, totalPages: number | null): Set<number> {
  return new Set((pages ?? []).filter((page) => validPage(page) && (!totalPages || page <= totalPages)));
}

function getStageLabel(stage: ConversionProgress["stage"], language: ConversionProgressLanguage): string {
  if (language === "en") {
    switch (stage) {
      case "preparing": return "Preparing conversion";
      case "recognizing": return "Recognizing pages";
      case "validating": return "Checking recognized pages";
      case "complete": return "Pages recognized";
      case "interrupted": return "Attempt interrupted";
    }
  }
  switch (stage) {
    case "preparing": return "Preparando a conversão";
    case "recognizing": return "Reconhecendo páginas";
    case "validating": return "Conferindo páginas reconhecidas";
    case "complete": return "Páginas reconhecidas";
    case "interrupted": return "Tentativa interrompida";
  }
}

function countLabel(
  count: number,
  kind: "reused" | "failed" | "excluded",
  language: ConversionProgressLanguage,
  number: (value: number) => string
): string {
  const quantity = number(count);
  if (language === "en") {
    if (kind === "reused") return `${quantity} ${plural(count, "page reused", "pages reused")}`;
    if (kind === "failed") return `${quantity} ${plural(count, "page failed", "pages failed")}`;
    return `${quantity} ${plural(count, "page excluded", "pages excluded")}`;
  }
  if (kind === "reused") return `${quantity} ${plural(count, "página reaproveitada", "páginas reaproveitadas")}`;
  if (kind === "failed") return `${quantity} ${plural(count, "página com falha", "páginas com falha")}`;
  return `${quantity} ${plural(count, "página excluída", "páginas excluídas")}`;
}

function plural(count: number, singular: string, pluralValue: string): string {
  return count === 1 ? singular : pluralValue;
}
