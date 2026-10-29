import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversionCoverage, Score, User } from "../domain.js";
import { AppError } from "../errors/AppError.js";
import { InMemoryAuditRepository, InMemoryScoreRepository } from "../repositories/inMemoryRepositories.js";
import type { OmrAdapter, OmrConversionOptions, OmrReadyPage, OmrResult } from "../services/OmrAdapter.js";
import { FileStorageService } from "../services/FileStorageService.js";
import { ScoreConversionService } from "../services/ScoreConversionService.js";
import { ScoreService } from "../services/ScoreService.js";
import type { MidiExportService } from "../services/MidiExportService.js";
import type { SourceVisualValidationService } from "../services/SourceVisualValidationService.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

const firstPageXml = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>1</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note></measure></part></score-partwise>`;
const finalXml = firstPageXml.replace("<step>C</step>", "<step>D</step>");
const sha256 = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");
const part = { id: "P1", name: "Melody", staffCount: 1, staves: [1] };

function coverage(totalPages: number, processedPages: number[], missingPages: number[], unsupportedPages: number[] = []): ConversionCoverage {
  return {
    totalPages,
    processedPages,
    missingPages,
    ...(unsupportedPages.length ? { unsupportedPages } : {}),
    pages: Array.from({ length: totalPages }, (_value, index) => {
      const page = index + 1;
      return processedPages.includes(page)
        ? { page, status: "processed" as const, parts: [part] }
        : { page, status: "missing" as const, parts: [], ...(unsupportedPages.includes(page) ? { supportStatus: "unsupported" as const } : {}) };
    })
  };
}

function fullResult(): OmrResult {
  return { musicXml: finalXml, coverage: coverage(2, [1, 2], []), warnings: ["Resultado final completo"] };
}

function readyPage(page = 1, totalPages = 2, musicXml = firstPageXml): OmrReadyPage {
  return { page, totalPages, result: { musicXml, warnings: ["Leitura da primeira página"] } };
}

function recognitionProgress(totalPages = 2, currentPage = 2, completedPages: number[] = [1]): Parameters<NonNullable<OmrConversionOptions["onProgress"]>>[0] {
  return { stage: "recognizing", totalPages, currentPage, completedPages, failedPages: [], excludedPages: [], reusedPages: [] };
}

type OmrHandler = (options?: OmrConversionOptions) => Promise<OmrResult>;
function omr(handler: OmrHandler): OmrAdapter {
  return { convert: async (_input, _filename, _output, options) => handler(options) };
}

function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function setup(adapter: OmrAdapter) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "first-page-preview-test-"));
  roots.push(root);
  const scores = new InMemoryScoreRepository();
  const audits = new InMemoryAuditRepository();
  const storage = new FileStorageService(path.join(root, "uploads"), path.join(root, "exports"));
  await storage.saveUpload("source.pdf", Buffer.from("%PDF-1.4\n%%EOF"));
  const score = await scores.create({
    userId: "user-1", originalFilename: "Estudo.pdf", storedFilename: "source.pdf", fileType: "pdf",
    mimeType: "application/pdf", fileSize: 14, uploadStatus: "uploaded", conversionStatus: "queued",
    scoreType: "melody", scoreTypeSelected: true
  });
  const visual = {
    evaluate: async (input: { sourcePath: string; musicXml: string }) => ({
      review: {
        version: 1 as const, status: "unavailable" as const,
        sourceSHA256: sha256(await fs.readFile(input.sourcePath)), xmlSHA256: sha256(input.musicXml), reader: null,
        checkedMeasures: 0, unknownMeasures: 1, segments: [], proposals: [], limitations: ["Synthetic test review"],
        accuracyVerified: false as const, trainingEligible: false as const, history: []
      },
      assets: []
    })
  } as unknown as SourceVisualValidationService;
  const midi = {
    inspect: async (musicXml: string) => ({ status: "passed" as const, checkedNotes: 1, checkedDurations: 1,
      issues: [], limitations: [], xmlSHA256: sha256(musicXml) }),
    generate: async () => Buffer.from([])
  } as unknown as MidiExportService;
  const conversion = new ScoreConversionService(scores, audits, storage, adapter, visual, midi, false);
  const user = { id: "user-1", role: "user" } as User;
  const service = new ScoreService(scores, audits, storage, midi, undefined, false);
  return { root, scores, audits, storage, score, conversion, service, user };
}

function previewPath(ctx: Awaited<ReturnType<typeof setup>>, revision: string): string {
  const uploadPath = ctx.storage.resolveUploadPath(ctx.score.storedFilename);
  return path.join(path.dirname(uploadPath), `${path.basename(uploadPath)}.previews`, `${revision}.musicxml`);
}

async function remainingPreviewFiles(ctx: Awaited<ReturnType<typeof setup>>): Promise<string[]> {
  const directory = `${ctx.storage.resolveUploadPath(ctx.score.storedFilename)}.previews`;
  return fs.readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
}

describe("first page conversion preview", () => {
  it("serves page one while later work is pending, then clears and removes it after final publication", async () => {
    const published = deferred();
    const release = deferred();
    const ctx = await setup(omr(async (options) => {
      await options?.onProgress?.(recognitionProgress());
      await options?.onPageReady?.(readyPage());
      published.resolve();
      await release.promise;
      return fullResult();
    }));
    const pending = ctx.conversion.convertScore(ctx.score.id);
    try {
      await published.promise;
      const visible = await ctx.service.getFor(ctx.user, ctx.score.id);
      const preview = visible.conversionPreview!;
      expect(visible).toMatchObject({ conversionStatus: "processing", musicxmlFilename: null, coverage: null,
        conversionProgress: { attemptId: preview.attemptId, stage: "recognizing", currentPage: 2, completedPages: [1] } });
      expect(preview).toMatchObject({ page: 1, totalPages: 2, xmlSHA256: sha256(firstPageXml), warnings: ["Leitura da primeira página"] });
      expect(await ctx.service.firstPagePreviewFor(ctx.user, ctx.score.id, preview.revision)).toEqual(Buffer.from(firstPageXml));
      await expect(fs.access(previewPath(ctx, preview.revision))).resolves.toBeUndefined();

      release.resolve();
      const finished = await pending;
      expect(finished).toMatchObject({ conversionStatus: "converted", resultStatus: "complete", conversionPreview: null });
      expect(finished.musicxmlFilename).toBeTruthy();
      expect(finished.coverage).toEqual(fullResult().coverage);
      await expect(fs.access(previewPath(ctx, preview.revision))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(ctx.service.firstPagePreviewFor(ctx.user, ctx.score.id, preview.revision))
        .rejects.toMatchObject({ code: "FIRST_PAGE_PREVIEW_UNAVAILABLE" });
    } finally {
      release.resolve();
      await pending.catch(() => undefined);
    }
  });

  it.each([
    { label: "single page", page: 1, totalPages: 1, finalCoverage: coverage(1, [1], []) },
    { label: "page two when page one is missing", page: 2, totalPages: 2, finalCoverage: coverage(2, [2], [1]) },
    { label: "page two when page one is unsupported", page: 2, totalPages: 2, finalCoverage: coverage(2, [2], [1], [1]) }
  ])("does not publish a preview for $label", async ({ page, totalPages, finalCoverage }) => {
    const ctx = await setup(omr(async (options) => {
      await options?.onProgress?.(recognitionProgress(totalPages, page, page === 1 ? [] : []));
      await options?.onPageReady?.(readyPage(page, totalPages));
      return { musicXml: finalXml, coverage: finalCoverage, warnings: [] };
    }));

    const finished = await ctx.conversion.convertScore(ctx.score.id);

    expect(finished.conversionPreview).toBeNull();
    expect(finished.musicxmlFilename).toBeTruthy();
    expect(finished.resultStatus).toBe(totalPages === 1 ? "complete" : "partial");
    expect(await remainingPreviewFiles(ctx)).toEqual([]);
  });

  it("keeps an existing final result when a manual retry publishes a preview and then fails", async () => {
    let call = 0;
    let ctx: Awaited<ReturnType<typeof setup>>;
    let previousPreviewRevision = "";
    const retryPreviewPublished = deferred();
    const failRetry = deferred();
    let pendingRetry: Promise<Score> | undefined;
    ctx = await setup(omr(async (options) => {
      call += 1;
      await options?.onProgress?.(recognitionProgress());
      await options?.onPageReady?.(readyPage());
      if (call === 1) {
        previousPreviewRevision = (await ctx.scores.findById(ctx.score.id))?.conversionPreview?.revision ?? "";
        return fullResult();
      }
      retryPreviewPublished.resolve();
      await failRetry.promise;
      throw new AppError(422, "Synthetic later page failure", "OMR_PAGE_FAILED");
    }));
    try {
      const original = await ctx.conversion.convertScore(ctx.score.id);
      const originalXml = await ctx.storage.readExport(original.musicxmlFilename!);
      await ctx.service.retryFor(ctx.user, ctx.score.id);
      const manualAttempt = (await ctx.scores.listAttempts(ctx.score.id)).find((attempt) => attempt.kind === "manual")!;
      pendingRetry = ctx.conversion.convertScore(ctx.score.id, manualAttempt.id);
      await retryPreviewPublished.promise;
      const liveRetryPreview = (await ctx.service.getFor(ctx.user, ctx.score.id)).conversionPreview!;
      expect(liveRetryPreview.revision).not.toBe(previousPreviewRevision);
      await expect(ctx.service.firstPagePreviewFor(ctx.user, ctx.score.id, previousPreviewRevision))
        .rejects.toMatchObject({ statusCode: 409, code: "FIRST_PAGE_PREVIEW_CHANGED" });
      failRetry.resolve();
      const failedRetry = await pendingRetry;

      expect(failedRetry).toMatchObject({ conversionStatus: "converted", musicxmlFilename: original.musicxmlFilename, conversionPreview: null });
      expect(await ctx.storage.readExport(original.musicxmlFilename!)).toBe(originalXml);
      expect(failedRetry.lastErrorCode).toBe("OMR_PAGE_FAILED");
      expect(await remainingPreviewFiles(ctx)).toEqual([]);
    } finally {
      failRetry.resolve();
      await pendingRetry?.catch(() => undefined);
    }
  });

  it("does not publish a preview after the page callback loses its attempt claim", async () => {
    const ctx = await setup(omr(async (options) => {
      await options?.onProgress?.(recognitionProgress());
      await options?.onPageReady?.(readyPage());
      return fullResult();
    }));
    const publish = ctx.scores.publishConversionPreview.bind(ctx.scores);
    let replacementToken: string | null = null;
    let attemptedRevision = "";
    vi.spyOn(ctx.scores, "publishConversionPreview").mockImplementation(async (scoreId, attemptId, claimToken, preview) => {
      attemptedRevision = preview.revision;
      await ctx.scores.requeueStaleAttempts(new Date(Date.now() + 5_000));
      replacementToken = await ctx.scores.claimAttempt(attemptId);
      return publish(scoreId, attemptId, claimToken, preview);
    });

    const returned = await ctx.conversion.convertScore(ctx.score.id);

    expect(replacementToken).toBeTruthy();
    expect(returned).toMatchObject({ conversionStatus: "processing", conversionPreview: null, musicxmlFilename: null,
      conversionProgress: { stage: "preparing", currentPage: null } });
    expect((await ctx.scores.getAttempt((await ctx.scores.listAttempts(ctx.score.id))[0].id))?.status).toBe("processing");
    await expect(fs.access(previewPath(ctx, attemptedRevision))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(ctx.service.firstPagePreviewFor(ctx.user, ctx.score.id, attemptedRevision))
      .rejects.toMatchObject({ code: "FIRST_PAGE_PREVIEW_UNAVAILABLE" });
  });

  it("denies another account and a deleted score while the preview is live", async () => {
    const published = deferred();
    const release = deferred();
    const ctx = await setup(omr(async (options) => {
      await options?.onProgress?.(recognitionProgress());
      await options?.onPageReady?.(readyPage());
      published.resolve();
      await release.promise;
      return fullResult();
    }));
    const pending = ctx.conversion.convertScore(ctx.score.id);
    try {
      await published.promise;
      const preview = (await ctx.service.getFor(ctx.user, ctx.score.id)).conversionPreview!;
      await expect(ctx.service.firstPagePreviewFor({ id: "user-2", role: "user" } as User, ctx.score.id, preview.revision))
        .rejects.toMatchObject({ statusCode: 403 });
      await ctx.service.deleteFor(ctx.user, ctx.score.id);
      await expect(ctx.service.firstPagePreviewFor(ctx.user, ctx.score.id, preview.revision))
        .rejects.toMatchObject({ statusCode: 404 });
      release.resolve();
      await pending;
      await expect(fs.access(previewPath(ctx, preview.revision))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      release.resolve();
      await pending.catch(() => undefined);
    }
  });

  it.each(["digest mismatch", "symlink"] as const)("refuses a preview with %s", async (attack) => {
    const published = deferred();
    const release = deferred();
    const ctx = await setup(omr(async (options) => {
      await options?.onProgress?.(recognitionProgress());
      await options?.onPageReady?.(readyPage());
      published.resolve();
      await release.promise;
      return fullResult();
    }));
    const pending = ctx.conversion.convertScore(ctx.score.id);
    let previewRevision = "";
    try {
      await published.promise;
      previewRevision = (await ctx.service.getFor(ctx.user, ctx.score.id)).conversionPreview!.revision;
      const filename = previewPath(ctx, previewRevision);
      if (attack === "digest mismatch") await fs.writeFile(filename, "tampered preview", { mode: 0o600 });
      else {
        const target = path.join(ctx.root, "outside-preview-target");
        await fs.writeFile(target, "outside content", { mode: 0o600 });
        await fs.rm(filename);
        await fs.symlink(target, filename);
      }
      await expect(ctx.service.firstPagePreviewFor(ctx.user, ctx.score.id, previewRevision))
        .rejects.toMatchObject({ statusCode: 410, code: "FIRST_PAGE_PREVIEW_UNAVAILABLE" });
      release.resolve();
      await pending;
      if (attack === "symlink") expect(await fs.readFile(path.join(ctx.root, "outside-preview-target"), "utf8")).toBe("outside content");
    } finally {
      release.resolve();
      await pending.catch(() => undefined);
    }
  });

  it("drops a read that overlaps final publication", async () => {
    const published = deferred();
    const releaseConversion = deferred();
    const readStarted = deferred();
    const releaseRead = deferred();
    const ctx = await setup(omr(async (options) => {
      await options?.onProgress?.(recognitionProgress());
      await options?.onPageReady?.(readyPage());
      published.resolve();
      await releaseConversion.promise;
      return fullResult();
    }));
    const pending = ctx.conversion.convertScore(ctx.score.id);
    try {
      await published.promise;
      const preview = (await ctx.service.getFor(ctx.user, ctx.score.id)).conversionPreview!;
      const read = ctx.storage.readFirstPagePreview.bind(ctx.storage);
      vi.spyOn(ctx.storage, "readFirstPagePreview").mockImplementation(async (storedFilename, metadata) => {
        const bytes = await read(storedFilename, metadata);
        readStarted.resolve();
        await releaseRead.promise;
        return bytes;
      });
      const response = ctx.service.firstPagePreviewFor(ctx.user, ctx.score.id, preview.revision);
      await readStarted.promise;
      releaseConversion.resolve();
      await pending;
      releaseRead.resolve();
      await expect(response).rejects.toMatchObject({ statusCode: 409, code: "FIRST_PAGE_PREVIEW_CHANGED" });
    } finally {
      releaseConversion.resolve();
      releaseRead.resolve();
      await pending.catch(() => undefined);
    }
  });

  it("keeps final conversion when optional preview storage is unavailable", async () => {
    const ctx = await setup(omr(async (options) => {
      await options?.onProgress?.(recognitionProgress());
      await options?.onPageReady?.(readyPage());
      return fullResult();
    }));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(ctx.storage, "saveFirstPagePreview").mockRejectedValue(new Error("synthetic preview disk failure"));

    const finished = await ctx.conversion.convertScore(ctx.score.id);

    expect(finished).toMatchObject({ conversionStatus: "converted", resultStatus: "complete", conversionPreview: null });
    expect(finished.musicxmlFilename).toBeTruthy();
    expect(await ctx.storage.readExport(finished.musicxmlFilename!)).toBe(finalXml);
    expect(warning).toHaveBeenCalledWith("First-page preview unavailable", expect.objectContaining({ scoreId: ctx.score.id }));
  });

  it("prunes only old preview files and keeps fresh, linked, outside, and unknown files", async () => {
    const ctx = await setup(omr(async () => fullResult()));
    const old = await ctx.storage.saveFirstPagePreview("source.pdf", "old-attempt", 2, firstPageXml, []);
    const fresh = await ctx.storage.saveFirstPagePreview("source.pdf", "fresh-attempt", 2, finalXml, []);
    const directory = `${ctx.storage.resolveUploadPath("source.pdf")}.previews`;
    const oldPath = path.join(directory, `${old.revision}.musicxml`);
    const freshPath = path.join(directory, `${fresh.revision}.musicxml`);
    const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await fs.utimes(oldPath, oldDate, oldDate);
    const linkedPath = path.join(directory, `${"a".repeat(64)}.musicxml`);
    const outsidePath = path.join(ctx.root, "outside-target.musicxml");
    const unknownPath = path.join(directory, "keep-me.txt");
    await fs.writeFile(outsidePath, "outside target", { mode: 0o600 });
    await fs.symlink(outsidePath, linkedPath);
    await fs.writeFile(unknownPath, "unknown sentinel", { mode: 0o600 });

    const newest = await ctx.storage.saveFirstPagePreview("source.pdf", "current-attempt", 3, firstPageXml, []);

    await expect(fs.access(oldPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await fs.readFile(freshPath, "utf8")).toBe(finalXml);
    expect(await fs.readFile(path.join(directory, `${newest.revision}.musicxml`), "utf8")).toBe(firstPageXml);
    expect((await fs.lstat(linkedPath)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(outsidePath, "utf8")).toBe("outside target");
    expect(await fs.readFile(unknownPath, "utf8")).toBe("unknown sentinel");
  });
});
