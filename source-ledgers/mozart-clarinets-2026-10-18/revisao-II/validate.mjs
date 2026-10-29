import fs from 'node:fs';
import path from 'node:path';
import {DOMParser} from '@xmldom/xmldom';
const dir=path.dirname(new URL(import.meta.url).pathname);
const xml=fs.readFileSync('output/mozart-clarinets-2026-10-18/Clarinet-II-reviewed.musicxml','utf8');
const parserErrors=[],doc=new DOMParser({errorHandler:{warning:x=>parserErrors.push(x),error:x=>parserErrors.push(x),fatalError:x=>parserErrors.push(x)}}).parseFromString(xml,'application/xml');
const children=(p,n)=>Array.from(p.childNodes).filter(c=>c.nodeType===1&&c.localName===n);
const val=(p,n)=>children(p,n)[0]?.textContent;
const ties=new Map(),slurs=new Map(),issues=[];let global=0,tiePairs=0,slurPairs=0,main=0,cue=0;
const ms=Array.from(doc.getElementsByTagName('measure'));
const expected=[...Array.from({length:295},(_,i)=>'I-'+(i+1)),...Array.from({length:243},(_,i)=>'III-'+(i+1))];
ms.forEach((m,mi)=>{const id=m.getAttribute('number');if(id!==expected[mi])issues.push('Unexpected measure '+id);let cursor=0,priorOnset=0;const voices=new Map();
 for(const e of Array.from(m.childNodes).filter(n=>n.nodeType===1)){
  if(e.localName==='backup'){cursor-=+val(e,'duration');continue;}if(e.localName!=='note')continue;
  const isCue=children(e,'cue').length>0,grace=children(e,'grace').length>0,chord=children(e,'chord').length>0;
  const duration=grace?0:+val(e,'duration'),voice=val(e,'voice'),onset=global+(chord?priorOnset:cursor),pitch=children(e,'pitch')[0];
  if(!chord){priorOnset=cursor;voices.set(voice,(voices.get(voice)||0)+duration);cursor+=duration;}
  if(pitch){isCue?cue++:main++;const pk=[voice,val(pitch,'step'),val(pitch,'alter')||'0',val(pitch,'octave')].join(':');
   for(const t of children(e,'tie').filter(t=>t.getAttribute('type')==='stop')){if(ties.get(pk)!==onset)issues.push(`Tie stop without adjacent start ${id} ${pk}`);else{tiePairs++;ties.delete(pk);}}
   for(const t of children(e,'tie').filter(t=>t.getAttribute('type')==='start')){if(ties.has(pk))issues.push(`Tie overwritten ${id} ${pk}`);ties.set(pk,onset+duration);}
  }
  const no=children(e,'notations')[0];if(no)for(const s of children(no,'slur')){const k=voice+':'+s.getAttribute('number');if(s.getAttribute('type')==='stop'){if(!slurs.has(k))issues.push(`Unmatched slur stop ${id} ${k}`);else{slurPairs++;slurs.delete(k);}}else{if(slurs.has(k))issues.push(`Slur overwritten ${id} ${k}`);slurs.set(k,id);}}
 }
 for(const [voice,d]of voices)if(d!==64)issues.push(`Duration ${id} voice${voice}: ${d}`);global+=64;
});
for(const [k]of ties)issues.push('Unclosed tie '+k);for(const [k]of slurs)issues.push('Unclosed slur '+k);
const report={measures:ms.length,sourceMovementCounts:{I:295,III:243},mainNotes:main,cueNotes:cue,tiePairs,slurPairs,parserErrors,issues,complete:ms.length===538&&issues.length===0&&parserErrors.length===0,limits:'Structural checks do not independently certify visual source fidelity.'};
fs.writeFileSync(dir+'/structural-validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.complete)process.exitCode=1;
