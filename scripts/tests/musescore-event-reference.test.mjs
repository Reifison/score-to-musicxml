import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareNativeAndMusicXmlEvents,
  parseMusicXmlNativeEvents,
  parseMuseScoreNativeEvents,
} from '../lib/musescore-event-reference.mjs';

const native = `<museScore><programVersion>4.6.5</programVersion><Score>
  <Part><Staff id="1"/></Part>
  <Staff id="1"><Measure>
    <voice>
      <Chord><durationType>quarter</durationType><dots>1</dots>
        <Note><pitch>60</pitch><tpc>14</tpc></Note>
        <Note><pitch>64</pitch><tpc>18</tpc></Note>
      </Chord>
      <Rest><durationType>quarter</durationType></Rest>
    </voice>
    <voice/>
  </Measure></Staff>
</Score></museScore>`;

const musicXml = `<score-partwise><part-list><score-part id="P1"><part-name>Instrument</part-name></score-part></part-list>
  <part id="P1"><measure number="0" implicit="yes">
    <attributes><divisions>4</divisions><staves>1</staves></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>6</duration><voice>1</voice><type>quarter</type><dot/></note>
    <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>6</duration><voice>1</voice><type>quarter</type><dot/></note>
    <note><rest/><duration>4</duration><voice>1</voice><type>quarter</type></note>
  </measure></part></score-partwise>`;

test('retains complete native chord/rest stream and an empty voice slot', () => {
  const parsed = parseMuseScoreNativeEvents(native);
  assert.equal(parsed.noteCount, 2);
  assert.equal(parsed.restCount, 1);
  assert.equal(parsed.eventCount, 2);
  assert.deepEqual(parsed.voiceTopology[0].voiceSlots, [
    { voiceOrdinal: 1, eventCount: 2 },
    { voiceOrdinal: 2, eventCount: 0 },
  ]);
  assert.equal(parsed.events[0].onsetQ, '0');
  assert.equal(parsed.events[0].durationQ, '3/2');
  assert.deepEqual(parsed.events[0].pitches.map(pitch => [pitch.spelling.step, pitch.octave]), [['C', 4], ['E', 4]]);
  assert.deepEqual(parsed.events[1].onsetQ, '3/2');
});

test('MusicXML keeps chord onsets, explicit written spelling, pickup numbering, and backup/forward cursors', () => {
  const parsed = parseMusicXmlNativeEvents(musicXml);
  assert.equal(parsed.noteCount, 2);
  assert.equal(parsed.restCount, 1);
  assert.equal(parsed.events.length, 2);
  assert.equal(parsed.measures[0].musicXmlMeasureNumber, '0');
  assert.equal(parsed.events[0].onsetQ, '0');
  assert.equal(parsed.events[0].durationQ, '3/2');
  assert.deepEqual(parsed.events[0].pitches.map(pitch => pitch.step), ['C', 'E']);

  const cursorXml = `<score-partwise><part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><staves>2</staves></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><staff>1</staff><voice>1</voice></note>
    <backup><duration>4</duration></backup><forward><duration>2</duration></forward>
    <note><rest/><duration>2</duration><staff>1</staff><voice>2</voice></note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><staff>2</staff><voice>5</voice></note>
  </measure></part></score-partwise>`;
  const withCursors = parseMusicXmlNativeEvents(cursorXml);
  assert.deepEqual(withCursors.events.map(event => [event.localStaff, event.voiceOrdinal, event.onsetQ]), [
    [1, 1, '0'], [1, 2, '1/2'], [2, 1, '1'],
  ]);
});

test('compares complete supported fixture streams without omitting notes or rests', () => {
  const source = parseMuseScoreNativeEvents(native);
  const candidate = parseMusicXmlNativeEvents(musicXml);
  const result = compareNativeAndMusicXmlEvents(source, candidate);
  assert.equal(result.status, 'compared');
  assert.deepEqual(result.comparison, { exact: 2, changed: 0, missing: 0, extra: 0, differentEventCount: 0, differences: [] });
  assert.equal(result.scoreOutOf10, null);
  assert.equal(result.globalGrades, null);
  assert.equal(result.approvedForFinalDelivery, false);
  assert.equal(result.trainingEligible, false);
  assert.equal(result.humanApproved, false);
  assert.equal(result.independentPdfReference, false);
  assert.equal(result.equivalentToPdf, false);
});

test('records an event difference only when both full event streams are supported', () => {
  const candidate = parseMusicXmlNativeEvents(musicXml.replace('<step>C</step>', '<step>D</step>'));
  const result = compareNativeAndMusicXmlEvents(parseMuseScoreNativeEvents(native), candidate);
  assert.equal(result.status, 'compared');
  assert.equal(result.comparison.differentEventCount, 1);
  assert.equal(result.comparison.changed, 1);
  assert(result.comparison.differences[0].fields.some(field => field.field === 'pitches'));
  assert.equal(result.scoreOutOf10, null);
});

