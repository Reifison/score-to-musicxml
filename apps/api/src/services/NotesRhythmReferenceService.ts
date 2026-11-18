import { createHash } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { DOMParser } from "@xmldom/xmldom";
import { z } from "zod";
import { paths } from "../config/env.js";
import type { ConversionCoverage, Score, ScoreType } from "../domain.js";
import type { SourceVisualReview } from "./SourceVisualReviewTypes.js";
import { FileStorageService } from "./FileStorageService.js";
import { inspectMusicXmlValidation } from "./MusicXmlValidation.js";
import { parseVisualMusicXml } from "./VisualMusicXml.js";

const digest = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const identity = z.string().min(1).max(256);
/** Registration is an explicit administrative operation, never inferred from automatic delivery. */
export const notesRhythmReferenceSchema = z.object({
  version: z.literal(1), scope: z.literal("notes_rhythm"),
  ownerUserId: identity, sourceSHA256: hash,
  scoreType: z.enum(["melody", "piano", "guitar_solo", "guitar_duo"]),
  // V1 deliberately supports only a fully reviewed single-page source.
  totalPages: z.literal(1), sourceScoreId: identity, sourceReviewRevision: hash,
  exportFilename: z.string().regex(/^[a-zA-Z0-9_-]+\.musicxml$/).max(256), xmlSHA256: hash,
  referenceKind: z.literal("assisted_visual_revision"),
  authorization: z.object({ kind: z.literal("explicit_user_request"), actorUserId: identity,
    recordedAt: z.string().datetime() }).strict(),
  accuracyVerified: z.literal(false), trainingEligible: z.literal(false)
}).strict().refine((entry) => entry.authorization.actorUserId === entry.ownerUserId,
  { message: "Reference reuse must be authorized for its owner" });
export type NotesRhythmReference = z.infer<typeof notesRhythmReferenceSchema>;
export type NotesRhythmReferenceMatch = { reference: NotesRhythmReference; musicXml: string; coverage: ConversionCoverage };
export type NotesRhythmReferenceLookup = { match: NotesRhythmReferenceMatch | null; diagnostic?: "NOTES_RHYTHM_REFERENCE_INVALID" };

export function notesRhythmReferenceKey(ownerUserId: string, sourceSHA256: string, scoreType: ScoreType): string {
  return digest(JSON.stringify([ownerUserId, sourceSHA256, scoreType, "notes_rhythm"]));
}

/** Validate a deliberately plain, metric reference. No pitch inference or score-specific rules. */
export function inspectNotesRhythmReference(musicXml: string): ConversionCoverage {
  if (Buffer.byteLength(musicXml) > 4 * 1024 * 1024 || /<!ENTITY\b|<!DOCTYPE\b/i.test(musicXml)) throw new Error("Invalid reference document");
  const parsed = parseVisualMusicXml(musicXml);
  if (!parsed.length || parsed.length > 200 || parsed.some((measure) => !measure.events.length || !measure.rhythmNotationValid)) throw new Error("Incomplete metric reference");
  const validation = inspectMusicXmlValidation(musicXml);
  // Metric violations are warnings in the ordinary review flow. A reusable reference must pass them too.
  if (validation.skippedMeasures || validation.issues.length) throw new Error("Invalid reference rhythm");
  const document = new DOMParser().parseFromString(musicXml, "application/xml");
  for (const tag of ["direction", "credit", "lyric", "technical", "dynamics", "articulations", "ornaments", "slur", "repeat", "ending"]) {
    if (document.getElementsByTagName(tag).length) throw new Error("Reference contains content outside notes/rhythm scope");
  }
  const tempos = Array.from(document.getElementsByTagName("sound"));
  if (tempos.length !== 1 || tempos[0].attributes.length !== 1 || !tempos[0].hasAttribute("tempo")
    || !Number.isFinite(Number(tempos[0].getAttribute("tempo"))) || Number(tempos[0].getAttribute("tempo")) <= 0
    || Number(tempos[0].getAttribute("tempo")) > 400) {
    throw new Error("Reference must have one explicit constant playback tempo");
  }
  const parts = [...new Set(parsed.map((measure) => measure.partId))].map((id) => {
    const events = parsed.filter((measure) => measure.partId === id).flatMap((measure) => measure.events);
    const staves = [...new Set(events.map((event) => event.staff))].sort((a, b) => a - b);
    return { id, name: "", staffCount: staves.length, staves };
  });
  return { totalPages: 1, processedPages: [1], missingPages: [], pages: [{ page: 1, status: "processed", contentRole: "musical", parts }] };
}

