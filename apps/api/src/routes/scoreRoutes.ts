import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";
import { requireAuth } from "../middleware/auth.js";
import { downloadRateLimit, midiDownloadRateLimit, uploadRateLimit } from "../middleware/rateLimits.js";
import { safeMidiErrorCode } from "../services/MidiObservabilityService.js";

const execFileAsync = promisify(execFile);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_BYTES,
    files: 1
  }
});

export const scoreRoutes = Router();

scoreRoutes.use(requireAuth);

scoreRoutes.get("/", async (req, res) => {
  const favorite = req.query.favorite === "true" ? true : req.query.favorite === "false" ? false : undefined;
  const scores = await req.services.scores.listFor(req.user!, {
    status: String(req.query.status || ""),
    userId: typeof req.query.userId === "string" ? req.query.userId : undefined,
    favorite
  });
  res.json({ scores });
});

scoreRoutes.get("/trash", async (req, res) => {
  const favorite = req.query.favorite === "true" ? true : req.query.favorite === "false" ? false : undefined;
  const scores = await req.services.scores.listTrashFor(req.user!, { favorite });
  res.json({ scores });
});

scoreRoutes.post("/bulk", async (req, res) => {
  const input = z.object({
    ids: z.array(z.string().trim().min(1)).min(1).max(100),
    action: z.enum(["delete", "favorite"]),
    isFavorite: z.boolean().optional()
  }).superRefine((value, context) => {
    if (value.action === "favorite" && value.isFavorite === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["isFavorite"], message: "Informe o estado do favorito." });
    }
  }).parse(req.body);

  if (input.action === "delete") {
    res.json(await req.services.scores.bulkDeleteFor(req.user!, input.ids, req.ip));
    return;
  }
  res.json(await req.services.scores.bulkFavoriteFor(req.user!, input.ids, input.isFavorite!));
});

scoreRoutes.patch("/:id/favorite", async (req, res) => {
  const input = z.object({ isFavorite: z.boolean() }).parse(req.body);
  const score = await req.services.scores.setFavoriteFor(req.user!, req.params.id, input.isFavorite);
  res.json({ score });
});

scoreRoutes.patch("/:id", async (req, res) => {
  const input = z.object({ originalFilename: z.string().trim().min(1).max(180) }).parse(req.body);
  const score = await req.services.scores.renameFor(req.user!, req.params.id, input.originalFilename, req.ip);
  res.json({ score });
});

scoreRoutes.post("/:id/restore", async (req, res) => {
  const score = await req.services.scores.restoreFor(req.user!, req.params.id, req.ip);
  res.json({ score });
});

scoreRoutes.post("/", uploadRateLimit, upload.single("file"), async (req, res) => {
  if (!req.file) throw new AppError(400, "Arquivo obrigatório.", "FILE_REQUIRED");
  const score = await req.services.uploads.upload({
    user: req.user!,
    filename: req.file.originalname,
    buffer: req.file.buffer,
    preprocessingProfile: typeof req.body.preprocessingProfile === "string" ? req.body.preprocessingProfile : null,
    scoreType: req.body.scoreType === undefined ? undefined : z.enum(["melody", "piano", "guitar_solo", "guitar_duo"]).parse(req.body.scoreType),
    ipAddress: req.ip
  });
  res.status(201).json({ score });
});

scoreRoutes.get("/:id", async (req, res) => {
  res.json({ score: await req.services.scores.getFor(req.user!, req.params.id) });
});

scoreRoutes.get("/:id/versions", downloadRateLimit, async (req, res) => {
  const versions = await req.services.scores.versionsFor(req.user!, String(req.params.id));
  setPrivateDownloadHeaders(res);
  res.json({ versions });
});

scoreRoutes.get("/:id/versions/:versionId/musicxml", downloadRateLimit, async (req, res) => {
  const download = await req.services.scores.versionMusicXmlFor(req.user!, String(req.params.id), String(req.params.versionId));
  setPrivateDownloadHeaders(res);
  res.setHeader("Content-Type", "application/vnd.recordare.musicxml+xml; charset=utf-8");
  res.attachment(download.filename);
  res.send(download.musicXml);
});

