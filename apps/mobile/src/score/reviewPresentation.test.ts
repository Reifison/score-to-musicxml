import { describe, expect, it } from "vitest";
import type { MusicalValidation } from "../api/types";
import { hasReviewReservations, midiValidationSummary, reviewApprovalLabel, reviewIssueLocation, reviewSourcePage } from "./reviewPresentation";

function checkedValidation(overrides: Partial<MusicalValidation> = {}): MusicalValidation {
  return {
    version: 1,
    visualReview: {
      version: 1,
      status: "completed",
      sourceSHA256: "source",
      xmlSHA256: "xml",
      reader: null,
      checkedMeasures: 4,
      unknownMeasures: 0,
      segments: [],
      proposals: [],
      limitations: [],
      accuracyVerified: false,
      trainingEligible: false,
      history: []
    },
    midiValidation: { status: "passed", checkedNotes: 16, issues: [], limitations: [], xmlSHA256: "xml" },
    issues: [],
    checkedMeasures: 4,
    skippedMeasures: 0,
    requiresReview: false,
    ...overrides
  };
}

describe("review locations", () => {
  it("distinguishes page-local measures from merged score measures", () => {
    const issue = { code: "CANDIDATE_EVENT_DIVERGENCE", severity: "warning" as const, message: "Confira o original.", page: 2, partName: "Violão", measure: "3", staff: 1, voice: "2" };
    expect(reviewIssueLocation(issue)).toBe("Página 2 · Violão · compasso 3 nesta página · pauta 1 · voz 2");
    expect(reviewIssueLocation({ ...issue, page: undefined })).toBe("Violão · compasso 3 · pauta 1 · voz 2");
  });
  it("never creates source-page links for unknown or invalid page mappings", () => {
    const issue = { code: "RHYTHM_SHORT", severity: "warning" as const, message: "Confira o original.", measure: "3" };
    expect(reviewSourcePage(issue, 2)).toBeUndefined();
    expect(reviewSourcePage({ ...issue, page: 2 }, undefined)).toBeUndefined();
    expect(reviewSourcePage({ ...issue, page: 3 }, 2)).toBeUndefined();
    expect(reviewSourcePage({ ...issue, page: 1.5 }, 2)).toBeUndefined();
    expect(reviewSourcePage({ ...issue, page: 2 }, 2)).toBe(2);
  });
});

describe("review reservations and MIDI copy", () => {
  it("explains that a passed MIDI check does not compare notes with the source image", () => {
    expect(midiValidationSummary("passed")).toEqual({
      title: "Execução em MIDI verificada",
      description: "As verificações disponíveis da execução passaram. Elas não conferem todas as notas e durações nem a fidelidade à imagem original."
    });
    expect(midiValidationSummary("failed").description).toContain("reprodução e o MIDI ficam indisponíveis");
    expect(midiValidationSummary("unverified").title).toBe("Execução em MIDI não verificada");
    expect(midiValidationSummary(undefined).title).toBe("Verificação de MIDI não informada");
  });

  it("keeps accepted visual corrections clear when every other check passes", () => {
    const validation = checkedValidation({
      visualReview: {
        ...checkedValidation().visualReview!,
        proposals: [{
          id: "proposal-1", status: "accepted", segmentId: "segment-1", page: 1, partId: "piano", partIndex: 0,
          measureIndex: 0, measure: "1", noteIndex: 0, before: null, after: null, applicable: true, reason: "", differences: []
        }]
      }
    });
    expect(hasReviewReservations(validation)).toBe(false);
    expect(reviewApprovalLabel(validation)).toBe("Conferi a prévia: finalizar");
  });

  it("marks unresolved checks, rejected visual proposals, and non-passed MIDI as reservations", () => {
    const complete = checkedValidation();
    expect(hasReviewReservations({ ...complete, issues: [{ code: "RHYTHM_SHORT", severity: "warning", message: "Confira." }] })).toBe(true);
    expect(hasReviewReservations({ ...complete, skippedMeasures: 1 })).toBe(true);
    expect(hasReviewReservations({ ...complete, visualReview: { ...complete.visualReview!, unknownMeasures: 1 } })).toBe(true);
    expect(hasReviewReservations({ ...complete, visualReview: { ...complete.visualReview!, status: "partial" } })).toBe(true);
    expect(hasReviewReservations({ ...complete, visualReview: undefined })).toBe(true);
    expect(hasReviewReservations({
      ...complete,
      visualReview: {
        ...complete.visualReview!,
        proposals: [{
          id: "proposal-1", status: "rejected", segmentId: "segment-1", page: 1, partId: "piano", partIndex: 0,
          measureIndex: 0, measure: "1", noteIndex: 0, before: null, after: null, applicable: true, reason: "", differences: []
        }]
      }
    })).toBe(true);
    expect(hasReviewReservations(complete, "unverified")).toBe(true);
    expect(hasReviewReservations(complete, "failed")).toBe(true);
    expect(reviewApprovalLabel(complete, "unverified")).toBe("Conferi a prévia: finalizar com ressalvas");
  });
});
