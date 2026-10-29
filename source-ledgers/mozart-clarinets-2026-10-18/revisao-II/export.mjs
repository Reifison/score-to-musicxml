import fs from 'node:fs';
import path from 'node:path';
import {sections,cues,dynamics,slurs,trills,printedAccidentals,words} from './ledger.mjs';
const here=path.dirname(new URL(import.meta.url).pathname);
const dur={w:64,h:32,q:16,e:8,s:4,t:2,x:1};
const types={w:'whole',h:'half',q:'quarter',e:'eighth',s:'16th',t:'32nd',x:'64th'};
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const parse=(bar)=>bar.trim().split(/\s+/).map(t=>{const m=t.match(/^((?:R|[A-G](?:b|#|n)?[0-8])(?:\+[A-G](?:b|#|n)?[0-8])*)([whqestxg])(d?)(~?)(?::(st|ss))?$/);if(!m)throw new Error('Bad token '+t);return{p:m[1],d:m[2]==='g'?0:dur[m[2]]*(m[3]?1.5:1),type:m[2]==='g'?'eighth':types[m[2]],grace:m[2]==='g',dot:!!m[3],tie:!!m[4],art:m[5]};});
const expand=str=>str.split('|').flatMap(bar=>{const m=bar.trim().match(/^Rw\*(\d+)$/);return m?Array.from({length:+m[1]},()=>parse('Rw')):[parse(bar)];});
// Source beaming follows half-bar groups of eighths, split at beats where
// sixteenths/32nds occur. Rests, quarter notes and grace notes delimit beams.
const beams=(events)=>{
 const map=new Map(), timed=[];let time=0;
 events.forEach((e,i)=>{timed.push({e,i,time});time+=e.d;});
 for(let half=0;half<64;half+=32){const region=timed.filter(t=>t.time>=half&&t.time<half+32&&!t.e.grace);const step=region.some(t=>t.e.d<8&&t.e.p!=='R')?16:32;
  for(let start=half;start<half+32;start+=step){let run=[];const close=()=>{if(run.length>1){for(let level=1;level<=3;level++){const eligible=run.map(t=>t.e.d<=8/2**(level-1));let local=[];const end=()=>{if(local.length>1)local.forEach((t,j)=>{if(!map.has(t.i))map.set(t.i,[]);map.get(t.i).push({level,value:j===0?'begin':j===local.length-1?'end':'continue'});});else if(local.length===1&&level>1){const t=local[0];if(!map.has(t.i))map.set(t.i,[]);map.get(t.i).push({level,value:run.indexOf(t)===run.length-1?'backward hook':'forward hook'});}local=[];};run.forEach((t,j)=>{if(eligible[j])local.push(t);else end();});end();}}run=[];};
   for(const t of region.filter(t=>t.time>=start&&t.time<start+step)){if(t.e.p!=='R'&&t.e.d<16)run.push(t);else close();}close();
  }
 }return map;
};
const measures=[];const seen=new Set();
for(const sec of sections)for(const sys of sec.systems){let n=sys.start;for(const events of expand(sys.bars)){const id=`${sec.movement}-${n}`;if(seen.has(id))throw new Error('Duplicate '+id);seen.add(id);if(events.reduce((s,e)=>s+e.d,0)!==64)throw new Error('Duration '+id);measures.push({mov:sec.movement,n,id,page:sec.page,system:n===sys.start,events});n++;}}
const cueMap=new Map();for(const cue of cues){expand(cue.bars).forEach((events,i)=>{const m=cue.m+i,key=`${cue.mov}-${m}`;if(events.reduce((s,e)=>s+e.d,0)!==64)throw new Error('Cue duration '+key);cueMap.set(key,{...cue,events,first:i===0,last:i===expand(cue.bars).length-1});});}
let previous=null,previousCue=null;const stats={measures:measures.length,mainNotes:0,mainRests:0,cueNotes:0,ties:0,slurs:slurs.length,sourcePages:[...new Set(measures.map(m=>m.page))]};
let xml=`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="4.0"><work><work-title>Sinfonie in D / Paris Symphony, K. 297 (300a)</work-title></work><movement-title>Clarinetto II in La/A</movement-title><identification><creator type="composer">Wolfgang Amadeus Mozart</creator><encoding><software>Source ledger: Clarinetto II review, 2026-10-18</software></encoding><source>Source PDF pp. 6–10; written pitches; small labelled notes are non-playing cues. II Andante: tacet has no invented measures.</source></identification><defaults><scaling><millimeters>7</millimeters><tenths>40</tenths></scaling></defaults><part-list><score-part id="P2"><part-name>Clarinetto II in La/A</part-name><part-abbreviation>Cl. II (A)</part-abbreviation><score-instrument id="P2-I1"><instrument-name>Clarinet in A</instrument-name><instrument-abbreviation>Cl.</instrument-abbreviation></score-instrument><midi-instrument id="P2-I1"><midi-channel>2</midi-channel><midi-program>72</midi-program></midi-instrument></score-part></part-list><part id="P2">\n`;
for(const m of measures){xml+=`<measure number="${m.id}">`;
 if(m.system)xml+='<print new-system="yes"/>';
 if(m.n===1){xml+='<attributes><divisions>16</divisions><key><fifths>-1</fifths></key><time symbol="'+(m.mov==='I'?'common':'cut')+'"><beats>'+(m.mov==='I'?4:2)+'</beats><beat-type>'+(m.mov==='I'?4:2)+'</beat-type></time><clef><sign>G</sign><line>2</line></clef><transpose><diatonic>-2</diatonic><chromatic>-3</chromatic></transpose></attributes>';if(m.mov==='III')xml+='<direction placement="above"><direction-type><words>II Andante: tacet</words></direction-type></direction>';xml+='<direction placement="above"><direction-type><words>'+m.mov+'. '+(m.mov==='I'?'Allegro assai':'Allegro')+'</words></direction-type></direction>';}
 const cue=cueMap.get(m.id); if(cue?.label&&cue.first)xml+=`<direction placement="above"><direction-type><words font-size="9">${escape(cue.label)}</words></direction-type></direction>`;
 if(cue?.dynamic&&cue.first)xml+=`<direction placement="above"><direction-type><dynamics font-size="8"><${cue.dynamic}/></dynamics></direction-type><voice>2</voice></direction>`;
 if(cue?.ottava&&cue.first)xml+='<direction placement="above"><direction-type><octave-shift type="down" size="8" number="1"/></direction-type></direction>';
 const mainBeams=beams(m.events),cueBeams=cue?beams(cue.events):new Map();
 const accidentals=new Map();
 const emit=(e,index,isCue)=>{let out='';const rest=e.p==='R';
  if(e.p.includes('+'))return e.p.split('+').map((p,i)=>emit({...e,p,chord:i>0},index,isCue)).join('');
  if(isCue&&!rest)stats.cueNotes++;else if(!isCue)stats[rest?'mainRests':'mainNotes']++;
  for(const d of dynamics.filter(d=>!isCue&&d.mov===m.mov&&d.m===m.n&&d.index===index))out+=`<direction placement="below"><direction-type><dynamics><${d.value}/></dynamics></direction-type><sound dynamics="${d.value==='f'?88:48}"/></direction>`;
  for(const w of words.filter(w=>!isCue&&w.mov===m.mov&&w.m===m.n&&w.index===index))out+=`<direction placement="below"><direction-type><words font-style="italic">${escape(w.text)}</words></direction-type></direction>`;
  const attrs=isCue&&rest?' print-object="no"':'';out+=`<note${attrs}>`;if(e.grace)out+='<grace slash="yes"/>';if(isCue)out+='<cue/>';if(e.chord)out+='<chord/>';
  if(rest)out+='<rest'+(e.d===64?' measure="yes"':'')+'/>';else{const p=e.p.match(/^([A-G])([b#n]?)([0-8])$/);const alter=p[2]==='b'?-1:p[2]==='#'?1:0;out+=`<pitch><step>${p[1]}</step><alter>${alter}</alter><octave>${p[3]}</octave></pitch>`;}
  if(!e.grace)out+=`<duration>${e.d}</duration>`;const tiePrev=isCue?previousCue:previous;const tieStop=tiePrev?.tie&&tiePrev?.p.replace('n','')===e.p.replace('n','');
  if(tieStop){out+='<tie type="stop"/>';stats.ties++;}if(e.tie)out+='<tie type="start"/>';
  out+=`<voice>${isCue?2:1}</voice><type${isCue?' size="cue"':''}>${e.type}</type>`+(e.dot?'<dot/>':'');
  if(!rest){const pd=e.p.match(/^([A-G])([b#n]?)([0-8])$/),alter=pd[2]==='b'?-1:pd[2]==='#'?1:0,keyAlter=pd[1]==='B'?-1:0,key=[isCue?2:1,pd[1],pd[3]].join(':'),prior=accidentals.has(key)?accidentals.get(key):keyAlter;
   const sourceNatural=pd[2]==='n',courtesyAtBreak=tieStop&&m.system&&index===0&&alter!==keyAlter;
   const forced=printedAccidentals.find(a=>!isCue&&a.mov===m.mov&&a.m===m.n&&a.index===index);
   if(sourceNatural||courtesyAtBreak||forced||(!tieStop&&alter!==prior))out+=`<accidental>${forced?.kind||(alter===-1?'flat':alter===1?'sharp':'natural')}</accidental>`;
   accidentals.set(key,alter);
  }
  if(!rest&&isCue)out+='<stem>up</stem>';
  if(!e.chord)for(const b of (isCue?cueBeams:mainBeams).get(index)||[])out+=`<beam number="${b.level}">${b.value}</beam>`;
  const not=[];if(tieStop)not.push('<tied type="stop"/>');if(e.tie)not.push('<tied type="start"/>');
  for(const [i,s] of slurs.entries()){if(!!s.cue!==isCue||e.chord)continue;if(s.mov===m.mov&&s.start[0]===m.n&&s.start[1]===index)not.push(`<slur type="start" number="${i%6+1}"/>`);if(s.mov===m.mov&&s.end[0]===m.n&&s.end[1]===index)not.push(`<slur type="stop" number="${i%6+1}"/>`);}if(trills.some(t=>!!t.cue===isCue&&t.mov===m.mov&&t.m===m.n&&t.index===index&&(!t.chordTop||e.chord)))not.push('<ornaments><trill-mark/></ornaments>');
  if(e.art)not.push(`<articulations><${e.art==='st'?'staccato':'staccatissimo'}/></articulations>`);
  if(not.length)out+='<notations>'+not.join('')+'</notations>';out+='</note>';if(!isCue)previous=e;else previousCue=e;return out;
 };
 m.events.forEach((e,i)=>xml+=emit(e,i,false));
 if(cue){if(cue.first)previousCue=null;xml+='<backup><duration>64</duration></backup>';cue.events.forEach((e,i)=>xml+=emit(e,i,true));if(cue.ottava&&cue.last)xml+='<direction placement="above"><direction-type><octave-shift type="stop" size="8" number="1"/></direction-type></direction>';}
 if((m.mov==='I'&&m.n===295)||(m.mov==='III'&&m.n===243))xml+='<barline location="right"><bar-style>light-heavy</bar-style></barline>';
 xml+='</measure>\n';
}
xml+='</part></score-partwise>\n';
const complete=measures.length===538;const outfile=complete?'output/mozart-clarinets-2026-10-18/Clarinet-II-reviewed.musicxml':here+'/Clarinet-II-in-progress.musicxml';
fs.mkdirSync(path.dirname(outfile),{recursive:true});fs.writeFileSync(outfile,xml);fs.writeFileSync(here+'/validation.json',JSON.stringify({...stats,complete,editorialAccidentals:[],measureIds:measures.map(m=>m.id)},null,2)+'\n');
console.log(JSON.stringify({outfile,...stats,complete}));
