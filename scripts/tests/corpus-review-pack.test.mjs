import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { generateReviewPack } from '../corpus-review-pack.mjs';

const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

async function fixture() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'review-pack-test-'));
  const corpusRoot = path.join(rootDir, 'output/omr/corpus-partituras-2026-10-07');
  const resultsPath = path.join(rootDir, 'docs/validation/corpus-partituras-2026-10-07/results.json');
  const packRoot = path.join(corpusRoot, 'review-pack');
  await fs.mkdir(corpusRoot, { recursive: true });
  const files = new Map();
  async function artifact(relative, text) {
    const full = path.join(corpusRoot, relative);
    const bytes = Buffer.from(text);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, bytes);
    files.set(full, bytes);
    return { full, bytes };
  }

  const rawXml = await artifact('book-one/attempts/preview-01.musicxml', '<score-partwise><part id="P1"/></score-partwise>\n');
  const preparedXml = await artifact('prepared/preview.musicxml', '<score-partwise><part id="P1"><measure number="1"/></part></score-partwise>\n');
  const sameBasenameXml = await artifact('prepared-other/preview.musicxml', '<score-partwise><part id="P2"/></score-partwise>\n');
  const movementOne = await artifact('salvage/movement-a.musicxml', '<score-partwise><part id="A"/></score-partwise>\n');
  const movementTwo = await artifact('salvage/movement-b.musicxml', '<score-partwise><part id="B"/></score-partwise>\n');
  const sourceReviewed = await artifact('reviewed/corrected.musicxml', '<score-partwise><part id="P1"><note/></part></score-partwise>\n');
  const assetPrepared = await artifact('prepared-asset/preview.musicxml', '<score-partwise><part id="PHOTO"/></score-partwise>\n');
  const missingDigest = await artifact('prepared-missing-sha/preview.musicxml', '<score-partwise><part id="UNVERIFIED"/></score-partwise>\n');
  const approved = await artifact('approved/final.musicxml', '<score-partwise><part id="APPROVED"/></score-partwise>\n');
  const rawReportPath = path.join(corpusRoot, 'book-one/result.json');
  const rawReport = {
    workflow: 'raw-library-baseline-v2', source: 'Lutes/Book One.pdf', sourceSHA256: 'a'.repeat(64), physicalPages: 4,
    exports: [{ path: rawXml.full, sha256: sha(rawXml.bytes), pageMappingVerified: true, sourcePhysicalPages: [1, 3] }],
  };
  await fs.mkdir(path.dirname(rawReportPath), { recursive: true });
  await fs.writeFile(rawReportPath, JSON.stringify(rawReport));

  const results = {
    summary: { generatedAt: '2026-10-07T12:00:00.000Z' },
    cases: [
      { source: 'Lutes/Book One.pdf', sourceSHA256: 'a'.repeat(64), physicalPages: 4, baselineReport: rawReportPath, baselineFinished: true, baselineStatus: 'raw_exports_present' },
      { source: 'Lutes/Book Two.pdf', sourceSHA256: 'b'.repeat(64), physicalPages: 6, baselineReport: null, baselineFinished: false, baselineStatus: 'queued' },
      { source: 'Lutes/No Preview.pdf', sourceSHA256: 'c'.repeat(64), physicalPages: 1, baselineReport: null, baselineFinished: true, baselineStatus: 'no_export' },
    ],
    preparedReports: [{
      process: 'application_prepared_unit', source: '/Users/reifison/Downloads/partituras/Lutes/Book One.pdf', sourceSHA256: 'a'.repeat(64),
      outputPath: preparedXml.full, outputSHA256: sha(preparedXml.bytes), reportPath: path.join(corpusRoot, 'prepared/prepared-result.json'),
      coverage: { totalPages: 4, processedPages: [1, 2, 3, 4], missingPages: [2], excludedPages: [] }, reviewStatus: 'needs_review',
    }, {
      process: 'application_prepared_unit', source: '/Users/reifison/Downloads/partituras/Other/Book One.pdf', sourceSHA256: 'd'.repeat(64),
      outputPath: sameBasenameXml.full, outputSHA256: sha(sameBasenameXml.bytes), reportPath: path.join(corpusRoot, 'prepared-other/prepared-result.json'),
      coverage: { totalPages: 2, processedPages: [1, 2], missingPages: [] }, reviewStatus: 'needs_review',
    }, {
      process: 'application_prepared_unit', source: '/private/tmp/corpus/image-sources/asset.png', sourceSHA256: 'p'.repeat(64),
      preparedInput: { path: '/private/tmp/corpus/image-sources/asset.png', sha256: 'p'.repeat(64) },
      originalAsset: { path: '/Users/reifison/Downloads/partituras/Outras/Ensaio.HEIC', sha256: 'e'.repeat(64), format: 'HEIC' },
      outputPath: assetPrepared.full, outputSHA256: sha(assetPrepared.bytes), reportPath: path.join(corpusRoot, 'asset/prepared-result.json'),
    }, {
      process: 'application_prepared_unit', source: '/Users/reifison/Downloads/partituras/Lutes/Book One.pdf', sourceSHA256: 'a'.repeat(64),
      outputPath: missingDigest.full, reportPath: path.join(corpusRoot, 'missing-sha/prepared-result.json'),
    }],
    salvagedReports: [{
      process: 'native_selected_pages', source: 'Lutes/Book One.pdf', sourceSHA256: 'a'.repeat(64), physicalPages: 4,
      reusedPhysicalPages: [2, 3, 4], omittedPhysicalPages: [1], verifiedNonmusicalOmittedPages: [1], reportPath: path.join(corpusRoot, 'salvage/result.json'),
      exports: [
        { path: movementOne.full, sha256: sha(movementOne.bytes), movement: { title: 'Suite I/Prelude' }, pageMappingVerified: true, sourcePhysicalPages: [2] },
        { path: movementTwo.full, sha256: sha(movementTwo.bytes), movement: { title: 'Suite I/Fugue' }, pageMappingVerified: true, sourcePhysicalPages: [3, 4] },
      ],
    }],
    sourceReviews: [{
      process: 'source_assisted_copy', sourceSHA256: 'a'.repeat(64), outputPath: sourceReviewed.full,
      outputSHA256: sha(sourceReviewed.bytes), reportPath: path.join(corpusRoot, 'source-reviewed/result.json'), reviewStatus: 'needs_review',
    }],
    boundedReports: [{
      workflow: 'bounded-raw', source: 'Lutes/Book One.pdf', sourceSHA256: 'a'.repeat(64),
      exports: [{ path: approved.full, sha256: sha(approved.bytes), finalExportApproved: true }],
    }],
  };
  await fs.mkdir(path.dirname(resultsPath), { recursive: true });
  await fs.writeFile(resultsPath, `${JSON.stringify(results, null, 2)}\n`);
  return { rootDir, corpusRoot, resultsPath, packRoot, results, files, missingDigest };
}