scoreRoutes.get("/:id/first-page-preview", downloadRateLimit, async (req, res) => {
  const revision = z.string().regex(/^[a-f0-9]{64}$/).parse(req.query.revision);
  const musicXml = await req.services.scores.firstPagePreviewFor(req.user!, String(req.params.id), revision);
  setPrivateDownloadHeaders(res);
  res.setHeader("Content-Type", "application/vnd.recordare.musicxml+xml; charset=utf-8");
  res.setHeader("X-Score-Result-Status", "provisional");
  res.setHeader("X-Score-Preview-Page", "1");
  res.send(musicXml);
});

scoreRoutes.post("/:id/retry", async (req, res) => {
  const input = z.object({ scoreType: z.enum(["melody", "piano", "guitar_solo", "guitar_duo"]).optional() }).parse(req.body ?? {});
  res.status(202).json({ score: await req.services.scores.retryFor(req.user!, req.params.id, req.ip, input.scoreType) });
});

scoreRoutes.post("/:id/review", async (req, res) => {
  const input = z.object({ revision: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(req.body);
  res.json({ score: await req.services.scores.approveReviewFor(req.user!, req.params.id, input.revision, req.ip) });
});

scoreRoutes.post("/:id/visual-review/decision", async (req, res) => {
  const input = z.object({ revision: z.string().regex(/^[a-f0-9]{64}$/), proposalId: z.string().min(1).max(64), decision: z.enum(["accept", "reject", "undo"]) }).strict().parse(req.body);
  res.json({ score: await req.services.scores.decideVisualProposalFor(req.user!, req.params.id, input.revision, input.proposalId, input.decision, req.ip) });
});

scoreRoutes.get("/:id/evidence", async (req, res) => {
  const evidence = await req.services.scores.evidenceFor(req.user!, req.params.id);
  setPrivateDownloadHeaders(res);
  res.json({ evidence });
});

scoreRoutes.get("/:id/evidence/:asset", async (req, res) => {
  const asset = await req.services.scores.evidenceAssetFor(req.user!, req.params.id, req.params.asset);
  setPrivateDownloadHeaders(res);
  res.download(asset, req.params.asset, (error) => {
    if (error && !res.headersSent) res.status(404).json({ error: "Evidência não encontrada.", code: "EVIDENCE_NOT_FOUND" });
  });
});

scoreRoutes.delete("/:id", async (req, res) => {
  await req.services.scores.deleteFor(req.user!, req.params.id, req.ip);
  res.status(204).send();
});

scoreRoutes.get("/:id/download", downloadRateLimit, async (req, res) => {
  const preview = req.query.preview === "true";
  const download = await req.services.scores.downloadFor(req.user!, String(req.params.id), req.ip, preview);
  setPrivateDownloadHeaders(res);
  res.setHeader("Content-Type", "application/vnd.recordare.musicxml+xml; charset=utf-8");
  res.setHeader("X-Score-Result-Status", download.resultStatus);
  res.setHeader("X-Score-Review-Status", download.reviewStatus);
  if (download.missingPages.length) res.setHeader("X-Score-Missing-Pages", download.missingPages.join(","));
  res.attachment(download.filename);
  res.send(download.musicXml);
});

scoreRoutes.get("/:id/midi", midiDownloadRateLimit, async (req, res) => {
  const startedAt = performance.now();
  let metricRecorded = false;
  const recordFailure = (errorCode: string) => {
    if (metricRecorded) return;
    metricRecorded = true;
    req.services.midiObservability.recordFailure("download", performance.now() - startedAt, errorCode);
  };

  try {
    const download = await req.services.scores.downloadMidiFor(req.user!, String(req.params.id), req.ip);
    res.once("finish", () => {
      if (metricRecorded) return;
      metricRecorded = true;
      req.services.midiObservability.recordSuccess("download", performance.now() - startedAt, download.buffer.byteLength);
    });
    res.once("close", () => {
      if (!res.writableFinished) recordFailure("CLIENT_DISCONNECTED");
    });
    res.once("error", () => recordFailure("RESPONSE_STREAM_ERROR"));

    setPrivateDownloadHeaders(res);
    res.attachment(download.filename);
    res.setHeader("Content-Type", "audio/midi");
    res.setHeader("Content-Length", String(download.buffer.byteLength));
    res.send(download.buffer);
  } catch (error) {
    recordFailure(safeMidiErrorCode(error));
    throw error;
  }
});

scoreRoutes.get("/:id/preview", async (req, res) => {
  const score = await req.services.scores.getFor(req.user!, String(req.params.id));
  const filePath = req.services.storage.resolveUploadPath(score.storedFilename);
  const policy = String(res.getHeader("Content-Security-Policy") ?? "");
  const directives = policy.split(";").map((directive) => directive.trim()).filter(Boolean)
    .filter((directive) => !/^frame-ancestors(?:\s|$)/i.test(directive));
  directives.push(`frame-ancestors 'self' ${new URL(env.WEB_ORIGIN).origin}`);
  res.setHeader("Content-Security-Policy", directives.join(";"));
  res.removeHeader("X-Frame-Options");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Content-Type", score.mimeType);
  fs.createReadStream(filePath).pipe(res);
});

scoreRoutes.get("/:id/preview-image", async (req, res) => {
  const score = await req.services.scores.getFor(req.user!, String(req.params.id));
  const rawPage = req.query.page ?? "1";
  if (typeof rawPage !== "string" || !/^[1-9][0-9]*$/.test(rawPage)) throw new AppError(400, "Informe uma página válida do original.", "INVALID_PREVIEW_PAGE");
  const page = Number(rawPage);
  const pageLimit = score.fileType === "image" ? 1 : score.coverage?.totalPages ?? env.OMR_MAX_PAGES;
  if (!Number.isSafeInteger(page) || page > pageLimit) throw new AppError(400, "A página solicitada não pertence a este original.", "INVALID_PREVIEW_PAGE");
  const filePath = req.services.storage.resolveUploadPath(score.storedFilename);
  setPrivateDownloadHeaders(res);

  if (score.fileType === "image") {
    res.setHeader("Content-Type", score.mimeType);
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const pdftoppm = await findCommand(["/usr/local/bin/pdftoppm", "/opt/homebrew/bin/pdftoppm", "pdftoppm"]);
  if (!pdftoppm) {
    throw new AppError(501, "Preview de PDF indisponível neste servidor.", "PDF_PREVIEW_NOT_CONFIGURED");
  }

  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "score-preview-"));
  const outputPrefix = path.join(dir, "page");
  const outputPath = `${outputPrefix}.png`;
  try {
    await execFileAsync(pdftoppm, ["-png", "-singlefile", "-f", String(page), "-l", String(page), "-scale-to", "1400", filePath, outputPrefix], {
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024
    });
    res.setHeader("Content-Type", "image/png");
    res.on("close", () => {
      void fsp.rm(dir, { force: true, recursive: true });
    });
    fs.createReadStream(outputPath).pipe(res);
  } catch (error) {
    await fsp.rm(dir, { force: true, recursive: true });
    if (error instanceof AppError) throw error;
    throw new AppError(422, "Não foi possível gerar imagem de preview do PDF.", "PDF_PREVIEW_FAILED");
  }
});

async function findCommand(candidates: string[]) {
  for (const candidate of candidates) {
    try {
      if (candidate.includes(path.sep)) {
        await fsp.access(candidate, fs.constants.X_OK);
        return candidate;
      }
      await execFileAsync("which", [candidate], { timeout: 2000, maxBuffer: 1024 * 1024 });
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function setPrivateDownloadHeaders(res: import("express").Response): void {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}
