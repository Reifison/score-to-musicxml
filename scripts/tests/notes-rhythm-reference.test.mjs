import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { evaluateEvents, ledgerEvents, readEvents } from '../evaluate-musicxml-reference.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureRoot = resolve(repositoryRoot, 'apps/api/src/tests/fixtures/notes-rhythm');
const manifest = JSON.parse(await readFile(resolve(fixtureRoot, 'manifest.json'), 'utf8'));

const sha256 = value => createHash('sha256').update(value).digest('hex');
const absolute = relativePath => resolve(repositoryRoot, relativePath);

async function loadText(relativePath) {
  return readFile(absolute(relativePath), 'utf8');
}

async function loadSealedText(relativePath, expectedSha256) {
  const contents = await loadText(relativePath);
  assert.equal(sha256(contents), expectedSha256, `hash mudou: ${relativePath}`);
  return contents;
}

function referenceEvents(ledger) {
  return ledgerEvents(ledger);
}

function eventAt(events, predicate, message) {
  const event = events.find(predicate);
  assert.ok(event, message);
  return event;
}

function neutralizeVoice(events) {
  return events.map(event => ({ ...event, voice: 'pitch-time' }));
}

function unionDuration(events) {
  const intervals = events
    .filter(event => !event.grace && event.duration > 0)
    .map(event => [event.onset, event.onset + event.duration])
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  let total = 0;
  let start = null;
  let end = null;
  for (const [nextStart, nextEnd] of intervals) {
    if (start === null) {
      start = nextStart;
      end = nextEnd;
    } else if (nextStart <= end) {
      end = Math.max(end, nextEnd);
    } else {
      total += end - start;
      start = nextStart;
      end = nextEnd;
    }
  }
  if (start !== null) total += end - start;
  return total;
}

function groupedByMeasureAndVoice(events) {
  const groups = new Map();
  for (const event of events) {
    const key = `${event.measure}/${event.voice}`;
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }
  return groups;
}

test('sela a nova referência, seus limites e a correção histórica de c13', async () => {
  const referenceXml = await loadSealedText(
    manifest.reference.musicXml,
    manifest.reference.musicXmlSha256,
  );
  const referenceLedgerText = await loadSealedText(
    manifest.reference.ledger,
    manifest.reference.ledgerSha256,
  );
  const historicalLedgerText = await loadSealedText(
    manifest.historical.ledger,
    manifest.historical.ledgerSha256,
  );
  const baselineXml = await loadSealedText(
    manifest.baseline.musicXml,
    manifest.baseline.musicXmlSha256,
  );
  assert.equal(referenceXml.length > 0, true);
  assert.equal(baselineXml.length > 0, true);

  const ledger = JSON.parse(referenceLedgerText);
  const historicalLedger = JSON.parse(historicalLedgerText);
  const expected = referenceEvents(ledger);
  const historical = referenceEvents(historicalLedger);
  const document = new DOMParser().parseFromString(referenceXml, 'application/xml');
  const measures = Array.from(document.getElementsByTagName('measure'));
  const firstTime = measures[0]?.getElementsByTagName('time').item(0);

  assert.equal(ledger.editorial_human_approval, false);
  assert.equal(ledger.training_eligible, false);
  assert.equal(manifest.provenance.editorialHumanApproval, false);
  assert.equal(manifest.provenance.humanReview, false);
  assert.equal(manifest.provenance.trainingEligible, false);
  assert.equal(manifest.provenance.mlTraining, false);
  assert.equal(ledger.measures.length, manifest.counts.measures);
  assert.equal(measures.length, manifest.counts.measures);
  assert.equal(firstTime?.getElementsByTagName('beats').item(0)?.textContent, String(manifest.counts.beatsPerMeasure));
  assert.equal(firstTime?.getElementsByTagName('beat-type').item(0)?.textContent, String(manifest.counts.beatType));
  assert.equal(expected.length, manifest.counts.events);
  assert.equal(expected.filter(event => event.kind === 'note').length, manifest.counts.notes);
  assert.equal(expected.filter(event => event.kind === 'rest').length, manifest.counts.rests);
  assert.equal(expected.filter(event => event.grace).length, manifest.counts.graces);

  const currentC13 = eventAt(
    expected,
    event => event.measure === '13' && event.voice === '3' && event.onset === 2 && event.duration === 0.5 && event.kind === 'note',
    'a referência nova precisa conter o baixo de c13',
  );
  assert.equal(currentC13.pitch, manifest.historical.knownCorrection.currentWrittenPitch);
  const historicalC13 = eventAt(
    historical,
    event => event.measure === '13' && event.voice === '3' && event.onset === 2 && event.duration === 0.5 && event.kind === 'note',
    'o ledger histórico precisa permanecer disponível para auditoria',
  );
  assert.equal(historicalC13.pitch, manifest.historical.knownCorrection.previousWrittenPitch);
});

