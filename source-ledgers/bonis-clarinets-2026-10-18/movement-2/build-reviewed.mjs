import fs from 'node:fs';
import path from 'node:path';

// Independent transcription from the twelve photographed systems on PDF pp. 3–4.
// Durations are in quarter-note / 4 units: 1=16th, 2=8th, 4=quarter,
// 6=dotted quarter, 8=half, 12=dotted half.  R is a whole-measure rest.
// g marks an unmeasured grace and c an instrumental cue, which must not sound.
const root = '/Users/reifison/Desktop/Apps/score-to-musicxml';
const xmlOnly = process.argv.includes('--xml-only');
const dir = path.join(root, 'source-ledgers/bonis-clarinets-2026-10-18/movement-2');
const out = path.join(root, 'output/bonis-clarinets-reviewed-2026-10-18/02-Interlude-et-Valse-lente.musicxml');
const measures = Array.from({length:156}, (_,i)=>({number:i+1, staves:[[],[]], directions:[]}));
const systems = [
  {page:3,system:1,first:1,last:9}, {page:3,system:2,first:10,last:21},
  {page:3,system:3,first:22,last:30}, {page:3,system:4,first:31,last:41},
  {page:3,system:5,first:42,last:51}, {page:3,system:6,first:52,last:79},
  {page:4,system:1,first:80,last:93}, {page:4,system:2,first:94,last:104},
  {page:4,system:3,first:105,last:116}, {page:4,system:4,first:117,last:128},
  {page:4,system:5,first:129,last:143}, {page:4,system:6,first:144,last:156},
];
function parse(token) {
  const m = /^(g|c)?(R|r|[A-G](?:#|b|n)?[3-6]):(\d+)$/.exec(token);
  if (!m) throw new Error(`Bad token ${token}`);
  const [,kind,p,d] = m;
  const ev = {token, duration:+d, grace:kind==='g', cue:kind==='c', ties:[],slurs:[],articulations:[]};
  if (p==='r'||p==='R') {ev.rest=true;ev.measureRest=p==='R';return ev;}
  const q=/^([A-G])([#bn]?)(\d)$/.exec(p);
  ev.step=q[1];ev.octave=+q[3];ev.explicitAccidental=q[2]||null;
  ev.alter=q[2]==='#'?1:q[2]==='b'?-1:q[2]==='n'?0:undefined;
  return ev;
}
function set(m,s,tokens) {measures[m-1].staves[s-1]=tokens.split(/\s+/).filter(Boolean).map(parse);}
function both(m,a,b=a) {set(m,1,a);set(m,2,b);}
function rests(a,b=a) {for(let m=a;m<=b;m++)both(m,'R:12');}
const ost='r:4 E4:4 E4:2 r:2';

// Page 3, system 1, mm. 1–9.  The three percent signs really repeat m.1.
both(1,'R:12',ost);
for(let m=2;m<=4;m++){both(m,'R:12',ost);measures[m-1].sourceRepeat={staff:2,from:m-1};}
both(5,'r:4 B5:4 B5:4','r:4 G5:4 G5:4');
both(6,'r:4 G5:4 G5:4','r:4 E5:4 E5:4');
both(7,'r:4 F#5:4 F#5:4','r:4 E5:4 E5:4');
both(8,'r:4 F#5:4 F#5:4','r:4 D#5:4 D#5:4');
both(9,'B4:4 F#5:6 G5:2','B3:4 A4:6 B4:2');

// Page 3, system 2, mm.10–21.  Printed 2-bar rests expand at 11–12 and 17–18.
both(10,'F#5:2 D#5:2 F#5:4 E5:2 r:2','A4:2 F#4:2 A4:4 G4:2 r:2');
rests(11,12);
both(13,'E4:4 B4:6 C5:2');
both(14,'A4:12');
both(15,'gG4:1 gA4:1 G4:4 F#4:2 E4:2 F#4:2 G4:2');
both(16,'E4:2 r:2 r:4 r:4');
rests(17,18);
both(19,'D5:4 E5:8','R:12');
both(20,'E5:2 D5:2 E5:2 F#5:2 E5:4','R:12');
both(21,'E5:4 D5:4 B4:4','R:12');

// Page 3, solo system 3, mm.22–30.  Cl.2 is tacet throughout the omitted staff.
both(22,'D5:4 A4:8','R:12');
both(23,'r:2 B4:2 C5:2 D5:2 E5:2 F#5:2','R:12');
both(24,'E5:2 D5:2 C5:2 B4:2 A4:2 G4:2','R:12');
both(25,'F#4:2 E4:2 F#4:2 G4:2 F#4:4','R:12');
both(26,'F#4:2 E4:2 F#4:8','R:12');
both(27,'r:2 B4:2 C5:2 D5:2 C5:2 B4:2','R:12');
both(28,'D5:4 A4:8','R:12');
both(29,'r:2 B4:2 C5:2 D5:2 E5:2 G5:2','R:12');
both(30,'F#5:4 gE5:1 gF#5:1 D5:8','R:12');

// Page 3, system 4, mm.31–41.
rests(31);
both(32,'r:2 D5:2 E5:2 F#5:2 E5:2 D5:2','R:12');
both(33,'E5:4 B4:8','R:12');
both(34,'D5:12','R:12');
both(35,'D#5:1 E5:1 D#5:1 E5:1 D#5:1 E5:1 D#5:1 C#5:1 D#5:2 r:2','D#4:4 r:4 r:4');
both(36,'R:12',ost);
for(let m=37;m<=39;m++){both(m,'R:12',ost);measures[m-1].sourceRepeat={staff:2,from:m-1};}
both(40,'r:4 B5:4 B5:4','r:4 G5:4 G5:4');
both(41,'r:4 G5:4 G5:4','r:4 E5:4 E5:4');

// Page 3, system 5, mm.42–51.
both(42,'r:4 F#5:4 F#5:4','r:4 E5:4 E5:4');
both(43,'r:4 F#5:4 F#5:4','r:4 D#5:4 D#5:4');
both(44,'B4:4 F#5:6 G5:2','B3:4 A4:6 B4:2');
both(45,'F#5:2 D#5:2 F#5:4 E5:2 r:2','A4:2 F#4:2 A4:4 G4:2 r:2');
rests(46,47);
both(48,'E4:4 B4:6 C5:2','r:4 E5:4 E5:4');
both(49,'A4:12','r:4 E5:4 E5:4');
both(50,'gG4:1 gA4:1 G4:4 F#4:2 E4:2 F#4:2 G4:2','r:4 E5:4 E5:4');
both(51,'E4:12','r:4 F#5:4 G5:2 r:2');

// Page 3, system 6, mm.52–79; changes to B-flat clarinets at m.54.
both(52,'E4:12','r:4 F#5:4 G5:2 r:2');
both(53,'E4:12','r:4 F#5:4 G5:2 r:2');
rests(54,73);
// The 13-bar rest in Cl.2 is mm.62–74.  The first violin cue is printed at
// the end of the last compressed bar; its first three eighths are an upbeat.
both(74,'r:6 cF5:2 cG5:2 cAb5:2','R:12');
measures[73].staves[0][0].hidden=true;
measures[73].staves[0][0].sourceReason='silent first half of final bar of the 13-bar rest; cue upbeat occupies second half';
both(75,'cBb5:4 cAb5:2 cBb5:2 cAb5:4','R:12');
both(76,'cAb5:4 cG5:2 cAb5:2 cG5:4','R:12');
both(77,'cG5:4 cF5:4 cAb5:4','R:12');
both(78,'cAb5:2 cr:2 r:2 C5:2 D5:2 Eb5:2','R:12');
both(79,'F5:4 Eb5:2 F5:2 Eb5:4','R:12');

// Page 4, solo system 1, mm.80–93. Cl.2 remains tacet.
both(80,'Eb5:4 D5:2 Eb5:2 D5:4','R:12');
both(81,'D5:4 C5:4 Eb5:4','R:12');
both(82,'Eb5:4 D5:4 Bb4:4','R:12');
both(83,'Bb4:4 G4:2 Ab4:2 Bb4:4','R:12');
both(84,'Bb4:4 G4:4 Bb4:4','R:12');
both(85,'Bb4:4 F4:2 Ab4:2 Bb4:4','R:12');
both(86,'Bb4:4 G4:4 Bb4:4','R:12');
both(87,'Bb4:4 Bb4:2 r:2 r:4','R:12');
rests(88,92);
both(93,'cF4:2 cBb4:2 cAb4:4 cG4:4','R:12');

// Page 4, system 2, mm.94–104.
both(94,'F4:2 Eb4:2 F4:4 G4:4','D4:2 C4:2 D4:4 Bb3:4');
both(95,'Eb4:2 r:2 r:4 r:4','C4:2 r:2 r:4 r:4');
for(let m=96;m<=98;m++)both(m,'Eb4:12','C4:12');
both(99,'Eb4:2 r:2 r:4 r:4','C4:2 r:2 r:4 r:4');
rests(100,101);
both(102,'cG5:2 cAb5:2 cAb5:2 cG5:2 cG5:2 cF5:2','R:12');
both(103,'r:2 Db5:2 Db5:2 C5:2 C5:2 Bb4:2','r:2 Bb4:2 Bb4:2 Ab4:2 Ab4:2 G4:2');
both(104,'Bb4:2 Ab4:2 Ab4:2 G4:2 G4:4','G4:2 F4:2 F4:2 En4:2 E4:4');

// Page 4, system 3, mm.105–116.
both(105,'G4:12','En4:12');
both(106,'Ab4:12','C4:12');
both(107,'G4:12','Bb3:12');
both(108,'F4:2 r:2 r:4 r:4','Bb3:2 r:2 r:4 r:4');
both(109,'Ab4:12','F4:12');
both(110,'Ab4:4 G4:2 r:2 r:4','F4:4 Eb4:2 r:2 r:4');
both(111,'r:4 F4:8','r:4 D4:8');
both(112,'Ab4:4 Ab4:2 r:2 r:4','C4:4 C4:2 r:2 r:4');
for(let m=113;m<=116;m++)both(m,'Ab4:12','F4:12');

// Page 4, system 4, mm.117–128.
both(117,'F4:12','D4:12');
both(118,'Bb4:2 r:2 r:4 r:4','Eb4:2 r:2 r:4 r:4');
rests(119);
both(120,'G4:12','Db4:12');
both(121,'Ab4:2 r:2 r:4 r:4','Dn4:2 r:2 r:4 r:4');
both(122,'F4:12','D4:12');
both(123,'D4:8 Eb4:4','Bn3:8 C4:4');
both(124,'r:4 G4:4 F#4:4','R:12');
both(125,'Fn4:12','R:12');
both(126,'Eb4:8 Eb4:2 r:2','R:12');
rests(127);
both(128,'G4:12','Db4:12');

// Page 4, system 5, mm.129–143.
both(129,'Ab4:2 r:2 r:4 r:4','Dn4:2 r:2 r:4 r:4');
both(130,'R:12','F#3:12');
both(131,'R:12','G3:12');
both(132,'R:12','Ab3:12');
both(133,'En4:2 F4:2 E4:8','G3:2 r:2 r:4 Db4:4');
both(134,'En4:2 F4:2 E4:8','Db4:12');
both(135,'En4:2 r:2 r:4 r:4','C4:2 r:2 r:4 r:4');
rests(136,137);
both(138,'C5:2 Bb4:2 Ab4:4 r:4','Ab4:2 G4:2 F4:4 r:4');
rests(139,141);
both(142,'Ab4:2 G4:2 F4:4 r:4','R:12');
both(143,'C5:12','Ab4:12');

// Page 4, final system 6, mm.144–156.
both(144,'C5:12','Ab4:12');
both(145,'C5:12','Ab4:12');
both(146,'Bb4:8 Bb4:2 r:2','Ab4:8 Ab4:2 r:2');
both(147,'Bb4:12','G4:12');
measures[146].staves[0][0].editorial='Emenda editorial: a fonte imprime mínima sem ponto no compasso 147, pauta 1; acrescentado ponto para os três tempos indicados pela pauta 2, preservando o único ataque de Si bemol 4. Evidência: p4-m147.png.';
both(148,'Ab4:12','F4:12');
both(149,'G4:8 G4:2 r:2','Eb4:8 Eb4:2 r:2');
both(150,'F4:12','D4:12');
both(151,'Eb4:12','C4:12');
both(152,'Eb4:12','C4:12');
both(153,'D4:12','Ab3:12');
both(154,'D4:12','Ab3:12');
both(155,'Eb4:12','G3:12');
both(156,'Eb4:2 r:2 r:4 r:4','G3:2 r:2 r:4 r:4');

const noteAt=(s,m,n)=>{
  const notes=measures[m-1].staves[s-1].filter(e=>!e.rest);
  const ev=notes[n==='last'?notes.length-1:n-1];
  if(!ev)throw new Error(`No note ${s}/${m}/${n}`);return ev;
};
const slurLinks=[];
function tie(s,m,n,m2,n2){const a=noteAt(s,m,n),b=noteAt(s,m2,n2);a.ties.push('start');b.ties.push('stop');}
function slur(s,m,n,m2,n2){slurLinks.push({staff:s,first:{m,n},last:{m:m2,n:n2}});}
function articulation(s,m,n,...names){noteAt(s,m,n).articulations.push(...names);}
function ports(s,m){articulation(s,m,1,'staccato');articulation(s,m,2,'staccato');slur(s,m,1,m,2);}
for(const m of [1,2,3,4,36,37,38,39])tie(2,m,1,m,2);
for(const m of [5,6,7,8,40,41,42,43])for(const s of [1,2])ports(s,m);
for(const m of [9,44])for(const s of [1,2])slur(s,m,1,m,'last');
for(const m of [10,45])for(const s of [1,2]){slur(s,m,1,m,3);slur(s,m,3,m,4);}
for(const s of [1,2]){
  slur(s,13,1,14,1);slur(s,15,1,15,3);slur(s,15,3,16,1);
}
slur(1,19,1,19,2);tie(1,19,2,20,1);slur(1,20,1,20,5);tie(1,20,5,21,1);slur(1,21,1,21,3);
slur(1,22,1,22,2);slur(1,23,1,24,1);slur(1,24,2,25,1);
slur(1,25,2,25,4);tie(1,25,5,26,1);slur(1,26,1,26,3);
slur(1,27,1,28,2);slur(1,29,1,30,4);slur(1,30,1,30,2);slur(1,30,3,30,4);
slur(1,32,1,33,1);slur(1,33,2,34,1);slur(1,35,1,35,4);slur(1,35,5,35,9);
articulation(2,35,1,'tenuto','staccato');
slur(1,48,1,49,1);slur(1,50,1,50,3);slur(1,50,3,51,1);
for(const m of [48,49,50])ports(2,m);
for(const m of [51,52,53])slur(2,m,1,m,2);
slur(1,74,1,74,3);
for(const m of [75,76]){slur(1,m,1,m,2);slur(1,m,3,m,4);}
tie(1,76,4,77,1);slur(1,77,1,77,3);tie(1,77,3,78,1);
slur(1,78,2,78,4);slur(1,79,1,79,3);tie(1,79,4,80,1);
slur(1,80,2,80,4);tie(1,80,4,81,1);slur(1,80,4,82,2);tie(1,81,3,82,1);
tie(1,82,3,83,1);slur(1,82,3,83,4);tie(1,83,4,84,1);
slur(1,83,4,85,4);tie(1,84,3,85,1);tie(1,85,4,86,1);
slur(1,85,4,87,2);tie(1,86,3,87,1);slur(1,93,1,93,4);
for(const s of [1,2]){
  slur(s,94,1,95,1);for(const m of [96,97,98])tie(s,m,1,m+1,1);
}
for(const pair of [[1,2],[3,4],[5,6]])slur(1,102,pair[0],102,pair[1]);
for(const s of [1,2]){
  slur(s,103,2,103,3);slur(s,103,4,103,5);
  slur(s,104,1,104,2);slur(s,104,3,104,4);tie(s,104,5,105,1);
  slur(s,105,1,108,1);tie(s,109,1,110,1);slur(s,110,1,110,2);
  slur(s,111,1,112,1);tie(s,112,1,112,2);
  for(const m of [113,114,115])tie(s,m,1,m+1,1);
  slur(s,117,1,118,1);slur(s,120,1,121,1);slur(s,123,1,123,2);
  slur(s,128,1,129,1);slur(s,138,1,138,3);
}
slur(1,124,1,126,2);tie(1,126,1,126,2);slur(2,130,1,133,1);
slur(1,133,1,133,3);slur(1,134,1,134,3);tie(1,134,3,135,1);
tie(2,133,2,134,1);slur(2,134,1,135,1);slur(1,142,1,142,3);
for(const s of [1,2]){
  tie(s,143,1,144,1);tie(s,144,1,145,1);tie(s,146,1,146,2);
  slur(s,147,1,149,1);tie(s,149,1,149,2);slur(s,150,1,151,1);
  tie(s,151,1,152,1);tie(s,153,1,154,1);slur(s,154,1,155,1);tie(s,155,1,156,1);
}
slur(1,145,1,146,1);tie(2,145,1,146,1);
noteAt(1,126,1).forceAccidental=true;

function direction(m,s,kind,value,offset=0){measures[m-1].directions.push({staff:s,kind,value,offset});}
function words(m,s,value,offset=0){direction(m,s,'words',value,offset);}
function dyn(m,s,value,offset=0){direction(m,s,'dynamics',value,offset);}
function rehearsal(m,value){direction(m,1,'rehearsal',value);}
words(1,1,'I — INTERLUDE. Assez lent.');words(1,2,'En LA — 2º');dyn(1,2,'p');
for(const s of [1,2]){dyn(5,s,'p');dyn(9,s,'mf');dyn(13,s,'mf');dyn(40,s,'p');dyn(44,s,'mf');dyn(94,s,'p');dyn(96,s,'p');dyn(103,s,'mf');dyn(113,s,'p');dyn(128,s,'p');dyn(138,s,'mp');dyn(143,s,'p');}
words(16,1,'Rit.');words(19,1,'Un peu plus animé. 1º SOLO. Espress.');
words(22,1,'1º');words(27,1,'Espress.');dyn(35,1,'mf');words(36,1,'Iº tempo.');words(36,2,'2º');dyn(36,2,'p');
words(48,1,'SOLO. Espress.');dyn(48,2,'p');
words(54,1,'II — VALSE LENTE');words(54,2,'Changez en SI♭');rehearsal(62,'A');
words(74,1,'1er VIOLON.');rehearsal(78,'B');words(78,1,'CLAR. SOLO. Espress.');dyn(78,1,'mf',2);
words(80,1,'1º SOLO.');words(93,1,'1er VIOLON.');dyn(93,1,'p');
words(94,1,'CLAR. Espress.');words(94,2,'SOLI. Espress.');words(95,1,'Cédez un peu.');words(96,1,'Tempo.');
words(102,1,'FLÛTE.');words(103,1,'CLAR.');words(103,2,'SOLI.');rehearsal(104,'C');
words(122,1,'Cresc.');words(124,1,'Dim.');rehearsal(134,'D');dyn(142,1,'mp');
for(const s of [1,2]){
  direction(23,s===1?1:1,'wedge','crescendo',2);if(s===1)direction(23,1,'wedge','stop',12);
}
// Explicit source hairpins; only Cl.1 has material in this solo system.
measures[22].directions=measures[22].directions.filter((x,i,a)=>x.kind!=='wedge'||a.findIndex(y=>y.kind===x.kind&&y.value===x.value&&y.offset===x.offset)===i);
direction(24,1,'wedge','diminuendo');direction(24,1,'wedge','stop',12);
direction(25,1,'wedge','crescendo',2);direction(26,1,'wedge','stop',0);
direction(83,1,'wedge','crescendo');direction(85,1,'wedge','stop',4);
direction(85,1,'wedge','diminuendo',6);direction(86,1,'wedge','stop',8);
noteAt(1,53,1).fermata=true;measures[52].staves[1].at(-1).fermata=true;
for(const s of [1,2])measures[155].staves[s-1].at(-1).fermata=true;

// The printed beams are copied by bounded note groups; isolated eighths retain
// flags, including anacruses followed by a four-note beamed figure.
function beam(s,m,first,last,levels=1){
  for(let n=first;n<=last;n++){
    const e=noteAt(s,m,n);e.beams??=[];
    for(let level=1;level<=levels;level++)e.beams.push({level,value:n===first?'begin':n===last?'end':'continue'});
  }
}
for(const m of [10,45])for(const s of [1,2])beam(s,m,1,2);
for(const s of [1,2]){beam(s,15,1,2,2);beam(s,15,4,7);}
beam(1,20,1,4);beam(1,23,2,5);beam(1,24,1,6);beam(1,25,1,4);beam(1,26,1,2);
beam(1,27,2,5);beam(1,29,2,5);beam(1,30,2,3,2);beam(1,32,2,5);
beam(1,35,1,4,2);beam(1,35,5,8,2);beam(1,50,1,2,2);beam(1,50,4,7);
beam(1,74,2,3);beam(1,75,2,3);beam(1,76,2,3);beam(1,78,3,4);beam(1,79,2,3);beam(1,80,2,3);
beam(1,83,2,3);beam(1,85,2,3);beam(1,93,1,2);
for(const s of [1,2])beam(s,94,1,2);
beam(1,102,1,6);
for(const s of [1,2]){beam(s,103,2,5);beam(s,104,1,4);beam(s,138,1,2);}
beam(1,133,1,2);beam(1,134,1,2);beam(1,142,1,2);

// Give every pitch its effective source accidental; explicit accidentals are
// retained on the first occurrence, or where a natural/sharp is printed.
for(const m of measures){
  const key=m.number<54?{F:1}:{B:-1,E:-1,A:-1};
  for(const staff of m.staves){
    let onset=0;const accidentalMemory=new Map();
    for(const [eventIndex,e] of staff.entries()){
      e.eventOrder=(m.number-1)*100+eventIndex;
      e.onset=onset;if(!e.grace)onset+=e.duration;
      if(!e.rest){
        const id=e.step+e.octave;const implicit=accidentalMemory.has(id)?accidentalMemory.get(id):(key[e.step]||0);
        const explicit=e.alter;
        e.alter=explicit??implicit;
        e.showAccidental=e.forceAccidental||e.explicitAccidental==='n'||(explicit!==undefined&&explicit!==implicit);
        accidentalMemory.set(id,e.alter);
      }
    }
    if(onset!==12)throw new Error(`Unfilled source measure ${m.number}: ${onset}`);
  }
}
// Slur numbers are allocated by interval rather than left as OMR fragments.
for(const staff of [1,2]){
  const active=[];
  const links=slurLinks.filter(l=>l.staff===staff).map(l=>{
    const a=noteAt(staff,l.first.m,l.first.n),b=noteAt(staff,l.last.m,l.last.n);
    return {...l,a,b,start:a.eventOrder,end:b.eventOrder};
  }).sort((a,b)=>a.start-b.start||a.end-b.end);
  for(const l of links){
    for(let i=active.length-1;i>=0;i--)if(active[i].end<=l.start)active.splice(i,1);
    const used=new Set(active.map(x=>x.number));let number=1;while(used.has(number))number++;
    if(number>6)throw new Error('More than 6 concurrent source slurs');
    const xmlNumber=number+(staff===2?8:0);
    l.a.slurs.push({type:'start',number:xmlNumber});l.b.slurs.push({type:'stop',number:xmlNumber});active.push({end:l.end,number});
  }
}

const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const typeMap={1:['16th',0],2:['eighth',0],4:['quarter',0],6:['quarter',1],8:['half',0],12:['half',1]};
function noteXml(e,staff){
  let x=`<note${e.hidden?' print-object="no"':''}${e.cue?' font-size="75%"':''}>`;
  if(e.grace)x+='<grace slash="yes"/>';
  if(e.cue)x+='<cue/>';
  x+=e.rest?`<rest${e.measureRest?' measure="yes"':''}/>`:`<pitch><step>${e.step}</step>${e.alter?`<alter>${e.alter}</alter>`:''}<octave>${e.octave}</octave></pitch>`;
  if(!e.grace)x+=`<duration>${e.duration}</duration>`;
  for(const tieType of ['stop','start'])if(e.ties.includes(tieType))x+=`<tie type="${tieType}"/>`;
  if(e.editorial)x+=`<footnote>${esc(e.editorial)}</footnote><level reference="yes">editorial</level>`;
  x+=`<voice>${staff}</voice>`;
  if(!e.measureRest){const [type,dots]=typeMap[e.duration];x+=`<type>${type}</type>${'<dot/>'.repeat(dots)}`;}
  if(e.showAccidental)x+=`<accidental>${e.alter===1?'sharp':e.alter===-1?'flat':'natural'}</accidental>`;
  if(e.cue)x+='<notehead parentheses="no">normal</notehead>';
  x+=`<staff>${staff}</staff>`;
  for(const b of e.beams||[])x+=`<beam number="${b.level}">${b.value}</beam>`;
  const n=[];
  for(const tieType of ['stop','start'])if(e.ties.includes(tieType))n.push(`<tied type="${tieType}"/>`);
  for(const sl of e.slurs.filter(s=>s.type==='stop').concat(e.slurs.filter(s=>s.type==='start')))n.push(`<slur type="${sl.type}" number="${sl.number}"/>`);
  if(e.articulations.length)n.push(`<articulations>${e.articulations.map(a=>`<${a}/>`).join('')}</articulations>`);
  if(e.fermata)n.push('<fermata type="upright"/>');
  if(n.length)x+=`<notations>${n.join('')}</notations>`;
  return x+'</note>';
}
function directionXml(d){
  let content=d.kind==='dynamics'?`<dynamics><${d.value}/></dynamics>`:d.kind==='rehearsal'?`<rehearsal>${esc(d.value)}</rehearsal>`:d.kind==='wedge'?`<wedge type="${d.value}" number="1"/>`:`<words>${esc(d.value)}</words>`;
  return `<direction placement="${d.kind==='dynamics'||d.kind==='wedge'?'below':'above'}"><direction-type>${content}</direction-type>${d.offset?`<offset>${d.offset}</offset>`:''}<staff>${d.staff}</staff></direction>`;
}
function attributes(m){
  if(m!==1&&m!==54)return '';
  const first=m===1;const fifths=first?1:-3;const dia=first?-2:-1;const chrom=first?-3:-2;
  return `<attributes>${first?'<divisions>4</divisions>':''}<key><fifths>${fifths}</fifths></key>${first?'<time><beats>3</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>G</sign><line>2</line></clef>':''}${[1,2].map(s=>`<staff-details number="${s}" print-object="yes"><staff-lines>5</staff-lines></staff-details><transpose number="${s}"><diatonic>${dia}</diatonic><chromatic>${chrom}</chromatic></transpose>`).join('')}</attributes>`;
}
let xml=`<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><work><work-title>Suite en forme de valses</work-title></work><movement-title>II — Interlude et Valse lente — Clarinettes</movement-title><identification><creator type="composer">Mel Bonis</creator><encoding><software>Independent source review — PDF pages 3–4, 2026-10-18</software><encoding-date>2026-10-18</encoding-date></encoding><source>Bonis - Suite en forme de valses - 03 - Clarinets.pdf, pages 3–4</source><miscellaneous><miscellaneous-field name="source-review">156 measures; all twelve systems read visually; percent repeats and multimeasure rests expanded; instrumental cues silent; editorial dotted half in m147 staff1 documented in note footnote.</miscellaneous-field></miscellaneous></identification><defaults><scaling><millimeters>7</millimeters><tenths>40</tenths></scaling></defaults><part-list><score-part id="P1"><part-name>Clarinettes 1–2</part-name><part-abbreviation>Cl. 1–2</part-abbreviation><score-instrument id="P1-I1"><instrument-name>Clarinets</instrument-name></score-instrument><midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>72</midi-program></midi-instrument></score-part></part-list><part id="P1">\n`;
for(const m of measures){
  const system=systems.find(s=>s.first===m.number);
  xml+=`<measure number="${m.number}">`;
  if(system&&m.number>1)xml+=`<print ${m.number===80?'new-page="yes"':'new-system="yes"'}/>`;
  xml+=attributes(m.number);
  for(const d of m.directions)xml+=directionXml(d);
  for(const e of m.staves[0])xml+=noteXml(e,1);
  xml+='<backup><duration>12</duration></backup>';
  for(const e of m.staves[1])xml+=noteXml(e,2);
  if([18,35,53,133].includes(m.number))xml+='<barline location="right"><bar-style>light-light</bar-style></barline>';
  if(m.number===156)xml+='<barline location="right"><bar-style>light-heavy</bar-style></barline>';
  xml+='</measure>\n';
}
xml+='</part></score-partwise>\n';
fs.writeFileSync(out,xml);

const ledger={
  title:'II — Interlude et Valse lente',source:'/Users/reifison/Downloads/Bonis - Suite en forme de valses - 03 - Clarinets.pdf',sourcePages:[3,4],sourceSystems:systems,
  method:'Independent visual transcription from 300 dpi source renders, with enlarged crops; no event count or pitch adopted on the authority of OMR.',
  totalMeasures:156,divisions:4,staves:2,
  editorialEmendations:[{measure:147,staff:1,printed:'Bb4 half, 2 quarters; dot absent',adopted:'Bb4 dotted half, 3 quarters',reason:'Parent reviewer independently confirmed source omission; second staff fills 3/4. One existing attack extended by one quarter, no new note or rest.',evidence:path.join(root,'tmp/bonis-review/movement-2/p4-m147.png')}],
  tempoWords:[{measure:1,text:'Assez lent.'},{measure:16,text:'Rit.'},{measure:19,text:'Un peu plus animé.'},{measure:36,text:'Iº tempo.'},{measure:54,text:'II — VALSE LENTE'},{measure:95,text:'Cédez un peu.'},{measure:96,text:'Tempo.'}],
  expandedSourceNotation:[{staff:2,measures:[2,3,4],type:'one-bar repeats',sourceMeasure:1},{staff:2,measures:[37,38,39],type:'one-bar repeats',sourceMeasure:36},{staves:[1,2],first:11,last:12,type:'2-bar rest'},{staves:[1,2],first:17,last:18,type:'2-bar rest'},{staves:[1,2],first:46,last:47,type:'2-bar rest'},{staves:[1,2],first:54,last:61,type:'8-bar rest'},{staff:2,first:62,last:74,type:'13-bar rest; cue in last half of staff1 m74'},{staff:1,first:88,last:92,type:'5-bar rest'},{staves:[1,2],first:100,last:101,type:'2-bar rest'},{staves:[1,2],first:136,last:137,type:'2-bar rest'},{staves:[1,2],first:139,last:141,type:'3-bar rest'}],
  cuePassages:[{staff:1,first:74,last:78,instrument:'1er violon',lastOnsetQuarters:0},{staff:1,first:93,last:93,instrument:'1er violon'},{staff:1,first:102,last:102,instrument:'flûte'}],
  uncertainties:[],
  measures:measures.map(m=>{
    const system=systems.find(s=>m.number>=s.first&&m.number<=s.last);
    return {measure:m.number,partId:'P1',sourcePage:system.page,sourceSystem:system.system,source_visual_status:'confirmed_visual',sourceRepeat:m.sourceRepeat||null,
      sourceSequence:m.staves.map((staff,i)=>({staff:i+1,tokens:staff.map(e=>e.token).join(' ')})),
      events:m.staves.flatMap((staff,i)=>staff.map(e=>({event:e.rest?'rest':'note',voice:String(i+1),staff:i+1,onset_quarters:e.onset/4,duration_quarters:e.grace?0:e.duration/4,...(!e.rest?{step:e.step,alter_effective:e.alter,octave:e.octave}:{}),candidate_grace:e.grace,source_visual_status:'confirmed_visual',cue:e.cue,source_silence_under_cue:e.hidden||false,ties:e.ties,slurs:e.slurs,articulations:e.articulations,...(e.editorial?{editorial:e.editorial}:{}),...(e.sourceReason?{sourceReason:e.sourceReason}:{})})))
    };
  })
};
if(!xmlOnly)fs.writeFileSync(path.join(dir,'source-ledger.json'),JSON.stringify(ledger,null,2)+'\n');
let report='# Revisão da fonte — II, Interlude et Valse lente\n\n- [x] Lidos visualmente os 12 sistemas das páginas 3 e 4.\n- [x] Reconstruídos 156 compassos em duas pautas de clarinete, ambas em clave de sol e visíveis.\n- [x] Expandidos símbolos de repetição de compasso e pausas multicompasso.\n- [x] Preservados os trechos de primeiro violino e flauta como notas-guia silenciosas.\n- [x] Declaradas as transposições em Lá (−3 semitons) e Si♭ (−2) nas duas pautas.\n- [x] Emenda de duração de c147 documentada no MusicXML e no ledger.\n\nA transcrição usa alturas escritas. Os tokens registram duração em divisões de uma semínima/4: 1=semicolcheia, 2=colcheia, 4=semínima, 6=semínima pontuada, 8=mínima, 12=mínima pontuada. `g`=apojatura sem duração medida; `c`=nota-guia; `R`=pausa de compasso.\n\nO OMR anterior tinha 125 compassos e omitia eventos ou confundia pausas, motivos de repetição, claves temporárias de cue e acidentes. Este arquivo foi reconstruído independentemente pela imagem.\n\n## Emenda editorial\n\nC147, pauta 1: a fonte imprime Si♭4 mínima sem ponto, enquanto pauta 2 preenche 3/4 com Sol4 mínima pontuada. Dupla inspeção visual confirmou a ausência do ponto na impressão. Adotada mínima pontuada na pauta 1, sem novo ataque. O MusicXML traz footnote na nota. Evidência: `tmp/bonis-review/movement-2/p4-m147.png`.\n\n## Notas de leitura\n\nAs barras com % em c2–4 e c37–39 repetem o motivo r4–Mi4 q–Mi4 e–r8, com a ligadura de prolongamento. A pausa de 13 compassos de c62–74 termina com anacruse de três colcheias de primeiro violino na pauta superior; a primeira metade desse compasso é silêncio pertencente à pausa multicompasso e fica sem novo símbolo impresso. As pautas omitidas nos sistemas solo estão explicitadas como silêncio de clarinete 2.\n\n## Ledger por sistema e compasso\n\n';
for(const s of systems){report+=`### Página ${s.page}, sistema ${s.system}: c${s.first}–${s.last}\n\n`;
  for(const m of ledger.measures.filter(m=>m.measure>=s.first&&m.measure<=s.last))report+=`- [x] c${m.measure}: pauta 1 \`${m.sourceSequence[0].tokens}\`; pauta 2 \`${m.sourceSequence[1].tokens}\`${m.measure===147?' — duração com emenda editorial explícita':''}.\n`;
  report+='\n';
}
if(!xmlOnly)fs.writeFileSync(path.join(dir,'review.md'),report);
const events=ledger.measures.flatMap(m=>m.events);
console.log(JSON.stringify({out,ledger:path.join(dir,'source-ledger.json'),measures:156,notes:events.filter(e=>e.event==='note').length,graces:events.filter(e=>e.candidate_grace).length,cues:events.filter(e=>e.cue).length,soundingWrittenAttacks:events.filter(e=>e.event==='note'&&!e.cue&&!e.candidate_grace&&!e.ties.includes('stop')).length,rests:events.filter(e=>e.event==='rest').length,slurLinks:slurLinks.length},null,2));
