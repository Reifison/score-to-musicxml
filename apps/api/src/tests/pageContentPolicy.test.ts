import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { AudiverisOmrAdapter } from "../services/OmrAdapter.js";
import { classifyPageContent } from "../services/PageContentClassifier.js";
import { validCoverage } from "../services/ScoreConversionService.js";
import type { ConversionCoverage } from "../domain.js";

const xml = `<score-partwise><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note></measure></part></score-partwise>`;

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-page-policy-"));
  const source = path.join(dir, "source.pdf");
  const cover = path.join(dir, "cover.png");
  const staff = path.join(dir, "staff.png");
  const weak = path.join(dir, "weak.png");
  const mixed = path.join(dir, "mixed.png");
  await fs.writeFile(source, "%PDF policy test");
  const image = (color: string, lines: boolean) => Buffer.from(`<svg width="1000" height="700" xmlns="http://www.w3.org/2000/svg"><rect width="1000" height="700" fill="white"/>${lines ? Array.from({ length: 5 }, (_, index) => `<rect x="100" y="${200 + index * 12}" width="800" height="1" fill="${color}"/>`).join("") : `<text x="100" y="180" font-size="40" fill="black">COVER TEXT</text>`}</svg>`);
  await Promise.all([
    sharp(image("black", false)).png().toFile(cover),
    sharp(image("black", true)).png().toFile(staff),
    sharp(image("#cccccc", true)).png().toFile(weak),
    sharp(Buffer.from(`<svg width="1000" height="700" xmlns="http://www.w3.org/2000/svg"><rect width="1000" height="700" fill="white"/><text x="100" y="120" font-size="50">Title and prose</text>${Array.from({ length: 5 }, (_, index) => `<rect x="100" y="${300 + index * 12}" width="800" height="1" fill="black"/>`).join("")}</svg>`)).png().toFile(mixed)
  ]);
  return { dir, source, cover, staff, weak, mixed };
}

