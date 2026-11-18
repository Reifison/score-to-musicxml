import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { ScoreType } from "../domain.js";
import { FileStorageService } from "../services/FileStorageService.js";
import {
  inspectNotesRhythmReference,
  NotesRhythmReferenceService,
  notesRhythmReferenceKey,
} from "../services/NotesRhythmReferenceService.js";
import { parseVisualMusicXml } from "../services/VisualMusicXml.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const sourceFixturePath = path.join(repositoryRoot, "source-ledgers/adelita-2026-10-10/original.pdf");
const musicXmlFixturePath = path.join(repositoryRoot, "apps/api/src/tests/fixtures/adelita/notes-rhythm.musicxml");
const sourceSha256 = "d51b949f2f2e76967402ffb7228adf17656263bac87cbb7df4bf5f195e22b115";
const musicXmlSha256 = "01dacfeedc64f3000e3616ff7ea1abe570df0848afd474eb2f372027a31f7811";
const ownerUserId = "adelita-owner";
const scoreType: ScoreType = "guitar_solo";
const exportFilename = "adelita-notes-rhythm.musicxml";
const sourceScoreId = "df7ca228-bf60-4fde-8293-97b75e8ca7a3";
const sourceReviewRevision = "c3cd11ef2241fb837affc1c31c334d871d8fcfc27a5aefd35ec28ef519d7bc05";
const directories: string[] = [];

type ManifestPatch = Record<string, unknown> & {
  authorization?: Record<string, unknown>;
};

type ReferenceFixture = {
  directory: string;
  sourcePath: string;
  sourceBytes: Buffer;
  referenceDirectory: string;
  manifestPath: string;
  exportPath: string;
  xml: string;
  ownerUserId: string;
  scoreType: ScoreType;
  service: NotesRhythmReferenceService;
};

const hash = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

async function createFixture(options: { xml?: string; manifestPatch?: ManifestPatch } = {}): Promise<ReferenceFixture> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "notes-rhythm-reference-"));
  directories.push(directory);
  const sourceBytes = await fs.readFile(sourceFixturePath);
  expect(hash(sourceBytes)).toBe(sourceSha256);
  const xml = options.xml ?? await fs.readFile(musicXmlFixturePath, "utf8");
  if (options.xml === undefined) expect(hash(xml)).toBe(musicXmlSha256);

  const sourcePath = path.join(directory, "source.pdf");
  const referenceDirectory = path.join(directory, "references");
  await fs.writeFile(sourcePath, sourceBytes, { mode: 0o600 });
  await fs.mkdir(referenceDirectory, { mode: 0o700 });
  const storage = new FileStorageService(path.join(directory, "uploads"), path.join(directory, "exports"));
  await storage.saveExport(exportFilename, xml);
  const exportPath = storage.resolveExportPath(exportFilename);
  const baseManifest = {
    version: 1 as const,
    scope: "notes_rhythm" as const,
    ownerUserId,
    sourceSHA256: sourceSha256,
    scoreType,
    totalPages: 1 as const,
    sourceScoreId,
    sourceReviewRevision,
    exportFilename,
    xmlSHA256: hash(xml),
    referenceKind: "assisted_visual_revision" as const,
    authorization: {
      kind: "explicit_user_request" as const,
      actorUserId: ownerUserId,
      recordedAt: "2026-10-11T14:33:48.173Z",
    },
    accuracyVerified: false as const,
    trainingEligible: false as const,
  };
  const patch = options.manifestPatch ?? {};
  const manifest = {
    ...baseManifest,
    ...patch,
    authorization: { ...baseManifest.authorization, ...(patch.authorization ?? {}) },
  };
  const manifestPath = path.join(referenceDirectory, `${notesRhythmReferenceKey(ownerUserId, sourceSha256, scoreType)}.json`);
  await fs.writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
  return {
    directory,
    sourcePath,
    sourceBytes,
    referenceDirectory,
    manifestPath,
    exportPath,
    xml,
    ownerUserId,
    scoreType,
    service: new NotesRhythmReferenceService(storage, referenceDirectory),
  };
}

