import { describe, expect, it } from "vitest";
import type { Score } from "../api/types";
import { scoreDetails } from "./presentation";

const base: Score = {
  id: "score-1",
  userId: "user-1",
  originalFilename: "estudo.pdf",
  storedFilename: "stored.pdf",
  fileType: "pdf",
  mimeType: "application/pdf",
  fileSize: 1024,
  uploadStatus: "converted",
  conversionStatus: "converted",
  errorMessage: null,
  warnings: null,
  confidence: 0.95,
  musicxmlFilename: "estudo.musicxml",
  isFavorite: false,
  createdAt: "2026-10-06T00:00:00.000Z",
  updatedAt: "2026-10-06T00:00:00.000Z",
  convertedAt: "2026-10-06T00:00:00.000Z"
};

describe("score presentation facts", () => {
  it("shows selected type and page coverage without presenting confidence as accuracy", () => {
    const details = scoreDetails({
      ...base,
      scoreType: "piano",
      scoreTypeSelected: true,
      resultStatus: "partial",
      coverage: { totalPages: 3, processedPages: [1, 3], missingPages: [2], pages: [] }
    });

    expect(details).toContainEqual({ label: "Partitura", value: "Piano" });
    expect(details).toContainEqual({ label: "Cobertura", value: "2 de 3 páginas · ausentes: 2" });
    expect(details.some((detail) => /confiança/i.test(detail.label))).toBe(false);
    expect(details.some((detail) => /95%/.test(detail.value))).toBe(false);
  });

  it("labels legacy type and coverage as unknown instead of inferring them", () => {
    const details = scoreDetails({ ...base, scoreTypeSelected: false, resultStatus: null, coverage: null });
    expect(details).toContainEqual({ label: "Partitura", value: "Não informado" });
    expect(details).toContainEqual({ label: "Cobertura", value: "Desconhecida" });
  });

  it("keeps the document page count separate from a verified musical page after a cover", () => {
    const details=scoreDetails({...base,coverage:{totalPages:2,processedPages:[2],missingPages:[],excludedPages:[1],uncertainPages:[],pages:[
      {page:1,status:'excluded',contentRole:'nonmusical',parts:[]},{page:2,status:'processed',contentRole:'musical',parts:[]}
    ]}});
    const coverage=details.find(detail=>detail.label==='Cobertura')!.value;
    expect(coverage).toContain('1 de 1 página musical identificada');
    expect(coverage).toContain('2 páginas no documento');
    expect(coverage).toContain('1 sem conteúdo musical');
  });
});