test('a referência visual nova coincide exatamente com o MusicXML de notas e ritmo', async () => {
  const ledger = JSON.parse(await loadText(manifest.reference.ledger));
  const expected = referenceEvents(ledger);
  const actual = readEvents(await loadText(manifest.reference.musicXml), { includeStaff: true });
  const result = evaluateEvents(expected, actual);

  assert.deepEqual(
    {
      expectedEvents: result.expectedEvents,
      actualEvents: result.actualEvents,
      correct: result.correct,
      changed: result.changed,
      missing: result.missing,
      extra: result.extra,
      incorrect: result.incorrect,
    },
    { expectedEvents: 147, actualEvents: 147, correct: 147, changed: 0, missing: 0, extra: 0, incorrect: 0 },
  );
  assert.deepEqual(result.issues, []);
  assert.equal(result.accuracyPercent, 100);
});

test('a conversão baseline falha nos 66 eventos documentados quando a voz é neutralizada', async () => {
  const ledger = JSON.parse(await loadText(manifest.reference.ledger));
  const expected = neutralizeVoice(referenceEvents(ledger));
  const baseline = neutralizeVoice(
    readEvents(await loadText(manifest.baseline.musicXml), { includeStaff: true }),
  );
  const result = evaluateEvents(expected, baseline);

  assert.deepEqual(
    {
      actualEvents: result.actualEvents,
      correct: result.correct,
      changed: result.changed,
      missing: result.missing,
      extra: result.extra,
      incorrect: result.incorrect,
    },
    {
      actualEvents: manifest.baseline.expectedActualEvents,
      correct: manifest.baseline.expectedCorrect,
      changed: manifest.baseline.expectedChanged,
      missing: manifest.baseline.expectedMissing,
      extra: manifest.baseline.expectedExtra,
      incorrect: manifest.baseline.expectedDifferences,
    },
  );
  assert.ok(result.incorrect > 0, 'o baseline deve continuar falhando');
});

test('detecta c4 indevido em c13 como alteração de altura escrita', async () => {
  const ledger = JSON.parse(await loadText(manifest.reference.ledger));
  const expected = referenceEvents(ledger);
  const actual = readEvents(await loadText(manifest.reference.musicXml), { includeStaff: true });
  const wrongC13 = actual.map(event =>
    event.measure === '13' && event.voice === '3' && event.onset === 2 && event.duration === 0.5 && event.pitch === 'A:0:3'
      ? { ...event, pitch: 'C:0:4' }
      : event,
  );
  const result = evaluateEvents(expected, wrongC13);
  const issue = result.issues.find(item => item.kind === 'changed' && item.expected.measure === '13');

  assert.equal(result.changed, 1);
  assert.equal(result.missing, 0);
  assert.equal(result.extra, 0);
  assert.deepEqual(
    [issue?.expected.pitch, issue?.actual.pitch, issue?.expected.onset, issue?.actual.onset],
    ['A:0:3', 'C:0:4', 2, 2],
  );
});

test('detecta omissão de uma voz sustentada e de uma nota-membro de acorde', async () => {
  const ledger = JSON.parse(await loadText(manifest.reference.ledger));
  const expected = referenceEvents(ledger);
  const actual = readEvents(await loadText(manifest.reference.musicXml), { includeStaff: true });

  const withoutBassVoice = actual.filter(
    event => !(event.measure === '1' && event.voice === '3' && event.pitch === 'E:0:3'),
  );
  const voiceResult = evaluateEvents(expected, withoutBassVoice);
  assert.equal(voiceResult.missing, 1);
  assert.equal(voiceResult.changed, 0);
  assert.equal(voiceResult.extra, 0);
  assert.equal(voiceResult.issues[0]?.expected.voice, '3');
  assert.equal(voiceResult.issues[0]?.expected.pitch, 'E:0:3');

  const withoutChordMember = actual.filter(
    event => !(event.measure === '1' && event.voice === '2' && event.pitch === 'G:0:5' && event.onset === 2),
  );
  const chordResult = evaluateEvents(expected, withoutChordMember);
  assert.equal(chordResult.missing, 1);
  assert.equal(chordResult.changed, 0);
  assert.equal(chordResult.extra, 0);
  assert.equal(chordResult.issues[0]?.expected.voice, '2');
  assert.equal(chordResult.issues[0]?.expected.pitch, 'G:0:5');
});

