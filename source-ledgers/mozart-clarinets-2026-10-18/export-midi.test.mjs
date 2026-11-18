import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import midiFile from 'midi-file';
import {exportAndValidate} from './export-midi.mjs';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mozart-clarinets-export-test-'));
const labelFor = index => index < 295 ? `I-${index + 1}` : `III-${index - 294}`;

function note({step, octave, duration = 16, type = 'whole', voice = 1, alter, cue = false, grace = false,
  rest = false, tieStart = false, tieStop = false, slurType = '', articulation = ''}) {
  const marker = `${tieStart ? '<tie type="start"/>' : ''}${tieStop ? '<tie type="stop"/>' : ''}`;
  const notation = `${tieStart ? '<tied type="start"/>' : ''}${tieStop ? '<tied type="stop"/>' : ''}${slurType ? `<slur type="${slurType}" number="1"/>` : ''}${articulation ? `<articulations><${articulation}/></articulations>` : ''}`;
  const pitch = rest ? '<rest/>' : `<pitch><step>${step}</step>${alter === undefined ? '' : `<alter>${alter}</alter>`}<octave>${octave}</octave></pitch>`;
  return `<note>${cue ? '<cue/>' : ''}${grace ? '<grace slash="yes"/>' : ''}${pitch}${grace ? '' : `<duration>${duration}</duration>`}<voice>${voice}</voice><type>${type}</type><staff>1</staff>${marker}${notation ? `<notations>${notation}</notations>` : ''}</note>`;
}

function cueNote({grace = false, step = 'A', octave = 4}) {
  return `<note><cue/>${grace ? '<grace slash="yes"/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch>${grace ? '' : '<duration>4</duration>'}<voice>2</voice><type>${grace ? 'eighth' : 'quarter'}</type><staff>1</staff></note>`;
}

function cueRest() {
  return '<note><cue/><rest/><duration>4</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>';
}

function measureBody(partIndex, index) {
  const attrs = [];
  if (index === 0) attrs.push('<divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves><transpose><diatonic>-2</diatonic><chromatic>-3</chromatic></transpose>');
  if (index === 295) attrs.push('<time><beats>2</beats><beat-type>2</beat-type></time>');
  const prefix = attrs.length ? `<attributes>${attrs.join('')}</attributes>` : '';
  const verbalTempo = index === 0 && partIndex === 0 ? '<direction><direction-type><words>Allegro</words></direction-type></direction>' : '';
  const cueVoiceDynamics = index === 0 && partIndex === 0 ? '<direction><direction-type><dynamics><p/></dynamics></direction-type><voice>2</voice></direction>' : '';
  const directTempo = partIndex === 0 && index === 0 ? '<sound tempo="132"/>' : partIndex === 0 && index === 295 ? '<sound tempo="192"/>' : '';
  let main;
  if (partIndex === 0 && index === 0) main = note({step: 'B', octave: 4, alter: -1}) + '<backup><duration>16</duration></backup>' + cueNote({step: 'C', octave: 6});
  else if (partIndex === 1 && index === 0) main = note({rest: true}) + '<backup><duration>16</duration></backup>' + cueNote({grace: true, step: 'F', octave: 5}) + cueRest();
  else if (partIndex === 0 && index === 1) main = note({step: 'C', octave: 5, tieStart: true});
  else if (partIndex === 0 && index === 2) main = note({step: 'C', octave: 5, tieStop: true});
  else if (partIndex === 0 && index === 3) main = note({step: 'D', octave: 5, articulation: 'staccato'});
  else if (partIndex === 0 && index === 4) main = note({step: 'E', octave: 5, duration: 0, type: 'eighth', grace: true}) + note({step: 'G', octave: 5});
  else if (partIndex === 1 && index === 1) main = note({step: 'B', octave: 4, slurType: 'start'});
  else if (partIndex === 1 && index === 2) main = note({step: 'A', octave: 4, slurType: 'stop'});
  else if (partIndex === 1) main = note({step: index % 2 ? 'B' : 'A', octave: 4});
  else main = note({step: index % 2 ? 'C' : 'D', octave: 5});
  return `<measure number="${labelFor(index)}">${prefix}${verbalTempo}${cueVoiceDynamics}${directTempo}${main}</measure>`;
}

