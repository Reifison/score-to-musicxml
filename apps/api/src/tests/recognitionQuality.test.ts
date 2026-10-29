import { describe, expect, it } from "vitest";
import type { MusicalValidation } from "../domain.js";
import type { SourceVisualReview } from "../services/SourceVisualReviewTypes.js";
import { recognitionQualityFor } from "../services/RecognitionQuality.js";

const validation = (extra: Partial<MusicalValidation> = {}): MusicalValidation => ({
  version: 1, issues: [], checkedMeasures: 36, skippedMeasures: 0, requiresReview: true, ...extra
});
const visual = (extra: Partial<SourceVisualReview> = {}): SourceVisualReview => ({
  version: 1, status: "completed", sourceSHA256: "source", xmlSHA256: "xml",
  reader: { name: "independent", sourceFirst: true }, checkedMeasures: 36, unknownMeasures: 0,
  segments: [], proposals: [], limitations: [], accuracyVerified: false, trainingEligible: false,
  history: [], ...extra
});
const converted = (value: MusicalValidation | null = null) => ({ conversionStatus: "converted" as const, resultStatus: "complete" as const, validation: value });

describe("recognition quality separate from page coverage", () => {
  it("exposes a short SONATA measure even when all pages were processed and delivery is complete", () => {
    const score = converted(validation({ issues: [{ code: "RHYTHM_SHORT", severity: "warning", message: "private raw details", measure: "4" }] }));
    expect(recognitionQualityFor(score)).toMatchObject({ status: "needs_review", accuracyVerified: false,
      sourceComparison: "unavailable", checkedMeasures: 0,
      issues: [{ code: "RHYTHM_SHORT", measure: "4", message: expect.stringContaining("ritmo") }] });
    expect(score.resultStatus).toBe("complete");
    expect(JSON.stringify(recognitionQualityFor(score))).not.toContain("private raw details");
  });

  it("reports missing source measures without inventing an XML measure number", () => {
    const result = recognitionQualityFor(converted(validation({ visualReview: visual({ status: "partial", unknownMeasures: 36,
      diagnostics: [{ code: "VISUAL_SOURCE_MEASURE_UNMAPPED", page: 1, message: "source37 vs xml36" }] }) })));
    expect(result).toMatchObject({ status: "needs_review", sourceComparison: "partial",
      issues: [{ code: "VISUAL_SOURCE_MEASURE_UNMAPPED", page: 1 }] });
    expect(result?.issues[0]).not.toHaveProperty("measure");
  });

  it("retains anacrusis zero when the source association is known", () => {
    const result = recognitionQualityFor(converted(validation({ visualReview: visual({
      diagnostics: [{ code: "VISUAL_KEY_SIGNATURE_MISMATCH", page: 1, measure: "0", message: "fifths -1 absent" }]
    }) })));
    expect(result?.issues).toEqual([{ code: "VISUAL_KEY_SIGNATURE_MISMATCH", page: 1, measure: "0",
      message: expect.stringContaining("armadura") }]);
    expect(result?.status).toBe("needs_review");
  });

  it("never promotes reader agreement or absence of warnings to verified accuracy", () => {
    expect(recognitionQualityFor(converted(validation({ visualReview: visual() })))).toMatchObject({
      status: "unverified", sourceComparison: "compared", accuracyVerified: false, issues: []
    });
  });

  it("distinguishes unavailable checking and guitar octave metadata from detected musical errors", () => {
    expect(recognitionQualityFor(converted(validation({ issues: [
      { code: "GUITAR_TRANSPOSITION_NORMALIZED", severity: "warning", message: "octave" },
      { code: "MIDI_PREFLIGHT_UNAVAILABLE", severity: "warning", message: "unavailable" }
    ], visualReview: visual({ status: "unavailable", checkedMeasures: 0, unknownMeasures: 36,
      diagnostics: [{ code: "VISUAL_READER_NOT_CONFIGURED", message: "not configured" }] }) })))).toMatchObject({
      status: "unverified", sourceComparison: "unavailable", accuracyVerified: false,
      issues: [{ code: "VISUAL_READER_NOT_CONFIGURED", message: expect.stringContaining("Não foi possível conferir") }]
    });
  });

  it("explains an incomplete reader without misclassifying it as a confirmed musical error", () => {
    const result = recognitionQualityFor(converted(validation({ visualReview: visual({ status: "partial", checkedMeasures: 0,
      unknownMeasures: 36, diagnostics: [{ code: "HOMR_EMPTY_MEASURE", page: 1, message: "/private/reader/path" }]
    }) })));
    expect(result).toMatchObject({ status: "unverified", sourceComparison: "partial",
      issues: [{ code: "HOMR_EMPTY_MEASURE", page: 1, message: expect.stringContaining("Não foi possível conferir") }] });
    expect(JSON.stringify(result)).not.toContain("/private");
  });

  it("keeps disagreement visible when automatic delivery rejected the independent proposal", () => {
    const proposal: SourceVisualReview["proposals"][number] = { id: "p1", status: "rejected", segmentId: "s", page: 1,
      partId: "P1", partIndex: 0, measureIndex: 16, measure: "17", noteIndex: 0,
      before: { kind: "rest", duration: 0.5 }, after: null, applicable: false, reason: "independent disagreement", differences: ["note_or_rest"] };
    expect(recognitionQualityFor(converted(validation({ visualReview: visual({ proposals: [proposal] }) })))?.issues)
      .toEqual([{ code: "VISUAL_SOURCE_EVENT_DIFFERENCE", page: 1, measure: "17", message: expect.stringContaining("divergem") }]);
  });

  it("preserves page partial state, tolerates legacy exports and emits no summary while processing", () => {
    expect(recognitionQualityFor({ ...converted(), resultStatus: "partial" })?.issues[0].code).toBe("PAGE_COVERAGE_INCOMPLETE");
    expect(recognitionQualityFor(converted())).toMatchObject({ status: "unverified", sourceComparison: "unavailable", issues: [] });
    expect(recognitionQualityFor({ ...converted(), conversionStatus: "processing" })).toBeUndefined();
  });
});
