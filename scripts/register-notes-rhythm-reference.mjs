#!/usr/bin/env node
// Administrative opt-in for a specific, already published revision. Dry-run by default.
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const match = /^--([a-z-]+)=(.+)$/.exec(arg);
  if (!match) throw new Error('Arguments must use --key=value');
  return [match[1], match[2]];
}));
const allowed = ['api-root', 'score-id', 'expected-revision', 'expected-source-sha', 'expected-xml-sha', 'authorization', 'apply'];
if (Object.keys(args).some(key => !allowed.includes(key))) throw new Error('Unknown argument');
for (const key of ['score-id', 'expected-revision', 'expected-source-sha', 'expected-xml-sha', 'authorization']) {
  if (!args[key]) throw new Error(`Missing --${key}`);
}
if (args.authorization !== 'explicit-owner-request' || (args.apply && args.apply !== 'true')) throw new Error('Explicit owner authorization required');
const apiRoot = path.resolve(args['api-root'] ?? '/app/apps/api');
const require = createRequire(path.join(apiRoot, 'package.json'));
const { PrismaClient } = require('@prisma/client');
const load = relative => import(pathToFileURL(path.join(apiRoot, 'dist', relative)).href);
const [{ paths }, { FileStorageService }, { MidiExportService }, { reviewRevision }, referenceModule] = await Promise.all([
  load('config/env.js'), load('services/FileStorageService.js'), load('services/MidiExportService.js'),
  load('services/MusicalReview.js'), load('services/NotesRhythmReferenceService.js')
]);
const { notesRhythmReferenceSchema, notesRhythmReferenceKey, inspectNotesRhythmReference, isCurrentNotesRhythmReference } = referenceModule;
const sha = value => createHash('sha256').update(value).digest('hex');
const check = (condition, message) => { if (!condition) throw new Error(message); };
const db = new PrismaClient();
const storage = new FileStorageService();
let createdPath;
try {
  const score = await db.score.findUnique({ where: { id: args['score-id'] } });
  check(score && !score.deletedAt && score.musicxmlFilename, 'Published score unavailable');
  const xmlBytes = await storage.readExportForDownload(score.musicxmlFilename);
  const musicXml = xmlBytes.toString('utf8');
  const sourceBytes = await fs.readFile(storage.resolveUploadPath(score.storedFilename));
  check(sha(xmlBytes) === args['expected-xml-sha'], 'Published XML changed');
  check(sha(sourceBytes) === args['expected-source-sha'], 'Source changed');
  check(reviewRevision(score.musicxmlFilename, musicXml) === args['expected-revision'] && score.reviewRevision === args['expected-revision'], 'Published revision changed');
  const coverage = inspectNotesRhythmReference(musicXml);
  check(score.coverage?.totalPages === 1 && score.coverage?.processedPages?.join(',') === '1'
    && score.coverage?.missingPages?.length === 0 && !score.coverage?.uncertainPages?.length, 'Only a complete single-page review is supported');
  const reference = notesRhythmReferenceSchema.parse({ version: 1, scope: 'notes_rhythm', ownerUserId: score.userId,
    sourceSHA256: sha(sourceBytes), scoreType: score.scoreType, totalPages: 1, sourceScoreId: score.id,
    sourceReviewRevision: score.reviewRevision, exportFilename: score.musicxmlFilename, xmlSHA256: sha(xmlBytes),
    referenceKind: 'assisted_visual_revision', authorization: { kind: 'explicit_user_request', actorUserId: score.userId,
      recordedAt: new Date().toISOString() }, accuracyVerified: false, trainingEligible: false });
  check(isCurrentNotesRhythmReference(reference, score), 'Score is not an available, approved and MIDI-validated reference');
  const midi = await new MidiExportService().inspect(musicXml);
  check(midi.status === 'passed' && midi.xmlSHA256 === reference.xmlSHA256, 'Fresh MIDI check failed');
  const key = notesRhythmReferenceKey(score.userId, reference.sourceSHA256, score.scoreType);
  const directory = path.join(paths.storageDir, 'notes-rhythm-references');
  const filename = path.join(directory, `${key}.json`);
  let alreadyRegistered = false;
  try {
    const stat = await fs.lstat(directory);
    check(stat.isDirectory() && !stat.isSymbolicLink(), 'Invalid registry directory');
    const handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const entryStat = await handle.stat();
      check(entryStat.isFile() && entryStat.size <= 65536, 'Invalid existing entry');
      const existing = notesRhythmReferenceSchema.parse(JSON.parse(await handle.readFile('utf8')));
      check(JSON.stringify({ ...existing, authorization: { ...existing.authorization, recordedAt: reference.authorization.recordedAt } }) === JSON.stringify(reference),
        'Another revision is registered; explicit replacement is required');
      alreadyRegistered = true;
    } finally { await handle.close(); }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (args.apply === 'true' && !alreadyRegistered) {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(directory);
    check(stat.isDirectory() && !stat.isSymbolicLink(), 'Invalid registry directory');
    const handle = await fs.open(filename, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    createdPath = filename;
    try { await handle.writeFile(JSON.stringify(reference, null, 2) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    await db.auditLog.create({ data: { actorId: null, action: 'score_reviewed', entity: 'score', entityId: score.id,
      metadata: { operation: 'notes_rhythm_reference_registered', registryKey: key, sourceSHA256: reference.sourceSHA256,
        referenceRevision: reference.sourceReviewRevision, referenceXmlSHA256: reference.xmlSHA256,
        authorization: reference.authorization, scope: 'notes_rhythm', accuracyVerified: false, trainingEligible: false } } });
    createdPath = undefined;
  }
  console.log(JSON.stringify({ mode: args.apply === 'true' ? 'registered' : 'validated_dry_run', alreadyRegistered,
    scoreId: score.id, registryKey: key, xmlSHA256: reference.xmlSHA256, sourceSHA256: reference.sourceSHA256,
    referenceRevision: reference.sourceReviewRevision, pages: coverage.totalPages, midiStatus: midi.status,
    scope: reference.scope, accuracyVerified: false, trainingEligible: false }, null, 2));
} catch (error) {
  if (createdPath) await fs.unlink(createdPath).catch(() => undefined);
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
} finally { await db.$disconnect(); }
