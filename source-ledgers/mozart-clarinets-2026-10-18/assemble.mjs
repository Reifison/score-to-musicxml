import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import sharp from 'sharp';
import {VerovioToolkit} from 'verovio/esm';
import createVerovioModule from 'verovio/wasm';

const directoryIndex=process.argv.indexOf('--directory');
const root=path.resolve(directoryIndex<0?'output/mozart-clarinets-2026-10-18':process.argv[directoryIndex+1]);
const child=(p,name)=>Array.from(p.childNodes).filter(n=>n.nodeType===1 && (!name || n.nodeName===name));
const one=(p,name)=>child(p,name)[0];
const hash=s=>createHash('sha256').update(s).digest('hex');
const serializer=new XMLSerializer();
const expected=[...Array.from({length:295},(_,i)=>`I-${i+1}`),...Array.from({length:243},(_,i)=>`III-${i+1}`)];
function parse(xml) {
  const errors=[];
  const doc=new DOMParser({errorHandler:{warning:()=>{},error:m=>errors.push(m),fatalError:m=>errors.push(m)}}).parseFromString(xml,'application/xml');
  assert.equal(errors.length,0,errors.join('\n'));
  assert.equal(doc.documentElement.nodeName,'score-partwise');
  return doc;
}
const input=[];
for(const n of ['I','II']) {
  const file=path.join(root,`Clarinet-${n}-reviewed.musicxml`);
  const xml=await fs.readFile(file,'utf8');
  const doc=parse(xml);
  const parts=child(doc.documentElement,'part');
  assert.equal(parts.length,1,`${n}: a fonte revisada deve ter uma parte`);
  const measures=child(parts[0],'measure');
  assert.equal(measures.length,538,`${n}: parte incompleta`);
  const numbers=measures.map(m=>m.getAttribute('number'));
  // Review sources may use plain restarted numbering or movement-prefixed labels.
  const plain=[...Array.from({length:295},(_,i)=>String(i+1)),...Array.from({length:243},(_,i)=>String(i+1))];
  assert.ok(numbers.every((v,i)=>v===expected[i]) || numbers.every((v,i)=>v===plain[i]),`${n}: mapa de compassos inesperado`);
  input.push({file,xml,doc,part:parts[0],measures,sha256:hash(xml)});
}

const doc=parse('<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"/>');
const score=doc.documentElement;
const el=(name,value,attrs={})=>{
  const n=doc.createElement(name);
  for(const [k,v] of Object.entries(attrs)) n.setAttribute(k,String(v));
  if(value!==undefined) n.appendChild(doc.createTextNode(String(value)));
  return n;
};
const append=(parent,name,value,attrs)=>{const n=el(name,value,attrs);parent.appendChild(n);return n;};
const work=append(score,'work');
append(work,'work-title','Sinfonia No. 31 em Re maior - Paris, K. 297 (300a)');
append(score,'movement-title','Clarinetes I e II em La');
const identification=append(score,'identification');
append(identification,'creator','Wolfgang Amadeus Mozart',{type:'composer'});
const encoding=append(identification,'encoding');
append(encoding,'software','Source-based conversion and two-part assembly');
append(encoding,'encoding-date','2026-10-18');
append(identification,'source','Mozart - Pariser Sinfonie - 03 - Clarinet.pdf; all 10 source pages');
const misc=append(identification,'miscellaneous');
append(misc,'miscellaneous-field','d46a8c5ed40b46d5fe5200ef70c91e42298994bc25117c15017ab426f7f8a343',{name:'source-pdf-sha256'});
append(misc,'miscellaneous-field','I: 295 measures; II: Andante tacet, no duration supplied; III: 243 measures',{name:'movement-map'});
append(misc,'miscellaneous-field','A clarinets; sounding pitch = written pitch minus 3 semitones',{name:'transposition'});
append(misc,'miscellaneous-field','Cue notes are visible references only and are excluded from the accompanying MIDI',{name:'cue-playback'});
append(misc,'miscellaneous-field','Editorial audition tempi: I quarter=132; III quarter=192; no numerical tempo supplied in PDF',{name:'midi-tempo-policy'});
for(const [i,s] of input.entries()) append(misc,'miscellaneous-field',s.sha256,{name:`reviewed-part-${i+1}-sha256`});
const defaults=append(score,'defaults');
const scaling=append(defaults,'scaling');append(scaling,'millimeters','7');append(scaling,'tenths','40');
const pageLayout=append(defaults,'page-layout');append(pageLayout,'page-height','1697');append(pageLayout,'page-width','1200');
const margins=append(pageLayout,'page-margins',undefined,{type:'both'});
for(const n of ['left-margin','right-margin','top-margin','bottom-margin']) append(margins,n,'60');
const partList=append(score,'part-list');
const group=append(partList,'part-group',undefined,{type:'start',number:'1'});
append(group,'group-symbol','bracket');append(group,'group-barline','yes');
for(const [i,roman] of ['I','II'].entries()) {
  const p=append(partList,'score-part',undefined,{id:`P${i+1}`});
  append(p,'part-name',`Clarinete ${roman} em La`);append(p,'part-abbreviation',`Cl. ${roman}`);
  const instrument=append(p,'score-instrument',undefined,{id:`P${i+1}-I1`});
  append(instrument,'instrument-name','Clarinet in A');append(instrument,'instrument-abbreviation','Cl.');
  const midi=append(p,'midi-instrument',undefined,{id:`P${i+1}-I1`});
  append(midi,'midi-channel',i+1);append(midi,'midi-program',72);
}
append(partList,'part-group',undefined,{type:'stop',number:'1'});