test('keeps tuplets unsupported and applies direct voice location offsets', () => {
  const tupletSource = native.replace(
    '<Chord><durationType>quarter</durationType><dots>1</dots>',
    '<Tuplet><eid>tuplet-1</eid><actualNotes>3</actualNotes><normalNotes>2</normalNotes></Tuplet><Chord><durationType>quarter</durationType><dots>1</dots>',
  ).replace('</voice>', '<endTuplet><eid>tuplet-1</eid></endTuplet></voice>');
  const source = parseMuseScoreNativeEvents(tupletSource);
  assert(source.unsupported.some(item => item.code === 'tuplet-semantics-unverified'));
  const tupleResult = compareNativeAndMusicXmlEvents(source, parseMusicXmlNativeEvents(musicXml));
  assert.equal(tupleResult.status, 'unsupported');
  assert.equal(tupleResult.comparison, null);
  assert.equal(tupleResult.scoreOutOf10, null);

  const located = native.replace(
    '</Chord>\n      <Rest>',
    '</Chord>\n      <location><fractions>1/8</fractions></location>\n      <Rest>',
  );
  const locatedParsed = parseMuseScoreNativeEvents(located);
  assert.equal(locatedParsed.events[1].onsetQ, '2');
  assert.equal(locatedParsed.sourceVoiceLocationOffsets[0].offsetQ, '1/2');
  assert(!locatedParsed.unsupported.some(item => item.code === 'source-location-timing-semantics-unverified'));

  const candidateWithGap = musicXml.replace(
    '<note><rest/><duration>4</duration>',
    '<forward><duration>2</duration></forward><note><rest/><duration>4</duration>',
  );
  const comparedLocation = compareNativeAndMusicXmlEvents(locatedParsed, parseMusicXmlNativeEvents(candidateWithGap));
  assert.equal(comparedLocation.status, 'compared');
  assert.equal(comparedLocation.comparison.differentEventCount, 0);

  const unsupportedLocation = parseMuseScoreNativeEvents(native.replace(
    '<voice>', '<voice><location><fractions>1/8</fractions><timeTick>1</timeTick></location>',
  ));
  assert(unsupportedLocation.unsupported.some(item => item.code === 'source-location-timing-semantics-unverified'));
  assert(unsupportedLocation.unsupported.some(item => item.raw?.tag === 'location'));
  assert.equal(compareNativeAndMusicXmlEvents(unsupportedLocation, parseMusicXmlNativeEvents(musicXml)).status, 'unsupported');
});

test('treats measure stretch and known performance ornaments as out-of-scope metadata', () => {
  const sourceXml = native
    .replace('<Measure>', '<Measure><stretch>1.2</stretch>')
    .replace('<durationType>quarter</durationType><dots>1</dots>', '<durationType>quarter</durationType><dots>1</dots><Arpeggio/>');
  const source = parseMuseScoreNativeEvents(sourceXml);
  assert.equal(source.measures[0].stretch, 1.2);
  assert.equal(source.sourceOutOfScopeModifiers.length, 1);
  assert.equal(source.sourceOutOfScopeModifiers[0].tag, 'Arpeggio');
  assert(!source.unsupported.some(item => item.code === 'measure-stretch-semantics-unverified'));
  assert(!source.unsupported.some(item => item.code === 'source-event-modifier-semantics-unverified'));
  const result = compareNativeAndMusicXmlEvents(source, parseMusicXmlNativeEvents(musicXml));
  assert.equal(result.status, 'compared');
  assert.equal(result.comparison.differentEventCount, 0);
});

test('blocks written-pitch comparison when an octave shift is present', () => {
  const sourceXml = native.replace(
    '<voice>', '<voice><Spanner type="Ottava"><Ottava><subtype>8va</subtype></Ottava><next><location><fractions>1/4</fractions></location></next></Spanner>',
  );
  const source = parseMuseScoreNativeEvents(sourceXml);
  assert.equal(source.sourceSpannerTypes.Ottava, 1);
  assert(source.unsupported.some(item => item.code === 'source-ottava-written-pitch-semantics-unverified'));
  assert.equal(compareNativeAndMusicXmlEvents(source, parseMusicXmlNativeEvents(musicXml)).status, 'unsupported');

  const candidateXml = musicXml.replace(
    '<note><pitch>', '<direction><direction-type><octave-shift type="down" size="8"/></direction-type></direction><note><pitch>',
  );
  const candidate = parseMusicXmlNativeEvents(candidateXml);
  assert(candidate.unsupported.some(item => item.code === 'musicxml-octave-shift-semantics-unverified'));
  assert.equal(compareNativeAndMusicXmlEvents(parseMuseScoreNativeEvents(native), candidate).status, 'unsupported');
});

