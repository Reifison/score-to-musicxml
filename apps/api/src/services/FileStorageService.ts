import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { nanoid } from "nanoid";
import { paths } from "../config/env.js";
import { AppError } from "../errors/AppError.js";
import { extensionOf } from "../utils/filenames.js";
import type { MusicalValidation } from "../domain.js";
import type { VisualEvidenceAsset } from "./SourceVisualReviewTypes.js";

const evidenceAssetPattern = /^(candidate-[1-9][0-9]*\.(musicxml|png|jpg|jpeg|webp|tif|tiff|bmp)|artifact-[1-9][0-9]*\.(mxl|omr|xml|musicxml|log)|visual-(page|crop|segment)-[1-9][0-9]*\.png|review-version-[1-9][0-9]*\.musicxml)$/;

export class FileStorageService {
  constructor(private baseUploadsDir = paths.uploadsDir, private baseExportsDir = paths.exportsDir) {}

  async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.baseUploadsDir, { recursive: true, mode: 0o700 });
    await fs.mkdir(this.baseExportsDir, { recursive: true, mode: 0o700 });
  }

  generateStoredFilename(originalFilename: string): string {
    const ext = extensionOf(originalFilename);
    if (!ext) throw new AppError(400, "Arquivo sem extensão válida.", "INVALID_EXTENSION");
    return `${nanoid(32)}.${ext}`;
  }

  generateExportStoredFilename(scoreId: string): string {
    return `${scoreId}-${nanoid(12)}.musicxml`;
  }

  async saveUpload(storedFilename: string, buffer: Buffer): Promise<void> {
    await this.ensureDirectories();
    await fs.writeFile(this.resolveUploadPath(storedFilename), buffer, { mode: 0o600, flag: "wx" });
  }

  async saveExport(storedFilename: string, content: string): Promise<void> {
    await this.ensureDirectories();
    await fs.writeFile(this.resolveExportPath(storedFilename), content, { mode: 0o600, flag: "wx" });
  }

  async readExport(storedFilename: string): Promise<string> {
    return fs.readFile(this.resolveExportPath(storedFilename), "utf8");
  }

  /** Read an export from an already-open regular file without following a symlink. */
  async readExportForDownload(storedFilename: string): Promise<Buffer> {
    const exportPath = this.resolveExportPath(storedFilename);
    const handle = await fs.open(exportPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const details = await handle.stat();
      if (!details.isFile()) {
        const error = new Error("MusicXML export is not a regular file.");
        (error as NodeJS.ErrnoException).code = "EXPORT_NOT_A_FILE";
        throw error;
      }
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  }

  async deleteUpload(storedFilename: string): Promise<void> {
    await fs.rm(this.resolveUploadPath(storedFilename), { force: true });
  }

  async deleteExport(storedFilename: string | null): Promise<void> {
    if (storedFilename) {
      await fs.rm(this.resolveExportPath(storedFilename), { force: true });
      await fs.rm(this.evidenceDirectory(storedFilename), { recursive: true, force: true });
    }
  }

  /** Called only when an owning score expires; failure cleanup must use deleteExport. */
  async deleteExportHistory(storedFilename: string | null): Promise<void> {
    const versions = new Set<string>();
    let current = storedFilename;
    const ownerPrefix = storedFilename?.match(/^(.*)-[a-zA-Z0-9_-]{12}\.musicxml$/)?.[1];
    while (current && !versions.has(current)) {
      this.resolveExportPath(current);
      versions.add(current);
      let parent: unknown;
      try {
        const manifest = await this.readConversionEvidence(current) as Record<string, unknown>;
        parent = manifest.parentExportFilename;
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== "EVIDENCE_NOT_FOUND") throw error;
      }
      if (parent === undefined || parent === null) break;
      // Never let a malformed manifest delete another score's immutable exports.
      if (!ownerPrefix || typeof parent !== "string"
        || !parent.startsWith(`${ownerPrefix}-`)
        || !/^[a-zA-Z0-9_-]+-[a-zA-Z0-9_-]{12}\.musicxml$/.test(parent)
        || parent.length !== current.length) {
        throw new AppError(500, "Histórico de versões inválido.", "INVALID_EXPORT_HISTORY");
      }
      current = parent;
      if (versions.size >= 10000) throw new AppError(500, "Histórico de versões excedido.", "INVALID_EXPORT_HISTORY");
    }
    for (const filename of versions) await this.deleteExport(filename);
  }

  async saveConversionEvidence(storedFilename: string, input: {
    sourcePath: string; workDir: string; revision: string;
    metadata: Record<string, unknown>;
    visualAssets?: VisualEvidenceAsset[];
    candidates: Array<{ page: number; candidate: number; candidateIds?: number[]; selected: boolean; reason: string; xml: string; sourceImagePath?: string; sourceImagePaths?: Array<{ candidate: number; path: string; sha256: string }>; validation: unknown }>;
  }): Promise<void> {
    const directory = this.evidenceDirectory(storedFilename);
    await fs.mkdir(directory, { mode: 0o700 });
    const canonicalWorkDir = await fs.realpath(input.workDir);
    const canonicalSource = await fs.realpath(input.sourcePath);
    const digest = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
    const copyWithHash = async (source: string, filename: string): Promise<string> => {
      const target = path.join(directory, filename);
      await fs.copyFile(source, target, constants.COPYFILE_EXCL);
      await fs.chmod(target, 0o600);
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(target)) hash.update(chunk);
      return hash.digest("hex");
    };
    const candidates = [];
    for (let index = 0; index < input.candidates.length; index++) {
      const candidate = input.candidates[index];
      const xmlFilename = `candidate-${index + 1}.musicxml`;
      await fs.writeFile(path.join(directory, xmlFilename), candidate.xml, { mode: 0o600, flag: "wx" });
      let image: { filename: string; sha256: string } | null = null;
      if (candidate.sourceImagePath) {
        const imagePath = await fs.realpath(candidate.sourceImagePath);
        const ext = path.extname(imagePath).toLowerCase();
        const inWorkDir = imagePath.startsWith(`${canonicalWorkDir}${path.sep}`);
        if ((!inWorkDir && imagePath !== canonicalSource) || ![".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"].includes(ext)) {
          throw new AppError(500, "Evidência de imagem inválida.", "INVALID_EVIDENCE_SOURCE");
        }
        if (!(await fs.lstat(imagePath)).isFile()) throw new AppError(500, "Evidência de imagem inválida.", "INVALID_EVIDENCE_SOURCE");
        const filename = `candidate-${index + 1}${ext}`;
        image = { filename, sha256: await copyWithHash(imagePath, filename) };
      }
      const preparedInputs = [];
      for (const alias of candidate.sourceImagePaths ?? []) {
        const aliasPath = await fs.realpath(alias.path);
        if ((!aliasPath.startsWith(`${canonicalWorkDir}${path.sep}`) && aliasPath !== canonicalSource)
          || !(await fs.lstat(aliasPath)).isFile() || !Number.isSafeInteger(alias.candidate) || alias.candidate < 1
          || !/^[a-f0-9]{64}$/.test(alias.sha256)) throw new AppError(500, "Origem de preparação inválida.", "INVALID_EVIDENCE_SOURCE");
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(aliasPath)) hash.update(chunk);
        if (hash.digest("hex") !== alias.sha256 || (image && image.sha256 !== alias.sha256)) {
          throw new AppError(500, "A preparação mudou após o reconhecimento.", "EVIDENCE_IMAGE_CHANGED");
        }
        preparedInputs.push({ candidate: alias.candidate, sha256: alias.sha256, image: image?.filename ?? null });
      }
      candidates.push({ page: candidate.page, candidate: candidate.candidate, candidateIds: candidate.candidateIds ?? [candidate.candidate],
        engineRuns: 1, sourceReference: false, preparedInputs, selected: candidate.selected, reason: candidate.reason,
        xml: { filename: xmlFilename, sha256: digest(candidate.xml) }, image, validation: candidate.validation,
        sourceMapping: { page: candidate.page, coordinates: null } });
    }
    // Keep the native engine outputs as well as normalized candidates; never follow symlinks.
    const artifacts: Array<{ filename: string; sha256: string; stage: string }> = [];
    const omittedArtifacts: Array<{ reason: string; sizeBytes: number }> = [];
    let nativeBytes = 0;
    const captureOutputs = async (directoryPath: string): Promise<void> => {
      for (const entry of await fs.readdir(directoryPath, { withFileTypes: true })) {
        const outputPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) await captureOutputs(outputPath);
        else if (entry.isFile() && /\.(mxl|omr|xml|musicxml|log)$/i.test(entry.name)) {
          const size = (await fs.stat(outputPath)).size;
          if (size > 128 * 1024 * 1024 || nativeBytes + size > 512 * 1024 * 1024) {
            omittedArtifacts.push({ reason: "native-artifact-storage-limit", sizeBytes: size });
            continue;
          }
          const filename = `artifact-${artifacts.length + 1}${path.extname(entry.name).toLowerCase()}`;
          artifacts.push({ filename, sha256: await copyWithHash(outputPath, filename), stage: "native-engine-output" });
          nativeBytes += size;
        }
      }
    };
    await captureOutputs(canonicalWorkDir);
    const visualAssets = [];
    let visualBytes = 0;
    for (const asset of input.visualAssets ?? []) {
      if (!/^visual-(page|crop|segment)-[1-9][0-9]*\.png$/.test(asset.name) || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
        throw new AppError(500, "Evidência visual inválida.", "INVALID_VISUAL_EVIDENCE");
      }
      const actualPath = await fs.realpath(asset.path);
      const stat = await fs.stat(actualPath);
      visualBytes += stat.size;
      if (!actualPath.startsWith(`${canonicalWorkDir}${path.sep}`) || !stat.isFile() || stat.size > 32 * 1024 * 1024 || visualBytes > 128 * 1024 * 1024) {
        throw new AppError(500, "Evidência visual fora dos limites.", "INVALID_VISUAL_EVIDENCE");
      }
      const actualSha = await copyWithHash(actualPath, asset.name);
      if (actualSha !== asset.sha256) throw new AppError(500, "A imagem visual mudou após a leitura.", "VISUAL_EVIDENCE_CHANGED");
      visualAssets.push({ filename: asset.name, sha256: actualSha });
    }
    const manifest = { version: 1, createdAt: new Date().toISOString(), revision: input.revision,
      originalSha256: digest(await fs.readFile(input.sourcePath)), outputSha256: digest(await this.readExport(storedFilename)),
      ...input.metadata, candidates, artifacts, visualAssets, omittedArtifacts, nativeArtifactsComplete: omittedArtifacts.length === 0 };
    await fs.writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600, flag: "wx" });
  }

  async readConversionEvidence(storedFilename: string): Promise<unknown> {
    try { return JSON.parse(await fs.readFile(path.join(this.evidenceDirectory(storedFilename), "manifest.json"), "utf8")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new AppError(404, "Evidências não registradas para esta versão.", "EVIDENCE_NOT_FOUND");
      throw error;
    }
  }

  resolveEvidenceAsset(storedFilename: string, asset: string): string {
    if (!evidenceAssetPattern.test(asset)) {
      throw new AppError(400, "Arquivo de evidência inválido.", "INVALID_EVIDENCE_ASSET");
    }
    return path.join(this.evidenceDirectory(storedFilename), asset);
  }

  async saveReviewDecisionEvidence(storedFilename: string, input: { parentFilename: string; revision: string; validation: MusicalValidation }): Promise<void> {
    const parentDirectory = this.evidenceDirectory(input.parentFilename);
    const directory = this.evidenceDirectory(storedFilename);
    const oldManifest = await this.readConversionEvidence(input.parentFilename) as Record<string, unknown>;
    const digest = (data: string) => createHash("sha256").update(data).digest("hex");
    if (oldManifest.outputSha256 !== digest(await this.readExport(input.parentFilename))) {
      throw new AppError(409, "A evidência da versão anterior mudou.", "REVIEW_EVIDENCE_CHANGED");
    }
    await fs.mkdir(directory, { mode: 0o700 });
    const linkImmutable = async (source: string, target: string): Promise<void> => {
      try { await fs.link(source, target); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
        await fs.copyFile(source, target, constants.COPYFILE_EXCL);
        await fs.chmod(target, 0o600);
      }
    };
    // Every asset is already immutable; sharing its inode avoids duplicating large native archives.
    for (const entry of await fs.readdir(parentDirectory, { withFileTypes: true })) {
      if (entry.isFile() && evidenceAssetPattern.test(entry.name)) {
        await linkImmutable(path.join(parentDirectory, entry.name), path.join(directory, entry.name));
      }
    }
    const number = input.validation.visualReview?.history.length ?? 1;
    const previousAsset = `review-version-${number}.musicxml`;
    await linkImmutable(this.resolveExportPath(input.parentFilename), path.join(directory, previousAsset));
    const xml = await this.readExport(storedFilename);
    const manifest = { ...oldManifest, revision: input.revision, createdAt: new Date().toISOString(),
      parentRevision: oldManifest.revision, parentExportFilename: input.parentFilename, previousVersionAsset: previousAsset,
      outputSha256: digest(xml), validation: input.validation,
      pipelineVersion: "source-visual-review-v1", accuracyVerified: false, trainingEligible: false,
      diagnosticCodes: [...new Set([...input.validation.issues.map((issue) => issue.code), ...(input.validation.visualReview?.diagnostics ?? []).map((item) => item.code)])] };
    await fs.writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600, flag: "wx" });
  }

  private evidenceDirectory(storedFilename: string): string {
    return this.resolveExportPath(storedFilename.replace(/\.[a-zA-Z0-9]+$/, ".evidence"));
  }

  resolveUploadPath(storedFilename: string): string {
    return this.safeJoin(this.baseUploadsDir, storedFilename);
  }

  resolveExportPath(storedFilename: string): string {
    return this.safeJoin(this.baseExportsDir, storedFilename);
  }

  private safeJoin(baseDir: string, filename: string): string {
    // Critical: only internal filenames generated by the server can become paths.
    if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(filename)) {
      throw new AppError(400, "Nome interno de arquivo inválido.", "INVALID_STORED_FILENAME");
    }
    const resolved = path.resolve(baseDir, filename);
    const base = path.resolve(baseDir);
    if (!resolved.startsWith(`${base}${path.sep}`)) {
      throw new AppError(400, "Caminho de arquivo inválido.", "PATH_TRAVERSAL_BLOCKED");
    }
    return resolved;
  }
}
