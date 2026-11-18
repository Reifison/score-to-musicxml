import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  assertExactArchiveEntries,
  assertSha256,
  revalidatePdfDecision,
  selectPackageItems,
} from '../acervo-approved-pack.mjs';
import { decideApproval } from '../lib/acervo-approval.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const xml = '<score-partwise><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note></measure></part></score-partwise>';
const event = { part: 'P1', measure: '1', voice: '1', staff: 1, kind: 'note', pitch: 'C:0:4', onset: 0, duration: 1, grace: false, sourceStatus: 'confirmed' };

function pendingDecision(pieceId, overrides = {}) {
  return {
    pieceId,
    scope: 'written_events',
    decision: 'withheld',
    approvedForFinalDelivery: false,
    approvedForTraining: false,
    requestPath: `approvals/${pieceId}.request.json`,
    requestSha256: 'c'.repeat(64),
    candidatePath: `output/${pieceId}.musicxml`,
    candidateSha256: 'b'.repeat(64),
    sourceSha256: 'a'.repeat(64),
    scopeDescription: `Leitura pendente de ${pieceId}`,
    reasons: ['SOURCE_AMBIGUITY'],
    ...overrides,
  };
}

function packageQueue(pendingItems = [pendingDecision('atirei')]) {
  const approved = { pieceId: 'complete-piece', scope: 'complete_edition', decision: 'approved', approvedForFinalDelivery: true, approvedForTraining: false, humanHomologation: false };
  const writtenOnly = { pieceId: 'events-only', scope: 'written_events', decision: 'approved', approvedForFinalDelivery: false, approvedForTraining: false, humanHomologation: false };
  const native = { source: 'native.mscz', decision: 'approved', scope: 'native_written_events', pdfApproved: false, approvedForFinalDelivery: false, approvedForTraining: false, humanHomologation: false, scoreOutOf10: null };
  return { summary: { nativeExportsEventsApproved: 1 }, pdfSources: [{ source: 'source.pdf', sourceSha256: 'a'.repeat(64), reviewedPieces: [approved, writtenOnly, ...pendingItems] }], nativeExportDecisions: [native] };
}

function gateFixture({ uncertain = false } = {}) {
  const source = Buffer.from('source pdf bytes');
  const candidate = Buffer.from(xml);
  const reviewer = reviewerId => ({
    reviewer: { id: reviewerId, kind: 'ai_assisted', sourceOnly: true, candidateConsultedBeforeReading: false, otherReferenceConsulted: false },
    source: { sha256: sha(source) },
    coverage: { allPages: true, allPieces: true, allWrittenParts: true, allMeasures: true, musicPages: [1] },
    uncertainties: [],
    pieces: [{ id: 'piece', measures: ['1'], events: [structuredClone(event)], musicStructure: { time: [4, 4] }, musicStructureStatus: 'confirmed', textStatus: 'confirmed' }],
  });
  const a = reviewer('reviewer-a');
  const b = reviewer('reviewer-b');
  if (uncertain) b.pieces[0].events[0].sourceStatus = 'uncertain';
  const files = new Map([
    ['source', source], ['candidate', candidate],
    ['ref-a', Buffer.from(JSON.stringify(a))], ['ref-b', Buffer.from(JSON.stringify(b))],
    ['candidate-review-a', Buffer.from(JSON.stringify({ reviewerId: 'reviewer-a', status: 'confirmed' }))],
    ['candidate-review-b', Buffer.from(JSON.stringify({ reviewerId: 'reviewer-b', status: 'confirmed' }))],
  ]);
  const read = async filePath => {
    if (!files.has(filePath)) throw new Error(`Missing fixture: ${filePath}`);
    return files.get(filePath);
  };
  const request = {
    source: { path: 'source', sha256: sha(source), pieceIds: ['piece'], musicPages: [1] },
    candidate: { path: 'candidate', sha256: sha(candidate) },
    pieceId: 'piece', scope: 'complete_edition',
    references: ['ref-a', 'ref-b'].map(filePath => ({ path: filePath, sha256: sha(files.get(filePath)) })),
    candidateMusicReviews: ['reviewer-a', 'reviewer-b'].map((reviewerId, index) => {
      const filePath = `candidate-review-${index === 0 ? 'a' : 'b'}`;
      return { reviewerId, path: filePath, proofSha256: sha(files.get(filePath)), status: 'confirmed', candidateSha256: sha(candidate), sourceSha256: sha(source) };
    }),
    candidateTextReviews: ['reviewer-a', 'reviewer-b'].map((reviewerId, index) => {
      const filePath = `candidate-review-${index === 0 ? 'a' : 'b'}`;
      return { reviewerId, path: filePath, proofSha256: sha(files.get(filePath)), status: 'confirmed', candidateSha256: sha(candidate), sourceSha256: sha(source) };
    }),
  };
  const requestBytes = Buffer.from(JSON.stringify(request));
  const filesWithMeta = new Map(files);
  filesWithMeta.set('test.request.json', requestBytes);
  return { files: filesWithMeta, read: async filePath => {
    if (!filesWithMeta.has(filePath)) throw new Error(`Missing fixture: ${filePath}`);
    return filesWithMeta.get(filePath);
  }, request, requestBytes };
}

test('only complete edition decisions enter the score group; other scopes stay out', () => {
  const groups = selectPackageItems(packageQueue());
  assert.deepEqual(groups.approved.map(item => item.pieceId), ['complete-piece']);
  assert.deepEqual(groups.native.map(item => item.source), ['native.mscz']);
  assert.deepEqual(groups.pending.map(item => item.pieceId), ['atirei']);
});

