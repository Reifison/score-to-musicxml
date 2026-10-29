import type { ConversionCoverage, ConversionProgress } from "../domain.js";

export function preparingProgress(attemptId: string): ConversionProgress {
  return { attemptId, stage: "preparing", totalPages: null, currentPage: null,
    completedPages: [], failedPages: [], excludedPages: [], reusedPages: [], updatedAt: new Date().toISOString() };
}

export function terminalProgress(attemptId: string, previous: ConversionProgress | null | undefined, coverage?: ConversionCoverage): ConversionProgress {
  const current = previous?.attemptId === attemptId ? previous : preparingProgress(attemptId);
  return { ...current, stage: coverage ? "complete" : "interrupted", currentPage: null,
    ...(coverage ? { totalPages: coverage.totalPages, completedPages: [...coverage.processedPages],
      failedPages: [...coverage.missingPages], excludedPages: [...(coverage.excludedPages ?? [])],
      reusedPages: current.reusedPages.filter((page) => coverage.processedPages.includes(page)) } : {}),
    updatedAt: new Date().toISOString() };
}

export function validConversionProgress(progress: ConversionProgress, attemptId: string): boolean {
  if (progress.attemptId !== attemptId || !["preparing", "recognizing", "validating"].includes(progress.stage)
    || !Number.isFinite(Date.parse(progress.updatedAt))) return false;
  const { totalPages, currentPage } = progress;
  if (totalPages !== null && (!Number.isSafeInteger(totalPages) || totalPages < 1)) return false;
  const inRange = (page: number) => Number.isSafeInteger(page) && page > 0 && totalPages !== null && page <= totalPages;
  if (currentPage !== null && !inRange(currentPage)) return false;
  const groups = [progress.completedPages, progress.failedPages, progress.excludedPages, progress.reusedPages];
  if (groups.some((pages) => !Array.isArray(pages) || pages.some((page) => !inRange(page)) || new Set(pages).size !== pages.length)) return false;
  const finished = [...progress.completedPages, ...progress.failedPages, ...progress.excludedPages];
  return new Set(finished).size === finished.length
    && (currentPage === null || !finished.includes(currentPage))
    && progress.reusedPages.every((page) => progress.completedPages.includes(page));
}