const sourceNoteSignatures=[];
const finalNoteSignatures=[];
function signature(n) {
  const c=n.cloneNode(true);
  for(const e of [c,...Array.from(c.getElementsByTagName('*'))]) for(const name of ['id','default-x','default-y','relative-x','relative-y']) e.removeAttribute(name);
  for(const instrument of child(c,'instrument')) c.removeChild(instrument);
  return serializer.serializeToString(c);
}
for(const [i,source] of input.entries()) {
  const part=append(score,'part',undefined,{id:`P${i+1}`});
  const sourceNotes=Array.from(source.part.getElementsByTagName('note'));
  sourceNoteSignatures.push(sourceNotes.map(signature));
  let ni=0;
  for(const [index,original] of source.measures.entries()) {
    const measure=doc.importNode(original,true);
    measure.setAttribute('number',expected[index]);
    measure.setAttribute('id',`P${i+1}-${expected[index]}`);
    measure.removeAttribute('width');
    for(const print of child(measure,'print')) measure.removeChild(print);
    for(const n of Array.from(measure.getElementsByTagName('*'))) for(const a of ['default-x','default-y','relative-x','relative-y']) n.removeAttribute(a);
    for(const note of Array.from(measure.getElementsByTagName('note'))) {
      note.setAttribute('id',`P${i+1}-n${++ni}`);
      for(const instrument of child(note,'instrument')) note.removeChild(instrument);
    }
    const attributes=child(measure,'attributes');
    for(const a of attributes) {
      for(const staves of child(a,'staves')) assert.equal(staves.textContent.trim(),'1','Cada clarinete deve ter sua pauta propria');
      for(const key of child(a,'key')) assert.equal(one(key,'fifths')?.textContent.trim(),'-1','Armadura inesperada');
    }
    // Both source parts remain in A throughout this PDF.
    for(const transpose of Array.from(measure.getElementsByTagName('transpose'))) transpose.parentNode.removeChild(transpose);
    if(index===0) {
      const a=attributes[0] ?? el('attributes');
      if(!a.parentNode) measure.insertBefore(a,measure.firstChild);
      const transpose=append(a,'transpose');append(transpose,'diatonic',-2);append(transpose,'chromatic',-3);
    }
    if(index===0 || index===295) {
      const print=el('print',undefined,index===295?{'new-page':'yes'}:{});
      append(print,'measure-numbering','system');measure.insertBefore(print,measure.firstChild);
      if(i===0) {
        // Audition reference only: the source gives tempo words, not a metronome number.
        const tempo=el('sound',undefined,{tempo:index===0?132:192});
        measure.insertBefore(tempo,one(measure,'note') ?? null);
      }
    }
    part.appendChild(measure);
  }
  finalNoteSignatures.push(Array.from(part.getElementsByTagName('note')).map(signature));
}
assert.deepEqual(finalNoteSignatures,sourceNoteSignatures,'A montagem mudou eventos musicais revisados');
const xml='<?xml version="1.0" encoding="UTF-8"?>\n'+serializer.serializeToString(score)+'\n';
const file=path.join(root,'Mozart-Paris-Clarinetes.musicxml');
await fs.writeFile(file,xml);
const report={file,sha256:hash(xml),parts:2,stavesPerPart:1,measuresPerPart:538,movements:{I:295,II:'tacet - duration unspecified',III:243},
  sourceHashes:input.map(s=>({file:s.file,sha256:s.sha256})),noteEventsPreserved:sourceNoteSignatures.map(x=>x.length),noteContentUnchangedByAssembly:true};
await fs.writeFile(path.join(root,'assembly-validation.json'),JSON.stringify(report,null,2)+'\n');
if(process.argv.includes('--render')) {
  const dir=path.resolve('tmp/mozart-omr-2026-10-18/combined-preview');await fs.mkdir(dir,{recursive:true});
  const tk=new VerovioToolkit(await createVerovioModule());
  tk.setOptions({inputFrom:'xml',breaks:'smart',pageWidth:2100,pageHeight:2970,scale:40,adjustPageHeight:true,midiNoCue:true});
  assert.ok(tk.loadData(xml),'O renderizador nao carregou o XML');
  const pages=tk.getPageCount();
  const selected=process.argv.includes('--render-all')?Array.from({length:pages},(_,n)=>n+1):[...new Set([1,2,Math.ceil(pages/2),pages])].filter(n=>n<=pages);
  for(const page of selected) await sharp(Buffer.from(tk.renderToSVG(page))).flatten({background:'#ffffff'}).png().toFile(path.join(dir,`page-${String(page).padStart(2,'0')}.png`));
  report.render={pages,selected,directory:dir};await fs.writeFile(path.join(root,'assembly-validation.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report,null,2));
