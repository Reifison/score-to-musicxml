import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../config/env.js";
import type { ScoreType } from "../domain.js";
import { FileStorageService } from "../services/FileStorageService.js";
import { inspectMusicXmlValidation } from "../services/MusicXmlValidation.js";
import {
  AudiverisOmrAdapter,
  type OmrPageProgress,
  type OmrResult,
  type PreparedInputInspection
} from "../services/OmrAdapter.js";
import { withConversionSignal } from "../services/SubprocessRunner.js";

type Fixture = {
  root: string;
  sourcePath: string;
  checkpointDirectory: string;
  runtimePath: string;
  runtimeSiblingPath: string;
};

type AdapterInternals = {
  resolveAudiverisBin(): Promise<string>;
  convertPreparedPage(
    page: PreparedInputInspection["pages"][number],
    originalFilename: string,
    pageOutputDir: string,
    pageNumber: number,
    scoreType: ScoreType
  ): Promise<OmrResult>;
};

type RecognitionHook = (pageNumber: number) => Promise<void> | void;

const sha256 = (content: Buffer | string): string => createHash("sha256").update(content).digest("hex");

async function makeFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "omr-checkpoint-flow-"));
  const sourcePath = path.join(root, "original-score.pdf");
  const checkpointDirectory = path.join(root, "durable-checkpoints");
  const runtimeDirectory = path.join(root, "runtime-bin");
  const runtimePath = path.join(runtimeDirectory, "runtime-wrapper");
  const runtimeSiblingPath = path.join(runtimeDirectory, "unrelated-runtime-data.bin");
  await fs.mkdir(runtimeDirectory, { recursive: true, mode: 0o700 });
  await fs.writeFile(sourcePath, "source score bytes v1");
  await fs.writeFile(runtimePath, "fake Audiveris executable v1");
  await fs.chmod(runtimePath, 0o700);
  await fs.writeFile(runtimeSiblingPath, Buffer.alloc(2 * 1024 * 1024, 0x31));
  return { root, sourcePath, checkpointDirectory, runtimePath, runtimeSiblingPath };
}

