import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileStorageService } from "../services/FileStorageService.js";

describe("export downloads", () => {
  it("reads regular exports and refuses symlinks or non-file entries", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "score-export-download-"));
    const exports = path.join(base, "exports");
    const outside = path.join(base, "outside.musicxml");
    const storage = new FileStorageService(path.join(base, "uploads"), exports);
    try {
      await storage.saveExport("score.musicxml", "<score-partwise/>");
      expect(await storage.readExportForDownload("score.musicxml")).toEqual(Buffer.from("<score-partwise/>"));

      await fs.writeFile(outside, "<private-outside-score/>");
      await fs.symlink(outside, storage.resolveExportPath("linked.musicxml"));
      await expect(storage.readExportForDownload("linked.musicxml")).rejects.toMatchObject({ code: "ELOOP" });

      await fs.mkdir(storage.resolveExportPath("directory.musicxml"));
      await expect(storage.readExportForDownload("directory.musicxml")).rejects.toMatchObject({ code: "EXPORT_NOT_A_FILE" });
    } finally {
      await fs.rm(base, { recursive: true, force: true });
    }
  });
});

describe("conversion evidence storage", () => {
  it("preserves identical preparation aliases as one engine run without exposing local paths", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "score-evidence-aliases-"));
    const workDir = path.join(base, "work");
    const storage = new FileStorageService(path.join(base, "uploads"), path.join(base, "exports"));
    const bytes = Buffer.from("identical-prepared-image");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    try {
      await fs.mkdir(workDir);
      await storage.saveUpload("original.png", bytes);
      await storage.saveExport("score.musicxml", "<score-partwise/>");
      const first = path.join(workDir, "first.png"), second = path.join(workDir, "second.png");
      await Promise.all([fs.writeFile(first, bytes), fs.writeFile(second, bytes)]);
      await storage.saveConversionEvidence("score.musicxml", {
        sourcePath: storage.resolveUploadPath("original.png"), workDir, revision: "revision", metadata: {},
        candidates: [{ page: 1, candidate: 1, candidateIds: [1, 2], selected: true, reason: "Identical input reused.", xml: "<score-partwise/>", sourceImagePath: first,
          sourceImagePaths: [{ candidate: 1, path: first, sha256 }, { candidate: 2, path: second, sha256 }], validation: {} }]
      });
      const evidence = await storage.readConversionEvidence("score.musicxml") as { candidates: Array<Record<string, unknown>> };
      expect(evidence.candidates).toMatchObject([{ candidateIds: [1, 2], engineRuns: 1, sourceReference: false,
        preparedInputs: [{ candidate: 1, sha256, image: "candidate-1.png" }, { candidate: 2, sha256, image: "candidate-1.png" }] }]);
      expect(JSON.stringify(evidence)).not.toContain(workDir);
      const evidenceFiles = await fs.readdir(path.dirname(storage.resolveEvidenceAsset("score.musicxml", "candidate-1.png")));
      expect(evidenceFiles.filter((file) => file.endsWith(".png"))).toEqual(["candidate-1.png"]);
      await storage.saveExport("changed.musicxml", "<score-partwise/>");
      await fs.writeFile(second, "changed-after-recognition");
      await expect(storage.saveConversionEvidence("changed.musicxml", {
        sourcePath: storage.resolveUploadPath("original.png"), workDir, revision: "revision", metadata: {},
        candidates: [{ page: 1, candidate: 1, selected: true, reason: "candidate", xml: "<score-partwise/>", sourceImagePath: first,
          sourceImagePaths: [{ candidate: 2, path: second, sha256 }], validation: {} }]
      })).rejects.toMatchObject({ code: "EVIDENCE_IMAGE_CHANGED" });
    } finally { await fs.rm(base, { recursive: true, force: true }); }
  });

  it("accepts canonical image paths, omits oversized native artifacts, and does not follow linked directories", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "score-evidence-storage-"));
    const uploads = path.join(base, "uploads");
    const exports = path.join(base, "exports");
    const workDir = path.join(base, "work");
    const outside = path.join(base, "outside");
    const storage = new FileStorageService(uploads, exports);
    const filename = "test-score.musicxml";
    const xml = "<score-partwise/>";
    try {
      await Promise.all([fs.mkdir(workDir), fs.mkdir(outside)]);
      await storage.saveUpload("original.pdf", Buffer.from("original-pdf"));
      await storage.saveExport(filename, xml);
      const image = path.join(workDir, "page.png");
      await fs.writeFile(image, Buffer.from("rendered-page"));
      await fs.writeFile(path.join(workDir, "native.xml"), "<native/>");
      const tooLarge = await fs.open(path.join(workDir, "oversized.omr"), "w");
      try { await tooLarge.truncate(129 * 1024 * 1024); } finally { await tooLarge.close(); }
      await fs.writeFile(path.join(outside, "external.xml"), "private-outside-workdir");
      await fs.symlink(outside, path.join(workDir, "linked-outside"));

      await storage.saveConversionEvidence(filename, {
        sourcePath: storage.resolveUploadPath("original.pdf"), workDir, revision: "revision",
        metadata: { accuracyVerified: false },
        candidates: [{ page: 1, candidate: 1, selected: true, reason: "candidate", xml,
          sourceImagePath: await fs.realpath(image), validation: { version: 1, issues: [] } }]
      });
      const evidence = await storage.readConversionEvidence(filename) as {
        candidates: Array<{ image: { filename: string; sha256: string } }>;
        artifacts: Array<{ filename: string; stage: string }>;
        omittedArtifacts: Array<{ reason: string; sizeBytes: number }>;
        nativeArtifactsComplete: boolean;
      };
      expect(evidence.candidates[0].image.sha256).toBe(createHash("sha256").update("rendered-page").digest("hex"));
      expect(await fs.readFile(storage.resolveEvidenceAsset(filename, evidence.candidates[0].image.filename), "utf8")).toBe("rendered-page");
      expect(evidence.artifacts).toMatchObject([{ stage: "native-engine-output" }]);
      expect(await fs.readFile(storage.resolveEvidenceAsset(filename, evidence.artifacts[0].filename), "utf8")).toBe("<native/>");
      expect(evidence.omittedArtifacts).toEqual([{ reason: "native-artifact-storage-limit", sizeBytes: 129 * 1024 * 1024 }]);
      expect(evidence.nativeArtifactsComplete).toBe(false);
    } finally { await fs.rm(base, { recursive: true, force: true }); }
  });
  it("cleans an immutable version chain after retry without deleting parents on failed-decision cleanup", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "score-version-retention-"));
    const storage = new FileStorageService(path.join(base, "uploads"), path.join(base, "exports"));
    const workDir = path.join(base, "work");
    const original = "scoreid-AAAAAAAAAAAA.musicxml";
    const decision = "scoreid-BBBBBBBBBBBB.musicxml";
    const retry = "scoreid-CCCCCCCCCCCC.musicxml";
    const loser = "scoreid-DDDDDDDDDDDD.musicxml";
    try {
      await fs.mkdir(workDir);
      await storage.saveUpload("source.png", Buffer.from("source"));
      for (const filename of [original, decision, retry, loser]) await storage.saveExport(filename, "<score-partwise/>");
      for (const [filename, parent] of [[original, null], [decision, original], [retry, decision], [loser, decision]] as const) {
        await storage.saveConversionEvidence(filename, { sourcePath: storage.resolveUploadPath("source.png"), workDir,
          revision: filename, metadata: { parentExportFilename: parent }, candidates: [] });
      }
      await storage.deleteExport(loser);
      expect(await storage.readExport(decision)).toBe("<score-partwise/>");
      await storage.deleteExportHistory(retry);
      for (const filename of [original, decision, retry]) {
        await expect(storage.readExport(filename)).rejects.toMatchObject({ code: "ENOENT" });
        await expect(storage.readConversionEvidence(filename)).rejects.toMatchObject({ code: "EVIDENCE_NOT_FOUND" });
      }
    } finally { await fs.rm(base, { recursive: true, force: true }); }
  });

  it("rejects a cross-score parent manifest before deleting either export", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "score-version-owner-"));
    const storage = new FileStorageService(path.join(base, "uploads"), path.join(base, "exports"));
    const workDir = path.join(base, "work");
    try {
      await fs.mkdir(workDir);
      await storage.saveUpload("source.png", Buffer.from("source"));
      await storage.saveExport("scoreid-AAAAAAAAAAAA.musicxml", "original");
      await storage.saveExport("otherid-BBBBBBBBBBBB.musicxml", "other");
      await storage.saveConversionEvidence("scoreid-AAAAAAAAAAAA.musicxml", {
        sourcePath: storage.resolveUploadPath("source.png"), workDir, revision: "r", candidates: [],
        metadata: { parentExportFilename: "otherid-BBBBBBBBBBBB.musicxml" }
      });
      await expect(storage.deleteExportHistory("scoreid-AAAAAAAAAAAA.musicxml")).rejects.toMatchObject({ code: "INVALID_EXPORT_HISTORY" });
      expect(await storage.readExport("scoreid-AAAAAAAAAAAA.musicxml")).toBe("original");
      expect(await storage.readExport("otherid-BBBBBBBBBBBB.musicxml")).toBe("other");
    } finally { await fs.rm(base, { recursive: true, force: true }); }
  });

});
