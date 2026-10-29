import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, type Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { OmrResult } from "./OmrAdapter.js";

/**
 * Durable, private page checkpoints for the OMR pipeline.
 *
 * A checkpoint generation is immutable.  Writers only ever publish a fresh
 * generation with an atomic rename, so a late/stale worker cannot replace a
 * healthy generation accepted by another worker.  Readers validate every
 * digest before exposing a result and silently leave corrupt generations
 * unused; the next healthy page conversion can then publish a replacement.
 */

const checkpointFormatVersion = 1;
const checkpointRootName = ".omr-page-checkpoints-v1";
const maxArtifactBytes = 128 * 1024 * 1024;
const maxGenerationBytes = 256 * 1024 * 1024;
const maxCheckpointBytes = 512 * 1024 * 1024;
const maxGenerationsPerPage = 3;
const maxManifestBytes = 2 * 1024 * 1024;
const maxArtifactCount = 4_000;

export type ConversionCheckpointIdentity = {
  /** Values that apply to every page in this conversion. */
  global: Record<string, unknown>;
  /** Values that distinguish this page's prepared inputs and decision. */
  page: Record<string, unknown>;
};

export type ConversionCheckpointRestoreInput = {
  page: number;
  identity: ConversionCheckpointIdentity;
  workDir: string;
  pageOutputDir: string;
};

export type ConversionCheckpointPublishInput = ConversionCheckpointRestoreInput & {
  sourcePath: string;
  result: OmrResult;
  /** Called after staging is durable and immediately before its atomic publication. */
  beforeCommit?: () => Promise<void>;
};

export type ConversionCheckpointPublishResult = {
  status: "published" | "existing" | "skipped";
};

type ArtifactTarget =
  | { kind: "output"; relativePath: string }
  | { kind: "hydrated"; relativePath: string };

type StoredArtifact = {
  id: string;
  file: string;
  sha256: string;
  bytes: number;
  target: ArtifactTarget;
};

type StoredManifest = {
  version: typeof checkpointFormatVersion;
  createdAt: string;
  page: number;
  identity: { globalDigest: string; pageDigest: string };
  result: OmrResult;
  /** Separate payload digest catches a syntactically valid, mutated result. */
  resultDigest: string;
  /** Canonical envelope digest covers identity, artifact targets, and result metadata. */
  manifestDigest: string;
  artifacts: StoredArtifact[];
  bytes: number;
};

type Generation = {
  directory: string;
  name: string;
  manifest: StoredManifest;
};

type StagedArtifact = StoredArtifact & { sourcePath: string };

class CheckpointTooLargeError extends Error {
  constructor() {
    super("Checkpoint exceeds its bounded private storage budget.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isSafeRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 1_024 || path.isAbsolute(value)) return false;
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  return normalized === value.replaceAll("\\", "/") && !normalized.split("/").some((part) => !part || part === "." || part === "..");
}

function safeJoin(root: string, relative: string): string {
  if (!isSafeRelativePath(relative)) throw new Error("Unsafe checkpoint-relative path.");
  const output = path.resolve(root, relative);
  if (!output.startsWith(`${root}${path.sep}`)) throw new Error("Checkpoint path escapes its root.");
  return output;
}

function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(filePath: string): Promise<string> {
  return sha256(await fs.readFile(filePath));
}

function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Checkpoint identity contains a non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item === undefined ? null : item)).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  throw new Error("Checkpoint identity contains a non-serializable value.");
}

export function conversionCheckpointDigest(value: unknown): string {
  return sha256(stableJson(value));
}

function artifactReference(id: string): string {
  return `checkpoint-artifact:${id}`;
}

function artifactIdFromReference(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^checkpoint-artifact:(f-[0-9]{6})$/.exec(value);
  return match?.[1] ?? null;
}

function cloneResult(result: OmrResult): OmrResult {
  // OMR results are JSON evidence objects. Round-tripping also prevents later
  // mutations in the active conversion from changing a staged manifest.
  return JSON.parse(JSON.stringify(result)) as OmrResult;
}