function pageMusicXml(pageNumber: number): string {
  const step = pageNumber === 1 ? "C" : "D";
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
  </measure></part>
</score-partwise>`;
}

function makeAdapter(fixture: Fixture, pageCount: number, calls: number[], beforeRecognition?: RecognitionHook): AudiverisOmrAdapter {
  const adapter = new AudiverisOmrAdapter();
  vi.spyOn(adapter, "inspectPages").mockImplementation(async (sourcePath, outputDir) => {
    const sourceSHA256 = sha256(await fs.readFile(sourcePath));
    const pages: PreparedInputInspection["pages"] = [];
    for (let index = 1; index <= pageCount; index += 1) {
      const imagePath = path.join(outputDir, `prepared-page-${String(index).padStart(3, "0")}.png`);
      const imageBytes = `prepared source image for page ${index}`;
      await fs.writeFile(imagePath, imageBytes, { mode: 0o600 });
      pages.push({
        page: index,
        attempts: [{ paths: [imagePath], description: "synthetic prepared source" }],
        originalPath: imagePath,
        originalImagePath: imagePath,
        originalImageSHA256: sha256(imageBytes),
        contentRole: "musical",
        classification: { method: "staff_evidence_v1", evidence: ["synthetic musical page"] }
      });
    }
    return { sourcePath, outputDir, sourceSHA256, warnings: [], pages };
  });

  const internals = adapter as unknown as AdapterInternals;
  // The fake file is fingerprinted as the executable, while the normal
  // runtime/module fingerprinting code remains active.
  internals.resolveAudiverisBin = async () => fixture.runtimePath;
  internals.convertPreparedPage = async (page, _filename, pageOutputDir, pageNumber, _scoreType) => {
    calls.push(pageNumber);
    await beforeRecognition?.(pageNumber);
    const musicXml = pageMusicXml(pageNumber);
    const preparedImagePath = page.attempts[0].paths[0];
    const nativeArchivePath = path.join(pageOutputDir, `native-page-${pageNumber}.omr`);
    await fs.writeFile(nativeArchivePath, `native output bytes for page ${pageNumber}`, { mode: 0o600 });
    return {
      musicXml,
      warnings: [],
      evidence: [{
        page: pageNumber,
        candidate: 1,
        selected: true,
        reason: "synthetic integration candidate",
        xml: musicXml,
        sourceImagePath: preparedImagePath,
        originalImagePath: page.originalImagePath,
        nativeArchivePath,
        sourceImagePaths: [{ candidate: 1, path: preparedImagePath, sha256: sha256(await fs.readFile(preparedImagePath)) }],
        validation: inspectMusicXmlValidation(musicXml)
      }]
    };
  };
  return adapter;
}

async function runConversion(
  adapter: AudiverisOmrAdapter,
  fixture: Fixture,
  workDir: string,
  options: Parameters<AudiverisOmrAdapter["convert"]>[3] = {}
): Promise<OmrResult> {
  await fs.mkdir(workDir, { recursive: true, mode: 0o700 });
  return adapter.convert(fixture.sourcePath, "synthetic-score.pdf", workDir, {
    checkpointDirectory: fixture.checkpointDirectory,
    ...options
  });
}

async function cachedGenerationCount(fixture: Fixture, pageNumber: number): Promise<number> {
  const directory = path.join(fixture.checkpointDirectory, ".omr-page-checkpoints-v1", "pages", `page-${String(pageNumber).padStart(3, "0")}`);
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).length;
}

afterEach(() => vi.restoreAllMocks());

describe("Audiveris checkpoint flow", () => {
  it("resumes completed pages in a fresh work directory, retries a failed page, and carries evidence forward", async () => {
    const fixture = await makeFixture();
    const calls: number[] = [];
    const firstWorkDir = path.join(fixture.root, "attempt-1");
    const abortController = new AbortController();
    const abortReason = new Error("stop before recognizing page 2");
    const firstProgress: OmrPageProgress[] = [];
    try {
      const firstAdapter = makeAdapter(fixture, 2, calls);
      await expect(withConversionSignal(abortController.signal, () => runConversion(firstAdapter, fixture, firstWorkDir, {
        signal: abortController.signal,
        onProgress: async (snapshot) => {
          firstProgress.push(snapshot);
          if (snapshot.stage === "recognizing" && snapshot.currentPage === 2) abortController.abort(abortReason);
        }
      }))).rejects.toBe(abortReason);

      expect(calls).toEqual([1]);
      expect(firstProgress[0]).toMatchObject({ stage: "preparing", totalPages: null, currentPage: null });
      expect(firstProgress).toContainEqual(expect.objectContaining({ stage: "preparing", totalPages: 2, currentPage: null }));
      expect(firstProgress).toContainEqual(expect.objectContaining({ stage: "recognizing", totalPages: 2, currentPage: 1 }));
      expect(firstProgress).toContainEqual(expect.objectContaining({ stage: "recognizing", totalPages: 2, currentPage: null, completedPages: [1] }));
      expect(firstProgress).not.toContainEqual(expect.objectContaining({ currentPage: null, completedPages: [1, 2] }));
      expect(await cachedGenerationCount(fixture, 1)).toBe(1);
      expect(await cachedGenerationCount(fixture, 2)).toBe(0);

      await fs.rm(firstWorkDir, { recursive: true, force: true });

      const secondWorkDir = path.join(fixture.root, "attempt-2");
      const secondProgress: OmrPageProgress[] = [];
      const failingAdapter = makeAdapter(fixture, 2, calls, (pageNumber) => {
        if (pageNumber === 2) throw new Error("synthetic temporary page failure");
      });
      const partial = await runConversion(failingAdapter, fixture, secondWorkDir, {
        onProgress: async (snapshot) => { secondProgress.push(snapshot); }
      });
      expect(calls).toEqual([1, 2]);
      expect(partial.coverage).toMatchObject({ processedPages: [1], missingPages: [2] });
      expect(secondProgress).toContainEqual(expect.objectContaining({
        stage: "recognizing", totalPages: 2, currentPage: null, completedPages: [1], reusedPages: [1]
      }));
      expect(secondProgress.at(-1)).toMatchObject({ stage: "validating", currentPage: null });
      expect(await cachedGenerationCount(fixture, 2)).toBe(0);
      await fs.rm(secondWorkDir, { recursive: true, force: true });

      const finalWorkDir = path.join(fixture.root, "attempt-3");
      const finalProgress: OmrPageProgress[] = [];
      const finalAdapter = makeAdapter(fixture, 2, calls);
      const result = await runConversion(finalAdapter, fixture, finalWorkDir, {
        onProgress: async (snapshot) => { finalProgress.push(snapshot); }
      });

      expect(calls).toEqual([1, 2, 2]);
      expect(result.coverage).toMatchObject({ totalPages: 2, processedPages: [1, 2], missingPages: [], excludedPages: [] });
      expect(result.coverage?.pages.map((page) => [page.page, page.status])).toEqual([[1, "processed"], [2, "processed"]]);
      expect([...result.musicXml.matchAll(/<measure\b[^>]*number="([^"]+)"/g)].map((match) => match[1])).toEqual(["1", "2"]);
      expect(result.musicXml.indexOf("<step>C</step>")).toBeLessThan(result.musicXml.indexOf("<step>D</step>"));
      expect(finalProgress).toContainEqual(expect.objectContaining({ stage: "recognizing", currentPage: null, completedPages: [1], reusedPages: [1] }));
      expect(finalProgress.at(-1)).toMatchObject({ stage: "validating", totalPages: 2, currentPage: null });
      expect(finalProgress.every((snapshot) => snapshot.stage !== ("complete" as OmrPageProgress["stage"]))).toBe(true);

      const pageEvidence = result.evidence ?? [];
      expect(pageEvidence.map((item) => item.page)).toEqual([1, 2]);
      for (const evidence of pageEvidence) {
        expect(evidence.sourceImagePath).toContain(finalWorkDir);
        expect(evidence.originalImagePath).toContain(finalWorkDir);
        expect(evidence.nativeArchivePath).toContain(finalWorkDir);
        expect(evidence.sourceImagePaths?.[0].path).toContain(finalWorkDir);
        expect(await fs.readFile(evidence.sourceImagePath!, "utf8")).toBe(`prepared source image for page ${evidence.page}`);
        expect(await fs.readFile(evidence.nativeArchivePath!, "utf8")).toBe(`native output bytes for page ${evidence.page}`);
      }
      expect(pageEvidence[0].nativeArchivePath).toContain(path.join(finalWorkDir, "page-001"));
      expect(pageEvidence[1].nativeArchivePath).toContain(path.join(finalWorkDir, "page-002"));

      const storage = new FileStorageService(path.join(fixture.root, "uploads"), path.join(fixture.root, "exports"));
      const exportFilename = "score-012345678901.musicxml";
      await storage.saveExport(exportFilename, result.musicXml);
      await storage.saveConversionEvidence(exportFilename, {
        sourcePath: fixture.sourcePath,
        workDir: finalWorkDir,
        revision: "resume-integration-v1",
        metadata: {},
        candidates: pageEvidence.map((evidence) => ({
          page: evidence.page,
          candidate: evidence.candidate,
          candidateIds: evidence.candidateIds,
          selected: evidence.selected,
          exportValid: evidence.exportValid,
          reason: evidence.reason,
          xml: evidence.xml,
          sourceImagePath: evidence.sourceImagePath,
          sourceImagePaths: evidence.sourceImagePaths,
          validation: evidence.validation
        }))
      });
      const savedEvidence = await storage.readConversionEvidence(exportFilename) as {
        candidates: unknown[];
        artifacts: unknown[];
        nativeArtifactsComplete: boolean;
      };
      expect(savedEvidence.candidates).toHaveLength(2);
      expect(savedEvidence.artifacts).toHaveLength(2);
      expect(savedEvidence.nativeArtifactsComplete).toBe(true);
    } finally {
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("propagates progress callback rejection instead of returning a page failure", async () => {
    const fixture = await makeFixture();
    const calls: number[] = [];
    const workDir = path.join(fixture.root, "callback-rejection");
    const rejected = new Error("progress persistence rejected");
    try {
      const adapter = makeAdapter(fixture, 2, calls);
      await expect(runConversion(adapter, fixture, workDir, {
        onProgress: async (snapshot) => {
          if (snapshot.stage === "recognizing" && snapshot.currentPage === 2) throw rejected;
        }
      })).rejects.toBe(rejected);
      expect(calls).toEqual([1]);
      expect(await cachedGenerationCount(fixture, 1)).toBe(1);
      expect(await cachedGenerationCount(fixture, 2)).toBe(0);
    } finally {
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("recomputes a page when its cached native artifact is corrupted", async () => {
    const fixture = await makeFixture();
    const calls: number[] = [];
    try {
      const initialWorkDir = path.join(fixture.root, "corruption-attempt-1");
      await runConversion(makeAdapter(fixture, 1, calls), fixture, initialWorkDir);
      expect(await cachedGenerationCount(fixture, 1)).toBe(1);

      const pageDirectory = path.join(fixture.checkpointDirectory, ".omr-page-checkpoints-v1", "pages", "page-001");
      const [generationName] = await fs.readdir(pageDirectory);
      const generationDirectory = path.join(pageDirectory, generationName);
      const manifest = JSON.parse(await fs.readFile(path.join(generationDirectory, "manifest.json"), "utf8")) as {
        artifacts: Array<{ file: string }>;
      };
      expect(manifest.artifacts.length).toBeGreaterThan(0);
      const artifactPath = path.join(generationDirectory, manifest.artifacts[0].file);
      const damaged = await fs.readFile(artifactPath);
      damaged[0] ^= 0xff;
      await fs.writeFile(artifactPath, damaged);
      await fs.rm(initialWorkDir, { recursive: true, force: true });

      const recoveryWorkDir = path.join(fixture.root, "corruption-attempt-2");
      const recovered = await runConversion(makeAdapter(fixture, 1, calls), fixture, recoveryWorkDir);
      expect(calls).toEqual([1, 1]);
      expect(recovered.coverage?.processedPages).toEqual([1]);
      expect(recovered.coverage?.missingPages).toEqual([]);
    } finally {
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it.each([
    ["source digest", async (fixture: Fixture) => { await fs.writeFile(fixture.sourcePath, "source score bytes v2"); }],
    ["preprocessing profile", async (_fixture: Fixture, state: { profile: string | null }) => { state.profile = "profile-b"; }],
    ["score type", async (_fixture: Fixture, state: { scoreType: ScoreType }) => { state.scoreType = "guitar_solo"; }],
    ["runtime configuration", async (_fixture: Fixture) => { env.OMR_AUDIVERIS_TIMEOUT_MS += 1; }],
    ["checkpoint generation", async (_fixture: Fixture) => { env.OMR_CHECKPOINT_GENERATION = `${env.OMR_CHECKPOINT_GENERATION}-next`; }],
    ["runtime executable", async (fixture: Fixture) => { await fs.writeFile(fixture.runtimePath, "fake Audiveris executable v2"); }]
  ] as const)("does not restore after the %s changes", async (_label, mutateIdentity) => {
    const fixture = await makeFixture();
    const calls: number[] = [];
    const oldTimeout = env.OMR_AUDIVERIS_TIMEOUT_MS;
    const oldGeneration = env.OMR_CHECKPOINT_GENERATION;
    const state: { profile: string | null; scoreType: ScoreType } = { profile: "profile-a", scoreType: "melody" };
    const convertWithIdentity = (workDir: string) => runConversion(makeAdapter(fixture, 1, calls), fixture, workDir, {
      preprocessingProfile: state.profile,
      scoreType: state.scoreType
    });
    try {
      await convertWithIdentity(path.join(fixture.root, "identity-attempt-1"));
      await mutateIdentity(fixture, state);
      const converted = await convertWithIdentity(path.join(fixture.root, "identity-attempt-2"));
      expect(calls).toEqual([1, 1]);
      expect(converted.coverage?.processedPages).toEqual([1]);
    } finally {
      env.OMR_AUDIVERIS_TIMEOUT_MS = oldTimeout;
      env.OMR_CHECKPOINT_GENERATION = oldGeneration;
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("fingerprints a generic runtime wrapper without hashing its neighboring data", async () => {
    const fixture = await makeFixture();
    const calls: number[] = [];
    try {
      await runConversion(makeAdapter(fixture, 1, calls), fixture, path.join(fixture.root, "runtime-attempt-1"));
      await fs.writeFile(fixture.runtimeSiblingPath, Buffer.alloc(2 * 1024 * 1024, 0x72));
      const resumed = await runConversion(makeAdapter(fixture, 1, calls), fixture, path.join(fixture.root, "runtime-attempt-2"));
      expect(calls).toEqual([1]);
      expect(resumed.coverage?.processedPages).toEqual([1]);
      expect(resumed.coverage?.missingPages).toEqual([]);
    } finally {
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });
});