test('retains known non-pitch spanner markers without blocking event encoding', () => {
  const sourceXml = native.replace(
    '<voice>', '<voice><Spanner type="HairPin"><HairPin/></Spanner><Spanner type="Volta"><Volta/></Spanner>',
  );
  const source = parseMuseScoreNativeEvents(sourceXml);
  assert.deepEqual(source.sourceSpannerTypes, { HairPin: 1, Volta: 1 });
  assert.equal(compareNativeAndMusicXmlEvents(source, parseMusicXmlNativeEvents(musicXml)).status, 'compared');
});

test('derives written octave from enharmonic spelling at MIDI octave boundaries', () => {
  const sourceXml = `<museScore><Score><Part><Staff id="1"/></Part><Staff id="1"><Measure>
    <voice><Chord><durationType>quarter</durationType>
      <Note><pitch>60</pitch><tpc>26</tpc></Note>
      <Note><pitch>59</pitch><tpc>7</tpc></Note>
    </Chord></voice>
  </Measure></Staff></Score></museScore>`;
  const candidateXml = `<score-partwise><part-list><score-part id="P1"><part-name>Instrument</part-name></score-part></part-list>
    <part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>
      <note><pitch><step>B</step><alter>1</alter><octave>3</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><chord/><pitch><step>C</step><alter>-1</alter><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure></part></score-partwise>`;
  const source = parseMuseScoreNativeEvents(sourceXml);
  assert.deepEqual(source.events[0].pitches.map(pitch => `${pitch.spelling.step}:${pitch.spelling.alter}:${pitch.octave}`).sort(), ['B:1:3', 'C:-1:4']);
  assert(!source.unsupported.some(item => item.code === 'source-pitch-tpc-inconsistent'));
  const result = compareNativeAndMusicXmlEvents(source, parseMusicXmlNativeEvents(candidateXml));
  assert.equal(result.status, 'compared');
  assert.equal(result.comparison.differentEventCount, 0);
});

test('still blocks a true pitch/TPC mismatch with no integral written octave', () => {
  const sourceXml = `<museScore><Score><Part><Staff id="1"/></Part><Staff id="1"><Measure>
    <voice><Chord><durationType>quarter</durationType><Note><pitch>61</pitch><tpc>14</tpc></Note></Chord></voice>
  </Measure></Staff></Score></museScore>`;
  const source = parseMuseScoreNativeEvents(sourceXml);
  const mismatch = source.unsupported.find(item => item.code === 'source-pitch-tpc-inconsistent');
  assert(mismatch);
  assert.equal(mismatch.pitch, 61);
  assert.equal(mismatch.tpc, 14);
  assert.equal(mismatch.derivedOctave, null);
  assert.equal(mismatch.expectedMidi, null);
  assert.equal(compareNativeAndMusicXmlEvents(source, parseMusicXmlNativeEvents(musicXml)).status, 'unsupported');
});

test('unknown event-bearing tags are preserved as unsupported, never silently skipped', () => {
  const source = parseMuseScoreNativeEvents(native.replace('<Chord>', '<Chord><UnknownTimingControl>2</UnknownTimingControl>'));
  assert(source.unsupported.some(item => item.code === 'unknown-event-related-source-element' && item.raw?.tag === 'UnknownTimingControl'));

  const candidate = parseMusicXmlNativeEvents(musicXml.replace('<pitch>', '<unknown-timing-control>2</unknown-timing-control><pitch>'));
  assert(candidate.unsupported.some(item => item.code === 'unknown-event-related-musicxml-note-element' && item.tag === 'unknown-timing-control'));
  assert.equal(compareNativeAndMusicXmlEvents(parseMuseScoreNativeEvents(native), candidate).status, 'unsupported');
});

test('measure rests retain their special whole-measure identity', () => {
  const sourceXml = `<museScore><Score><Part><Staff id="1"/></Part><Staff id="1"><Measure>
    <voice><Rest><durationType>measure</durationType><duration>4/4</duration></Rest></voice>
  </Measure></Staff></Score></museScore>`;
  const candidateXml = `<score-partwise><part id="P1"><measure number="1">
    <attributes><divisions>4</divisions></attributes><note><rest measure="yes"/><duration>16</duration><voice>1</voice><type>whole</type></note>
  </measure></part></score-partwise>`;
  const source = parseMuseScoreNativeEvents(sourceXml);
  const candidate = parseMusicXmlNativeEvents(candidateXml);
  assert.equal(source.events[0].measureRest, true);
  assert.equal(source.events[0].durationQ, '4');
  assert.equal(candidate.events[0].measureRest, true);
  assert.equal(candidate.events[0].durationQ, '4');
  assert.equal(compareNativeAndMusicXmlEvents(source, candidate).status, 'compared');
});
