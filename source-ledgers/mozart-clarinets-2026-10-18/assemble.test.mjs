import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {DOMParser} from '@xmldom/xmldom';

const directory=path.resolve('tmp/mozart-omr-2026-10-18/assembly-fixture');
await fs.mkdir(directory,{recursive:true});
const labels=[...Array.from({length:295},(_,i)=>`I-${i+1}`),...Array.from({length:243},(_,i)=>`III-${i+1}`)];
for(const [i,roman] of ['I','II'].entries()) {
  const measures=labels.map((label,index)=>{
    const attrs=index===0?'<attributes><divisions>1</divisions><key><fifths>-1</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves><clef><sign>G</sign><line>2</line></clef><transpose><diatonic>-2</diatonic><chromatic>-3</chromatic></transpose></attributes>':
      index===295?'<attributes><time><beats>2</beats><beat-type>2</beat-type></time></attributes>':'';
    const main=index===0?`<note id="old-note"><pitch><step>${i?'E':'B'}</step><alter>${i?0:-1}</alter><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>`:
      '<note><rest measure="yes"/><duration>4</duration><voice>1</voice></note>';
    const cue=index===1?'<backup><duration>4</duration></backup><note><cue/><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>2</voice><type size="cue">whole</type></note>':'';
    return `<measure number="${label}">${attrs}${main}${cue}</measure>`;
  }).join('');
  await fs.writeFile(path.join(directory,`Clarinet-${roman}-reviewed.musicxml`),`<score-partwise version="4.0"><part-list><score-part id="old"><part-name>TEST FIXTURE ONLY</part-name></score-part></part-list><part id="old">${measures}</part></score-partwise>`);
}
execFileSync(process.execPath,['source-ledgers/mozart-clarinets-2026-10-18/assemble.mjs','--directory',directory],{stdio:'pipe'});
const xml=await fs.readFile(path.join(directory,'Mozart-Paris-Clarinetes.musicxml'),'utf8');
const doc=new DOMParser().parseFromString(xml,'application/xml');
const parts=Array.from(doc.getElementsByTagName('part'));
assert.equal(parts.length,2);
assert.deepEqual(parts.map(p=>p.getElementsByTagName('measure').length),[538,538]);
assert.deepEqual(parts.map(p=>p.getElementsByTagName('chromatic')[0].textContent),['-3','-3']);
assert.deepEqual(parts.map(p=>p.getElementsByTagName('cue').length),[1,1]);
assert.deepEqual(parts.map(p=>p.getElementsByTagName('note')[0].getAttribute('id')),['P1-n1','P2-n1']);
assert.equal(doc.getElementsByTagName('midi-channel')[1].textContent,'2');
assert.equal(doc.getElementsByTagName('midi-program')[1].textContent,'72');
assert.equal(parts[0].getElementsByTagName('measure')[295].getAttribute('number'),'III-1');
assert.deepEqual(Array.from(doc.getElementsByTagName('sound')).map(n=>n.getAttribute('tempo')),['132','192']);
const report=JSON.parse(await fs.readFile(path.join(directory,'assembly-validation.json'),'utf8'));
assert.equal(report.noteContentUnchangedByAssembly,true);
console.log('PASS: two-part assembly, 538 synchronized measures, cues, pitch preservation, transposition, IDs, channels and audition tempi.');
