import type { ConversionAttempt, ConversionPreview, Score } from "../domain.js";

export function validConversionPreview(preview: ConversionPreview, attemptId: string): boolean {
  return preview.attemptId === attemptId && preview.page === 1
    && Number.isSafeInteger(preview.totalPages) && preview.totalPages > 1
    && /^[a-f0-9]{64}$/.test(preview.revision) && /^[a-f0-9]{64}$/.test(preview.xmlSHA256)
    && Number.isFinite(Date.parse(preview.createdAt)) && Array.isArray(preview.warnings)
    && preview.warnings.length <= 20 && preview.warnings.every((warning) => typeof warning === "string" && warning.length <= 2000);
}

export function hasCurrentFirstPagePreview(score: Score, attempts: ConversionAttempt[]): boolean {
  const preview = score.conversionPreview;
  const current = attempts.find((attempt) => attempt.kind === "manual")
    ?? attempts.find((attempt) => attempt.kind === "automatic") ?? attempts.find((attempt) => attempt.kind === "initial");
  return Boolean(preview && validConversionPreview(preview, preview.attemptId)
    && !score.deletedAt && current?.id === preview.attemptId && current.status === "processing"
    && score.conversionProgress?.attemptId === preview.attemptId
    && ["preparing", "recognizing", "validating"].includes(score.conversionProgress.stage));
}
