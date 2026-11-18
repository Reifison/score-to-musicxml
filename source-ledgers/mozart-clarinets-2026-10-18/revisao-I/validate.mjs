import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DOMParser} from '@xmldom/xmldom';
import {createHash} from 'node:crypto';
const root=path.dirname(new URL(import.meta.url).pathname);
const file=path.resolve('output/mozart-clarinets-2026-10-18/Clarinet-I-reviewed.musicxml');
const xml=await fs.readFile(file,'utf8');const errs=[];
const doc=new DOMParser({errorHandler:{warning:m=>errs.push(m),error:m=>errs.push(m),fatalError:m=>errs.push(m)}}).parseFromString(xml,'text/xml');assert.equal(errs.length,0,errs.join('\n'));
const ch=(p,name)=>Array.from(p.childNodes).filter(x=>x.nodeType===1&&(!name||x.nodeName===name));
const one=(p,name)=>ch(p,name)[0];const txt=(p,name)=>one(p,name)?.textContent;
const parts=ch(doc.documentElement,'part');assert.equal(parts.length,1);const measures=ch(parts[0],'measure');assert.equal(measures.length,538);
const expected=[...Array.from({length:295},(_,i)=>`I-${i+1}`),...Array.from({length:243},(_,i)=>`III-${i+1}`)];assert.deepEqual(measures.map(m=>m.getAttribute('number')),expected);
const report={file,sha256:createHash('sha256').update(xml).digest('hex'),measures:538,movements:{I:295,III:243},mainNotes:0,cueNotes:0,graces:0,tieStarts:0,slurStarts:0,measuresWithCues:0,multirestGroups:doc.getElementsByTagName('multiple-rest').length,issues:[]};
let div=0,global=0;const ties=new Map(),slurs=new Map();
for(const m of measures){
 let cursor=0,anchor=0;const voices=new Map();let hasCue=false;
 const mn=m.getAttribute('number');
 for(const e of ch(m)){
  if(e.nodeName==='attributes'&&txt(e,'divisions'))div=Number(txt(e,'divisions'));
  if(e.nodeName==='backup'){cursor-=Number(txt(e,'duration'))/div;assert.ok(cursor>=0);continue;}
  if(e.nodeName!=='note')continue;
  const grace=!!one(e,'grace'),cue=!!one(e,'cue'),chord=!!one(e,'chord');const duration=grace?0:Number(txt(e,'duration'))/div;
  const onset=chord?anchor:cursor;const voice=txt(e,'voice');const pitch=one(e,'pitch');
  if(!chord){voices.set(voice,(voices.get(voice)||0)+duration);anchor=cursor;cursor+=duration;}
  if(cue)hasCue=true;if(grace)report.graces++;
  if(pitch){
   if(cue)report.cueNotes++;else report.mainNotes++;
   const key=`${voice}:${txt(pitch,'step')}:${txt(pitch,'alter')||0}:${txt(pitch,'octave')}`;
   for(const tie of ch(e,'tie')){
    if(tie.getAttribute('type')==='stop'){const start=ties.get(key);assert.ok(start,`${mn}: tie stop has no start ${key}`);assert.equal(start.end,global+onset,`${mn}: noncontiguous tie ${key}`);ties.delete(key);}
    if(tie.getAttribute('type')==='start'){assert.ok(!ties.has(key));ties.set(key,{measure:mn,end:global+onset+duration});report.tieStarts++;}
   }
  }
  for(const nt of ch(e,'notations'))for(const slur of ch(nt,'slur')){
   const key=`${voice}:${slur.getAttribute('number')||1}`;
   if(slur.getAttribute('type')==='stop'){assert.ok(slurs.has(key),`${mn}: slur without start`);slurs.delete(key);}
   if(slur.getAttribute('type')==='start'){assert.ok(!slurs.has(key),`${mn}: duplicate slur`);slurs.set(key,mn);report.slurStarts++;}
  }
 }
 assert.equal(voices.get('1'),4,`${mn}: main voice duration`);for(const[v,d]of voices)assert.equal(d,4,`${mn}: voice ${v} duration`);
 if(hasCue)report.measuresWithCues++;global+=4;
}
assert.equal(ties.size,0,`Unclosed ties: ${JSON.stringify([...ties])}`);assert.equal(slurs.size,0,`Unclosed slurs: ${JSON.stringify([...slurs])}`);
assert.equal(doc.getElementsByTagName('transpose')[0].getElementsByTagName('chromatic')[0].textContent,'-3');
report.quarterBeats=global;report.allMeasuresExactlyFourQuarterBeats=true;report.tiesContiguousAndBalanced=true;report.slursBalanced=true;
await fs.writeFile(`${root}/structural-validation.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