test('copies every eligible method separately with readable, collision-resistant source names and safe review flags', async (t) => {
  const f = await fixture();
  t.after(() => fs.rm(f.rootDir, { recursive: true, force: true }));
  const beforeHashes = new Map([...f.files].map(([file, bytes]) => [file, sha(bytes)]));
  const legacySnapshots = ['snapshot-v1-legacy', 'snapshot-v2-legacy', 'snapshot-v3-legacy'];
  for (const name of legacySnapshots) {
    const legacyDir = path.join(f.packRoot, name);
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(path.join(legacyDir, 'preserved.txt'), name);
  }

  const result = await generateReviewPack({ rootDir: f.rootDir, resultsPath: f.resultsPath, packRoot: f.packRoot });
  const manifestPath = path.join(result.snapshotDir, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const copied = manifest.artifacts.filter((row) => row.artifactState === 'copied');
  assert.equal(copied.length, 7);
  assert.deepEqual(new Set(copied.map((row) => row.method)), new Set(['raw_baseline', 'prepared', 'native_selected_pages', 'source_reviewed']));
  assert.ok(copied.every((row) => row.reviewStatus === 'needs_review' && row.finalExportApproved === false && row.trainingEligible === false));
  assert.ok(copied.every((row) => row.copyPath && row.copyPath.startsWith('previews/')));
  assert.equal(new Set(copied.map((row) => row.copyPath)).size, copied.length);
  const bookOneNames = copied.filter((row) => path.basename(row.copyPath).startsWith('book-one--'));
  assert.ok(bookOneNames.some((row) => path.basename(row.copyPath).includes('--aaaaaaaa')));
  assert.ok(bookOneNames.some((row) => path.basename(row.copyPath).includes('--dddddddd')));

  const raw = copied.find((row) => row.method === 'raw_baseline');
  assert.deepEqual(raw.physicalPagesKnown, [1, 3]);
  assert.deepEqual(raw.physicalPagesMissing, [2, 4]);
  const prepared = copied.find((row) => row.method === 'prepared');
  assert.equal(prepared.physicalPageMappingVerified, false);
  assert.deepEqual(prepared.physicalPagesKnown, []);
  assert.deepEqual(prepared.physicalPagesReportedMissing, [2]);
  const movements = copied.filter((row) => row.method === 'native_selected_pages');
  assert.deepEqual(new Set(movements.map((row) => row.movement)), new Set(['Suite I/Prelude', 'Suite I/Fugue']));
  assert.ok(movements.every((row) => row.physicalPageMappingVerified));
  assert.ok(movements.every((row) => row.copyPath.includes('suite-i-prelude') || row.copyPath.includes('suite-i-fugue')));
  assert.ok(movements.every((row) => !row.physicalPagesMissing.includes(1)));
  assert.ok(movements.every((row) => row.physicalPagesVerifiedNonmusicalOmitted.includes(1)));

  const assetRow = copied.find((row) => row.originalAssetFormat === 'HEIC');
  assert.ok(assetRow);
  assert.equal(assetRow.sourceSHA, 'e'.repeat(64));
  assert.equal(assetRow.sourceDisplay, 'Outras/Ensaio.HEIC');
  assert.equal(assetRow.preparedInputSHA, 'p'.repeat(64));
  assert.notEqual(assetRow.sourceSHA, assetRow.preparedInputSHA);
  const sourceReviewedRow = copied.find((row) => row.method === 'source_reviewed');
  assert.equal(sourceReviewedRow.sourceDisplay, 'Lutes/Book One.pdf');

  const digestPending = manifest.artifacts.find((row) => row.originalPath === f.missingDigest.full);
  assert.equal(digestPending.artifactState, 'pending');
  assert.match(digestPending.pendingReason, /SHA-256 registrado da prévia ausente ou inválido/);
  assert.equal(digestPending.copyPath, null);

  const noPreview = manifest.pendingSources.find((row) => row.sourceSHA === 'c'.repeat(64));
  const queued = manifest.pendingSources.find((row) => row.sourceSHA === 'b'.repeat(64));
  assert.ok(noPreview && queued, 'sources without copies remain explicitly pending');
  assert.equal(manifest.excludedApprovedCount, 1);
  assert.equal(manifest.artifacts.find((row) => row.method === 'raw_baseline' && row.sourceSHA === 'a'.repeat(64) && row.reportPath === null), undefined);
  assert.ok(manifest.artifacts.some((row) => row.artifactState === 'excluded_approved'));

  for (const row of copied) {
    const sourcePath = row.originalPath;
    const copy = await fs.readFile(path.join(result.snapshotDir, row.copyPath));
    assert.equal(sha(copy), row.XMLSHA);
    assert.equal(sha(await fs.readFile(sourcePath)), beforeHashes.get(sourcePath));
  }
  const index = await fs.readFile(path.join(result.snapshotDir, 'index.md'), 'utf8');
  assert.match(index, /movimentos/);
  assert.match(index, /mapa físico não verificado/);
  assert.match(index, /gerado em 2026-10-07T12:00:00.000Z/);
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.packVersion, 4);
  assert.equal(manifest.artifactAttemptCount, manifest.artifacts.length);
  assert.equal(manifest.uniqueSourcesWithCopiedArtifacts, 3);
  assert.equal(manifest.nativeMetrics.attemptCount, 0);
  assert.match(manifest.runnerSHA256, /^[a-f0-9]{64}$/);
  assert.match(manifest.snapshot, /^snapshot-v4-/);
  const latest = JSON.parse(await fs.readFile(result.latestPath, 'utf8'));
  assert.equal(latest.schemaVersion, 3);
  assert.match(await fs.readFile(result.latestPath, 'utf8'), new RegExp(result.manifest.snapshot));
  for (const name of legacySnapshots) assert.equal(await fs.readFile(path.join(f.packRoot, name, 'preserved.txt'), 'utf8'), name);
});

