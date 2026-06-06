import fs from "node:fs";
import { Router } from "express";
import multer from "multer";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";
import { requireAuth } from "../middleware/auth.js";
import { downloadRateLimit, uploadRateLimit } from "../middleware/rateLimits.js";

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
  const scores = await req.services.scores.listFor(req.user!, {
    status: String(req.query.status || ""),
    userId: typeof req.query.userId === "string" ? req.query.userId : undefined
  });
  res.json({ scores });
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
  res.setHeader("Content-Type", "application/vnd.recordare.musicxml+xml; charset=utf-8");
  res.download(download.path, download.filename, (error) => {
    if (error && !res.headersSent) res.status(500).json({ error: "Falha ao baixar o arquivo.", code: "DOWNLOAD_FAILED" });
  });
});

scoreRoutes.get("/:id/preview", async (req, res) => {
  const score = await req.services.scores.getFor(req.user!, String(req.params.id));
  const filePath = req.services.storage.resolveUploadPath(score.storedFilename);
  res.setHeader("Content-Type", score.mimeType);
  fs.createReadStream(filePath).pipe(res);
});
