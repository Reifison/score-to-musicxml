import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateEvents, ledgerEvents, readEvents } from '../evaluate-musicxml-reference.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/acervo-review');
const manifest = JSON.parse(await readFile(resolve(fixtureRoot, 'manifest.json'), 'utf8'));
const privateCorpusAvailable = Object.values(manifest.sourceLedgers)
  .every(reference => existsSync(resolve(repositoryRoot, reference.path)));
const corpusTest = privateCorpusAvailable ? test : test.skip;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function loadFixture(name) {
  const contents = await readFile(resolve(fixtureRoot, name), 'utf8');
  assert.equal(sha256(contents), manifest.excerpts[name], `fixture hash changed: ${name}`);
  return contents;
}

async function loadSourceLedger(name) {
  const reference = manifest.sourceLedgers[name];
  const contents = await readFile(resolve(repositoryRoot, reference.path), 'utf8');
  assert.equal(sha256(contents), reference.sha256, `sealed source ledger hash changed: ${reference.path}`);
  return JSON.parse(contents);
}

function laudemusLedger(ledger, pieceId, measures) {
  const piece = ledger.pieces.find(candidate => candidate.id === pieceId);
  assert.ok(piece, `missing Laudemus piece ${pieceId}`);
  const wanted = new Set(measures.map(String));
  const grouped = new Map();
  for (const event of piece.events.filter(candidate => wanted.has(String(candidate.measure)))) {
    const measure = String(event.measure);
    const pitch = event.pitch?.match(/^([A-G]):(-?\d+):(\d+)$/);
    const events = grouped.get(measure) ?? [];
    events.push({
      source_visual_status: event.sourceStatus,
      event: event.kind,
      voice: event.voice,
      onset_quarters: event.onset,
      duration_quarters: event.duration,
      candidate_grace: event.grace,
      step: pitch?.[1],
      alter_effective: pitch ? Number(pitch[2]) : undefined,
      octave: pitch ? Number(pitch[3]) : undefined,
    });
    grouped.set(measure, events);
  }
  return ledgerEvents({
    measures: [...grouped].map(([measure, events]) => ({ measure, partId: 'P1', events })),
  });
}

function folcloreLedger(ledger, pieceId, measures) {
  const piece = ledger.pieces.find(candidate => candidate.id === pieceId);
  assert.ok(piece, `missing Folclore piece ${pieceId}`);
  const wanted = new Set(measures.map(Number));
  return {
    measures: piece.measures.filter(measure => wanted.has(measure.measure)).map(measure => ({
      measure: String(measure.measure),
      partId: 'P1',
      events: measure.events.map(event => {
        const pitch = event.pitch?.match(/^([A-G])(\d+)$/);
        return {
          source_visual_status: event.source_visual_status,
          event: event.kind,
          voice: '1',
          onset_quarters: event.onsetQuarter,
          duration_quarters: event.durationQuarter,
          candidate_grace: false,
          step: pitch?.[1],
          alter_effective: event.kind === 'note' ? event.alter : undefined,
          octave: pitch ? Number(pitch[2]) : undefined,
        };
      }),
    })),
  };
}

function independentFolcloreEvents(ledger, pieceId, measures) {
  const piece = ledger.pieces.find(candidate => candidate.id === pieceId);
  assert.ok(piece, `missing independent Folclore piece ${pieceId}`);
  const wanted = new Set(measures.map(Number));
  return piece.measures.filter(measure => wanted.has(measure.measure)).flatMap(measure =>
    measure.events.map(event => {
      const pitch = event.pitch?.match(/^([A-G])(\d+)$/);
      return {
        part: 'P1',
        measure: String(measure.measure),
        voice: '1',
        kind: event.kind,
        pitch: event.kind === 'note' ? `${pitch[1]}:${event.alter}:${pitch[2]}` : null,
        onset: event.onsetQuarter,
        duration: event.durationQuarter,
        grace: false,
      };
    }),
  );
}

function sourceFolcloreEvents(ledger, pieceId, measures) {
  return ledgerEvents(folcloreLedger(ledger, pieceId, measures));
}

function remapMeasures(events, offset) {
  return events.map(event => ({ ...event, measure: String(Number(event.measure) + offset) }));
}