/** A registry entry alone is insufficient: deleting, replacing or withdrawing the revision disables reuse. */
export function isCurrentNotesRhythmReference(reference: NotesRhythmReference, score: Score | null): boolean {
  return Boolean(score && score.id === reference.sourceScoreId && score.userId === reference.ownerUserId
    && !score.deletedAt && score.conversionStatus === "converted" && score.reviewStatus === "approved"
    && score.resultStatus === "complete" && score.scoreTypeSelected && score.scoreType === reference.scoreType
    && score.reviewRevision === reference.sourceReviewRevision && score.musicxmlFilename === reference.exportFilename
    && score.validation?.midiValidation?.status === "passed" && score.validation.midiValidation.xmlSHA256 === reference.xmlSHA256);
}

/** Reuse has provenance but did not run a new visual reader; never report invented agreement. */
export function referenceReuseVisualReview(match: NotesRhythmReferenceMatch): SourceVisualReview {
  const reason = "Notas e ritmo reaproveitados da revisão autorizada deste mesmo arquivo; sem nova leitura visual.";
  const segments = parseVisualMusicXml(match.musicXml).map((measure) => ({
    id: `visual-p${measure.partIndex}-m${measure.measureIndex}`, page: 1, partIndex: measure.partIndex,
    partId: measure.partId, measureIndex: measure.measureIndex, measure: measure.measure,
    status: "unknown" as const, reason
  }));
  return { version: 1, status: "skipped", sourceSHA256: match.reference.sourceSHA256, xmlSHA256: match.reference.xmlSHA256,
    reader: null, checkedMeasures: 0, unknownMeasures: segments.length, segments, proposals: [], limitations: [reason],
    diagnostics: [{ code: "NOTES_RHYTHM_REFERENCE_REUSED", message: reason }],
    accuracyVerified: false, trainingEligible: false, history: [] };
}

/** Private reuse of an authorized revision of the identical source bytes. This is not OMR or model training. */
export class NotesRhythmReferenceService {
  constructor(private storage = new FileStorageService(),
    private directory = path.join(paths.storageDir, "notes-rhythm-references")) {}

  async lookup(input: { sourcePath: string; ownerUserId: string; scoreType: ScoreType; scoreTypeSelected: boolean }): Promise<NotesRhythmReferenceLookup> {
    if (!input.scoreTypeSelected) return { match: null };
    const sourceSHA256 = digest(await fs.readFile(input.sourcePath));
    const filename = `${notesRhythmReferenceKey(input.ownerUserId, sourceSHA256, input.scoreType)}.json`;
    let handle: fs.FileHandle | undefined;
    try {
      // Parent is fixed application storage; entries and exported XML never follow symlinks.
      const directory = await fs.lstat(this.directory);
      if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error("Invalid reference directory");
      handle = await fs.open(path.join(this.directory, filename), constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 64 * 1024) throw new Error("Invalid reference manifest");
      const reference = notesRhythmReferenceSchema.parse(JSON.parse(await handle.readFile("utf8")));
      if (reference.ownerUserId !== input.ownerUserId || reference.sourceSHA256 !== sourceSHA256 || reference.scoreType !== input.scoreType) throw new Error("Reference identity mismatch");
      const buffer = await this.storage.readExportForDownload(reference.exportFilename);
      if (buffer.length > 4 * 1024 * 1024 || digest(buffer) !== reference.xmlSHA256) throw new Error("Reference export changed");
      const musicXml = buffer.toString("utf8");
      const coverage = inspectNotesRhythmReference(musicXml);
      return { match: { reference, musicXml, coverage } };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { match: null };
      return { match: null, diagnostic: "NOTES_RHYTHM_REFERENCE_INVALID" };
    } finally { await handle?.close(); }
  }
}
