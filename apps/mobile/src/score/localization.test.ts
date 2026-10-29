import { afterEach, describe, expect, it } from "vitest";
import { configureLanguageController, type Language } from "../i18n";
import { coverageSummary } from "./coveragePresentation";
import { scoreDisplayName } from "./presentation";
import { formatVisualNoteValue, visualReviewLocation } from "./sourceVisualReview";
import { getScoreTypeOptions, scoreTypeLabel } from "./scoreTypes";
import { midiValidationSummary, reviewIssueLocation } from "./reviewPresentation";
import { localizeMessage } from "./localizedMessages";

function language(value: Language) {
  configureLanguageController({ getLanguage: () => value, initialize: async () => value,
    setLanguage: async () => undefined, subscribe: () => () => undefined });
}
afterEach(() => language("pt"));

describe("musical localization", () => {
  it("switches note names and American note values without changing the source event", () => {
    const note = { kind: "note" as const, step: "C" as const, octave: 4, alter: 1, type: "quarter", duration: 1.5, dots: 1 };
    language("pt");
    expect(formatVisualNoteValue(note)).toEqual({ title: "Dó♯4 · semínima · 1 ponto", detail: "Duração: 1,5 tempos de semínima · 1 ponto" });
    language("en");
    expect(formatVisualNoteValue(note)).toEqual({ title: "C♯4 · quarter note · 1 dot", detail: "Duration: 1.5 quarter-note beats · 1 dot" });
    expect(note.step).toBe("C");
    expect(note.type).toBe("quarter");
    expect(formatVisualNoteValue({kind: "rest", type: "eighth", duration: .5}).title).toBe("Rest · eighth note");
  });

  it("keeps voices, staves, parts and measures distinct", () => {
    language("en");
    expect(scoreTypeLabel("guitar_duo")).toBe("Guitar duet");
    expect(getScoreTypeOptions().find(option => option.value === "piano")?.description).toBe("Two staves");
    expect(reviewIssueLocation({ code: "RHYTHM_UNCHECKED", severity: "warning", message: "", page: 2, partId: "P1", staff: 2, voice: "3", measure: "4" }))
      .toBe("Page 2 · Part P1 · measure 4 on this page · staff 2 · voice 3");
    expect(visualReviewLocation({ page: 1, partId: "P1", measure: "8" })).toBe("Page 1 · Part P1 · measure 8");
  });

  it("preserves incomplete coverage and the limits of MIDI verification", () => {
    language("en");
    expect(coverageSummary({ totalPages: 3, processedPages: [1], missingPages: [2, 3], pages: [] })).toBe("1 of 3 pages processed");
    const summary = midiValidationSummary("passed");
    expect(summary.description).toContain("do not check every note");
    expect(summary.description).toContain("original image");
  });

  it("translates server diagnostics while preserving numeric context and original titles", () => {
    language("en");
    expect(localizeMessage("Página 7: Sem leitura visual independente para este compasso.")).toBe("Page 7: No independent visual recognition is available for this measure.");
    expect(localizeMessage(localizeMessage("E-mail ou senha inválidos.", "INVALID_CREDENTIALS"))).toBe("Invalid email or password.");
    expect(localizeMessage("Não foi possível baixar o MIDI. Verifique sua conexão e tente novamente.")).toBe("Couldn't download MIDI. Check your connection and try again.");
    expect(localizeMessage("As leituras da armadura de clave divergem. Confira os sustenidos, bemóis e as notas no original.", "VISUAL_KEY_SIGNATURE_MISMATCH")).toContain("key signature");
    expect(localizeMessage("Mensagem de uma versão futura", "FUTURE_ERROR")).toContain("FUTURE_ERROR");
    expect(scoreDisplayName({ originalFilename: "Canção em Dó.pdf" } as Parameters<typeof scoreDisplayName>[0])).toBe("Canção em Dó");
    language("pt");
    expect(localizeMessage("Mensagem original", "FUTURE_ERROR")).toBe("Mensagem original");
  });
});
