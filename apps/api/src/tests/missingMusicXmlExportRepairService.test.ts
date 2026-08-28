import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryAuditRepository, InMemoryScoreRepository } from "../repositories/inMemoryRepositories.js";
import type { ScoreConversionQueue } from "../queues/ScoreConversionQueue.js";
import { FileStorageService } from "../services/FileStorageService.js";
import { MissingMusicXmlExportRepairService } from "../services/MissingMusicXmlExportRepairService.js";

const roots: string[] = [];
const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "score-repair-test-"));
  roots.push(root);
  const storage = new FileStorageService(path.join(root, "uploads"), path.join(root, "exports"));
  const scores = new InMemoryScoreRepository();
  const audits = new InMemoryAuditRepository();
  const score = await scores.create({
    userId: "user-1",
    originalFilename: "original.pdf",
    storedFilename: "original.pdf",
    fileType: "pdf",
    mimeType: "application/pdf",
    fileSize: pdf.byteLength,
    uploadStatus: "uploaded",
    conversionStatus: "converted"
  });
  await scores.update(score.id, { musicxmlFilename: "missing.musicxml" });
  await storage.saveUpload(score.storedFilename, pdf);
  return { audits, score, scores, storage };
}

describe("MissingMusicXmlExportRepairService", () => {
  it("somente relata o caso recuperável no modo dry-run", async () => {
    const { audits, score, scores, storage } = await setup();
    const enqueue = vi.fn();
    const repair = new MissingMusicXmlExportRepairService(
      scores,
      audits,
      storage,
      { scan: vi.fn().mockResolvedValue(undefined) },
      1024 * 1024,
      { enqueue } as ScoreConversionQueue
    );

    await expect(repair.run()).resolves.toMatchObject({
      checked: 1,
      exportsUnavailable: 1,
      recoverable: 1,
      queued: 0
    });
    expect(enqueue).not.toHaveBeenCalled();
    expect((await scores.findById(score.id))?.conversionStatus).toBe("converted");
    expect(await audits.list()).toHaveLength(0);
  });

  it("revalida o upload, enfileira e audita somente no modo apply", async () => {
    const { audits, score, scores, storage } = await setup();
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const scan = vi.fn().mockResolvedValue(undefined);
    const repair = new MissingMusicXmlExportRepairService(
      scores,
      audits,
      storage,
      { scan },
      1024 * 1024,
      { enqueue } as ScoreConversionQueue
    );

    await expect(repair.run({ apply: true })).resolves.toMatchObject({ queued: 1, queueFailures: 0 });
    expect(scan).toHaveBeenCalledWith(pdf, "original.pdf");
    expect(enqueue).toHaveBeenCalledWith(score.id);
    expect((await scores.findById(score.id))?.conversionStatus).toBe("queued");
    expect(await audits.list()).toContainEqual(expect.objectContaining({
      action: "conversion_queued",
      entity: "score",
      entityId: score.id
    }));
  });

  it("não enfileira quando o upload original não pode ser validado", async () => {
    const { audits, score, scores, storage } = await setup();
    await storage.deleteUpload(score.storedFilename);
    const enqueue = vi.fn();
    const repair = new MissingMusicXmlExportRepairService(
      scores,
      audits,
      storage,
      { scan: vi.fn() },
      1024 * 1024,
      { enqueue } as ScoreConversionQueue
    );

    await expect(repair.run({ apply: true })).resolves.toMatchObject({
      exportsUnavailable: 1,
      recoverable: 0,
      queued: 0,
      skipped: { invalidUpload: 1 }
    });
    expect(enqueue).not.toHaveBeenCalled();
    expect(await audits.list()).toHaveLength(0);
  });

  it("não duplica fila nem auditoria em execuções concorrentes", async () => {
    const { audits, scores, storage } = await setup();
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const repair = new MissingMusicXmlExportRepairService(
      scores,
      audits,
      storage,
      { scan: vi.fn().mockResolvedValue(undefined) },
      1024 * 1024,
      { enqueue } as ScoreConversionQueue
    );

    const results = await Promise.all([repair.run({ apply: true }), repair.run({ apply: true })]);
    expect(results.map((result) => result.queued).sort()).toEqual([0, 1]);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(await audits.list()).toHaveLength(1);
  });

  it("verifica disponibilidade do export sem carregar seu conteúdo no dry-run", async () => {
    const { storage, scores, audits } = await setup();
    const probe = vi.spyOn(storage, "isReadableExport");
    const read = vi.spyOn(storage, "readExportForDownload");
    const repair = new MissingMusicXmlExportRepairService(
      scores,
      audits,
      storage,
      { scan: vi.fn().mockResolvedValue(undefined) },
      1024 * 1024,
      { enqueue: vi.fn() } as ScoreConversionQueue
    );

    await repair.run();
    expect(probe).toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
});
