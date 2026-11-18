import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { evaluateEvents, ledgerEvents, readEvents } from '../evaluate-musicxml-reference.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/acervo-review/purcell');
const manifest = JSON.parse(await readFile(resolve(fixtureRoot, 'manifest.json'), 'utf8'));
const corpusTest = Object.values(manifest.sourceLedgers)
  .every(reference => existsSync(resolve(repositoryRoot, reference.path))) ? test : test.skip;

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function loadFixture(name) {
  const bytes = await readFile(resolve(fixtureRoot, name));
  assert.equal(sha256(bytes), manifest.fixtures[name].sha256, `Purcell fixture hash changed: ${name}`);
  return bytes.toString('utf8');
}

async function loadSourceLedger(key) {
  const reference = manifest.sourceLedgers[key];
  const bytes = await readFile(resolve(repositoryRoot, reference.path));
  assert.equal(sha256(bytes), reference.sha256, `sealed Purcell source ledger hash changed: ${reference.path}`);
  const ledger = JSON.parse(bytes.toString('utf8'));
  const sourceHash = key === 'a' ? ledger.source.pdfSha256 : ledger.source.sha256;
  assert.equal(sourceHash, manifest.sourcePdf.sha256, `ledger ${key} is bound to a different PDF`);
  return ledger;
}

function parseEncodedPitch(value) {
  const match = /^([A-G])(-?\d+)$/.exec(value ?? '');
  assert.ok(match, `unsupported encoded pitch in sealed Purcell ledger: ${value}`);
  return { step: match[1], octave: Number(match[2]) };
}

function expectedFromLedgerA(ledger, wantedMeasures) {
  const wanted = new Set(wantedMeasures);
  const measures = ledger.measures.filter(row => wanted.has(row.measure)).map(row => ({
    measure: String(row.measure),
    partId: 'P1',
    events: row.events.map(event => {
      const pitch = event.kind === 'note' ? parseEncodedPitch(event.octave8SoundingPitch) : null;
      return {
        source_visual_status: event.sourceVisualStatus,
        event: event.kind,
        voice: String(event.voice),
        onset_quarters: event.onsetQuarter,
        duration_quarters: event.durationQuarter,
        candidate_grace: false,
        staff: event.staff ?? row.staff ?? 1,
        step: pitch?.step,
        alter_effective: event.kind === 'note' ? event.effectiveAlter : undefined,
        octave: pitch?.octave,
      };
    }),
  }));
  assert.equal(measures.length, wanted.size, 'ledger A did not cover every requested measure');
  return ledgerEvents({ measures });
}

function expectedFromLedgerB(ledger, wantedMeasures) {
  const wanted = new Set(wantedMeasures);
  const measures = ledger.measures.filter(row => wanted.has(row.measure));
  assert.equal(measures.length, wanted.size, 'ledger B did not cover every requested measure');
  return measures.flatMap(row => row.events.map(event => {
    assert.ok(['clear', 'confirmed'].includes(event.sourceVisualStatus), `ledger B event is not source-confirmed in measure ${row.measure}`);
    const pitch = event.kind === 'note' ? parseEncodedPitch(event.effectivePitchWithClef8Below) : null;
    return {
      part: event.part ?? row.part ?? 'P1',
      measure: String(row.measure),
      voice: String(event.voice),
      kind: event.kind,
      pitch: pitch ? `${pitch.step}:${event.alter}:${pitch.octave}` : null,
      staff: event.staff ?? 1,
      onset: event.onsetQuarter,
      duration: event.durationQuarter,
      grace: false,
    };
  }));
}

function sorted(events) {
  return [...events].sort((a, b) => Number(a.measure) - Number(b.measure) || a.onset - b.onset || a.voice.localeCompare(b.voice));
}

function childText(parent, tag) {
  const child = Array.from(parent.childNodes).find(node => node.nodeType === 1 && node.localName === tag);
  return child?.textContent;
}

function firstClef(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const clef = doc.getElementsByTagName('clef')[0];
  assert.ok(clef, 'MusicXML excerpt has no clef');
  return {
    sign: childText(clef, 'sign'),
    line: Number(childText(clef, 'line')),
    octaveChange: childText(clef, 'clef-octave-change') === undefined ? null : Number(childText(clef, 'clef-octave-change')),
  };
}

function lastMetronomeAtMeasure(xml, measureNumber) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const measure = Array.from(doc.getElementsByTagName('measure')).find(row => row.getAttribute('number') === String(measureNumber));
  assert.ok(measure, `missing MusicXML measure ${measureNumber}`);
  const marks = Array.from(measure.getElementsByTagName('metronome'));
  assert.ok(marks.length, `missing metronome mark in measure ${measureNumber}`);
  return marks.at(-1);
}

