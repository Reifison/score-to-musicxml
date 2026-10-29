import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConversionCheckpointStore, conversionCheckpointDigest, type ConversionCheckpointIdentity } from "../services/ConversionCheckpointStore.js";
import type { OmrResult } from "../services/OmrAdapter.js";

const xml = "<score-partwise><part id=\"P1\"><measure number=\"1\"/></part></score-partwise>";
const validation = {
  version: 1 as const,
  issues: [],
  checkedMeasures: 0,
  skippedMeasures: 0,
  voiceCheckedMeasures: 0,
  voiceSkippedMeasures: 0,
  voiceChecks: [],
  requiresReview: false,
  limitations: []
};

type Fixture = {
  base: string;
  checkpointDirectory: string;
  workDir: string;
  pageOutputDir: string;
  sourcePath: string;
  identity: ConversionCheckpointIdentity;
  result: OmrResult;
  candidateOnePath: string;
  candidateTwoPath: string;
  originalImagePath: string;
  nativeArchivePath: string;
};

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

async function makeFixture(label: string, canonicalizeBase = true): Promise<Fixture> {
  const temporaryBase = await fs.mkdtemp(path.join(os.tmpdir(), `score-checkpoint-${label}-`));
  tempDirectories.push(temporaryBase);
  // macOS exposes /tmp through a symlink; use canonical paths so path-safety
  // assertions exercise checkpoint behavior instead of that platform alias.
  const base = canonicalizeBase ? await fs.realpath(temporaryBase) : temporaryBase;
  const workDir = path.join(base, "work-old");
  const pageOutputDir = path.join(workDir, "pages", "page-001");
  const candidateOnePath = path.join(workDir, "candidate-one", "source.png");
  const candidateTwoPath = path.join(workDir, "candidate-two", "source.png");
  const originalImagePath = path.join(workDir, "original-pages", "original.png");
  const nativeArchivePath = path.join(pageOutputDir, "native.omr");
  const sourcePath = path.join(base, "score.pdf");

  await Promise.all([
    fs.mkdir(pageOutputDir, { recursive: true }),
    fs.mkdir(path.dirname(candidateOnePath), { recursive: true }),
    fs.mkdir(path.dirname(candidateTwoPath), { recursive: true }),
    fs.mkdir(path.dirname(originalImagePath), { recursive: true })
  ]);
  await Promise.all([
    fs.writeFile(sourcePath, "source pdf bytes"),
    fs.writeFile(candidateOnePath, "candidate one bytes"),
    fs.writeFile(candidateTwoPath, "candidate two bytes"),
    fs.writeFile(originalImagePath, "original page bytes"),
    fs.writeFile(nativeArchivePath, "native archive bytes")
  ]);

  const identity: ConversionCheckpointIdentity = {
    global: { sourceSha256: "score-hash", engine: { name: "audiveris", version: "1.2" }, profile: "balanced" },
    page: { page: 1, preparedSha256: "prepared-hash", decision: "include" }
  };
  const result: OmrResult = {
    musicXml: xml,
    warnings: ["Review measure 1"],
    engine: { name: "audiveris", version: "1.2" },
    evidence: [{
      page: 1,
      candidate: 1,
      candidateIds: [1, 2],
      selected: true,
      reason: "best validated candidate",
      xml,
      sourceImagePath: candidateOnePath,
      originalImagePath,
      nativeArchivePath,
      sourceImagePaths: [
        { candidate: 1, path: candidateOnePath, sha256: "candidate-one-hash" },
        { candidate: 2, path: candidateTwoPath, sha256: "candidate-two-hash" }
      ],
      validation
    }]
  };

  return {
    base,
    checkpointDirectory: path.join(base, "private-checkpoints"),
    workDir,
    pageOutputDir,
    sourcePath,
    identity,
    result,
    candidateOnePath,
    candidateTwoPath,
    originalImagePath,
    nativeArchivePath
  };
}

function inputFor(fixture: Fixture, overrides: Partial<{
  workDir: string;
  pageOutputDir: string;
  identity: ConversionCheckpointIdentity;
  result: OmrResult;
  beforeCommit: () => Promise<void>;
}> = {}) {
  return {
    page: 1,
    identity: overrides.identity ?? fixture.identity,
    workDir: overrides.workDir ?? fixture.workDir,
    pageOutputDir: overrides.pageOutputDir ?? fixture.pageOutputDir,
    sourcePath: fixture.sourcePath,
    result: overrides.result ?? fixture.result,
    beforeCommit: overrides.beforeCommit
  };
}