test('mede sobreposições por intervalo e preserva a métrica de 3/4', async () => {
  const ledger = JSON.parse(await loadText(manifest.reference.ledger));
  const expected = referenceEvents(ledger);
  const groups = groupedByMeasureAndVoice(expected);

  for (const [key, events] of groups) {
    for (const event of events) {
      assert.ok(event.onset >= 0, `${key}: início negativo`);
      assert.ok(event.onset + event.duration <= 3, `${key}: evento ultrapassa a barra`);
    }
    assert.ok(unionDuration(events) <= 3, `${key}: ocupação métrica excede 3/4`);
  }

  const m16Voice1 = expected.filter(event => event.measure === '16' && event.voice === '1');
  const naiveSum = m16Voice1.reduce((sum, event) => sum + event.duration, 0);
  assert.equal(naiveSum, 7, 'os três sons do acorde e a pausa se sobrepõem no mesmo fluxo temporal');
  assert.equal(unionDuration(m16Voice1), 3, 'a união dos intervalos ainda ocupa somente a barra de 3/4');
  assert.equal(m16Voice1.filter(event => event.kind === 'rest').length, 1);
});

test('mantém acidentes escritos explícitos sem depender do glifo accidental', async () => {
  const ledger = JSON.parse(await loadText(manifest.reference.ledger));
  const expected = referenceEvents(ledger);
  const sourceXml = await loadText(manifest.reference.musicXml);
  const actual = readEvents(sourceXml, { includeStaff: true });
  const accidentalCount = (sourceXml.match(/<accidental>/g) ?? []).length;
  assert.ok(accidentalCount >= 1);
  assert.equal(eventAt(actual, event => event.measure === '1' && event.pitch === 'D:1:6').pitch, 'D:1:6');
  assert.equal(
    eventAt(actual, event => event.measure === '14' && event.voice === '3' && event.pitch === 'C:0:4').pitch,
    'C:0:4',
  );

  const withoutDisplayAccidentals = sourceXml.replace(/\s*<accidental>[^<]*<\/accidental>/g, '');
  const result = evaluateEvents(expected, readEvents(withoutDisplayAccidentals, { includeStaff: true }));
  assert.equal(result.incorrect, 0, 'a métrica usa pitch/alter escritos, não o glifo de exibição');

  const wrongNatural = actual.map(event =>
    event.measure === '14' && event.voice === '3' && event.pitch === 'C:0:4'
      ? { ...event, pitch: 'C:1:4' }
      : event,
  );
  assert.equal(evaluateEvents(expected, wrongNatural).changed, 1);
});

test('ignora dedilhado, dinâmica, repetição e ligadura no metric pitch-only', async () => {
  const ledger = JSON.parse(await loadText(manifest.reference.ledger));
  const expected = referenceEvents(ledger);
  const sourceXml = await loadText(manifest.reference.musicXml);
  const enrichedXml = sourceXml
    .replace(
      '</note>',
      '<notations><technical><fingering>1</fingering></technical><slur type="start" number="1"/></notations></note>',
    )
    .replaceAll(
      '</measure>',
      '<direction><direction-type><dynamics><p/></dynamics></direction-type></direction><barline location="right"><repeat direction="forward"/></barline></measure>',
    );
  const actual = readEvents(enrichedXml, { includeStaff: true });
  const result = evaluateEvents(expected, actual);

  assert.match(enrichedXml, /<fingering>1<\/fingering>/);
  assert.match(enrichedXml, /<dynamics><p\/><\/dynamics>/);
  assert.match(enrichedXml, /<repeat direction="forward"\/>/);
  assert.match(enrichedXml, /<slur type="start"/);
  assert.equal(result.incorrect, 0);
  assert.deepEqual(result.issues, []);
});
