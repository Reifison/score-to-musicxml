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

scoreRoutes.post("/", uploadRateLimit, upload.single("file"), async (req, res) => {
  if (!req.file) throw new AppError(400, "Arquivo obrigatório.", "FILE_REQUIRED");
  const score = await req.services.uploads.upload({
    user: req.user!,
    filename: req.file.originalname,
    buffer: req.file.buffer,
    preprocessingProfile: typeof req.body.preprocessingProfile === "string" ? req.body.preprocessingProfile : null,
    ipAddress: req.ip
  });
  res.status(201).json({ score });
});

scoreRoutes.get("/:id", async (req, res) => {
  res.json({ score: await req.services.scores.getFor(req.user!, req.params.id) });
});

scoreRoutes.delete("/:id", async (req, res) => {
  await req.services.scores.deleteFor(req.user!, req.params.id, req.ip);
  res.status(204).send();
});

scoreRoutes.get("/:id/download", downloadRateLimit, async (req, res) => {
  const download = await req.services.scores.downloadFor(req.user!, String(req.params.id), req.ip);
  setPrivateDownloadHeaders(res);
  res.setHeader("Content-Type", "application/vnd.recordare.musicxml+xml; charset=utf-8");
  res.download(download.path, download.filename, (error) => {
    if (error && !res.headersSent) res.status(500).json({ error: "Falha ao baixar o arquivo.", code: "DOWNLOAD_FAILED" });
  });
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
  res.setHeader("Content-Type", score.mimeType);
  fs.createReadStream(filePath).pipe(res);
});

scoreRoutes.get("/:id/preview-image", async (req, res) => {
  const score = await req.services.scores.getFor(req.user!, String(req.params.id));
  const filePath = req.services.storage.resolveUploadPath(score.storedFilename);

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
  const outputPath = `${outputPrefix}-1.png`;
  try {
    await execFileAsync(pdftoppm, ["-png", "-f", "1", "-l", "1", "-scale-to", "1400", filePath, outputPrefix], {
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