test('source-reviewed event comparison does not verify OCR text, approve export, or enable training', async (t) => {
  const f = await fixture();
  t.after(() => fs.rm(f.rootDir, { recursive: true, force: true }));
  f.results.sourceReviews[0] = {
    ...f.results.sourceReviews[0],
    eventComparisonComplete: true,
    eventComparisonScope: '155 written events compared with a source-assisted reference.',
    referenceStatus: 'source_assisted_cross_reviewed_pending_human_approval',
    textReviewStatus: 'unverified_ocr_draft',
    textAccuracyVerified: false,
    remainingReview: ['OCR lyrics and chord symbols remain unverified.'],
  };
  f.results.preparedReports[0].textReviewStatus = 'unverified_ocr_draft';
  await fs.writeFile(f.resultsPath, `${JSON.stringify(f.results, null, 2)}\n`);

  const result = await generateReviewPack({ rootDir: f.rootDir, resultsPath: f.resultsPath, packRoot: f.packRoot });
  const manifest = JSON.parse(await fs.readFile(path.join(result.snapshotDir, 'manifest.json'), 'utf8'));
  const reviewed = manifest.artifacts.find((row) => row.method === 'source_reviewed');
  assert.ok(reviewed);
  assert.equal(reviewed.eventComparisonScope, '155 written events compared with a source-assisted reference.');
  assert.equal(reviewed.referenceStatus, 'source_assisted_cross_reviewed_pending_human_approval');
  assert.equal(reviewed.textReviewStatus, 'unverified_ocr_draft');
  assert.equal(reviewed.textAccuracyVerified, false);
  assert.deepEqual(reviewed.remainingReview, ['OCR lyrics and chord symbols remain unverified.']);
  assert.equal(reviewed.reviewStatus, 'needs_review');
  assert.equal(reviewed.finalExportApproved, false);
  assert.equal(reviewed.trainingEligible, false);

  const prepared = manifest.artifacts.find((row) => row.method === 'prepared');
  assert.equal(prepared.textReviewStatus, undefined, 'source-review metadata is scoped to source_reviewed artifacts');
  const index = await fs.readFile(path.join(result.snapshotDir, 'index.md'), 'utf8');
  const warning = 'Notas comparadas com referência assistida; letra/cifras OCR ainda não conferidas';
  assert.equal(index.split(warning).length - 1, 1, 'the OCR caveat is shown only for the source-reviewed artifact');
  assert.match(index, /source_reviewed \/ corrected[\s\S]*Notas comparadas com referência assistida; letra\/cifras OCR ainda não conferidas/);
});

