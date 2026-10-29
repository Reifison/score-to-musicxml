import type { ConversionPreview, Score } from "../types/domain.js";

const activeStages = new Set(["preparing", "recognizing", "validating"]);
const sha256Pattern = /^[a-f0-9]{64}$/;

export function currentFirstPagePreview(
  score: Pick<Score, "attempts" | "conversionProgress" | "conversionPreview">
): ConversionPreview | null {
  const preview = score.conversionPreview;
  if (!preview || preview.page !== 1 || !Number.isSafeInteger(preview.totalPages) || preview.totalPages <= 1) return null;
  if (!sha256Pattern.test(preview.revision) || !Number.isFinite(Date.parse(preview.createdAt))) return null;
  if (!Array.isArray(preview.warnings) || preview.warnings.length > 20
    || preview.warnings.some((warning) => typeof warning !== "string" || warning.length > 2_000)) return null;

  const attempt = score.attempts?.find((candidate) => candidate.id === preview.attemptId);
  const progress = score.conversionProgress;
  if (!attempt || attempt.status !== "processing" || progress?.attemptId !== preview.attemptId || !activeStages.has(progress.stage)) return null;
  return preview;
}
