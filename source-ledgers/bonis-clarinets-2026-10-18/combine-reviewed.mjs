import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {readEvents} from '../../scripts/evaluate-musicxml-reference.mjs';
import {inspectMusicXmlValidation} from '../../apps/api/src/services/MusicXmlValidation.ts';
import {parseScore,buildPerformance,definitions} from './export-reviewed.mjs';
import {VerovioToolkit} from 'verovio/esm';
import createVerovioModule from 'verovio/wasm';
import sharp from 'sharp';

const root=path.resolve('output/bonis-clarinets-reviewed-2026-10-18');
const output=path.join(root,'music.xml');
const previewDirectory=path.resolve('tmp/bonis-review/root/combined');
const child=(parent,name)=>Array.from(parent.childNodes).filter(n=>n.nodeType===1&&(!name||n.nodeName===name));
const one=(parent,name)=>child(parent,name)[0];
const serializer=new XMLSerializer();
const sha256=value=>createHash('sha256').update(value).digest('hex');
const reports=JSON.parse(await fs.readFile(path.join(root,'validation-report.json'),'utf8'));

const doc=new DOMParser().parseFromString('<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"/>','application/xml');
const score=doc.documentElement;
const element=(name,value,attributes={})=>{
  const e=doc.createElement(name);
  for(const [key,v] of Object.entries(attributes)) e.setAttribute(key,String(v));
  if(value!==undefined) e.appendChild(doc.createTextNode(String(value)));
  return e;
};
const work=element('work');
work.appendChild(element('work-title','Suite en forme de valses - Clarinettes'));
score.appendChild(work);
score.appendChild(element('movement-title','I - Ballabile'));
const identification=element('identification');
identification.appendChild(element('creator','Mel Bonis',{type:'composer'}));
const encoding=element('encoding');
encoding.appendChild(element('software','Compilation of three source-reviewed movements; original musical events preserved'));
encoding.appendChild(element('encoding-date','2026-10-18'));
identification.appendChild(encoding);
identification.appendChild(element('source','Bonis - Suite en forme de valses - 03 - Clarinets.pdf, pages 1-6'));
const miscellaneous=element('miscellaneous');
identification.appendChild(miscellaneous);
score.appendChild(identification);

const sourceDocuments=[];
for(const definition of definitions) {
  const xml=await fs.readFile(path.join(root,definition.file),'utf8');
  const expected=reports.find(r=>r.file===definition.file);
  assert.equal(sha256(xml),expected.xmlSHA256,`A versão de origem mudou: ${definition.file}`);
  sourceDocuments.push({definition,xml,document:new DOMParser().parseFromString(xml,'application/xml')});
}
score.appendChild(doc.importNode(one(sourceDocuments[0].document.documentElement,'defaults'),true));
const partList=doc.importNode(one(sourceDocuments[0].document.documentElement,'part-list'),true);
const scorePart=one(partList,'score-part');
one(scorePart,'part-name').textContent='Clarinetes 1-2';
one(scorePart,'part-abbreviation').textContent='Cl. 1-2';
for(const [index,instrument] of child(scorePart,'score-instrument').entries()) one(instrument,'instrument-name').textContent=`Clarinete ${index+1} (La / Si bemol)`;
score.appendChild(partList);
const part=element('part',undefined,{id:'P1'});
score.appendChild(part);

const expectedEvents=[];
const sourceNotes=[];
const expectedPerformance=[];
const expectedSlurs=[];
const movementRanges=[];
const sectionTempos={};
let measureOffset=0,performanceOffset=0,noteOffset=0;

function noteSignature(note) {
  const clone=note.cloneNode(true);
  for(const instrument of child(clone,'instrument')) clone.removeChild(instrument);
  for(const slur of Array.from(clone.getElementsByTagName('slur'))) slur.removeAttribute('number');
  return serializer.serializeToString(clone);
}

function slurConnections(document) {
  const open=new Map(),connections=[];
  for(const [index,note] of Array.from(document.getElementsByTagName('note')).entries()) {
    const staff=one(note,'staff')?.textContent?.trim()??'1';
    for(const slur of Array.from(note.getElementsByTagName('slur'))) {
      const key=`${staff}:${slur.getAttribute('number')||'1'}`;
      if(slur.getAttribute('type')==='stop') {
        assert.ok(open.has(key),`Ligadura sem início: ${key}`);
        connections.push({staff,from:open.get(key),to:index});
        open.delete(key);
      }
      if(slur.getAttribute('type')==='start') {
        assert.ok(!open.has(key),`Ligadura sobreposta: ${key}`);
        open.set(key,index);
      }
    }
  }
  assert.equal(open.size,0,'Ligadura aberta');
  return connections;
}

