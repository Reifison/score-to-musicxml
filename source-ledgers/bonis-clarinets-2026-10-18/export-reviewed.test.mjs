import assert from 'node:assert/strict';
import {parseScore,performedOrder,buildPerformance,makeMidi,verifyMidi,definitions} from './export-reviewed.mjs';

const nav=(overrides={})=>({forward:false,backward:false,times:2,endingStarts:[],endingStops:[],...overrides});
const repeated=[
  {index:0,navigation:nav({forward:true})},
  {index:1,navigation:nav({backward:true,endingStarts:[[1]],endingStops:[[1]]})},
  {index:2,navigation:nav({endingStarts:[[2]],endingStops:[[2]]})}
];
assert.deepEqual(performedOrder(repeated),[0,1,0,2]);

const note=(staff,pitch,onset,duration,extras={})=>({id:`${staff}-${pitch}-${onset}`,staff,pitch,onset,duration,voice:String(staff),
  rest:false,grace:false,cue:false,chord:false,articulations:[],...extras});
const measure=(index,events)=>({index,number:String(index+1),duration:3,beats:3,beatType:4,navigation:nav(),directions:[],events});
const parsed={measures:[
  measure(0,[note(1,69,0,3,{tieStart:true}),note(2,57,0,3)]),
  measure(1,[note(1,69,0,3,{tieStop:true}),note(2,59,0,3,{articulations:['staccato']})])
]};
const performed=buildPerformance(parsed,definitions[0]);
assert.equal(performed.issues.length,0);
assert.equal(performed.notes.length,3);
assert.equal(performed.notes.find(n=>n.staff===1).end,6);
assert.equal(performed.notes.find(n=>n.staff===2&&n.pitch===59).end,4.5);
assert.equal(verifyMidi(makeMidi(performed,'test'),performed).checkedDurations,3);

const tremolo=buildPerformance({measures:[measure(0,[
  note(1,72,0,3,{tremolo:{strokes:1,type:'single'}}),note(2,60,0,3)
])]},definitions[2]);
assert.equal(tremolo.notes.filter(n=>n.staff===1).length,6);
assert.deepEqual(tremolo.notes.filter(n=>n.staff===1).map(n=>n.start),[0,0.5,1,1.5,2,2.5]);
assert.equal(verifyMidi(makeMidi(tremolo,'tremolo'),tremolo).checkedAttacks,7);

const ornament=buildPerformance({measures:[measure(0,[
  note(1,67,0,1),note(1,69,1,0,{grace:true}),note(1,71,1,0,{grace:true}),note(1,69,1,2),note(2,57,0,3)
])]},definitions[0]);
assert.equal(ornament.notes.find(n=>n.staff===1&&n.pitch===67).end,0.875);
assert.deepEqual(ornament.notes.filter(n=>n.grace).map(n=>n.start),[0.875,0.9375]);
assert.equal(verifyMidi(makeMidi(ornament,'grace'),ornament).checkedAttacks,5);

const source='<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Clarinetes</part-name></score-part></part-list><part id="P1">'+
  '<measure number="1"><attributes><divisions>4</divisions><time><beats>3</beats><beat-type>4</beat-type></time><staves>2</staves><transpose><diatonic>-2</diatonic><chromatic>-3</chromatic></transpose></attributes>'+
  '<note><pitch><step>C</step><octave>5</octave></pitch><duration>12</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note><backup><duration>12</duration></backup>'+
  '<note><pitch><step>D</step><octave>4</octave></pitch><duration>12</duration><voice>2</voice><type>half</type><dot/><staff>2</staff></note></measure></part></score-partwise>';
const score=parseScore(source,definitions[0]);
assert.equal(score.notationIssues.length,0);
assert.deepEqual(score.measures[0].events.map(n=>n.pitch),[69,59]);
assert.equal(verifyMidi(makeMidi(buildPerformance(score,definitions[0]),'test'),buildPerformance(score,definitions[0])).status,'passed');
console.log('passed: repeat endings, tie duration, two tracks, staccato, transposing written pitch, exact MIDI round trip');