function atMeasure(events, measure) {
  return events.filter(event => event.measure === String(measure));
}

function semanticEvents(events) {
  return events.map(({ part, measure, voice, kind, pitch, onset, duration, grace }) =>
    ({ part, measure, voice, kind, pitch, onset, duration, grace }));
}

function assertExactEvents(expected, actual, context) {
  const result = evaluateEvents(expected, actual);
  assert.deepEqual(result.issues, [], context);
}

corpusTest('Laudemus: the original export has confirmed event deltas; the corrected V3 excerpts match both source readings', async () => {
  const [rootLedger, solLedger] = await Promise.all([
    loadSourceLedger('laudemusRoot'),
    loadSourceLedger('laudemusSol'),
  ]);
  assert.deepEqual(manifest.caseMappings.laudemus.originalMeasureToSource, {
    '6': 'broad local 3',
    '8': 'splendens local 2',
    '9': 'splendens local 3',
  });

  const rootBroad = laudemusLedger(rootLedger, 'laudemus-broad', ['3']);
  const solBroad = laudemusLedger(solLedger, 'laudemus-broad', ['3']);
  const rootSplendens = laudemusLedger(rootLedger, 'splendens', ['2', '3']);
  const solSplendens = laudemusLedger(solLedger, 'splendens', ['2', '3']);
  assert.deepEqual(semanticEvents(rootBroad), semanticEvents(solBroad));
  assert.deepEqual(semanticEvents(rootSplendens), semanticEvents(solSplendens));

  const original = readEvents(await loadFixture('laudemus-original-affected.xml'));
  const combinedExpected = [
    ...remapMeasures(rootBroad, 3),
    ...remapMeasures(rootSplendens, 6),
  ];

  const m6 = evaluateEvents(atMeasure(combinedExpected, 6), atMeasure(original, 6));
  assert.equal(m6.changed, 2);
  assert.equal(m6.missing, 0);
  assert.equal(m6.extra, 0);
  assert.deepEqual(m6.issues.map(issue => [issue.expected.pitch, issue.expected.onset, issue.expected.duration, issue.actual.onset, issue.actual.duration]), [
    ['G:0:4', 0.5, 0.5, 0.5, 1 / 3],
    ['A:0:4', 1, 1, 0.5 + 1 / 3, 2 / 3],
  ]);

  const m8 = evaluateEvents(atMeasure(combinedExpected, 8), atMeasure(original, 8));
  assert.equal(m8.missing, 1);
  assert.deepEqual(m8.issues.map(issue => issue.expected), [{
    part: 'P1', measure: '8', voice: '1', kind: 'note', pitch: 'C:0:4', staff: 1,
    onset: 2, duration: 2, grace: false,
  }]);

  const m9 = evaluateEvents(atMeasure(combinedExpected, 9), atMeasure(original, 9));
  assert.equal(m9.changed, 2);
  assert.deepEqual(m9.issues.map(issue => [issue.expected.pitch, issue.expected.onset, issue.expected.duration, issue.actual.onset, issue.actual.duration]), [
    ['E:0:4', 1, 1, 1, 2 / 3],
    ['F:0:4', 2, 2, 1 + 2 / 3, 4 / 3],
  ]);

  const broadV3 = readEvents(await loadFixture('laudemus-broad-v3-measure-3.xml'));
  const splendensV3 = readEvents(await loadFixture('laudemus-splendens-v3-measures-2-3.xml'));
  assertExactEvents(rootBroad, broadV3, 'corrected broad measure 3 differs from the source ledgers');
  assertExactEvents(rootSplendens, splendensV3, 'corrected splendens measures 2–3 differ from the source ledgers');
  assertExactEvents(solBroad, broadV3, 'corrected broad measure 3 differs from the independent source reading');
  assertExactEvents(solSplendens, splendensV3, 'corrected splendens measures 2–3 differ from the independent source reading');
});