for(const [movementIndex,source] of sourceDocuments.entries()) {
  const {definition,xml,document}=source;
  const sourceRoot=document.documentElement;
  const sourceIdentification=one(sourceRoot,'identification');
  for(const software of Array.from(sourceIdentification.getElementsByTagName('software'))) encoding.appendChild(doc.importNode(software,true));
  const sourceMiscellaneous=one(sourceIdentification,'miscellaneous');
  for(const field of child(sourceMiscellaneous,'miscellaneous-field')) {
    const clone=doc.importNode(field,true);
    clone.setAttribute('name',`movement-${movementIndex+1}:${field.getAttribute('name')}`);
    miscellaneous.appendChild(clone);
  }
  miscellaneous.appendChild(element('miscellaneous-field',sha256(xml),{name:`movement-${movementIndex+1}:source-xml-sha256`}));
  const sourceMeasures=child(one(sourceRoot,'part'),'measure');
  movementRanges.push({movement:movementIndex+1,title:definition.title,start:measureOffset+1,end:measureOffset+sourceMeasures.length,localMeasures:sourceMeasures.length});
  miscellaneous.appendChild(element('miscellaneous-field',`${definition.title}: global ${measureOffset+1}-${measureOffset+sourceMeasures.length}; original 1-${sourceMeasures.length}`,{name:`movement-${movementIndex+1}:measure-map`}));
  for(const event of readEvents(xml,{includeStaff:true})) expectedEvents.push({...event,measure:String(Number(event.measure)+measureOffset)});
  sourceNotes.push(...Array.from(document.getElementsByTagName('note')).map(noteSignature));
  expectedSlurs.push(...slurConnections(document).map(s=>({...s,from:s.from+noteOffset,to:s.to+noteOffset})));
  noteOffset+=document.getElementsByTagName('note').length;
  const slurNumbers={1:new Map(),2:new Map()};
  for(const note of Array.from(document.getElementsByTagName('note'))) {
    const staff=Number(one(note,'staff')?.textContent?.trim()??1);
    for(const slur of Array.from(note.getElementsByTagName('slur'))) {
      const original=slur.getAttribute('number')||'1';
      if(!slurNumbers[staff].has(original)) slurNumbers[staff].set(original,(staff===1?1:9)+slurNumbers[staff].size);
    }
  }
  assert.ok(slurNumbers[1].size<=8&&slurNumbers[2].size<=8,'Número de ligaduras simultâneas fora do limite');
  const originalPerformance=buildPerformance(parseScore(xml,definition),definition);
  assert.deepEqual(originalPerformance.issues,[]);
  expectedPerformance.push(...originalPerformance.notes.map(n=>({staff:n.staff,pitch:n.pitch,start:n.start+performanceOffset,end:n.end+performanceOffset})));
  performanceOffset+=originalPerformance.duration;
  sectionTempos[measureOffset+1]=definition.bpm;
  for(const [number,bpm] of Object.entries(definition.sectionTempos??{})) sectionTempos[Number(number)+measureOffset]=bpm;

  for(const [index,sourceMeasure] of sourceMeasures.entries()) {
    const measure=doc.importNode(sourceMeasure,true);
    const globalNumber=measureOffset+index+1;
    measure.setAttribute('number',String(globalNumber));
    part.appendChild(doc.createComment(` ${definition.title}; original measure ${sourceMeasure.getAttribute('number')} `));
    if(index===0) {
      let print=one(measure,'print');
      if(!print) {print=element('print');measure.insertBefore(print,measure.firstChild);}
      if(movementIndex>0) {print.setAttribute('new-page','yes');print.removeAttribute('new-system');}
      const heading=element('direction',undefined,{placement:'above'});
      const directionType=element('direction-type');
      directionType.appendChild(element('words',definition.title,{'font-size':'16','font-weight':'bold'}));
      heading.appendChild(directionType);
      heading.appendChild(element('staff','1'));
      measure.insertBefore(heading,one(measure,'direction')??one(measure,'note'));
    }
    if(sectionTempos[globalNumber]) {
      const direction=element('direction');
      const type=element('direction-type');
      type.appendChild(element('words',''));
      // The editorial metronome is playback data; printed verbal tempo remains untouched.
      direction.appendChild(type);
      direction.appendChild(element('staff','1'));
      direction.appendChild(element('sound',undefined,{tempo:sectionTempos[globalNumber]}));
      measure.insertBefore(direction,one(measure,'direction')??one(measure,'note'));
    }
    for(const note of child(measure,'note')) {
      const staff=one(note,'staff')?.textContent?.trim()??'1';
      for(const slur of Array.from(note.getElementsByTagName('slur'))) slur.setAttribute('number',String(slurNumbers[staff].get(slur.getAttribute('number')||'1')));
      if(!one(note,'pitch') || one(note,'instrument')) continue;
      note.insertBefore(element('instrument',undefined,{id:`P1-I${staff}`}),one(note,'voice')??one(note,'type')??one(note,'staff'));
    }
    part.appendChild(measure);
  }
  measureOffset+=sourceMeasures.length;
}
miscellaneous.appendChild(element('miscellaneous-field','Metronome values are editorial realizations of the printed verbal tempos; original written notation retained.',{name:'editorial-playback-tempos'}));
const result=serializer.serializeToString(doc)+'\n';
assert.deepEqual(readEvents(result,{includeStaff:true}),expectedEvents,'Os eventos musicais não correspondem às origens');
const reparsed=new DOMParser().parseFromString(result,'application/xml');
assert.deepEqual(Array.from(reparsed.getElementsByTagName('note')).map(noteSignature),sourceNotes,'Foi alterada a notação de uma nota');
assert.deepEqual(slurConnections(reparsed),expectedSlurs,'Mudou a ligação entre as notas de uma ligadura');
const combinedDefinition={file:'music.xml',title:'Suite en forme de valses',bpm:definitions[0].bpm,sectionTempos};
const parsed=parseScore(result,combinedDefinition);
const musicalValidation=inspectMusicXmlValidation(result);
assert.deepEqual(parsed.notationIssues,[]);
assert.deepEqual(musicalValidation.issues,[]);
const combinedPerformance=buildPerformance(parsed,combinedDefinition);
assert.deepEqual(combinedPerformance.issues,[]);
const order=notes=>notes.map(n=>({staff:n.staff,pitch:n.pitch,start:n.start,end:n.end})).sort((a,b)=>a.staff-b.staff||a.start-b.start||a.pitch-b.pitch);
assert.deepEqual(order(combinedPerformance.notes),order(expectedPerformance),'A execução unificada diverge dos movimentos originais');
assert.equal(parsed.measures.length,369);
assert.equal(combinedPerformance.order.length,389);
assert.equal(combinedPerformance.notes.length,986);
await fs.writeFile(output,result);