test('zero and multiple verified pending decisions are accepted', () => {
  assert.deepEqual(selectPackageItems(packageQueue([])).pending, []);
  const multiple = selectPackageItems(packageQueue([pendingDecision('piece-a'), pendingDecision('piece-b')]));
  assert.deepEqual(multiple.pending.map(item => item.pieceId), ['piece-a', 'piece-b']);
});

test('withheld entries without a request hash and candidate binding are excluded', () => {
  const unbound = pendingDecision('unbound', { requestPath: null, requestSha256: null, candidatePath: 'output/unbound.musicxml' });
  const groups = selectPackageItems(packageQueue([unbound]));
  assert.deepEqual(groups.pending, []);
  assert.deepEqual(groups.pendingExcluded.map(item => item.reason), ['pending_candidate_without_verified_request_binding']);
});

test('scope contradictions and a final-delivery claim on native events fail closed', () => {
  const queue = packageQueue();
  queue.nativeExportDecisions[0].approvedForFinalDelivery = true;
  assert.throws(() => selectPackageItems(queue), /Escopo de aprovação nativa inconsistente/);
  const queue2 = packageQueue();
  queue2.pdfSources[0].reviewedPieces[0].approvedForFinalDelivery = false;
  assert.throws(() => selectPackageItems(queue2), /Decisão PDF inconsistente/);
});

test('candidate or proof bytes with a changed hash are rejected', () => {
  assert.throws(() => assertSha256(Buffer.from('changed'), sha('expected'), 'candidato'), /SHA-256 divergente/);
  assert.equal(assertSha256(Buffer.from('same'), sha('same')), sha('same'));
});

test('fresh approval revalidation rejects a source reference that became uncertain', async () => {
  const fixture = gateFixture();
  const approved = await decideApproval(fixture.request, fixture.read);
  assert.equal(approved.decision, 'approved');
  const decisionPath = 'test.decision.json';
  fixture.files.set(decisionPath, Buffer.from(JSON.stringify(approved)));
  const queueDecision = {
    ...approved,
    requestPath: 'test.request.json',
    requestSha256: sha(fixture.requestBytes),
    candidatePath: 'candidate',
  };
  const changedReference = JSON.parse(fixture.files.get('ref-b').toString('utf8'));
  changedReference.pieces[0].events[0].sourceStatus = 'uncertain';
  fixture.files.set('ref-b', Buffer.from(JSON.stringify(changedReference)));
  await assert.rejects(() => revalidatePdfDecision(queueDecision, fixture), /Revalidação atual diverge/);
});

test('approved revalidation hashes every applicable candidate review proof and rejects a post-queue change', async () => {
  const fixture = gateFixture();
  const approved = await decideApproval(fixture.request, fixture.read);
  assert.equal(approved.decision, 'approved');
  const decisionPath = 'test.decision.json';
  fixture.files.set(decisionPath, Buffer.from(JSON.stringify(approved)));
  const queueDecision = {
    ...approved,
    requestPath: 'test.request.json',
    requestSha256: sha(fixture.requestBytes),
    candidatePath: 'candidate',
  };

  const verified = await revalidatePdfDecision(queueDecision, fixture);
  assert.equal(verified.candidateReviewProofs.length, 4);
  assert.deepEqual(verified.candidateReviewProofs.map(row => row.field), [
    'candidateMusicReviews', 'candidateMusicReviews', 'candidateTextReviews', 'candidateTextReviews',
  ]);

  fixture.files.set('candidate-review-a', Buffer.from('changed after queue creation'));
  await assert.rejects(() => revalidatePdfDecision(queueDecision, fixture), /parecer musical reviewer-a: SHA-256 divergente/);
});

test('approved revalidation fails closed when an applicable review proof path or hash is missing', async () => {
  const fixture = gateFixture();
  fixture.request.candidateTextReviews[0].proofSha256 = undefined;
  const requestBytes = Buffer.from(JSON.stringify(fixture.request));
  fixture.files.set('test.request.json', requestBytes);
  const approved = await decideApproval(fixture.request, fixture.read);
  assert.equal(approved.decision, 'approved');
  fixture.files.set('test.decision.json', Buffer.from(JSON.stringify(approved)));
  const queueDecision = {
    ...approved,
    requestPath: 'test.request.json',
    requestSha256: sha(requestBytes),
    candidatePath: 'candidate',
  };
  await assert.rejects(() => revalidatePdfDecision(queueDecision, fixture), /parecer textual sem caminho ou proofSha256/);
});

test('a queue decision marked withheld cannot be revalidated and packaged as approved', async () => {
  const fixture = gateFixture();
  const current = await decideApproval(fixture.request, fixture.read);
  const withheld = { ...current, decision: 'withheld', approvedForFinalDelivery: false, reasons: ['MANUAL_HOLD'] };
  fixture.files.set('test.decision.json', Buffer.from(JSON.stringify(withheld)));
  const queueDecision = {
    ...withheld,
    requestPath: 'test.request.json',
    requestSha256: sha(fixture.requestBytes),
    candidatePath: 'candidate',
  };
  await assert.rejects(() => revalidatePdfDecision(queueDecision, fixture), /Revalidação atual diverge/);
});

test('a ZIP with an extra entry is rejected even when required members exist', () => {
  assert.throws(() => assertExactArchiveEntries(['README.md', 'manifest.json', 'extra.txt'], ['README.md', 'manifest.json']), /extras: extra.txt/);
  assert.equal(assertExactArchiveEntries(['b', 'a'], ['a', 'b']), true);
});