function resultEvidence(result: OmrResult): Array<Record<string, unknown>> {
  if (result.evidence === undefined) return [];
  if (!Array.isArray(result.evidence)) throw new Error("Checkpoint result has invalid evidence.");
  return result.evidence.map((candidate) => {
    if (!isRecord(candidate)) throw new Error("Checkpoint result has invalid candidate evidence.");
    return candidate;
  });
}

function assertStoredResultPaths(result: OmrResult, artifacts: Map<string, StoredArtifact>): void {
  if (!isRecord(result) || typeof result.musicXml !== "string" || !Array.isArray(result.warnings)) {
    throw new Error("Checkpoint result is malformed.");
  }
  const assertReference = (value: unknown): void => {
    const id = artifactIdFromReference(value);
    if (!id || !artifacts.has(id)) throw new Error("Checkpoint evidence references an invalid artifact.");
  };
  for (const evidence of resultEvidence(result)) {
    for (const field of ["sourceImagePath", "originalImagePath", "nativeArchivePath"] as const) {
      if (evidence[field] !== undefined) assertReference(evidence[field]);
    }
    if (evidence.sourceImagePaths !== undefined) {
      if (!Array.isArray(evidence.sourceImagePaths)) throw new Error("Checkpoint prepared-image aliases are malformed.");
      for (const alias of evidence.sourceImagePaths) {
        if (!isRecord(alias)) throw new Error("Checkpoint prepared-image alias is malformed.");
        assertReference(alias.path);
      }
    }
  }
}

function replaceEvidencePaths(result: OmrResult, mapper: (value: string) => string): OmrResult {
  const copy = cloneResult(result);
  for (const evidence of resultEvidence(copy)) {
    for (const field of ["sourceImagePath", "originalImagePath", "nativeArchivePath"] as const) {
      if (typeof evidence[field] === "string") evidence[field] = mapper(evidence[field]);
    }
    if (Array.isArray(evidence.sourceImagePaths)) {
      for (const alias of evidence.sourceImagePaths) {
        if (isRecord(alias) && typeof alias.path === "string") alias.path = mapper(alias.path);
      }
    }
  }
  return copy;
}

function pageDirectoryName(page: number): string {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) throw new Error("Invalid checkpoint page number.");
  return `page-${String(page).padStart(3, "0")}`;
}

function isGenerationName(value: string): boolean {
  return /^[a-f0-9-]{36}$/.test(value);
}

function validArtifact(value: unknown): value is StoredArtifact {
  if (!isRecord(value) || typeof value.id !== "string" || !/^f-[0-9]{6}$/.test(value.id)
    || typeof value.file !== "string" || !/^files\/f-[0-9]{6}\.bin$/.test(value.file)
    || !isSha256(value.sha256) || typeof value.bytes !== "number" || !Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.bytes > maxArtifactBytes
    || !isRecord(value.target) || !isSafeRelativePath(value.target.relativePath)) return false;
  return (value.target.kind === "output" || value.target.kind === "hydrated");
}

function validManifest(value: unknown, page: number, identity: { globalDigest: string; pageDigest: string }): value is StoredManifest {
  if (!isRecord(value) || value.version !== checkpointFormatVersion || value.page !== page
    || typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt))
    || !isRecord(value.identity) || value.identity.globalDigest !== identity.globalDigest || value.identity.pageDigest !== identity.pageDigest
    || !Array.isArray(value.artifacts) || value.artifacts.length > maxArtifactCount
    || !isSha256(value.resultDigest) || !isSha256(value.manifestDigest) || typeof value.bytes !== "number" || !Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.bytes > maxGenerationBytes
    || !isRecord(value.result)) return false;
  const artifacts = value.artifacts;
  if (!artifacts.every(validArtifact) || new Set(artifacts.map((artifact) => artifact.id)).size !== artifacts.length) return false;
  try {
    assertStoredResultPaths(value.result as OmrResult, new Map(artifacts.map((artifact) => [artifact.id, artifact])));
    if (conversionCheckpointDigest(value.result) !== value.resultDigest) return false;
    if (manifestEnvelopeDigest(value as StoredManifest) !== value.manifestDigest) return false;
  }
  catch { return false; }
  return true;
}