await fs.mkdir(previewDirectory,{recursive:true});
const toolkit=new VerovioToolkit(await createVerovioModule());
toolkit.setOptions({inputFrom:'xml',breaks:'smart',pageWidth:2100,pageHeight:2970,scale:40,adjustPageHeight:true,midiNoCue:true});
assert.ok(toolkit.loadData(result),'O mecanismo de leitura não abriu o MusicXML');
const previews=[];
for(let page=1;page<=toolkit.getPageCount();page++) {
  const preview=path.join(previewDirectory,`music-page-${page}.png`);
  await sharp(Buffer.from(toolkit.renderToSVG(page))).flatten({background:'#ffffff'}).png().toFile(preview);
  previews.push(preview);
}
toolkit.destroy();
const report={file:output,sha256:sha256(result),movements:movementRanges,staffCount:2,measures:369,performedMeasures:389,
  preservedMusicalEvents:expectedEvents.length,preservedPitchedNotes:parsed.noteCount,checkedPerformedAttacks:combinedPerformance.notes.length,
  noteNotationPreserved:true,sourceEventsIdentical:true,performanceIdentical:true,preservedSlurs:expectedSlurs.length,notationIssues:parsed.notationIssues,
  musicalValidation,previews};
await fs.writeFile(path.join(root,'music-unificado-validacao.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,musicalValidation:{checkedMeasures:musicalValidation.checkedMeasures,issues:musicalValidation.issues},previews},null,2));
