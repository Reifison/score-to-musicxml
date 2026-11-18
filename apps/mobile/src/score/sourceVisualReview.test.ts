import { describe, expect, it } from "vitest";
import type { SourceVisualReview } from "../api/types";
import { formatVisualNoteValue, unknownVisualSourcePages, visualReviewLocation, visualReviewPageLabel, visualReviewPendingCount } from "./sourceVisualReview";

const report: SourceVisualReview = {
  version: 1,
  status: "partial",
  sourceSHA256: "source-hash",
  xmlSHA256: "xml-hash",
  reader: { name: "reader", sourceFirst: true },
  checkedMeasures: 2,
  unknownMeasures: 2,
  segments: [
    { id: "unknown-1", page: 1, partIndex: 0, partId: "piano", measureIndex: 2, measure: "3", status: "unknown", sourceAsset: "page-1.png" },
    { id: "unknown-2", page: 1, partIndex: 0, partId: "piano", measureIndex: 3, measure: "4", status: "unknown", sourceAsset: "page-1.png" },
    { id: "unknown-3", page: 2, partIndex: 0, partId: "piano", measureIndex: 0, measure: "1", status: "unknown", sourceAsset: "page-2.png" },
    { id: "compared", page: 2, partIndex: 0, partId: "piano", measureIndex: 1, measure: "2", status: "compared", cropAsset: "crop.png" }
  ],
  proposals: [
    { id: "proposal-1", status: "pending", segmentId: "compared", page: 2, partId: "piano", partIndex: 0, measureIndex: 1, measure: "2", noteIndex: 0, before: null, after: null, applicable: false, reason: "ambiguous", differences: ["pitch"] }
  ],
  limitations: [],
  accuracyVerified: false,
  trainingEligible: false,
  history: []
};

describe("source visual review presentation helpers", () => {
  it("renders a readable Portuguese note value with pitch, duration, type and dots", () => {
    expect(formatVisualNoteValue({ kind: "note", step: "F", alter: 1, octave: 4, duration: 0.5, type: "eighth", dots: 1 })).toEqual({
      title: "Fá♯4 · colcheia · 1 ponto",
      detail: "Duração: 0,5 tempos de semínima · 1 ponto"
    });
    expect(formatVisualNoteValue({ kind: "rest", duration: 1, type: "quarter" }).title).toBe("Pausa · semínima");
  });

  it("counts pending proposals and groups unknown segments by page instead of listing every bar", () => {
    expect(visualReviewPendingCount(report)).toBe(1);
    expect(unknownVisualSourcePages(report)).toEqual([
      { page: 1, count: 2, sourceAsset: "page-1.png" },
      { page: 2, count: 1, sourceAsset: "page-2.png" }
    ]);
  });

  it("labels an unmapped source page as unconfirmed", () => {
    const withUnmappedPage = {
      ...report,
      segments: [...report.segments, { id: "unknown-zero", page: 0, partIndex: 0, partId: "piano", measureIndex: 4, measure: "5", status: "unknown" as const, sourceAsset: "unmapped-page.png" }]
    };

    expect(visualReviewPageLabel(0)).toBe("Página não confirmada");
    expect(visualReviewLocation({ page: 0, partId: "piano", measure: "5" })).toBe("Página não confirmada · Parte piano · compasso 5");
    expect(unknownVisualSourcePages(withUnmappedPage)).toContainEqual({ page: 0, count: 1, sourceAsset: "unmapped-page.png" });
  });
});