function assertNoEventIssues(expected, actual, label) {
  const result = evaluateEvents(expected, actual);
  assert.deepEqual(result.issues, [], label);
  return result;
}

corpusTest('Purcell m1: graphical D4 under G8 requires pitch D3; the old normal-G D4 reading differs and V1 matches', async () => {
  const [ledgerA, ledgerB, originalXml, v1Xml] = await Promise.all([
    loadSourceLedger('a'),
    loadSourceLedger('b'),
    loadFixture('original-m1-m39.xml'),
    loadFixture('v1-m1-m40.xml'),
  ]);
  const expectedA = expectedFromLedgerA(ledgerA, [1]);
  const expectedB = expectedFromLedgerB(ledgerB, [1]);
  assert.deepEqual(sorted(expectedA), sorted(expectedB), 'the two corrected source ledgers disagree on measure 1');
  assert.deepEqual(expectedA.map(event => event.pitch), ['D:0:3', 'D:0:3', 'C:0:3']);

  const originalClef = firstClef(originalXml);
  const v1Clef = firstClef(v1Xml);
  assert.deepEqual(originalClef, { sign: 'G', line: 2, octaveChange: null });
  assert.deepEqual(v1Clef, { sign: 'G', line: 2, octaveChange: -1 });

  const original = readEvents(originalXml, { includeStaff: true }).filter(event => event.measure === '1');
  const v1 = readEvents(v1Xml, { includeStaff: true }).filter(event => event.measure === '1');
  const oldResult = evaluateEvents(expectedA, original);
  assert.equal(oldResult.changed, 3);
  assert.equal(oldResult.missing, 0);
  assert.equal(oldResult.extra, 0);
  assert.deepEqual(oldResult.issues.map(issue => [issue.expected.pitch, issue.actual.pitch]), [
    ['D:0:3', 'D:0:4'],
    ['D:0:3', 'D:0:4'],
    ['C:0:3', 'C:0:4'],
  ]);
  const correctedResult = assertNoEventIssues(expectedA, v1, 'Purcell V1 measure 1 differs from the two source readings');
  assert.equal(correctedResult.correct, 3);
});

corpusTest('Purcell m40: the original lacks both notes; V1 restores them and preserves the literal final half=10 mark', async () => {
  const [ledgerA, ledgerB, originalXml, v1Xml] = await Promise.all([
    loadSourceLedger('a'),
    loadSourceLedger('b'),
    loadFixture('original-m1-m39.xml'),
    loadFixture('v1-m1-m40.xml'),
  ]);
  const expectedA = expectedFromLedgerA(ledgerA, [40]);
  const expectedB = expectedFromLedgerB(ledgerB, [40]);
  assert.deepEqual(sorted(expectedA), sorted(expectedB), 'the two corrected source ledgers disagree on measure 40');
  assert.deepEqual(expectedA.map(event => [event.pitch, event.onset, event.duration]), [
    ['A:0:2', 0, 4],
    ['D:0:3', 4, 2],
  ]);

  const original = readEvents(originalXml, { includeStaff: true });
  const originalMeasures = [...new Set(original.map(event => event.measure))];
  assert.deepEqual(originalMeasures, ['1', '39']);
  assert.equal(manifest.candidateOrigins.original.fullMeasureCount, 39);
  const oldResult = evaluateEvents(expectedA, original.filter(event => event.measure === '40'));
  assert.equal(oldResult.missing, 2);
  assert.equal(oldResult.extra, 0);
  assert.deepEqual(oldResult.issues.map(issue => issue.expected), expectedA);

  const v1 = readEvents(v1Xml, { includeStaff: true }).filter(event => event.measure === '40');
  const correctedResult = assertNoEventIssues(expectedA, v1, 'Purcell V1 measure 40 differs from the two source readings');
  assert.equal(correctedResult.correct, 2);

  const tempoA = ledgerA.tempoMarks.filter(mark => mark.measure === 40).map(mark => ({
    onsetQuarter: mark.onsetQuarter,
    beatUnit: mark.beatUnit,
    perMinute: mark.perMinutePrinted,
  }));
  const tempoB = ledgerB.work.tempoMarks.filter(mark => mark.measure === 40).map(mark => ({
    onsetQuarter: mark.onsetQuarter,
    beatUnit: mark.beatUnit,
    perMinute: mark.perMinute,
  }));
  assert.deepEqual(tempoA, tempoB, 'the two corrected source ledgers disagree on measure 40 tempo marks');
  assert.deepEqual(tempoA.at(-1), { onsetQuarter: 4, beatUnit: 'half', perMinute: 10 });
  const finalMark = lastMetronomeAtMeasure(v1Xml, 40);
  assert.equal(childText(finalMark, 'beat-unit'), 'half');
  assert.equal(childText(finalMark, 'per-minute'), '10');
});