async function publishedGeneration(fixture: Fixture): Promise<string> {
  const pageDirectory = path.join(fixture.checkpointDirectory, ".omr-page-checkpoints-v1", "pages", "page-001");
  const entries = await fs.readdir(pageDirectory);
  const generations = entries.filter((entry) => /^[a-f0-9-]{36}$/.test(entry));
  expect(generations).toHaveLength(1);
  return path.join(pageDirectory, generations[0]);
}

async function rewriteManifest(generation: string, manifest: Record<string, unknown>, options: { updateEnvelope?: boolean } = {}): Promise<void> {
  if (options.updateEnvelope) {
    const { manifestDigest: _oldDigest, ...envelope } = manifest;
    manifest.manifestDigest = conversionCheckpointDigest(envelope);
  }
  const serialized = JSON.stringify(manifest);
  await fs.writeFile(path.join(generation, "manifest.json"), serialized);
  await fs.writeFile(path.join(generation, "manifest.sha256"), `${createHash("sha256").update(serialized).digest("hex")}\n`);
}

async function assertMissing(filePath: string): Promise<void> {
  await expect(fs.lstat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
}

describe("ConversionCheckpointStore", () => {
  it("restores MusicXML and original, candidate, and native archive evidence after the old work directory is removed", async () => {
    const fixture = await makeFixture("round-trip");
    const store = new ConversionCheckpointStore(fixture.checkpointDirectory);

    await expect(store.publish(inputFor(fixture))).resolves.toEqual({ status: "published" });
    await fs.rm(fixture.workDir, { recursive: true, force: true });

    const restoredWorkDir = path.join(fixture.base, "work-new");
    const restoredPageOutputDir = path.join(restoredWorkDir, "pages", "page-001");
    await fs.mkdir(restoredWorkDir);
    const restored = await store.restore({ page: 1, identity: fixture.identity, workDir: restoredWorkDir, pageOutputDir: restoredPageOutputDir });

    expect(restored).toMatchObject({ musicXml: xml, warnings: fixture.result.warnings, engine: fixture.result.engine });
    const evidence = restored?.evidence?.[0];
    expect(evidence).toBeDefined();
    expect(evidence?.originalImagePath).toBeTruthy();
    expect(evidence?.nativeArchivePath).toBe(path.join(restoredPageOutputDir, "native.omr"));
    expect(evidence?.sourceImagePath).toBe(evidence?.sourceImagePaths?.[0].path);
    expect(evidence?.sourceImagePaths?.[0].path).not.toBe(evidence?.sourceImagePaths?.[1].path);
    expect(path.basename(evidence?.sourceImagePaths?.[0].path ?? "")).toBe("source.png");
    expect(path.basename(evidence?.sourceImagePaths?.[1].path ?? "")).toBe("source.png");
    expect(await fs.readFile(evidence!.sourceImagePaths![0].path, "utf8")).toBe("candidate one bytes");
    expect(await fs.readFile(evidence!.sourceImagePaths![1].path, "utf8")).toBe("candidate two bytes");
    expect(await fs.readFile(evidence!.originalImagePath!, "utf8")).toBe("original page bytes");
    expect(await fs.readFile(evidence!.nativeArchivePath!, "utf8")).toBe("native archive bytes");
  });

  it("misses when either the source configuration or page input identity changes", async () => {
    const fixture = await makeFixture("identity");
    const store = new ConversionCheckpointStore(fixture.checkpointDirectory);
    await store.publish(inputFor(fixture));

    const globalChanged = { ...fixture.identity, global: { ...fixture.identity.global, profile: "high-accuracy" } };
    const pageChanged = { ...fixture.identity, page: { ...fixture.identity.page, preparedSha256: "new-prepared-hash" } };
    const workDir = path.join(fixture.base, "work-miss");
    await fs.mkdir(workDir);
    const output = path.join(workDir, "pages", "page-001");
    await expect(store.restore({ page: 1, identity: globalChanged, workDir, pageOutputDir: output })).resolves.toBeNull();
    await expect(store.restore({ page: 1, identity: pageChanged, workDir, pageOutputDir: output })).resolves.toBeNull();
    await assertMissing(output);
  });

  it("publishes and restores through the raw temporary-directory path", async () => {
    const fixture = await makeFixture("temporary-path-alias", false);
    const store = new ConversionCheckpointStore(fixture.checkpointDirectory);
    await expect(store.publish(inputFor(fixture))).resolves.toEqual({ status: "published" });

    const restoredWorkDir = path.join(fixture.base, "work-restored");
    await fs.mkdir(restoredWorkDir);
    const restored = await store.restore({
      page: 1,
      identity: fixture.identity,
      workDir: restoredWorkDir,
      pageOutputDir: path.join(restoredWorkDir, "pages", "page-001")
    });
    expect(restored?.musicXml).toBe(xml);
  });

  it("rejects a valid-JSON MusicXML mutation when the enclosing file checksum is updated", async () => {
    const fixture = await makeFixture("result-digest");
    const store = new ConversionCheckpointStore(fixture.checkpointDirectory);
    await store.publish(inputFor(fixture));
    const generation = await publishedGeneration(fixture);
    const manifest = JSON.parse(await fs.readFile(path.join(generation, "manifest.json"), "utf8")) as Record<string, any>;
    manifest.result.musicXml = "<score-partwise><part id=\"P2\"/></score-partwise>";
    await rewriteManifest(generation, manifest);

    const workDir = path.join(fixture.base, "work-mutated");
    await fs.mkdir(workDir);
    await expect(store.restore({ page: 1, identity: fixture.identity, workDir, pageOutputDir: path.join(workDir, "pages", "page-001") })).resolves.toBeNull();
  });

  it("misses when valid JSON changes artifact target metadata without repairing its manifest checksum", async () => {
    const fixture = await makeFixture("target-metadata-digest");
    const store = new ConversionCheckpointStore(fixture.checkpointDirectory);
    await store.publish(inputFor(fixture));
    const generation = await publishedGeneration(fixture);
    const manifest = JSON.parse(await fs.readFile(path.join(generation, "manifest.json"), "utf8")) as Record<string, any>;
    manifest.artifacts[0].target.relativePath = "forged/native.omr";
    await fs.writeFile(path.join(generation, "manifest.json"), JSON.stringify(manifest));

    const workDir = path.join(fixture.base, "work-target-metadata");
    const output = path.join(workDir, "pages", "page-001");
    await fs.mkdir(workDir);
    await expect(store.restore({ page: 1, identity: fixture.identity, workDir, pageOutputDir: output })).resolves.toBeNull();
    await assertMissing(output);
  });

  it.each(["malformed manifest", "artifact byte corruption"] as const)("skips a generation with %s", async (corruption) => {
    const fixture = await makeFixture(`corrupt-${corruption.replaceAll(" ", "-")}`);
    const store = new ConversionCheckpointStore(fixture.checkpointDirectory);
    await store.publish(inputFor(fixture));
    const generation = await publishedGeneration(fixture);

    if (corruption === "malformed manifest") {
      const malformed = "{not valid JSON";
      await fs.writeFile(path.join(generation, "manifest.json"), malformed);
      await fs.writeFile(path.join(generation, "manifest.sha256"), `${createHash("sha256").update(malformed).digest("hex")}\n`);
    } else {
      const manifest = JSON.parse(await fs.readFile(path.join(generation, "manifest.json"), "utf8")) as { artifacts: Array<{ file: string }> };
      const artifact = path.join(generation, "files", path.basename(manifest.artifacts[0].file));
      const bytes = await fs.readFile(artifact);
      bytes[0] ^= 0xff;
      await fs.writeFile(artifact, bytes);
    }

    const workDir = path.join(fixture.base, "work-corrupt");
    const output = path.join(workDir, "pages", "page-001");
    await fs.mkdir(workDir);
    await expect(store.restore({ page: 1, identity: fixture.identity, workDir, pageOutputDir: output })).resolves.toBeNull();
    await assertMissing(output);
  });

  it("keeps the first healthy generation when another writer publishes the same identity", async () => {
    const fixture = await makeFixture("concurrent-writers");
    const store = new ConversionCheckpointStore(fixture.checkpointDirectory);
    await expect(store.publish(inputFor(fixture))).resolves.toEqual({ status: "published" });
    const competingResult: OmrResult = { ...fixture.result, musicXml: "<score-partwise><part id=\"P2\"/></score-partwise>", warnings: ["late writer"] };
    await expect(store.publish(inputFor(fixture, { result: competingResult }))).resolves.toEqual({ status: "existing" });

    const workDir = path.join(fixture.base, "work-writer-check");
    await fs.mkdir(workDir);
    const restored = await store.restore({ page: 1, identity: fixture.identity, workDir, pageOutputDir: path.join(workDir, "pages", "page-001") });
    expect(restored?.musicXml).toBe(xml);
    expect(restored?.warnings).toEqual(fixture.result.warnings);
  });

  it("leaves no page output behind when hydration cannot safely materialize its artifacts", async () => {
    const fixture = await makeFixture("atomic-hydration");
    const store = new ConversionCheckpointStore(fixture.checkpointDirectory);
    await store.publish(inputFor(fixture));
    const generation = await publishedGeneration(fixture);
    const manifest = JSON.parse(await fs.readFile(path.join(generation, "manifest.json"), "utf8")) as Record<string, any>;
    manifest.artifacts[0].target.relativePath = "collision";
    manifest.artifacts[1].target.relativePath = "collision/child.bin";
    await rewriteManifest(generation, manifest, { updateEnvelope: true });

    const workDir = path.join(fixture.base, "work-hydration-failure");
    const output = path.join(workDir, "pages", "page-001");
    await fs.mkdir(workDir);
    await expect(store.restore({ page: 1, identity: fixture.identity, workDir, pageOutputDir: output })).resolves.toBeNull();
    await assertMissing(output);
    const leftovers = (await fs.readdir(workDir)).filter((name) => name.startsWith(".omr-checkpoint-hydration-"));
    expect(leftovers).toEqual([]);
  });

  it("does not publish when the caller's fenced progress write rejects", async () => {
    const fixture = await makeFixture("before-commit");
    const store = new ConversionCheckpointStore(fixture.checkpointDirectory);
    await expect(store.publish(inputFor(fixture, { beforeCommit: async () => { throw new Error("progress lease lost"); } })))
      .rejects.toThrow("progress lease lost");
    const pageDirectory = path.join(fixture.checkpointDirectory, ".omr-page-checkpoints-v1", "pages", "page-001");
    await expect(fs.readdir(pageDirectory)).resolves.toEqual([]);
    const stagingDirectory = path.join(fixture.checkpointDirectory, ".omr-page-checkpoints-v1", "staging");
    await expect(fs.readdir(stagingDirectory)).resolves.toEqual([]);
  });

  it.each(["root", "pages", "page"] as const)("rejects a symlinked %s directory without touching its outside sentinel", async (linkAt) => {
    const fixture = await makeFixture(`symlink-${linkAt}`);
    const root = path.join(fixture.checkpointDirectory, ".omr-page-checkpoints-v1");
    const pages = path.join(root, "pages");
    const page = path.join(pages, "page-001");
    const outside = path.join(fixture.base, "outside");
    await fs.mkdir(outside);
    const sentinel = path.join(outside, "sentinel.txt");
    await fs.writeFile(sentinel, "keep this outside file");

    if (linkAt === "root") {
      await fs.mkdir(fixture.checkpointDirectory, { recursive: true });
      await fs.symlink(outside, root, "dir");
    } else {
      await fs.mkdir(root, { recursive: true });
      if (linkAt === "pages") await fs.symlink(outside, pages, "dir");
      else {
        await fs.mkdir(pages);
        await fs.symlink(outside, page, "dir");
      }
    }

    const workDir = path.join(fixture.base, "work-symlink");
    await fs.mkdir(workDir);
    await expect(storeRestore(fixture, workDir)).rejects.toThrow();
    expect(await fs.readFile(sentinel, "utf8")).toBe("keep this outside file");
    expect(await fs.readdir(outside)).toEqual(["sentinel.txt"]);
  });

  it("ignores a generation whose files directory is a symlink to outside storage", async () => {
    const fixture = await makeFixture("symlink-files");
    const store = new ConversionCheckpointStore(fixture.checkpointDirectory);
    await store.publish(inputFor(fixture));
    const generation = await publishedGeneration(fixture);
    const files = path.join(generation, "files");
    const outside = path.join(fixture.base, "outside-files");
    await fs.mkdir(outside);
    const sentinel = path.join(outside, "sentinel.txt");
    await fs.writeFile(sentinel, "keep this outside file");
    await fs.rm(files, { recursive: true });
    await fs.symlink(outside, files, "dir");

    const workDir = path.join(fixture.base, "work-files-symlink");
    await fs.mkdir(workDir);
    await expect(store.restore({ page: 1, identity: fixture.identity, workDir, pageOutputDir: path.join(workDir, "pages", "page-001") })).resolves.toBeNull();
    expect(await fs.readFile(sentinel, "utf8")).toBe("keep this outside file");
    expect(await fs.readdir(outside)).toEqual(["sentinel.txt"]);
  });

  it("does not hydrate through a symlinked page-output ancestor", async () => {
    const fixture = await makeFixture("symlink-output-ancestor");
    const store = new ConversionCheckpointStore(fixture.checkpointDirectory);
    await store.publish(inputFor(fixture));

    const workDir = path.join(fixture.base, "work-output-symlink");
    const outside = path.join(fixture.base, "outside-output");
    await fs.mkdir(workDir);
    await fs.mkdir(outside);
    const sentinel = path.join(outside, "sentinel.txt");
    await fs.writeFile(sentinel, "keep this outside file");
    await fs.symlink(outside, path.join(workDir, "pages"), "dir");

    await expect(store.restore({ page: 1, identity: fixture.identity, workDir, pageOutputDir: path.join(workDir, "pages", "page-001") })).resolves.toBeNull();
    expect(await fs.readFile(sentinel, "utf8")).toBe("keep this outside file");
    expect(await fs.readdir(outside)).toEqual(["sentinel.txt"]);
  });

  it("skips oversized manifests before the progress fence and keeps its private files private", async () => {
    const fixture = await makeFixture("manifest-limit");
    const store = new ConversionCheckpointStore(fixture.checkpointDirectory);
    let fenceCalled = false;
    const oversized: OmrResult = { ...fixture.result, musicXml: "x".repeat(2 * 1024 * 1024) };
    await expect(store.publish(inputFor(fixture, { result: oversized, beforeCommit: async () => { fenceCalled = true; } })))
      .resolves.toEqual({ status: "skipped" });
    expect(fenceCalled).toBe(false);

    const root = path.join(fixture.checkpointDirectory, ".omr-page-checkpoints-v1");
    await expect(fs.readdir(path.join(root, "pages", "page-001"))).resolves.toEqual([]);
    await expect(fs.readdir(path.join(root, "staging"))).resolves.toEqual([]);
    for (const directory of [fixture.checkpointDirectory, root, path.join(root, "pages"), path.join(root, "staging")]) {
      expect((await fs.stat(directory)).mode & 0o777).toBe(0o700);
    }

    await expect(store.publish(inputFor(fixture))).resolves.toEqual({ status: "published" });
    const generation = await publishedGeneration(fixture);
    const privateDirectories = [path.join(root, "pages"), path.join(root, "pages", "page-001"), generation, path.join(generation, "files")];
    for (const directory of privateDirectories) expect((await fs.stat(directory)).mode & 0o777).toBe(0o700);
    const manifest = JSON.parse(await fs.readFile(path.join(generation, "manifest.json"), "utf8")) as { artifacts: Array<{ file: string }> };
    const privateFiles = [path.join(generation, "manifest.json"), path.join(generation, "manifest.sha256"), path.join(generation, manifest.artifacts[0].file)];
    for (const file of privateFiles) expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
  });

  it("recovers stale staging entries and retains only a bounded number of page generations", async () => {
    const fixture = await makeFixture("retention");
    const root = path.join(fixture.checkpointDirectory, ".omr-page-checkpoints-v1");
    const staging = path.join(root, "staging");
    const abandoned = path.join(staging, randomUUID());
    await fs.mkdir(abandoned, { recursive: true });
    await fs.writeFile(path.join(abandoned, "partial.bin"), "orphaned partial write");
    const old = new Date(Date.now() - 7 * 60 * 60 * 1000);
    await fs.utimes(abandoned, old, old);

    const store = new ConversionCheckpointStore(fixture.checkpointDirectory);
    const publishedIdentities: ConversionCheckpointIdentity[] = [];
    for (let version = 0; version < 4; version++) {
      const identity = { ...fixture.identity, page: { ...fixture.identity.page, preparedSha256: `prepared-${version}` } };
      publishedIdentities.push(identity);
      await expect(store.publish(inputFor(fixture, { identity }))).resolves.toEqual({ status: "published" });
    }

    await assertMissing(abandoned);
    const pageDirectory = path.join(root, "pages", "page-001");
    const generations = (await fs.readdir(pageDirectory)).filter((entry) => /^[a-f0-9-]{36}$/.test(entry));
    expect(generations).toHaveLength(3);

    let restoredCount = 0;
    for (const [index, identity] of publishedIdentities.entries()) {
      const workDir = path.join(fixture.base, `work-retention-${index}`);
      await fs.mkdir(workDir);
      const restored = await store.restore({ page: 1, identity, workDir, pageOutputDir: path.join(workDir, "pages", "page-001") });
      if (restored) restoredCount++;
    }
    expect(restoredCount).toBe(3);
  });
});

async function storeRestore(fixture: Fixture, workDir: string): Promise<OmrResult | null> {
  return new ConversionCheckpointStore(fixture.checkpointDirectory).restore({
    page: 1,
    identity: fixture.identity,
    workDir,
    pageOutputDir: path.join(workDir, "pages", "page-001")
  });
}