function manifestEnvelopeDigest(manifest: Omit<StoredManifest, "manifestDigest"> | StoredManifest): string {
  const { manifestDigest: _manifestDigest, ...envelope } = manifest as StoredManifest;
  return conversionCheckpointDigest(envelope);
}

/**
 * Stores page results without retaining unsafe work-directory paths. The
 * manifest contains only artifact references; hydration creates fresh paths
 * inside the current work directory before downstream evidence consumers run.
 */
export class ConversionCheckpointStore {
  constructor(private readonly directory: string) {}

  async restore(input: ConversionCheckpointRestoreInput): Promise<OmrResult | null> {
    const state = await this.ensureRoot();
    const identity = this.identityDigests(input.identity);
    // A supplied page-output path is outside the immutable checkpoint data.
    // Treat an unsafe target as a cache miss so restore can never write beyond
    // its active work tree.
    const workPaths = await this.safeWorkPaths(input.workDir, input.pageOutputDir).catch(() => null);
    if (!workPaths) return null;
    const generations = await this.matchingGenerations(state.root, input.page, identity);
    for (const generation of generations) {
      try {
        const hydrated = await this.hydrateGeneration(generation, workPaths.workDir, workPaths.pageOutputDir);
        return hydrated;
      } catch {
        // A generation is immutable, so a failed validation/hydration cannot
        // poison the next attempt. Ignore it and let the caller recompute.
      }
    }
    return null;
  }