corpusTest('Cravo: the old single-bar rest expands to seven source measures in V2, aligned by physical bar order', async () => {
  const [sourceV2, independent] = await Promise.all([
    loadSourceLedger('folcloreSolV2'),
    loadSourceLedger('folcloreSolIndependent'),
  ]);
  const measures = [10, 11, 12, 13, 14, 15, 16];
  const expected = sourceFolcloreEvents(sourceV2, 'cravo', measures);
  assert.deepEqual(semanticEvents(expected), independentFolcloreEvents(independent, 'cravo', measures));
  assert.equal(manifest.caseMappings.cravo.original.physicalMeasureOrdinal, 10);
  assert.equal(manifest.caseMappings.cravo.original.printedMeasureNumber, '9');
  assert.equal(manifest.caseMappings.cravo.corrected.logicalSourceMeasures.length, 7);

  const beforeXml = await loadFixture('cravo-original-single-multirest.xml');
  const afterXml = await loadFixture('cravo-v2-seven-rest-measures.xml');
  assert.match(beforeXml, /<multiple-rest>1<\/multiple-rest>/);
  assert.match(afterXml, /<multiple-rest>7<\/multiple-rest>/);

  const before = readEvents(beforeXml);
  const beforeResult = evaluateEvents(expected, before);
  assert.equal(before.length, 1);
  assert.equal(beforeResult.missing, 6);
  assert.equal(beforeResult.extra, 0);

  const after = readEvents(afterXml);
  assert.equal(after.length, 7);
  assert.equal(after.filter(event => event.kind === 'rest').length, 7);
  assertExactEvents(expected, after, 'Cravo V2 does not preserve one rest event in each logical measure 10–16');
});

corpusTest('Atirei: source-confirmed quarter rest at measure 16 is absent in the old export and present in V1', async () => {
  const [sourceV2, independent] = await Promise.all([
    loadSourceLedger('folcloreSolV2'),
    loadSourceLedger('folcloreSolIndependent'),
  ]);
  const expected = sourceFolcloreEvents(sourceV2, 'atirei', [16]);
  assert.deepEqual(semanticEvents(expected), independentFolcloreEvents(independent, 'atirei', [16]));

  const before = readEvents(await loadFixture('atirei-original-measure-16.xml'));
  const beforeResult = evaluateEvents(expected, before);
  assert.equal(beforeResult.missing, 1);
  assert.deepEqual(beforeResult.issues.map(issue => issue.expected), [{
    part: 'P1', measure: '16', voice: '1', kind: 'rest', pitch: null, staff: 1,
    onset: 3, duration: 1, grace: false,
  }]);

  const after = readEvents(await loadFixture('atirei-v1-measure-16.xml'));
  assertExactEvents(expected, after, 'Atirei V1 measure 16 differs from both source readings');
});

corpusTest('Atirei: five provisional F4 events stay uncertain even though the candidate uses natural F4', async () => {
  const [sourceV2, independent] = await Promise.all([
    loadSourceLedger('folcloreSolV2'),
    loadSourceLedger('folcloreSolIndependent'),
  ]);
  const sourcePiece = sourceV2.pieces.find(piece => piece.id === 'atirei');
  const uncertain = sourcePiece.measures
    .filter(measure => [8, 20].includes(measure.measure))
    .flatMap(measure => measure.events
      .filter(event => event.pitch === 'F4')
      .map(event => ({ measure: String(measure.measure), ...event })));
  assert.equal(uncertain.length, 5);
  assert.equal(manifest.caseMappings.atirei.uncertainF4EventCount, 5);
  assert.ok(uncertain.every(event => event.source_visual_status === 'uncertain' && event.alter === 0));

  const candidate = readEvents(await loadFixture('atirei-v1-provisional-f4-measures.xml'));
  const candidateNaturalFs = candidate.filter(event => event.kind === 'note' && event.pitch === 'F:0:4');
  assert.equal(candidateNaturalFs.length, 5);
  assert.deepEqual(
    candidateNaturalFs.map(event => [event.measure, event.onset, event.duration]),
    uncertain.map(event => [event.measure, event.onsetQuarter, event.durationQuarter]),
  );

  const independentRead = independentFolcloreEvents(independent, 'atirei', [8, 20])
    .filter(event => event.kind === 'note' && event.pitch === 'F:0:4');
  assert.equal(independentRead.length, 5);
  assert.throws(
    () => ledgerEvents(folcloreLedger(sourceV2, 'atirei', [8, 20])),
    /Evento sem confirmação visual/,
    'candidate agreement must not promote the V2 source uncertainty to a confirmed reference',
  );
});
