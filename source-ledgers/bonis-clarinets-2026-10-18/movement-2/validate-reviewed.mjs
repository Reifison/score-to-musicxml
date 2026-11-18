import fs from 'node:fs';
import {DOMParser} from '@xmldom/xmldom';
import {inspectMusicXmlValidation} from '../../../apps/api/src/services/MusicXmlValidation.ts';
import {readEvents,ledgerEvents,evaluateEvents} from '../../../scripts/evaluate-musicxml-reference.mjs';
const dir=new URL('./',import.meta.url);
const xmlPath=new URL('../../../output/bonis-clarinets-reviewed-2026-10-18/02-Interlude-et-Valse-lente.musicxml',import.meta.url);
const xml=fs.readFileSync(xmlPath,'utf8');
const ledger=JSON.parse(fs.readFileSync(new URL('source-ledger.json',dir),'utf8'));
const parserErrors=[];
const document=new DOMParser({errorHandler:{warning:x=>parserErrors.push(x),error:x=>parserErrors.push(x),fatalError:x=>parserErrors.push(x)}}).parseFromString(xml,'application/xml');
const els=(p,name)=>Array.from(p.childNodes).filter(n=>n.nodeType===1&&n.localName===name);
const text=(p,name)=>els(p,name)[0]?.textContent;
const validation=inspectMusicXmlValidation(xml);
const ties=new Map(),slurs=new Map(),beamGroups=new Map(),structureIssues=[];
let tiePairs=0,slurPairs=0,beamEnds=0,global=0;
for(const measure of Array.from(document.getElementsByTagName('measure'))){
  let cursor=0;const staffSet=new Set();
  for(const e of Array.from(measure.childNodes).filter(n=>n.nodeType===1)){
    if(e.localName==='backup'){cursor-=Number(text(e,'duration'));continue;}
    if(e.localName==='forward'){cursor+=Number(text(e,'duration'));continue;}
    if(e.localName!=='note')continue;
    const staff=text(e,'staff'),voice=text(e,'voice'),pitch=els(e,'pitch')[0];
    staffSet.add(staff);
    const dur=els(e,'grace').length?0:Number(text(e,'duration'));
    const onset=global+cursor;
    if(pitch){
      const key=[staff,voice,text(pitch,'step'),text(pitch,'alter')||'0',text(pitch,'octave')].join(':');
      for(const tie of els(e,'tie').filter(x=>x.getAttribute('type')==='stop')){
        if(ties.get(key)!==onset)structureIssues.push(`Tie stop without adjacent same-pitch start ${measure.getAttribute('number')} ${key}`);
        else{tiePairs++;ties.delete(key);}
      }
      for(const tie of els(e,'tie').filter(x=>x.getAttribute('type')==='start')){
        if(ties.has(key))structureIssues.push(`Unclosed tie overwritten ${key}`);
        ties.set(key,onset+dur);
      }
    }
    const notations=els(e,'notations')[0];
    if(notations)for(const sl of els(notations,'slur')){
      const key=staff+':'+sl.getAttribute('number');
      if(sl.getAttribute('type')==='stop'){
        if(!slurs.has(key))structureIssues.push(`Unpaired slur stop ${measure.getAttribute('number')} ${key}`);
        else{slurPairs++;slurs.delete(key);}
      }else{
        if(slurs.has(key))structureIssues.push(`Slur overwritten ${measure.getAttribute('number')} ${key}`);
        slurs.set(key,measure.getAttribute('number'));
      }
    }
    for(const b of els(e,'beam')){
      const key=staff+':'+voice+':'+b.getAttribute('number');
      if(b.textContent==='begin'){
        if(beamGroups.has(key))structureIssues.push(`Beam begin overwrites ${measure.getAttribute('number')} ${key}`);
        beamGroups.set(key,measure.getAttribute('number'));
      }else if(b.textContent==='end'){
        if(!beamGroups.has(key))structureIssues.push(`Beam end without start ${measure.getAttribute('number')} ${key}`);
        else{beamEnds++;beamGroups.delete(key);}
      }else if(!beamGroups.has(key))structureIssues.push(`Beam continue without start ${measure.getAttribute('number')} ${key}`);
    }
    cursor+=dur;
  }
  if(staffSet.size!==2||!staffSet.has('1')||!staffSet.has('2'))structureIssues.push('Missing staff '+measure.getAttribute('number'));
  global+=12;
}
for(const [k]of ties)structureIssues.push('Unclosed tie '+k);
for(const [k]of slurs)structureIssues.push('Unclosed slur '+k);
for(const [k]of beamGroups)structureIssues.push('Unclosed beam '+k);
const eventComparison=evaluateEvents(ledgerEvents(ledger),readEvents(xml,{includeStaff:true}));
const result={parserErrors,checkedMeasures:validation.checkedMeasures,voiceChecks:validation.voiceChecks.length,metricIssues:validation.issues,structureIssues,tiePairs,slurPairs,beamGroups:beamEnds,
  xmlMeasures:document.getElementsByTagName('measure').length,staffCount:2,cues:Array.from(document.getElementsByTagName('note')).filter(n=>els(n,'cue').length&&els(n,'pitch').length).length,
  eventComparison:{expected:eventComparison.expectedEvents,actual:eventComparison.actualEvents,changed:eventComparison.changed,missing:eventComparison.missing,extra:eventComparison.extra},
  editorialEmendations:ledger.editorialEmendations,sourceReviewScope:ledger.sourceSystems,
  limits:'Metric and event/ledger checks do not independently prove source pitch accuracy; visual source reading is documented separately.'};
fs.writeFileSync(new URL('validation.json',dir),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(parserErrors.length||validation.issues.length||structureIssues.length||eventComparison.incorrect)process.exitCode=1;