function partDeclaration(partIndex) {
  const id = `P${partIndex + 1}`;
  const name = `Clarinet ${partIndex + 1}`;
  return `<score-part id="${id}"><part-name>${name}</part-name><score-instrument id="${id}-I1"><instrument-name>Clarinet in A</instrument-name></score-instrument></score-part>`;
}

const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><identification><miscellaneous><miscellaneous-field name="midi-tempo-policy">Editorial audition tempi: I quarter=132; III quarter=192; no numerical tempo supplied in PDF</miscellaneous-field></miscellaneous></identification><part-list>${partDeclaration(0)}${partDeclaration(1)}</part-list><part id="P1">${Array.from({length: 538}, (_, index) => measureBody(0, index)).join('')}</part><part id="P2">${Array.from({length: 538}, (_, index) => measureBody(1, index)).join('')}</part></score-partwise>`;

const xmlPath = path.join(tempDir, 'synthetic.musicxml');
const midiPath = path.join(tempDir, 'synthetic.mid');
const reportPath = path.join(tempDir, 'synthetic-report.json');
try {
  await fs.writeFile(xmlPath, xml, 'utf8');
  const report = await exportAndValidate({xmlPath, midiPath, reportPath});
  assert.equal(report.status, 'passed');
  assert.equal(report.counts.parts, 2);
  assert.deepEqual(report.counts.measuresPerPart, [538, 538]);
  assert.deepEqual(report.counts.durationQuartersPerPart, [2152, 2152]);
  assert.deepEqual(report.counts.cueEventsPerPart, [1, 2]);
  assert.deepEqual(report.counts.cuePitchedNotesPerPart, [1, 1]);
  assert.deepEqual(report.counts.actualGraceNotesPerPart, [1, 0]);
  assert.deepEqual(report.counts.graceMidiNotesPerPart, [1, 0]);
  assert.deepEqual(report.counts.tiesPerPart[0], {starts: 1, stops: 1, mergedConnections: 1});
  assert.deepEqual(report.counts.slursPerPart[1], {starts: 1, stops: 1});
  assert.equal(report.editorialMetronome, true);
  assert.equal(report.tempoPolicy[0].sourceWords, true);
  assert.equal(report.tempoPolicy[0].sourceNumericAtStart, true);
  assert.equal(report.tempoPolicy[0].editorialDefaultUsed, false);
  assert.equal(report.tempoPolicy[0].editorialRateMarkedInMusicXmlMetadata, true);
  assert.equal(report.numericTempoEvents, 2);
  assert.equal(report.midiValidation.tracks, 3);
  assert.equal(report.midiValidation.gmProgram, 71);
  assert.equal(report.midiValidation.checkedNoteOns, report.midiValidation.checkedNoteOffs);

  const parsedMidi = midiFile.parseMidi(await fs.readFile(midiPath));
  assert.equal(parsedMidi.header.format, 1);
  assert.equal(parsedMidi.header.ticksPerBeat, 960);
  let conductorTick = 0;
  const conductorEvents = [];
  for (const event of parsedMidi.tracks[0]) {
    conductorTick += event.deltaTime;
    if (event.type === 'setTempo' || event.type === 'timeSignature') conductorEvents.push({tick: conductorTick, ...event});
  }
  assert.deepEqual(conductorEvents.filter(event => event.type === 'setTempo').map(event => [event.tick, event.microsecondsPerBeat]),
    [[0, 454545], [1180 * 960, 312500]], 'conductor deve preservar os dois BPM editoriais marcados no XML');
  assert.deepEqual(conductorEvents.filter(event => event.type === 'timeSignature').map(event => [event.tick, event.numerator, event.denominator]),
    [[0, 4, 4], [1180 * 960, 2, 2]], 'conductor deve alinhar 4/4 e 2/2 às mudanças de movimento');
  assert.equal(report.midiValidation.checkedTempoEvents, 2);
  assert.equal(report.midiValidation.checkedMeterChanges, 2);
  const notesByTrack = parsedMidi.tracks.slice(1).map(track => {
    let tick = 0;
    const attacks = [];
    for (const event of track) {
      tick += event.deltaTime;
      if (event.type === 'noteOn' && event.velocity > 0) attacks.push({pitch: event.noteNumber, tick, channel: event.channel, velocity: event.velocity});
    }
    return attacks;
  });
  assert.ok(notesByTrack[0].some(event => event.pitch === 67 && event.tick === 0 && event.channel === 0), 'Bb4 deve transpor para G4 na pista/canal I');
  assert.equal(notesByTrack[0].find(event => event.pitch === 67 && event.tick === 0).velocity, 80,
    'dinâmica cue da voz 2 não pode alterar a velocidade da nota principal na voz 1');
  assert.ok(notesByTrack[0].some(event => event.pitch === 69 && event.tick === 3840), 'Tie C5 deve atacar uma vez no compasso II');
  assert.ok(!notesByTrack[0].some(event => event.pitch === 81), 'cue C6 não pode entrar no MIDI');
  assert.ok(notesByTrack[1].some(event => event.pitch === 68 && event.tick === 3840 && event.channel === 1), 'B4 transposto deve permanecer na pista/canal II');
  assert.ok(!notesByTrack[1].some(event => event.pitch === 74), 'grace cue não pode entrar no MIDI');
  const tieAttack = notesByTrack[0].find(event => event.pitch === 69 && event.tick === 3840);
  let tieDurationTicks = 0;
  let tick = 0;
  for (const event of parsedMidi.tracks[1]) {
    tick += event.deltaTime;
    if (event.type === 'noteOff' && event.noteNumber === 69 && tick > tieAttack.tick) { tieDurationTicks = tick - tieAttack.tick; break; }
  }
  assert.equal(tieDurationTicks, 8 * 960, 'tie entre compassos deve ser sustentado por oito semínimas sem reataque');
  assert.equal(JSON.parse(await fs.readFile(reportPath, 'utf8')).status, 'passed');
  const cliMidiPath = path.join(tempDir, 'cli-no-report.mid');
  const cliOutput = execFileSync(process.execPath, [fileURLToPath(new URL('./export-midi.mjs', import.meta.url)),
    '--xml', xmlPath, '--midi', cliMidiPath], {encoding: 'utf8', maxBuffer: 1_000_000});
  assert.equal(JSON.parse(cliOutput).status, 'passed', 'CLI deve aceitar --xml/--midi sem --report');
  await fs.access(cliMidiPath);

  const onlyCueInFirstBar = xml.replace(`${note({rest: true})}<backup><duration>16</duration></backup>`, '');
  assert.notEqual(onlyCueInFirstBar, xml, 'fixture negativo deve remover a pausa principal e deixar o cue isolado');
  const invalidXmlPath = path.join(tempDir, 'cue-only.musicxml');
  const invalidMidiPath = path.join(tempDir, 'cue-only.mid');
  const invalidReportPath = path.join(tempDir, 'cue-only-report.json');
  await fs.writeFile(invalidXmlPath, onlyCueInFirstBar, 'utf8');
  await assert.rejects(exportAndValidate({xmlPath: invalidXmlPath, midiPath: invalidMidiPath, reportPath: invalidReportPath}), /MusicXML validation failed/);
  const invalidReport = JSON.parse(await fs.readFile(invalidReportPath, 'utf8'));
  assert.equal(invalidReport.status, 'failed');
  assert.ok(invalidReport.errors.some(issue => issue.code === 'NON_CUE_COVERAGE_MISSING'), 'cue isolado não pode satisfazer a cobertura principal');
  await assert.rejects(fs.access(invalidMidiPath), 'falha de validação não deve deixar MIDI parcial');

  const orphanTieXml = xml.replace(note({step: 'C', octave: 5, tieStop: true}), note({step: 'C', octave: 5}));
  assert.notEqual(orphanTieXml, xml, 'fixture negativo deve retirar o tie stop');
  const orphanTiePath = path.join(tempDir, 'orphan-tie.musicxml');
  await fs.writeFile(orphanTiePath, orphanTieXml, 'utf8');
  await assert.rejects(exportAndValidate({xmlPath: orphanTiePath, midiPath: path.join(tempDir, 'orphan-tie.mid')}), error => {
    assert.match(error.message, /MusicXML validation failed/);
    assert.ok(error.report.errors.some(issue => issue.code === 'TIE_START_UNCLOSED'), 'tie sem stop deve constar do relatório');
    return true;
  });
  process.stdout.write('passed: 2 independent tracks, 538 measures, transposition, Bb, cue/rest, cue grace omitted, cross-bar tie, actual grace, meter and editorial tempo report\n');
} finally {
  await fs.rm(tempDir, {recursive: true, force: true});
}
