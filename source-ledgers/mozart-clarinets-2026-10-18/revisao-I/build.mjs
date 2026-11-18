import fs from 'node:fs/promises';
import path from 'node:path';
import {movements,cues,directions,sources,multiRests} from './ledger.mjs';
const ROOT=path.dirname(new URL(import.meta.url).pathname);
const OUTPUT=path.resolve('output/mozart-clarinets-2026-10-18/Clarinet-I-reviewed.musicxml');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const lengths={w:4,h:2,q:1,e:.5,s:.25,t:.125};
const types={w:'whole',h:'half',q:'quarter',e:'eighth',s:'16th',t:'32nd'};
function parse(notes){const events=notes.trim().split(/\s+/).map(raw=>{
 const m=raw.match(/^(r|[A-G](?:#|b|n)?[0-8](?:\+[A-G](?:#|b|n)?[0-8])*):([whqestg])(d?)(.*)$/);
 if(!m)throw Error(`Bad token ${raw}`);
 return {raw,pitch:m[1],duration:m[2]==='g'?0:lengths[m[2]]*(m[3]?1.5:1),type:types[m[2]]||'eighth',dot:!!m[3],mark:m[4],grace:m[2]==='g'};
});
 // Preserve ordinary two-beat eighth-note beams, splitting fast-note groups
 // at quarter boundaries while keeping hooks within each beam group.
 let onset=0;for(const e of events){e.onset=onset;onset+=e.duration;}
 const level=e=>e.type==='32nd'?3:e.type==='16th'?2:e.type==='eighth'?1:0;
 for(let i=0;i<events.length;){
  const first=events[i];if(first.grace||first.pitch==='r'||!level(first)){i++;continue;}
  let end=i;while(end<events.length&&!events[end].grace&&events[end].pitch!=='r'&&level(events[end]))end++;
  for(let begin=i;begin<end;){
   const halfEnd=(Math.floor((events[begin].onset+1e-8)/2)+1)*2;
   let limit=begin;while(limit<end&&events[limit].onset<halfEnd-1e-8)limit++;
   if(events.slice(begin,limit).some(e=>level(e)>1)){
    const quarterEnd=Math.floor(events[begin].onset+1e-8)+1;
    while(limit>begin&&events[limit-1].onset>=quarterEnd-1e-8)limit--;
   }
   if(limit-begin>1)for(let j=begin;j<limit;j++){
    const e=events[j];e.beams=[];
    for(let l=1;l<=level(e);l++){
     const prev=j>begin&&level(events[j-1])>=l,next=j+1<limit&&level(events[j+1])>=l;
     e.beams.push({number:l,value:prev?(next?'continue':'end'):(next?'begin':j===begin?'forward hook':'backward hook')});
    }
   }
   begin=limit;
  }
  i=end;
 }
 return events;
}
const stats={mainNotes:0,cueNotes:0,mainRests:0,tieStarts:0,slurStarts:0,graces:0,measures:0};
const tieState=new Map();
function noteXML(e,voice,ctx){
 let result='';const pitches=e.pitch==='r'?['r']:e.pitch.split('+');
 for(const [ci,p] of pitches.entries()){
  const rest=p==='r';let pitch='';
  if(!rest){const m=p.match(/^([A-G])([#bn]?)([0-8])$/);const alter=m[2]==='#'?1:m[2]==='b'?-1:0;
   pitch=`<pitch><step>${m[1]}</step><alter>${alter}</alter><octave>${m[3]}</octave></pitch>`;
   if(!ci){if(ctx.cue)stats.cueNotes++;else stats.mainNotes++;}if(e.grace)stats.graces++;
  }else if(!ctx.cue)stats.mainRests++;
  const tieKey=`${ctx.mv}:${voice}:${p.replace('n','')}`;const stopping=tieState.get(tieKey);const starting=e.mark.includes('~');
  let ties='';if(!rest&&!e.grace){if(stopping){ties+='<tie type="stop"/>';tieState.delete(tieKey);}if(starting){ties+='<tie type="start"/>';tieState.set(tieKey,true);stats.tieStarts++;}}
  let nt='';if(stopping)nt+='<tied type="stop"/>';if(starting)nt+='<tied type="start"/>';
  if(ci===0){
   if(e.mark.includes(')'))nt+='<slur type="stop" number="1"/>';
   if(e.mark.includes('(')){nt+='<slur type="start" number="1"/>';stats.slurStarts++;}
   if(e.mark.includes('tr'))nt+='<ornaments><trill-mark/></ornaments>';
   if(e.mark.includes('!'))nt+='<articulations><staccatissimo/></articulations>';
   else if(e.mark.includes('.'))nt+='<articulations><staccato/></articulations>';
  }
  // Pitch/alter is always absolute. Accidental glyphs follow the key and
  // within-measure state; ties carry their chromatic alteration silently.
  let accidental='';
  if(!rest){const pm=p.match(/^([A-G])([#bn]?)([0-8])$/);const pa=pm[2]==='#'?1:pm[2]==='b'?-1:0;
   const pk=`${pm[1]}${pm[3]}`;const before=ctx.accidentals.get(pk)??(pm[1]==='B'?-1:0);
   const glyph=p.includes('n')||e.mark.includes('a')||(!stopping&&pa!==before);
   const accidentalValue=pa===1?'sharp':pa===-1?'flat':'natural';
   if(glyph)accidental=`<accidental>${accidentalValue}</accidental>`;
   ctx.accidentals.set(pk,pa);
  }
  const isWholeRest=rest&&e.duration===4;
  const rx=isWholeRest?(ctx.lowerRest?'<rest measure="yes"><display-step>F</display-step><display-octave>4</display-octave></rest>':'<rest measure="yes"/>'):'<rest/>';
  result+=`<note${ctx.cue&&rest&&e.mark.includes('i')?' print-object="no"':''}>${e.grace?'<grace slash="yes"/>':''}${ctx.cue?'<cue/>':''}${ci?'<chord/>':''}${rest?rx:pitch}${e.grace?'':`<duration>${e.duration*8}</duration>`}${ties}<voice>${voice}</voice>${isWholeRest?'':`<type${ctx.cue?' size="cue"':''}>${e.type}</type>${e.dot?'<dot/>':''}`}${accidental}${ctx.cue&&!rest?'<stem>up</stem>':''}${ci?'':(e.beams||[]).map(b=>`<beam number="${b.number}">${b.value}</beam>`).join('')}${nt?`<notations>${nt}</notations>`:''}</note>`;
 }return result;
}
function direction(d){return `<direction placement="${d.kind==='dynamic'?'below':'above'}"><direction-type>${d.kind==='dynamic'?`<dynamics><${d.text}/></dynamics>`:`<words>${esc(d.text)}</words>`}</direction-type>${d.offset?`<offset>${d.offset*8}</offset>`:''}${d.kind==='dynamic'?`<sound dynamics="${d.text==='f'?88:d.text==='p'?45:70}"/>`:''}</direction>`;}
let xml='<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="4.0">';
xml+='<work><work-title>Sinfonie in D — Paris Symphony, KV 297 (300a)</work-title></work><movement-title>Clarinetto I in La/A — I and III</movement-title><identification><creator type="composer">W. A. Mozart</creator><encoding><software>Manual visual source transcription; Codex review ledger</software></encoding><source>Bärenreiter-Ausgabe 4727, Clarinetto I in La/A, pages 1–5</source></identification>';
xml+='<defaults><scaling><millimeters>7</millimeters><tenths>40</tenths></scaling></defaults><part-list><score-part id="P1"><part-name>Clarinetto I in La/A</part-name><part-abbreviation>Cl. I (A)</part-abbreviation><score-instrument id="P1-I1"><instrument-name>Clarinet in A</instrument-name><instrument-abbreviation>Cl.</instrument-abbreviation></score-instrument><midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>72</midi-program></midi-instrument></score-part></part-list><part id="P1">';
for(const mv of ['I','III']){
 const ms=movements[mv];const maximum=Math.max(...ms.keys());
 for(let n=1;n<=maximum;n++){
  const notes=ms.get(n);if(!notes)throw Error(`Missing ${mv}-${n}`);
  const events=parse(notes);const total=events.reduce((s,e)=>s+e.duration,0);if(total!==4)throw Error(`${mv}-${n}: main duration ${total}, ${notes}`);
  const src=sources.find(s=>s.mv===mv&&n>=s.start&&n<=s.end);
  xml+=`<measure number="${mv}-${n}">`;
  if(src?.systems.includes(n))xml+=`<print${(n===src.start&&src.page>1)?' new-page="yes"':n>1?' new-system="yes"':''}/>`;
  if(n===1){if(mv==='III')xml+=direction({kind:'words',text:'II — Andante: tacet (no duration specified in the source)',offset:0});xml+=`<attributes>${mv==='I'?'<divisions>8</divisions><key><fifths>-1</fifths><mode>major</mode></key>':''}<time symbol="${mv==='I'?'common':'cut'}"><beats>${mv==='I'?4:2}</beats><beat-type>${mv==='I'?4:2}</beat-type></time>${mv==='I'?'<staves>1</staves><clef><sign>G</sign><line>2</line></clef><transpose><diatonic>-2</diatonic><chromatic>-3</chromatic></transpose>':''}</attributes>`;}
  const mr=multiRests.find(r=>r.mv===mv&&r.start===n&&r.count>1&&!Array.from({length:r.count},(_,i)=>cues[mv].has(n+i)).some(Boolean));
  if(mr)xml+=`<attributes><measure-style><multiple-rest use-symbols="no">${mr.count}</multiple-rest></measure-style></attributes>`;
  for(const d of directions[mv].get(n)||[])xml+=direction(d);
  const mainAccidentals=new Map();
  for(const e of events)xml+=noteXML(e,'1',{mv,cue:false,lowerRest:cues[mv].has(n),accidentals:mainAccidentals});
  const c=cues[mv].get(n);if(c){const cev=parse(c.notes);const ct=cev.reduce((s,e)=>s+e.duration,0);if(ct!==4)throw Error(`${mv}-${n}: cue duration ${ct}`);
   xml+='<backup><duration>32</duration></backup>';
   if(c.label)xml+=direction({kind:'words',text:c.label,offset:0});
   if(c.dynamic)xml+=`<direction placement="above"><direction-type><dynamics><${c.dynamic}/></dynamics></direction-type><voice>2</voice></direction>`;
   if(c.octaveStart)xml+='<direction placement="above"><direction-type><octave-shift type="down" size="8" number="1"/></direction-type><voice>2</voice></direction>';
   const cueAccidentals=new Map();for(const e of cev)xml+=noteXML(e,'2',{mv,cue:true,accidentals:cueAccidentals});
   if(c.octaveStop)xml+='<direction placement="above"><direction-type><octave-shift type="stop" size="8" number="1"/></direction-type><voice>2</voice></direction>';
  }
  if(n===maximum)xml+='<barline location="right"><bar-style>light-heavy</bar-style></barline>';
  xml+='</measure>';stats.measures++;
 }
}
xml+='</part></score-partwise>\n';
await fs.mkdir(path.dirname(OUTPUT),{recursive:true});await fs.writeFile(OUTPUT,xml);
await fs.writeFile(`${ROOT}/audit.json`,JSON.stringify({output:OUTPUT,stats,sources,multiRests,measureCounts:Object.fromEntries(Object.entries(movements).map(([mv,m])=>[mv,m.size])),openTies:[...tieState.keys()]},null,2)+'\n');
console.log(JSON.stringify({output:OUTPUT,stats,counts:Object.fromEntries(Object.entries(movements).map(([mv,m])=>[mv,m.size]))}));