test('includes native score exports with valid identity while separating operation outcome, candidate status, attempts, and unique sources', async (t) => {
  const f = await fixture();
  t.after(() => fs.rm(f.rootDir, { recursive: true, force: true }));
  async function nativePreview(relative, xml) {
    const full = path.join(f.corpusRoot, relative);
    const bytes = Buffer.from(xml);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, bytes);
    return { path: full, sha256: sha(bytes) };
  }
  const partialPreview = await nativePreview('native-exports/mscz-attempt-0001/preview.musicxml', '<score-partwise><part id="partial"/></score-partwise>\n');
  const successPreview = await nativePreview('native-exports/mscz-attempt-0002/preview.musicxml', '<score-partwise><part id="success"/></score-partwise>\n');
  const gpxPreview = await nativePreview('native-exports/gpx-attempt-0001/preview.musicxml', '<score-partwise><part id="gpx"/></score-partwise>\n');
  const invalidIdentityPreview = await nativePreview('native-exports/invalid-source-hash/preview.musicxml', '<score-partwise><part id="invalid-source"/></score-partwise>\n');
  const invalidPreviewDigest = await nativePreview('native-exports/invalid-preview-hash/preview.musicxml', '<score-partwise><part id="invalid-preview"/></score-partwise>\n');
  const nativeReports = [
    { process: 'native_score_export', source: 'Native/Concert.mscz', sourceSHA256: 'f'.repeat(64), sourceFormat: '.mscz', method: 'musescore_native_export', reportPath: path.join(f.corpusRoot, 'native-exports/mscz-attempt-0001/result.json'), operationalOutcome: 'engine_failed', status: 'raw_partial_candidate_needs_review', referenceStatus: 'candidate_reference', independentReference: false, exports: [{ ...partialPreview, reviewStatus: 'needs_review', pageMappingVerified: false }] },
    { process: 'native_score_export', source: 'Native/Concert.mscz', sourceSHA256: 'f'.repeat(64), sourceFormat: '.mscz', method: 'musescore_native_export', reportPath: path.join(f.corpusRoot, 'native-exports/mscz-attempt-0002/result.json'), operationalOutcome: 'success', status: 'candidate_present', referenceStatus: 'candidate_reference', independentReference: false, exports: [{ ...successPreview, reviewStatus: 'needs_review', pageMappingVerified: false }] },
    { process: 'native_score_export', source: 'Native/Concert.mscz', sourceSHA256: 'f'.repeat(64), sourceFormat: '.mscz', method: 'musescore_native_export', reportPath: path.join(f.corpusRoot, 'native-exports/mscz-attempt-0003/result.json'), operationalOutcome: 'engine_failed', status: 'no_candidate', exports: [] },
    { process: 'native_score_export', source: 'Native/Arrangement.gpx', sourceSHA256: '9'.repeat(64), sourceFormat: '.gpx', method: 'musescore_native_export', reportPath: path.join(f.corpusRoot, 'native-exports/gpx-attempt-0001/result.json'), operationalOutcome: 'success', status: 'candidate_present', exports: [{ ...gpxPreview, reviewStatus: 'needs_review', pageMappingVerified: false }] },
    { process: 'native_score_export', source: 'Native/InvalidIdentity.mscz', sourceSHA256: 'not-a-sha256', sourceFormat: '.mscz', method: 'musescore_native_export', reportPath: path.join(f.corpusRoot, 'native-exports/invalid-source-hash/result.json'), operationalOutcome: 'success', status: 'candidate_present', exports: [{ ...invalidIdentityPreview, reviewStatus: 'needs_review', pageMappingVerified: false }] },
    { process: 'native_score_export', source: 'Native/InvalidPreviewHash.mscz', sourceSHA256: '8'.repeat(64), sourceFormat: '.mscz', method: 'musescore_native_export', reportPath: path.join(f.corpusRoot, 'native-exports/invalid-preview-hash/result.json'), operationalOutcome: 'success', status: 'candidate_present', exports: [{ path: invalidPreviewDigest.path, sha256: 'missing-digest', reviewStatus: 'needs_review', pageMappingVerified: false }] },
  ];
  f.results.nativeReports = nativeReports;
  await fs.writeFile(f.resultsPath, `${JSON.stringify(f.results, null, 2)}\n`);

  const result = await generateReviewPack({ rootDir: f.rootDir, resultsPath: f.resultsPath, packRoot: f.packRoot });
  const manifest = JSON.parse(await fs.readFile(path.join(result.snapshotDir, 'manifest.json'), 'utf8'));
  const nativeArtifacts = manifest.artifacts.filter((row) => row.sourceKind === 'native_score_input');
  const copiedNative = nativeArtifacts.filter((row) => row.artifactState === 'copied');
  assert.equal(copiedNative.length, 3);
  assert.ok(copiedNative.every((row) => row.reviewStatus === 'needs_review' && row.finalExportApproved === false && row.trainingEligible === false));
  assert.ok(copiedNative.every((row) => row.isGoldReference === false && row.referenceIndependence === 'unknown'));
  assert.ok(copiedNative.every((row) => row.sourceIdentity.hashStatus === 'valid_sha256_format_only' && /^[a-f0-9]{64}$/.test(row.sourceIdentity.sha256)));
  assert.ok(copiedNative.every((row) => row.physicalPageMappingVerified === false && row.physicalPageCountKnown === null && row.physicalPagesKnown.length === 0));
  assert.deepEqual(new Set(copiedNative.map((row) => row.sourceFormat)), new Set(['.mscz', '.gpx']));
  const partial = copiedNative.find((row) => row.attemptStatus === 'raw_partial_candidate_needs_review');
  assert.ok(partial);
  assert.equal(partial.operationalOutcome, 'engine_failed');
  assert.equal(partial.method, 'musescore_native_export');
  assert.equal(partial.sourceDisplay, 'Native/Concert.mscz');

  const rejectedIdentity = manifest.nativeReports.find((row) => row.identity.sourceDisplay === 'Native/InvalidIdentity.mscz');
  assert.equal(rejectedIdentity.identity.sourceSHA256, null);
  assert.equal(rejectedIdentity.identity.hashStatus, 'invalid_or_missing');
  assert.equal(rejectedIdentity.candidateExportsExcludedForInvalidSourceHash, 1);
  assert.equal(nativeArtifacts.some((row) => row.sourceDisplay === 'Native/InvalidIdentity.mscz'), false);
  const invalidDigest = nativeArtifacts.find((row) => row.sourceDisplay === 'Native/InvalidPreviewHash.mscz');
  assert.equal(invalidDigest.artifactState, 'pending');
  assert.match(invalidDigest.pendingReason, /SHA-256 registrado da prévia ausente ou inválido/);
  assert.equal(invalidDigest.copyPath, null);

  assert.deepEqual(manifest.nativeMetrics, {
    attemptCount: 6,
    operationalOutcomeCounts: { engine_failed: 2, success: 4 },
    candidateStatusCounts: { raw_partial_candidate_needs_review: 1, no_candidate: 1, candidate_present: 4 },
    operationalSuccessAttemptCount: 4,
    rawPartialCandidateNeedsReviewAttemptCount: 1,
    uniqueSourceCountWithValidSHA256: 3,
    attemptsWithCopiedCandidate: 3,
    uniqueSourcesWithCopiedCandidate: 2,
    copiedCandidateExportCount: 3,
    distinctCopiedXMLSHA256Count: 3,
    pendingCandidateExportCount: 1,
    reportsWithInvalidSourceSHA256: 1,
    candidateExportRecordsExcludedForInvalidSourceHash: 1,
  });
  assert.ok(manifest.nativeReports.every((row) => row.reviewStatus === 'needs_review' && row.finalExportApproved === false && row.trainingEligible === false && row.referenceIndependence === 'unknown' && row.isGoldReference === false));
  assert.ok(manifest.nativeReports.every((row) => row.identity.sourceSHA256 === null || /^[a-f0-9]{64}$/.test(row.identity.sourceSHA256)));
  const index = await fs.readFile(path.join(result.snapshotDir, 'index.md'), 'utf8');
  assert.match(index, /Sucessos operacionais nativos: 4/);
  assert.match(index, /Tentativas nativas com candidato parcial para revisão: 1/);
  assert.match(index, /independência da referência é desconhecida/);
  assert.match(index, /sem mapeamento físico de PDF/);
  assert.match(index, /não PDFs/);
});

test('refuses to overwrite an immutable snapshot when the source preview changes under the same results hash', async (t) => {
  const f = await fixture();
  t.after(() => fs.rm(f.rootDir, { recursive: true, force: true }));
  const first = await generateReviewPack({ rootDir: f.rootDir, resultsPath: f.resultsPath, packRoot: f.packRoot });
  const firstManifest = await fs.readFile(path.join(first.snapshotDir, 'manifest.json'));
  const xml = [...f.files.keys()].find((file) => file.endsWith('preview-01.musicxml'));
  await fs.writeFile(xml, '<score-partwise><changed/></score-partwise>\n');
  await assert.rejects(generateReviewPack({ rootDir: f.rootDir, resultsPath: f.resultsPath, packRoot: f.packRoot }), /Snapshot existente difere do plano/);
  assert.deepEqual(await fs.readFile(path.join(first.snapshotDir, 'manifest.json')), firstManifest);
});