async function lookup(fixture: ReferenceFixture, overrides: Partial<{
  sourcePath: string;
  ownerUserId: string;
  scoreType: ScoreType;
  scoreTypeSelected: boolean;
}> = {}) {
  return fixture.service.lookup({
    sourcePath: fixture.sourcePath,
    ownerUserId: fixture.ownerUserId,
    scoreType: fixture.scoreType,
    scoreTypeSelected: true,
    ...overrides,
  });
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("NotesRhythmReferenceService", () => {
  it("returns the real Adelita reference only for the same source identity and preserves all 147 events", async () => {
    const fixture = await createFixture();
    const result = await lookup(fixture);

    expect(result.diagnostic).toBeUndefined();
    expect(result.match).toBeTruthy();
    expect(result.match?.reference).toMatchObject({
      ownerUserId,
      sourceSHA256: sourceSha256,
      scoreType,
      totalPages: 1,
      sourceScoreId,
      sourceReviewRevision,
      exportFilename,
      xmlSHA256: musicXmlSha256,
      accuracyVerified: false,
      trainingEligible: false,
    });
    expect(result.match?.musicXml).toBe(fixture.xml);
    expect(result.match?.coverage).toMatchObject({ totalPages: 1, processedPages: [1], missingPages: [] });
    expect(result.match?.coverage.pages).toHaveLength(1);

    const parsedMeasures = parseVisualMusicXml(result.match!.musicXml);
    const parsedEvents = parsedMeasures.flatMap((measure) => measure.events);
    expect(parsedMeasures).toHaveLength(16);
    expect(parsedEvents).toHaveLength(147);
    expect(parsedEvents.filter((event) => event.kind === "note")).toHaveLength(135);
    expect(parsedEvents.filter((event) => event.kind === "rest")).toHaveLength(12);
    expect(parsedEvents.filter((event) => event.grace)).toHaveLength(12);
  });

  it("returns a miss for a different owner, type, source bytes, or a non-selected type", async () => {
    const fixture = await createFixture();
    const otherSourcePath = path.join(fixture.directory, "different-source.pdf");
    await fs.writeFile(otherSourcePath, Buffer.concat([fixture.sourceBytes, Buffer.from("changed source")]), { mode: 0o600 });

    await expect(lookup(fixture, { ownerUserId: "other-owner" })).resolves.toEqual({ match: null });
    await expect(lookup(fixture, { scoreType: "piano" })).resolves.toEqual({ match: null });
    await expect(lookup(fixture, { sourcePath: otherSourcePath })).resolves.toEqual({ match: null });
    await expect(lookup(fixture, { sourcePath: path.join(fixture.directory, "missing.pdf"), scoreTypeSelected: false }))
      .resolves.toEqual({ match: null });
  });

  it("returns a miss before touching storage when score type was not explicitly selected", async () => {
    const fixture = await createFixture();
    await expect(fixture.service.lookup({
      sourcePath: path.join(fixture.directory, "source-does-not-exist.pdf"),
      ownerUserId,
      scoreType,
      scoreTypeSelected: false,
    })).resolves.toEqual({ match: null });
  });

  it("rejects an export whose bytes no longer match the manifest hash", async () => {
    const fixture = await createFixture();
    await fs.writeFile(fixture.exportPath, `${fixture.xml}\n<!-- changed after registration -->\n`, { mode: 0o600 });

    await expect(lookup(fixture)).resolves.toEqual({
      match: null,
      diagnostic: "NOTES_RHYTHM_REFERENCE_INVALID",
    });
  });

  it.each([
    ["owner", { ownerUserId: "different-owner" }],
    ["source hash", { sourceSHA256: "0".repeat(64) }],
    ["score type", { scoreType: "piano" }],
    ["unknown score type", { scoreType: "not-a-score-type" }],
    ["authorization actor", { authorization: { actorUserId: "different-actor" } }],
    ["accuracy flag", { accuracyVerified: true }],
  ] as const)("rejects a changed manifest: %s", async (_label, manifestPatch) => {
    const fixture = await createFixture({ manifestPatch: manifestPatch as ManifestPatch });
    await expect(lookup(fixture)).resolves.toEqual({
      match: null,
      diagnostic: "NOTES_RHYTHM_REFERENCE_INVALID",
    });
  });

  it("rejects a manifest symlink instead of following it", async () => {
    const fixture = await createFixture();
    const target = `${fixture.manifestPath}.target`;
    await fs.rename(fixture.manifestPath, target);
    await fs.symlink(target, fixture.manifestPath);

    await expect(lookup(fixture)).resolves.toEqual({
      match: null,
      diagnostic: "NOTES_RHYTHM_REFERENCE_INVALID",
    });
  });

  it("rejects an export symlink instead of following it", async () => {
    const fixture = await createFixture();
    const target = `${fixture.exportPath}.target`;
    await fs.rename(fixture.exportPath, target);
    await fs.symlink(target, fixture.exportPath);

    await expect(lookup(fixture)).resolves.toEqual({
      match: null,
      diagnostic: "NOTES_RHYTHM_REFERENCE_INVALID",
    });
  });

  it("rejects metric duration issues and out-of-scope adornments, while retaining grace events", async () => {
    const referenceXml = await fs.readFile(musicXmlFixturePath, "utf8");
    const metricDurationXml = referenceXml.replace(
      "<duration>2</duration>\n        <voice>1</voice>\n        <type>eighth</type>",
      "<duration>4</duration>\n        <voice>1</voice>\n        <type>quarter</type>",
    );
    expect(metricDurationXml).not.toBe(referenceXml);
    expect(() => inspectNotesRhythmReference(metricDurationXml)).toThrow();
    const metricFixture = await createFixture({ xml: metricDurationXml });
    await expect(lookup(metricFixture)).resolves.toEqual({
      match: null,
      diagnostic: "NOTES_RHYTHM_REFERENCE_INVALID",
    });

    const adornmentXml = referenceXml.replace(
      "</measure>",
      "<direction><direction-type><dynamics><p/></dynamics></direction-type></direction></measure>",
    );
    expect(adornmentXml).not.toBe(referenceXml);
    expect(() => inspectNotesRhythmReference(adornmentXml)).toThrow();
    const adornmentFixture = await createFixture({ xml: adornmentXml });
    await expect(lookup(adornmentFixture)).resolves.toEqual({
      match: null,
      diagnostic: "NOTES_RHYTHM_REFERENCE_INVALID",
    });

    const inspected = inspectNotesRhythmReference(referenceXml);
    const parsed = parseVisualMusicXml(referenceXml).flatMap((measure) => measure.events);
    expect(inspected).toMatchObject({ totalPages: 1, processedPages: [1], missingPages: [] });
    expect(parsed.filter((event) => event.grace)).toHaveLength(12);
  });
});