function mockAdapter(paths: string[], omr: (page: string) => Promise<string> = async () => xml) {
  const adapter = new AudiverisOmrAdapter() as unknown as AudiverisOmrAdapter & {
    resolveAudiverisBin(): Promise<string>;
    preprocessInput(): Promise<{ pages: Array<{ originalPath: string; attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
    convertPage(pagePath: string): Promise<{ musicXml: string; warnings: string[] }>;
  };
  adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
  adapter.preprocessInput = async () => ({ pages: paths.map((originalPath) => ({ originalPath, attempts: [{ paths: [originalPath], description: "original" }] })), warnings: [] });
  const run = vi.fn(async (pagePath: string) => ({ musicXml: await omr(pagePath), warnings: [] }));
  adapter.convertPage = run;
  return { adapter, run };
}

describe("page content policy", () => {
  it("detecta pauta forte, mas não presume que capa ou pauta fraca são não musicais", async () => {
    const f = await fixture();
    try {
      const staff = await classifyPageContent(f.source, f.staff);
      expect(staff.role).toBe("musical");
      expect(staff.classification.sourceLayout).toMatchObject({ method: "horizontal_staff_bands_v1", status: "observed", staffBands: [{ top: expect.any(Number), bottom: expect.any(Number) }] });
      expect((await classifyPageContent(f.source, f.mixed)).role).toBe("musical");
      expect((await classifyPageContent(f.source, f.cover)).role).toBe("uncertain");
      const weak = await classifyPageContent(f.source, f.weak);
      expect(weak.role).toBe("uncertain");
      expect(weak.classification.sourceLayout).toMatchObject({ method: "horizontal_staff_bands_v1", status: "unknown", staffBands: [] });
    } finally { await fs.rm(f.dir, { recursive: true, force: true }); }
  });

  it("exclui capa confirmada antes do OMR e mantém índice físico da partitura", async () => {
    const f = await fixture();
    try {
      const { adapter, run } = mockAdapter([f.cover, f.staff]);
      const inspection = await adapter.inspectPages(f.source, f.dir);
      const decision = { page: 1, role: "nonmusical" as const, sourceSHA256: inspection.sourceSHA256!, originalImageSHA256: inspection.pages[0].originalImageSHA256!, reviewer: "curadoria", reason: "Capa conferida visualmente, sem trecho musical" };
      const result = await adapter.convert(f.source, "source.pdf", f.dir, { preparedInspection: inspection, pageDecisions: [decision] });
      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith(f.staff, "source.pdf", expect.any(String));
      expect(result.coverage).toMatchObject({ totalPages: 2, processedPages: [2], missingPages: [], excludedPages: [1], uncertainPages: [] });
      expect(result.coverage?.pages[0]).toMatchObject({ page: 1, status: "excluded", contentRole: "nonmusical", classification: { method: "verified_manual_v1" } });
      expect(validCoverage(result.coverage)).toBe(true);
    } finally { await fs.rm(f.dir, { recursive: true, force: true }); }
  });

  it("recusa hash errado e recusa excluir uma página com pauta", async () => {
    const f = await fixture();
    try {
      const { adapter, run } = mockAdapter([f.cover, f.staff]);
      const inspection = await adapter.inspectPages(f.source, f.dir);
      const base = { page: 1, role: "nonmusical" as const, sourceSHA256: inspection.sourceSHA256!, originalImageSHA256: inspection.pages[0].originalImageSHA256!, reviewer: "curadoria", reason: "Conferida" };
      await expect(adapter.convert(f.source, "source.pdf", f.dir, { preparedInspection: inspection, pageDecisions: [{ ...base, originalImageSHA256: "0".repeat(64) }] })).rejects.toMatchObject({ code: "PAGE_DECISION_HASH_MISMATCH" });
      await expect(adapter.convert(f.source, "source.pdf", f.dir, { preparedInspection: inspection, pageDecisions: [{ ...base, page: 2, originalImageSHA256: inspection.pages[1].originalImageSHA256! }] })).rejects.toMatchObject({ code: "PAGE_DECISION_CONFLICT" });
      expect(run).not.toHaveBeenCalled();
    } finally { await fs.rm(f.dir, { recursive: true, force: true }); }
  });

  it("distingue documento inteiramente não musical confirmado de classificação pendente", async () => {
    const f = await fixture();
    try {
      const { adapter, run } = mockAdapter([f.cover]);
      const inspection = await adapter.inspectPages(f.source, f.dir);
      const decision = { page: 1, role: "nonmusical" as const, sourceSHA256: inspection.sourceSHA256!, originalImageSHA256: inspection.pages[0].originalImageSHA256!, reviewer: "curadoria", reason: "Capa sem notação" };
      await expect(adapter.convert(f.source, "source.pdf", f.dir, { preparedInspection: inspection, pageDecisions: [decision] })).rejects.toMatchObject({ code: "NON_MUSICAL_DOCUMENT" });
      const pending = await adapter.convert(f.source, "source.pdf", f.dir, { preparedInspection: inspection });
      expect(pending.coverage).toMatchObject({ processedPages: [1], uncertainPages: [1], excludedPages: [] });
      expect(run).toHaveBeenCalledTimes(1);
    } finally { await fs.rm(f.dir, { recursive: true, force: true }); }
  });

  it("falha OMR não exclui página; incerteza residual impede cobertura completa", async () => {
    const f = await fixture();
    try {
      const { adapter } = mockAdapter([f.staff, f.weak], async (page) => { if (page === f.weak) throw new Error("OMR could not read this page"); return xml; });
      const result = await adapter.convert(f.source, "source.pdf", f.dir);
      expect(result.coverage).toMatchObject({ processedPages: [1], missingPages: [2], excludedPages: [], uncertainPages: [2] });
      expect(result.coverage?.pages[1]).toMatchObject({ status: "missing", contentRole: "uncertain" });
      expect(validCoverage(result.coverage)).toBe(true);
      const { adapter: successful } = mockAdapter([f.staff, f.weak]);
      const second = await successful.convert(f.source, "source.pdf", f.dir);
      expect(second.coverage).toMatchObject({ missingPages: [], uncertainPages: [2] });
      expect(validCoverage(second.coverage)).toBe(true);
    } finally { await fs.rm(f.dir, { recursive: true, force: true }); }
  });

  it("mantém layouts musicais não suportados distintos de páginas não musicais", async () => {
    const f = await fixture();
    try {
      const { adapter, run } = mockAdapter([f.staff, f.weak]);
      const inspection = await adapter.inspectPages(f.source, f.dir);
      const decision = { page: 2, role: "musical" as const, support: "unsupported" as const, sourceSHA256: inspection.sourceSHA256!, originalImageSHA256: inspection.pages[1].originalImageSHA256!, reviewer: "curadoria", reason: "Tablatura sem pauta tradicional" };
      const result = await adapter.convert(f.source, "source.pdf", f.dir, { preparedInspection: inspection, pageDecisions: [decision] });
      expect(run).toHaveBeenCalledTimes(1);
      expect(result.coverage).toMatchObject({ missingPages: [2], unsupportedPages: [2], excludedPages: [], uncertainPages: [] });
      expect(result.coverage?.pages[1]).toMatchObject({ status: "missing", contentRole: "musical", supportStatus: "unsupported", errorCode: "OMR_UNSUPPORTED_LAYOUT" });
      expect(validCoverage(result.coverage)).toBe(true);
    } finally { await fs.rm(f.dir, { recursive: true, force: true }); }
  });

  it("aceita coverage legado e rejeita exclusão sem decisão comprovada", () => {
    const legacy: ConversionCoverage = { totalPages: 1, processedPages: [1], missingPages: [], pages: [{ page: 1, status: "processed", parts: [{ id: "P1", name: "Melody", staffCount: 1, staves: [1] }] }] };
    expect(validCoverage(legacy)).toBe(true);
    const bad: ConversionCoverage = { totalPages: 2, processedPages: [1], missingPages: [], excludedPages: [2], pages: [...legacy.pages, { page: 2, status: "excluded", contentRole: "nonmusical", parts: [] }] };
    expect(validCoverage(bad)).toBe(false);
  });
});
