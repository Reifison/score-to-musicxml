import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectNativeScoreXml } from '../lib/native-score-reference.mjs';

test('lê metadados MusicXML sem converter notas e preserva afinação e transposição explícitas', async () => {
  const xml = `<?xml version="1.0"?>
    <score-partwise>
      <work><work-title>Example</work-title></work>
      <identification><creator type="composer">Composer</creator></identification>
      <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
      <part id="P1"><measure number="0" implicit="yes"><attributes>
        <staves>2</staves>
        <staff-details number="1"><staff-tuning line="1"><tuning-step>E</tuning-step><tuning-octave>2</tuning-octave></staff-tuning></staff-details>
        <transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>
      </attributes></measure><measure number="1"/></part>
    </score-partwise>`;
  const result = await inspectNativeScoreXml(xml);
  assert.equal(result.format, 'musicxml');
  assert.equal(result.title, 'Example');
  assert.equal(result.partCount, 1);
  assert.equal(result.staffCount, 2);
  assert.deepEqual(result.measureCounts, [{ partId: 'P1', count: 2 }]);
  assert.deepEqual(result.parts[0].firstMeasure, { number: '0', implicit: 'yes' });
  assert.deepEqual(result.parts[0].lastMeasure, { number: '1', implicit: null });
  assert.deepEqual(result.parts[0].tunings, [{
    attributesIndex: 0, staff: 1, line: 1, step: 'E', alter: 0, octave: 2,
  }]);
  assert.equal(result.parts[0].transpositions[0].octaveChange, -1);
  assert.equal(result.eventExtraction, 'not performed');
  assert.equal('events' in result, false);
});

test('lê metadados MuseScore, compassos por pauta e valores brutos de StringData', async () => {
  const xml = `<?xml version="1.0"?>
    <museScore version="4.6"><programVersion>4.6.5</programVersion>
      <Score>
        <Part><Staff/><Staff/><trackName>Violão</trackName><Instrument>
          <longName>Violão clássico</longName><instrumentId>pluck.guitar.nylon-string</instrumentId>
          <clef>G8vb</clef><transposeChromatic>0</transposeChromatic>
          <StringData><string>40</string><string>45</string><string>50</string></StringData>
        </Instrument></Part>
        <Staff id="1"><Measure len="3/4"/><Measure/></Staff>
        <Staff id="2"><Measure/><Measure/></Staff>
        <metaTag name="workTitle">Example</metaTag>
        <metaTag name="composer">Composer</metaTag>
      </Score>
    </museScore>`;
  const result = await inspectNativeScoreXml(xml);
  assert.equal(result.format, 'musescore-xml');
  assert.equal(result.title, 'Example');
  assert.equal(result.programVersion, '4.6.5');
  assert.equal(result.partCount, 1);
  assert.equal(result.staffCount, 2);
  assert.deepEqual(result.parts[0].staffIds, ['1', '2']);
  assert.deepEqual(result.measureCounts, [
    { staffId: '1', partNames: ['Violão'], count: 2, firstMeasureAttributes: { len: '3/4' }, firstMeasureHasIrregularMarker: false, lastMeasureAttributes: {}, lastMeasureHasIrregularMarker: false },
    { staffId: '2', partNames: ['Violão'], count: 2, firstMeasureAttributes: {}, firstMeasureHasIrregularMarker: false, lastMeasureAttributes: {}, lastMeasureHasIrregularMarker: false },
  ]);
  assert.deepEqual(result.parts[0].tuningMidiPitchesInSourceOrder, [40, 45, 50]);
  assert.deepEqual(result.parts[0].explicitTranspose, [{ field: 'transposeChromatic', value: 0 }]);
  assert.equal(result.eventExtraction, 'not performed');
});

test('rejeita subset interno de DTD, XML inválido, raiz não suportada e fonte acima do limite', async () => {
  await assert.rejects(inspectNativeScoreXml('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><score-partwise/>'), /Subset interno/);
  const externalDtd = await inspectNativeScoreXml('<!DOCTYPE score-partwise SYSTEM "http://example.invalid/score.dtd"><score-partwise><work><work-title>Example</work-title></work></score-partwise>');
  assert.equal(externalDtd.format, 'musicxml');
  await assert.rejects(inspectNativeScoreXml('<score-partwise>'), /Unclosed|Invalid|Unexpected/i);
  await assert.rejects(inspectNativeScoreXml('<root/>'), /não reconhecido/);
  await assert.rejects(inspectNativeScoreXml(`<score-partwise>${'x'.repeat(32 * 1024 * 1024)}</score-partwise>`), /32 MiB/);
});
