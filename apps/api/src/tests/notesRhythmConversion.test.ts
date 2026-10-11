import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryAuditRepository, InMemoryScoreRepository } from "../repositories/inMemoryRepositories.js";
import { FileStorageService } from "../services/FileStorageService.js";
import { MidiExportService } from "../services/MidiExportService.js";
import { reviewRevision } from "../services/MusicalReview.js";
import { inspectMusicXmlValidation } from "../services/MusicXmlValidation.js";
import { NotesRhythmReferenceService, inspectNotesRhythmReference, notesRhythmReferenceKey, referenceReuseVisualReview } from "../services/NotesRhythmReferenceService.js";
import { ScoreConversionService } from "../services/ScoreConversionService.js";
import type { SourceVisualValidationService } from "../services/SourceVisualValidationService.js";
import type { NotesRhythmReference } from "../services/NotesRhythmReferenceService.js";

const dirs: string[] = [];
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const xmlFile = new URL("./fixtures/adelita/notes-rhythm.musicxml", import.meta.url);
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))); });

async function setup() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "notes-rhythm-conversion-")); dirs.push(dir);
  const scores = new InMemoryScoreRepository();
  const audits = new InMemoryAuditRepository();
  const storage = new FileStorageService(path.join(dir, "uploads"), path.join(dir, "exports"));
  const musicXml = await fs.readFile(xmlFile, "utf8");
  const source = Buffer.from("same original PDF bytes");
  await storage.saveUpload("source.pdf", source);
  const input = { userId: "owner-1", originalFilename: "Adelita.pdf", storedFilename: "source.pdf", fileType: "pdf",
    mimeType: "application/pdf", fileSize: source.length, uploadStatus: "uploaded" as const,
    conversionStatus: "queued" as const, scoreType: "guitar_solo" as const, scoreTypeSelected: true };
  const original = await scores.create(input);
  await storage.saveExport("reviewed.musicxml", musicXml);
  const reference: NotesRhythmReference = { version: 1, scope: "notes_rhythm", ownerUserId: input.userId,
    sourceSHA256: sha(source), scoreType: input.scoreType, totalPages: 1, sourceScoreId: original.id,
    sourceReviewRevision: reviewRevision("reviewed.musicxml", musicXml), exportFilename: "reviewed.musicxml", xmlSHA256: sha(musicXml),
    referenceKind: "assisted_visual_revision", authorization: { kind: "explicit_user_request", actorUserId: input.userId,
      recordedAt: new Date().toISOString() }, accuracyVerified: false, trainingEligible: false };
  const midi = new MidiExportService();
  const midiValidation = await midi.inspect(musicXml);
  expect(midiValidation.status).toBe("passed");
  const originalState = await scores.update(original.id, { conversionStatus: "converted", resultStatus: "complete",
    reviewStatus: "approved", musicxmlFilename: reference.exportFilename, reviewRevision: reference.sourceReviewRevision,
    validation: { ...inspectMusicXmlValidation(musicXml), midiValidation } });
  const referencesDir = path.join(dir, "references");
  await fs.mkdir(referencesDir);
  await fs.writeFile(path.join(referencesDir, notesRhythmReferenceKey(input.userId, sha(source), input.scoreType) + ".json"), JSON.stringify(reference));
  const references = new NotesRhythmReferenceService(storage, referencesDir);
  const target = await scores.create(input);
  const coverage = inspectNotesRhythmReference(musicXml);
  const convert = vi.fn(async () => ({ musicXml, coverage, warnings: [], engine: { name: "test-omr", version: "1" } }));
  const evaluate = vi.fn(async () => ({ review: { ...referenceReuseVisualReview({ reference, musicXml, coverage }), status: "unavailable" as const, diagnostics: [] }, assets: [] }));
  const conversion = new ScoreConversionService(scores, audits, storage, { convert },
    { evaluate } as unknown as SourceVisualValidationService, midi, true, references);
  return { dir, scores, audits, storage, musicXml, originalState: structuredClone(originalState), reference, target, convert, evaluate, conversion };
}

describe("private notes/rhythm reference in conversion pipeline", () => {
  it("reuses exact reviewed content in a new immutable version with honest provenance and fresh MIDI validation", async () => {
    const ctx = await setup();
    const converted = await ctx.conversion.convertScore(ctx.target.id);
    expect(converted).toMatchObject({ conversionStatus: "converted", resultStatus: "complete", reviewStatus: "approved", canPlay: true });
    expect(ctx.convert).not.toHaveBeenCalled();
    expect(ctx.evaluate).not.toHaveBeenCalled();
    expect(converted.musicxmlFilename).not.toBe(ctx.reference.exportFilename);
    expect(converted.reviewRevision).not.toBe(ctx.reference.sourceReviewRevision);
    expect(await ctx.storage.readExport(converted.musicxmlFilename!)).toBe(ctx.musicXml);
    expect(converted.validation).toMatchObject({ referenceReuse: { scope: "notes_rhythm", referenceScoreId: ctx.reference.sourceScoreId,
      referenceXmlSHA256: sha(ctx.musicXml), accuracyVerified: false, trainingEligible: false },
      visualReview: { reader: null, status: "skipped", checkedMeasures: 0, unknownMeasures: 16 },
      midiValidation: { status: "passed", xmlSHA256: sha(ctx.musicXml) },
      reviewAcceptance: { accuracyVerified: false, trainingEligible: false } });
    const evidence = await ctx.storage.readConversionEvidence(converted.musicxmlFilename!);
    expect(evidence).toMatchObject({ pipelineVersion: "notes-rhythm-v5", conversionMode: "reference_reuse",
      engine: { name: "notes-rhythm-reference" }, candidates: [], outputSha256: sha(ctx.musicXml) });
    expect((await ctx.audits.list()).find((item) => item.action === "conversion_completed")?.metadata)
      .toMatchObject({ conversionMode: "reference_reuse", referenceReuse: { referenceScoreId: ctx.reference.sourceScoreId } });
    expect(await ctx.scores.findById(ctx.reference.sourceScoreId)).toEqual(ctx.originalState);
  });

  it.each(["changed_revision", "withdrawn_review", "deleted_source", "failed_midi"])("falls back to OMR when reference is %s", async (reason) => {
    const ctx = await setup();
    if (reason === "changed_revision") await ctx.scores.update(ctx.reference.sourceScoreId, { reviewRevision: "f".repeat(64) });
    if (reason === "withdrawn_review") await ctx.scores.update(ctx.reference.sourceScoreId, { reviewStatus: "needs_review" });
    if (reason === "deleted_source") await ctx.scores.softDelete(ctx.reference.sourceScoreId, { deletedAt: new Date(), purgeAt: new Date() });
    if (reason === "failed_midi") await ctx.scores.update(ctx.reference.sourceScoreId, { validation: {
      ...ctx.originalState.validation!, midiValidation: { ...ctx.originalState.validation!.midiValidation!, status: "failed" } } });
    const converted = await ctx.conversion.convertScore(ctx.target.id);
    expect(converted.conversionStatus).toBe("converted");
    expect(ctx.convert).toHaveBeenCalledOnce();
    expect(ctx.evaluate).toHaveBeenCalledOnce();
    expect(converted.validation?.referenceReuse).toBeUndefined();
    expect(converted.validation?.visualReview?.diagnostics).toContainEqual(expect.objectContaining({ code: "NOTES_RHYTHM_REFERENCE_STALE" }));
  });
});
