import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DOMParser} from '@xmldom/xmldom';
import toneMidi from '@tonejs/midi';
import {VerovioToolkit} from 'verovio/esm';
import createVerovioModule from 'verovio/wasm';
import {readEvents,ledgerEvents,evaluateEvents} from '../evaluate-musicxml-reference.mjs';

const base=new URL('../../source-ledgers/adelita-2026-10-10/',import.meta.url);
const load=name=>readFile(new URL(name,base));
const ledger=JSON.parse(await load('ledger.json'));
const caseRecord=JSON.parse(await load('case.json'));
const expected=ledgerEvents(ledger);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const xml=String(await load('reviewed.musicxml'));
const semitones={C:0,D:2,E:4,F:5,G:7,A:9,B:11};

test('Adelita retains the original, the reviewed source reference and their provenance',async()=>{
  for(const item of caseRecord.files) assert.equal(sha(await load(item.file)),item.sha256,item.file);
  assert.equal(caseRecord.trainingEligible,false);
  assert.equal(caseRecord.humanEditorialApproval,false);
  assert.equal(ledger.measures.length,16);
  assert.equal(expected.length,147);
  assert.equal(expected.filter(e=>e.grace).length,12);
});

test('Adelita detects the actual missing/altered events and the revised score matches the assisted source',async()=>{
  const withoutVoice=event=>({...event,voice:'canonical'});
  const ref=expected.map(withoutVoice);
  const received=readEvents(String(await load('converted-original.musicxml')),{includeStaff:true}).map(withoutVoice);
  const before=evaluateEvents(ref,received);
  assert.deepEqual([before.changed,before.missing,before.extra],[25,40,1]);
  assert.equal(evaluateEvents(expected,readEvents(xml,{includeStaff:true})).incorrect,0);
  // These were real source findings, not duration-normalization guesses.
  assert.ok(before.issues.some(x=>x.kind==='missing'&&x.expected.measure==='2'&&x.expected.pitch==='A:0:3'));
  assert.ok(before.issues.some(x=>x.kind==='missing'&&x.expected.measure==='16'&&x.expected.pitch==='E:0:3'));
  assert.equal(expected.filter(e=>e.measure==='15'&&e.onset===0&&e.kind==='note'&&e.voice==='1')[0].duration,0.75);
});

test('Adelita preserves written guitar pitch, E-major boundary, graces and rearticulation',()=>{
  const document=new DOMParser().parseFromString(xml,'application/xml');
  const measures=Array.from(document.getElementsByTagName('measure'));
  assert.equal(measures[8].getElementsByTagName('fifths')[0].textContent,'4');
  assert.equal(document.getElementsByTagName('octave-change')[0].textContent,'-1');
  assert.equal(document.getElementsByTagName('midi-program')[0].textContent,'25');
  assert.equal(document.getElementsByTagName('tie').length,0);
  assert.equal(document.getElementsByTagName('tied').length,0);
  assert.equal(document.getElementsByTagName('grace').length,12);
  assert.equal(expected.find(e=>e.kind==='note').pitch,'E:0:6');
  const finalSharp=Array.from(measures[13].getElementsByTagName('note')).find(n=>
    n.getElementsByTagName('voice')[0]?.textContent==='1'&&
    n.getElementsByTagName('step')[0]?.textContent==='A');
  assert.equal(finalSharp.getElementsByTagName('alter')[0].textContent,'1');
  assert.equal(finalSharp.getElementsByTagName('accidental')[0].textContent,'sharp');
});

test('Adelita renders 48 measures and all 376 sounding pitches, including the cross-voice A-sharp',async()=>{
  const toolkit=new VerovioToolkit(await createVerovioModule());
  try {
    toolkit.setOptions({inputFrom:'xml',breaks:'none'});
    assert.equal(Boolean(toolkit.loadData(xml)),true);
    const timemap=toolkit.renderToTimemap({includeMeasures:true});
    assert.equal(timemap.filter(x=>x.measureOn).length,48);
    const parsed=new toneMidi.Midi(Buffer.from(toolkit.renderToMIDI(),'base64'));
    const actual=parsed.tracks.flatMap(t=>t.notes.map(n=>n.midi)).sort((a,b)=>a-b);
    const performed=ledger.navigation.performed_source_measures.flatMap(n=>
      ledger.measures.find(m=>m.measure===n).events.filter(e=>e.event==='note').map(e=>
        12*(e.octave+1)+semitones[e.step]+e.alter_effective-12)).sort((a,b)=>a-b);
    assert.equal(actual.length,376);
    assert.deepEqual(actual,performed);
    assert.ok(parsed.tracks.every(t=>t.instrument.number+1===25));
    assert.ok(parsed.tracks.every(t=>t.notes.every(n=>n.duration>0&&n.velocity>0)));
  } finally { toolkit.destroy(); }
});
