import { describe, expect, it, vi } from "vitest";
import type { Score } from "../domain.js";
import type { AuditRepository, ScoreRepository } from "../repositories/contracts.js";
import { ScoreConversionService } from "../services/ScoreConversionService.js";
import type { FileStorageService } from "../services/FileStorageService.js";
import type { OmrAdapter } from "../services/OmrAdapter.js";

const baseScore: Score = {
  id: "score-1",
  userId: "user-1",
  originalFilename: "partitura.pdf",
  storedFilename: "source.pdf",
  fileType: "pdf",
  mimeType: "application/pdf",
  fileSize: 1024,
  preprocessingProfile: null,
  uploadStatus: "uploaded",
  conversionStatus: "queued",
  errorMessage: null,
  warnings: null,
  confidence: null,
  musicxmlFilename: null,
  isFavorite: false,
  deletedAt: null,
  purgeAt: null,
  createdAt: new Date("2026-09-08T00:00:00.000Z"),
  updatedAt: new Date("2026-09-08T00:00:00.000Z"),
  convertedAt: null
};

describe("ScoreConversionService", () => {
  it("não publica um MusicXML que exige revisão manual", async () => {
    const updates: Array<Partial<Score>> = [];
    const saveExport = vi.fn();
    const scores = {
      findById: async () => baseScore,
      update: async (_id: string, input: Partial<Score>) => {
        updates.push(input);
        return { ...baseScore, ...input };
      }
    } as unknown as ScoreRepository;
    const audits = { create: async () => ({}) } as unknown as AuditRepository;
    const storage = {
      resolveUploadPath: () => "/tmp/source.pdf",
      generateExportStoredFilename: () => "score-1.musicxml",
      saveExport
    } as unknown as FileStorageService;
    const omr = {
      convert: async () => ({
        musicXml: "<score-partwise/>",
        confidence: 0.55,
        warnings: ["O resultado por recortes exige revisão manual."]
      })
    } as OmrAdapter;

    const service = new ScoreConversionService(scores, audits, storage, omr);
    const result = await service.convertScore(baseScore.id);

    expect(saveExport).not.toHaveBeenCalled();
    expect(result.conversionStatus).toBe("failed");
    expect(result.errorMessage).toContain("não atingiu a qualidade mínima");
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ conversionStatus: "processing" }),
      expect.objectContaining({ conversionStatus: "failed" })
    ]));
  });
});