  async publish(input: ConversionCheckpointPublishInput): Promise<ConversionCheckpointPublishResult> {
    let stage: string | null = null;
    try {
      const state = await this.ensureRoot();
      const identity = this.identityDigests(input.identity);
      const workPaths = await this.safeWorkPaths(input.workDir, input.pageOutputDir);
      const workDir = workPaths.workDir;
      const pageOutputDir = workPaths.pageOutputDir;
      const existing = await this.matchingGenerations(state.root, input.page, identity);
      if (existing.length) return { status: "existing" };

      const sourcePath = await fs.realpath(input.sourcePath);
      const sourceStats = await fs.lstat(sourcePath);
      if (!sourceStats.isFile() || sourceStats.isSymbolicLink()) throw new Error("Checkpoint source is not a regular file.");

      const pageDirectory = await this.privateChildDirectory(state.pagesDirectory, pageDirectoryName(input.page));
      const generation = randomUUID();
      stage = await this.privateChildDirectory(state.stagingDirectory, generation);
      await this.privateChildDirectory(stage, "files");

      const artifacts: StagedArtifact[] = [];
      const byPath = new Map<string, StagedArtifact>();
      let bytes = 0;
      const addArtifact = async (candidate: string, target: ArtifactTarget): Promise<StagedArtifact> => {
        const resolved = await fs.realpath(candidate);
        const details = await fs.lstat(resolved);
        if (!details.isFile() || details.isSymbolicLink() || (!isInside(workDir, resolved) && resolved !== sourcePath)) {
          throw new Error("Checkpoint artifact is outside the active conversion.");
        }
        const duplicate = byPath.get(resolved);
        if (duplicate) return duplicate;
        if (details.size > maxArtifactBytes || bytes + details.size > maxGenerationBytes || artifacts.length >= maxArtifactCount) {
          throw new CheckpointTooLargeError();
        }
        const id = `f-${String(artifacts.length + 1).padStart(6, "0")}`;
        const file = `files/${id}.bin`;
        const targetPath = safeJoin(stage!, file);
        await fs.copyFile(resolved, targetPath, fsConstants.COPYFILE_EXCL);
        await fs.chmod(targetPath, 0o600);
        const copiedDetails = await fs.lstat(targetPath);
        if (!copiedDetails.isFile() || copiedDetails.isSymbolicLink() || copiedDetails.size !== details.size) throw new Error("Checkpoint artifact changed during copy.");
        const copiedSha256 = await sha256File(targetPath);
        if (await sha256File(resolved) !== copiedSha256) throw new Error("Checkpoint artifact changed during copy.");
        await this.syncFile(targetPath);
        const artifact: StagedArtifact = { id, file, sha256: copiedSha256, bytes: copiedDetails.size, target, sourcePath: resolved };
        artifacts.push(artifact);
        byPath.set(resolved, artifact);
        bytes += artifact.bytes;
        return artifact;
      };

      const canonicalOutput = await fs.realpath(pageOutputDir).catch(() => null);
      if (canonicalOutput && !isInside(workDir, canonicalOutput)) throw new Error("Checkpoint page output escapes the active work directory.");
      if (canonicalOutput) {
        const walkOutput = async (directory: string, relativeDirectory = ""): Promise<void> => {
          const entries = await fs.readdir(directory, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.name || entry.name === "." || entry.name === ".." || entry.name.includes("/") || entry.name.includes("\\")) {
              throw new Error("Unsafe native output entry.");
            }
            const fullPath = path.join(directory, entry.name);
            const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
            if (entry.isDirectory()) await walkOutput(fullPath, relativePath);
            else if (entry.isFile()) await addArtifact(fullPath, { kind: "output", relativePath });
            else throw new Error("Unsupported native output entry.");
          }
        };
        await walkOutput(canonicalOutput);
      }

      const stagedResult = replaceEvidencePaths(input.result, (value) => value);
      const resultPaths = new Map<string, StagedArtifact>();
      const addEvidenceArtifact = async (value: string): Promise<string> => {
        const existing = resultPaths.get(value);
        if (existing) return artifactReference(existing.id);
        const resolved = await fs.realpath(value);
        const outputRelative = canonicalOutput && isInside(canonicalOutput, resolved)
          ? path.relative(canonicalOutput, resolved).split(path.sep).join("/")
          : null;
        const nextId = `f-${String(artifacts.length + 1).padStart(6, "0")}`;
        const rawName = path.basename(resolved);
        const safeName = rawName && !rawName.includes("/") && !rawName.includes("\\") && rawName !== "." && rawName !== ".."
          ? rawName : "artifact.bin";
        const artifact = outputRelative && isSafeRelativePath(outputRelative)
          ? await addArtifact(resolved, { kind: "output", relativePath: outputRelative })
          : await addArtifact(resolved, { kind: "hydrated", relativePath: `.checkpoint-evidence/${nextId}/${safeName}` });
        resultPaths.set(value, artifact);
        return artifactReference(artifact.id);
      };
      const serializedResult = await this.serializeResultPaths(stagedResult, addEvidenceArtifact);
      const manifestBase: Omit<StoredManifest, "manifestDigest"> = {
        version: checkpointFormatVersion,
        createdAt: new Date().toISOString(),
        page: input.page,
        identity,
        result: serializedResult,
        resultDigest: conversionCheckpointDigest(serializedResult),
        artifacts: artifacts.map(({ sourcePath: _sourcePath, ...artifact }) => artifact),
        bytes
      };
      const manifest: StoredManifest = { ...manifestBase, manifestDigest: manifestEnvelopeDigest(manifestBase) };
      assertStoredResultPaths(manifest.result, new Map(manifest.artifacts.map((artifact) => [artifact.id, artifact])));
      const manifestPath = safeJoin(stage, "manifest.json");
      const manifestJson = JSON.stringify(manifest);
      if (Buffer.byteLength(manifestJson, "utf8") > maxManifestBytes) throw new CheckpointTooLargeError();
      await this.writePrivateFile(manifestPath, manifestJson);
      await this.writePrivateFile(safeJoin(stage, "manifest.sha256"), `${sha256(manifestJson)}\n`);
      await this.syncDirectory(stage);

      // The caller's fenced progress write happens after every artifact is
      // safely staged but before the generation becomes visible to readers.
      await input.beforeCommit?.();
      const destination = safeJoin(pageDirectory, generation);
      await fs.rename(stage, destination);
      stage = null;
      await this.syncDirectory(pageDirectory);
      await this.evict(state.root, destination);
      return { status: "published" };
    } catch (error) {
      if (error instanceof CheckpointTooLargeError) return { status: "skipped" };
      throw error;
    } finally {
      if (stage) await fs.rm(stage, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private identityDigests(identity: ConversionCheckpointIdentity): { globalDigest: string; pageDigest: string } {
    return { globalDigest: conversionCheckpointDigest(identity.global), pageDigest: conversionCheckpointDigest(identity.page) };
  }

  private async ensureRoot(): Promise<{ root: string; pagesDirectory: string; stagingDirectory: string }> {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const base = await fs.lstat(this.directory);
    if (!base.isDirectory() || base.isSymbolicLink()) throw new Error("Checkpoint directory is unsafe.");
    await fs.chmod(this.directory, 0o700);
    const baseDirectory = await fs.realpath(this.directory);
    const root = await this.privateChildDirectory(baseDirectory, checkpointRootName);
    const pagesDirectory = await this.privateChildDirectory(root, "pages");
    const stagingDirectory = await this.privateChildDirectory(root, "staging");
    await this.cleanupStaging(stagingDirectory);
    return { root, pagesDirectory, stagingDirectory };
  }

  /** Creates one direct child without ever traversing a symlinked cache node. */
  private async privateChildDirectory(parent: string, name: string): Promise<string> {
    const directory = safeJoin(parent, name);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const details = await fs.lstat(directory);
    if (!details.isDirectory() || details.isSymbolicLink()) throw new Error("Checkpoint directory is unsafe.");
    const canonical = await fs.realpath(directory);
    if (canonical !== directory || !isInside(parent, canonical)) throw new Error("Checkpoint directory escapes its private root.");
    await fs.chmod(directory, 0o700);
    return directory;
  }

  /** Resolves an existing direct child only after rejecting symlinks. */
  private async existingPrivateChildDirectory(parent: string, name: string): Promise<string | null> {
    const directory = safeJoin(parent, name);
    let details: Awaited<ReturnType<typeof fs.lstat>>;
    try { details = await fs.lstat(directory); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    if (!details.isDirectory() || details.isSymbolicLink()) throw new Error("Checkpoint directory is unsafe.");
    const canonical = await fs.realpath(directory);
    if (canonical !== directory || !isInside(parent, canonical)) throw new Error("Checkpoint directory escapes its private root.");
    return directory;
  }

  private async safeWorkPaths(workDir: string, pageOutputDir: string): Promise<{ workDir: string; pageOutputDir: string }> {
    const lexicalWorkDir = path.resolve(workDir);
    const lexicalOutputDir = path.resolve(pageOutputDir);
    const outputRelative = path.relative(lexicalWorkDir, lexicalOutputDir);
    if (!outputRelative || path.isAbsolute(outputRelative) || outputRelative.split(path.sep).some((part) => part === "..")) {
      throw new Error("Checkpoint output is outside the work directory.");
    }
    const canonicalWorkDir = await fs.realpath(lexicalWorkDir);
    const details = await fs.lstat(canonicalWorkDir);
    if (!details.isDirectory() || details.isSymbolicLink()) throw new Error("Checkpoint work directory is unsafe.");
    const canonicalOutputDir = path.resolve(canonicalWorkDir, outputRelative);
    if (!isInside(canonicalWorkDir, canonicalOutputDir)) throw new Error("Checkpoint output is outside the work directory.");
    await this.assertSafeOutputAncestors(canonicalWorkDir, canonicalOutputDir);
    return { workDir: canonicalWorkDir, pageOutputDir: canonicalOutputDir };
  }

  /**
   * Reject every existing symlink beneath the canonical work directory.
   *
   * Recursive mkdir follows a pre-existing directory symlink. The output path
   * is caller-provided, so that would otherwise let a valid checkpoint hydrate
   * outside the conversion work directory. We validate from the canonical
   * work root so macOS' /var -> /private/var alias remains usable.
   */
  private async assertSafeOutputAncestors(workDir: string, outputDir: string): Promise<void> {
    const relative = path.relative(workDir, outputDir);
    if (!relative || path.isAbsolute(relative) || relative.split(path.sep).some((part) => !part || part === "." || part === "..")) {
      throw new Error("Checkpoint output is outside the work directory.");
    }
    let current = workDir;
    for (const part of relative.split(path.sep)) {
      current = path.join(current, part);
      let details: Awaited<ReturnType<typeof fs.lstat>>;
      try { details = await fs.lstat(current); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      if (!details.isDirectory() || details.isSymbolicLink()) {
        throw new Error("Checkpoint output has an unsafe ancestor.");
      }
      const canonical = await fs.realpath(current);
      if (canonical !== current || !isInside(workDir, canonical)) {
        throw new Error("Checkpoint output escapes the active work directory.");
      }
    }
  }

  /** Create parent directories one at a time, then validate them again. */
  private async createSafeOutputParents(workDir: string, outputDir: string): Promise<void> {
    const relative = path.relative(workDir, outputDir);
    const parts = relative.split(path.sep);
    let current = workDir;
    for (const part of parts.slice(0, -1)) {
      current = path.join(current, part);
      try {
        await fs.mkdir(current, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      const details = await fs.lstat(current);
      if (!details.isDirectory() || details.isSymbolicLink() || await fs.realpath(current) !== current || !isInside(workDir, current)) {
        throw new Error("Checkpoint output has an unsafe ancestor.");
      }
      await fs.chmod(current, 0o700).catch(() => undefined);
    }
    await this.assertSafeOutputAncestors(workDir, outputDir);
  }

  private async matchingGenerations(root: string, page: number, identity: { globalDigest: string; pageDigest: string }): Promise<Generation[]> {
    const pagesDirectory = await this.existingPrivateChildDirectory(root, "pages");
    if (!pagesDirectory) return [];
    const pageDirectory = await this.existingPrivateChildDirectory(pagesDirectory, pageDirectoryName(page));
    if (!pageDirectory) return [];
    let entries: Dirent<string>[];
    try { entries = await fs.readdir(pageDirectory, { withFileTypes: true }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const generations: Generation[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !isGenerationName(entry.name)) continue;
      const directory = safeJoin(pageDirectory, entry.name);
      const generation = await this.readGeneration(directory, entry.name, page, identity);
      if (generation) generations.push(generation);
    }
    return generations.sort((left, right) => left.manifest.createdAt.localeCompare(right.manifest.createdAt) || left.name.localeCompare(right.name));
  }

  private async readGeneration(directory: string, name: string, page: number, identity: { globalDigest: string; pageDigest: string }): Promise<Generation | null> {
    try {
      const details = await fs.lstat(directory);
      if (!details.isDirectory() || details.isSymbolicLink()) return null;
      if (await fs.realpath(directory) !== directory) return null;
      const filesDirectory = await this.existingPrivateChildDirectory(directory, "files");
      if (!filesDirectory) return null;
      const manifestPath = safeJoin(directory, "manifest.json");
      const manifestDetails = await fs.lstat(manifestPath);
      if (!manifestDetails.isFile() || manifestDetails.isSymbolicLink() || manifestDetails.size > maxManifestBytes) return null;
      const checksumPath = safeJoin(directory, "manifest.sha256");
      const checksumDetails = await fs.lstat(checksumPath);
      if (!checksumDetails.isFile() || checksumDetails.isSymbolicLink() || checksumDetails.size !== 65) return null;
      const manifestJson = await fs.readFile(manifestPath, "utf8");
      if ((await fs.readFile(checksumPath, "utf8")).trim() !== sha256(manifestJson)) return null;
      const parsed: unknown = JSON.parse(manifestJson);
      if (!validManifest(parsed, page, identity)) return null;
      const manifest = parsed;
      let total = 0;
      for (const artifact of manifest.artifacts) {
        const artifactPath = safeJoin(filesDirectory, `${artifact.id}.bin`);
        const artifactDetails = await fs.lstat(artifactPath);
        if (!artifactDetails.isFile() || artifactDetails.isSymbolicLink() || artifactDetails.size !== artifact.bytes || await sha256File(artifactPath) !== artifact.sha256) return null;
        total += artifact.bytes;
      }
      if (total !== manifest.bytes || total > maxGenerationBytes) return null;
      return { directory, name, manifest };
    } catch { return null; }
  }

  private async hydrateGeneration(generation: Generation, workDir: string, pageOutputDir: string): Promise<OmrResult> {
    const artifactPaths = new Map<string, string>();
    const outputDir = path.resolve(pageOutputDir);
    if (!isInside(workDir, outputDir)) throw new Error("Checkpoint hydration output escapes its work directory.");
    const filesDirectory = await this.existingPrivateChildDirectory(generation.directory, "files");
    if (!filesDirectory) throw new Error("Checkpoint artifact directory is missing.");
    try {
      await fs.lstat(outputDir);
      throw new Error("Checkpoint hydration target already exists.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const stage = safeJoin(workDir, `.omr-checkpoint-hydration-${randomUUID()}`);
    try {
      await this.createSafeOutputParents(workDir, outputDir);
      await fs.mkdir(stage, { mode: 0o700 });
      for (const artifact of generation.manifest.artifacts) {
        const source = safeJoin(filesDirectory, `${artifact.id}.bin`);
        const target = safeJoin(stage, artifact.target.relativePath);
        await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        await fs.copyFile(source, target, fsConstants.COPYFILE_EXCL);
        await fs.chmod(target, 0o600);
        const copied = await fs.lstat(target);
        if (!copied.isFile() || copied.isSymbolicLink() || copied.size !== artifact.bytes || await sha256File(target) !== artifact.sha256) {
          throw new Error("Checkpoint hydration digest mismatch.");
        }
        await this.syncFile(target);
        artifactPaths.set(artifact.id, safeJoin(outputDir, artifact.target.relativePath));
      }
      await this.syncDirectory(stage);
      // Check once more immediately before exposing the staged result. This
      // closes the normal check/create window for a stale or hostile worker.
      await this.assertSafeOutputAncestors(workDir, outputDir);
      try {
        await fs.lstat(outputDir);
        throw new Error("Checkpoint hydration target already exists.");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await fs.rename(stage, outputDir);
      return replaceEvidencePaths(generation.manifest.result, (value) => {
        const id = artifactIdFromReference(value);
        const replacement = id ? artifactPaths.get(id) : undefined;
        if (!replacement) throw new Error("Checkpoint hydration references a missing artifact.");
        return replacement;
      });
    } finally {
      await fs.rm(stage, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async serializeResultPaths(result: OmrResult, capture: (path: string) => Promise<string>): Promise<OmrResult> {
    const copy = cloneResult(result);
    for (const evidence of resultEvidence(copy)) {
      for (const field of ["sourceImagePath", "originalImagePath", "nativeArchivePath"] as const) {
        if (evidence[field] !== undefined) {
          if (typeof evidence[field] !== "string") throw new Error("Checkpoint evidence path is malformed.");
          evidence[field] = await capture(evidence[field]);
        }
      }
      if (evidence.sourceImagePaths !== undefined) {
        if (!Array.isArray(evidence.sourceImagePaths)) throw new Error("Checkpoint prepared-image aliases are malformed.");
        for (const alias of evidence.sourceImagePaths) {
          if (!isRecord(alias) || typeof alias.path !== "string") throw new Error("Checkpoint prepared-image alias is malformed.");
          alias.path = await capture(alias.path);
        }
      }
    }
    return copy;
  }

  private async writePrivateFile(filePath: string, content: string): Promise<void> {
    const handle = await fs.open(filePath, "wx", 0o600);
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally { await handle.close(); }
  }

  private async syncFile(filePath: string): Promise<void> {
    const handle = await fs.open(filePath, fsConstants.O_RDONLY);
    try { await handle.sync(); } finally { await handle.close(); }
  }

  private async syncDirectory(directory: string): Promise<void> {
    // Directory fsync is unavailable on some supported filesystems. The
    // immutable generation + digest validation still keeps a torn write from
    // being reused when that happens.
    try {
      const handle = await fs.open(directory, fsConstants.O_RDONLY);
      try { await handle.sync(); } finally { await handle.close(); }
    } catch { /* Best effort only. */ }
  }

  /** Remove only abandoned, UUID-named staging generations after six hours. */
  private async cleanupStaging(stagingDirectory: string): Promise<void> {
    let entries: Dirent<string>[];
    try { entries = await fs.readdir(stagingDirectory, { withFileTypes: true }); }
    catch { return; }
    const staleBefore = Date.now() - 6 * 60 * 60 * 1000;
    for (const entry of entries) {
      if (!entry.isDirectory() || !isGenerationName(entry.name)) continue;
      let directory: string | null = null;
      try {
        directory = await this.existingPrivateChildDirectory(stagingDirectory, entry.name);
        if (!directory) continue;
        const details = await fs.lstat(directory);
        if (details.mtimeMs >= staleBefore) continue;
        await fs.rm(directory, { recursive: true, force: true });
      } catch {
        // A malformed or concurrently removed staging entry is never followed
        // or deleted through a symlink. A later sweep can reconsider it.
      }
    }
  }

  private async directoryFootprint(directory: string): Promise<number> {
    let total = 0;
    const visit = async (current: string): Promise<void> => {
      const entries = await fs.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.name || entry.name.includes("/") || entry.name.includes("\\")) throw new Error("Unsafe checkpoint entry.");
        const target = path.join(current, entry.name);
        const details = await fs.lstat(target);
        if (details.isSymbolicLink()) continue;
        if (details.isDirectory()) await visit(target);
        else if (details.isFile()) total += details.size;
        else total += maxGenerationBytes;
        if (total > maxCheckpointBytes + maxGenerationBytes) return;
      }
    };
    await visit(directory);
    return total;
  }

  private async evict(root: string, protectedGeneration: string): Promise<void> {
    const pagesDirectory = await this.existingPrivateChildDirectory(root, "pages");
    if (!pagesDirectory) return;
    let pageEntries: Dirent<string>[];
    try { pageEntries = await fs.readdir(pagesDirectory, { withFileTypes: true }); }
    catch { return; }
    const generations: Array<{ directory: string; pageDirectory: string; createdAt: string; bytes: number }> = [];
    for (const pageEntry of pageEntries) {
      if (!pageEntry.isDirectory() || !/^page-[0-9]{3,5}$/.test(pageEntry.name)) continue;
      let pageDirectory: string | null;
      try { pageDirectory = await this.existingPrivateChildDirectory(pagesDirectory, pageEntry.name); }
      catch { continue; }
      if (!pageDirectory) continue;
      let entries: Dirent<string>[];
      try { entries = await fs.readdir(pageDirectory, { withFileTypes: true }); }
      catch { continue; }
      for (const entry of entries) {
        if (!entry.isDirectory() || !isGenerationName(entry.name)) continue;
        let directory: string | null;
        try {
          directory = await this.existingPrivateChildDirectory(pageDirectory, entry.name);
          if (!directory) continue;
          const directoryDetails = await fs.lstat(directory);
          const footprint = await this.directoryFootprint(directory);
          let createdAt = new Date(directoryDetails.mtimeMs).toISOString();
          try {
            const manifestPath = safeJoin(directory, "manifest.json");
            const details = await fs.lstat(manifestPath);
            if (details.isFile() && !details.isSymbolicLink() && details.size <= maxManifestBytes) {
              const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown;
              if (isRecord(manifest) && typeof manifest.createdAt === "string" && !Number.isNaN(Date.parse(manifest.createdAt))) createdAt = manifest.createdAt;
            }
          } catch { /* The physical footprint still counts below. */ }
          // Count physical directory bytes even when the manifest is malformed,
          // so corruption cannot bypass this private-store budget.
          generations.push({ directory, pageDirectory, createdAt, bytes: footprint });
        } catch { /* Unsafe/corrupt entries are never traversed through links. */ }
      }
    }
    let total = generations.reduce((sum, generation) => sum + generation.bytes, 0);
    const byPage = new Map<string, number>();
    for (const generation of generations) byPage.set(generation.pageDirectory, (byPage.get(generation.pageDirectory) ?? 0) + 1);
    const oldestFirst = [...generations].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.directory.localeCompare(right.directory));
    for (const generation of oldestFirst) {
      if (generation.directory === protectedGeneration) continue;
      if ((byPage.get(generation.pageDirectory) ?? 0) <= maxGenerationsPerPage && total <= maxCheckpointBytes) continue;
      // Generation paths are canonical direct children of a validated private
      // directory; deleting one cannot reach user uploads or exports.
      await fs.rm(generation.directory, { recursive: true, force: true }).catch(() => undefined);
      byPage.set(generation.pageDirectory, (byPage.get(generation.pageDirectory) ?? 1) - 1);
      total -= generation.bytes;
    }
  }
}
