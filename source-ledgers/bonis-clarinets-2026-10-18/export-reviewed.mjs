import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DOMParser, XMLSerializer} from '@xmldom/xmldom';
import midiFile from 'midi-file';
import sharp from 'sharp';
import {VerovioToolkit} from 'verovio/esm';
import createVerovioModule from 'verovio/wasm';
import {inspectMusicXmlValidation} from '../../apps/api/src/services/MusicXmlValidation.ts';

const ROOT = path.resolve('output/bonis-clarinets-reviewed-2026-10-18');
const PREVIEWS = path.resolve('tmp/bonis-review/root/previews');
const PPQ = 960;
const EPSILON = 1e-7;
const definitions = [
  {file:'01-Ballabile.musicxml', title:'I - Ballabile', bpm:132},
  {file:'02-Interlude-et-Valse-lente.musicxml', title:'II - Interlude et Valse lente', bpm:66,
    sectionTempos:{16:58,19:80,36:66,54:108,95:96,96:108}},
  {file:'03-Scherzo-Valse.musicxml', title:'III - Scherzo-Valse', bpm:144,sectionTempos:{70:128,76:144}}
];
const children = (p, name) => Array.from(p.childNodes).filter(n=>n.nodeType===1 && (!name || n.nodeName===name));
const one = (p,n) => children(p,n)[0];
const text = (p,n) => one(p,n)?.textContent?.trim();
const descendants = (p,n) => Array.from(p.getElementsByTagName(n));
const hash = s => createHash('sha256').update(s).digest('hex');
const ascii = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,' ');
const durTypes = {maxima:32,long:16,breve:8,whole:4,half:2,quarter:1,eighth:0.5,'16th':0.25,'32nd':0.125,'64th':0.0625};
const dynamicVelocities = {ppp:28,pp:40,p:52,mp:66,mf:80,f:96,ff:110,fff:122};
const pitchBases = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};

function parseScore(xml, definition) {
  const errors=[];
  const document=new DOMParser({errorHandler:{warning:m=>errors.push(m),error:m=>errors.push(m),fatalError:m=>errors.push(m)}}).parseFromString(xml,'application/xml');
  if(errors.length || document.documentElement?.nodeName!=='score-partwise') throw new Error(`${definition.file}: XML inválido: ${errors.join('; ')}`);
  const parts=children(document.documentElement,'part');
  if(parts.length!==1) throw new Error(`${definition.file}: esperado uma parte com duas pautas.`);
  const part=parts[0];
  let divisions=0,beats=3,beatType=4;
  const transposes={1:0,2:0};
  const keys={1:0,2:0};
  const measures=[];
  const notationIssues=[];
  const openSlurs=new Map();
  const declaredStaves=new Set();
  let noteCount=0;

  for(const [index,measure] of children(part,'measure').entries()) {
    let cursor=0,anchor=0,eventIndex=0;
    const events=[],directions=[];
    const number=measure.getAttribute('number') || String(index+1);
    const attributes=[];
    for(const child of children(measure)) {
      if(child.nodeName==='attributes') {
        if(text(child,'divisions')) divisions=Number(text(child,'divisions'));
        if(text(child,'staves')) declaredStaves.add(Number(text(child,'staves')));
        const time=one(child,'time');
        if(time) {beats=Number(text(time,'beats'));beatType=Number(text(time,'beat-type'));}
        for(const transpose of children(child,'transpose')) {
          const semitones=Number(text(transpose,'chromatic') || 0)+12*Number(text(transpose,'octave-change') || 0);
          const staffs=transpose.hasAttribute('number')?[Number(transpose.getAttribute('number'))]:[1,2];
          for(const staff of staffs) transposes[staff]=semitones;
        }
        for(const key of children(child,'key')) {
          const staffs=key.hasAttribute('number')?[Number(key.getAttribute('number'))]:[1,2];
          for(const staff of staffs) keys[staff]=Number(text(key,'fifths') || 0);
        }
        attributes.push({onset:cursor,beats,beatType,transposes:{...transposes},keys:{...keys}});
        continue;
      }
      if(child.nodeName==='backup' || child.nodeName==='forward') {
        if(!(divisions>0)) throw new Error(`${number}: divisions ausente`);
        cursor+=(child.nodeName==='backup'?-1:1)*Number(text(child,'duration'))/divisions;
        if(cursor < -EPSILON) throw new Error(`${number}: cursor negativo`);
        anchor=cursor;
        continue;
      }
      if(child.nodeName==='direction') {
        const sound=one(child,'sound');
        const dynamic=descendants(child,'dynamics')[0];
        const dynamicName=dynamic?children(dynamic)[0]?.nodeName:undefined;
        const words=descendants(child,'words').map(n=>n.textContent?.trim()).join(' ');
        const staff=Number(text(child,'staff') || 1);
        directions.push({onset:cursor+Number(text(child,'offset') || 0)/(divisions || 1),staff,words,
          tempo:sound?.hasAttribute('tempo')?Number(sound.getAttribute('tempo')):undefined,
          velocity:dynamicName?dynamicVelocities[dynamicName]:sound?.hasAttribute('dynamics')?Math.min(127,Math.round(Number(sound.getAttribute('dynamics'))*1.27)):undefined});
        continue;
      }
      if(child.nodeName!=='note') continue;
      if(!(divisions>0)) throw new Error(`${number}: divisions ausente`);
      const staff=Number(text(child,'staff') || 1);
      if(![1,2].includes(staff)) throw new Error(`${number}: pauta ${staff} inválida`);
      const grace=Boolean(one(child,'grace')),cue=Boolean(one(child,'cue')),chord=Boolean(one(child,'chord'));
      const duration=grace?0:Number(text(child,'duration'))/divisions;
      if(!Number.isFinite(duration) || duration<0) throw new Error(`${number}: duração inválida`);
      const onset=chord?anchor:cursor;
      const pitch=one(child,'pitch');
      const rest=Boolean(one(child,'rest'));
      if(!pitch && !rest) throw new Error(`${number}: evento sem nota ou pausa`);
      const writtenPitch=pitch?12*(Number(text(pitch,'octave'))+1)+pitchBases[text(pitch,'step')]+Number(text(pitch,'alter') || 0):null;
      const ties=[...children(child,'tie'),...descendants(child,'tied')].map(n=>n.getAttribute('type'));
      const articulation=descendants(child,'articulations')[0];
      const tremolo=descendants(child,'tremolo')[0];
      const event={id:`mv${definitions.indexOf(definition)+1}-m${index+1}-s${staff}-e${++eventIndex}`,measure:number,measureIndex:index,staff,
        voice:text(child,'voice') || String(staff),onset,duration,rest,grace,cue,chord,
        writtenPitch,pitch:writtenPitch===null?null:writtenPitch+transposes[staff],transpose:transposes[staff],
        tieStart:ties.includes('start'),tieStop:ties.includes('stop'),
        tremolo:tremolo?{strokes:Number(tremolo.textContent),type:tremolo.getAttribute('type') || 'single'}:null,
        articulations:articulation?children(articulation).map(n=>n.nodeName):[]};
      child.setAttribute('id',event.id);
      if(pitch) noteCount++;
      const type=text(child,'type');
      if(!grace && type && durTypes[type]) {
        let typeDuration=durTypes[type];
        for(let dot=1;dot<=children(child,'dot').length;dot++) typeDuration+=durTypes[type]/2**dot;
        const modification=one(child,'time-modification');
        if(modification) typeDuration*=Number(text(modification,'normal-notes'))/Number(text(modification,'actual-notes'));
        if(Math.abs(typeDuration-duration)>EPSILON) notationIssues.push({code:'TYPE_DURATION_MISMATCH',measure:number,staff,event:event.id,duration,typeDuration});
      }
      for(const slur of descendants(child,'slur')) {
        const key=`${staff}:${slur.getAttribute('number') || '1'}`;
        if(slur.getAttribute('type')==='stop') {
          if(!openSlurs.delete(key)) notationIssues.push({code:'SLUR_STOP_WITHOUT_START',measure:number,staff,key});
        }
        if(slur.getAttribute('type')==='start') {
          if(openSlurs.has(key)) notationIssues.push({code:'SLUR_START_DUPLICATE',measure:number,staff,key});
          openSlurs.set(key,number);
        }
      }
      events.push(event);
      if(!chord) {anchor=cursor;cursor+=duration;}
    }
    const expected=beats*4/beatType;
    const staffChecks=[];
    for(const staff of [1,2]) {
      const notes=events.filter(e=>e.staff===staff && !e.grace);
      const spans=notes.map(e=>[e.onset,e.onset+e.duration]).sort((a,b)=>a[0]-b[0]);
      let covered=0;
      for(const [start,end] of spans) {
        if(start>covered+EPSILON) notationIssues.push({code:'STAFF_GAP',measure:number,staff,from:covered,to:start});
        covered=Math.max(covered,end);
      }
      if(Math.abs(covered-expected)>EPSILON) notationIssues.push({code:'STAFF_DURATION',measure:number,staff,actual:covered,expected});
      staffChecks.push({staff,duration:covered,expected});
    }
    const navigation={forward:false,backward:false,times:2,endingStarts:[],endingStops:[]};
    for(const barline of children(measure,'barline')) {
      for(const repeat of children(barline,'repeat')) {
        if(repeat.getAttribute('direction')==='forward') navigation.forward=true;
        if(repeat.getAttribute('direction')==='backward') {navigation.backward=true;navigation.times=Number(repeat.getAttribute('times') || 2);}
      }
      for(const ending of children(barline,'ending')) {
        const numbers=(ending.getAttribute('number') || '').split(/[^0-9]+/).filter(Boolean).map(Number);
        if(ending.getAttribute('type')==='start') navigation.endingStarts.push(numbers);
        else navigation.endingStops.push(numbers);
      }
    }
    measures.push({index,number,events,directions,attributes,duration:expected,staffChecks,navigation,beats,beatType,keys:{...keys}});
  }
  for(const [key,measure] of openSlurs) notationIssues.push({code:'SLUR_UNCLOSED',key,measure});
  if(!declaredStaves.has(2)) throw new Error(`${definition.file}: falta staves=2`);
  const hidden=descendants(part,'staff-details').filter(n=>n.getAttribute('print-object')==='no');
  if(hidden.length) notationIssues.push({code:'HIDDEN_STAFF',count:hidden.length});
  return {document,measures,noteCount,notationIssues};
}

function performedOrder(measures) {
  const groups=[];
  const forwards=[];
  for(const m of measures) {
    if(m.navigation.forward) forwards.push(m.index);
    if(m.navigation.backward) groups.push({start:forwards.pop() ?? 0,end:m.index,times:m.navigation.times,pass:1});
  }
  const endingNumbers=new Map();
  let active=null;
  for(const m of measures) {
    if(m.navigation.endingStarts.length) active=m.navigation.endingStarts.flat();
    if(active) endingNumbers.set(m.index,active);
    if(m.navigation.endingStops.length) active=null;
  }
  const order=[];
  for(let i=0,guard=0;i<measures.length;guard++) {
    if(guard>10000) throw new Error('Repetição não terminou');
    const endGroup=groups.find(g=>g.end===i);
    const ending=endingNumbers.get(i);
    const group=groups.find(g=>i>=g.start&&i<=g.end) || [...groups].reverse().find(g=>g.end<i);
    const allowed=!ending || ending.includes(group?.pass ?? 1);
    if(allowed) order.push(i);
    if(endGroup && endGroup.pass<endGroup.times) {endGroup.pass++;i=endGroup.start;continue;}
    i++;
  }
  return order;
}

function buildPerformance(parsed,definition) {
  const order=performedOrder(parsed.measures);
  const notes=[],tempos=[{q:0,bpm:definition.bpm,source:'editorial-default'}],markers=[],meters=[];
  const tieMap=new Map(),velocities={1:80,2:80};
  const issues=[];
  let q=0;
  for(const [occurrence,index] of order.entries()) {
    const m=parsed.measures[index];
    const editorialTempo=definition.sectionTempos?.[Number(m.number)];
    if(editorialTempo) tempos.push({q,bpm:editorialTempo,source:'editorial-verbal-direction'});
    markers.push({q,text:`${definition.title} / ${m.number}`});
    meters.push({q,numerator:m.beats,denominator:m.beatType});
    const directionEvents=m.directions.slice().sort((a,b)=>a.onset-b.onset);
    for(const direction of directionEvents) {
      if(direction.tempo>0) tempos.push({q:q+direction.onset,bpm:direction.tempo,source:'musicxml'});
    }
    const all=m.events.slice().sort((a,b)=>a.onset-b.onset || a.staff-b.staff);
    for(const event of all) {
      if(event.rest || event.cue || event.grace) continue;
      const dynamics=directionEvents.filter(d=>d.staff===event.staff && d.onset<=event.onset && d.velocity>0).at(-1);
      if(dynamics) velocities[event.staff]=dynamics.velocity;
      const absolute=q+event.onset;
      const tieKey=`${event.staff}:${event.voice}:${event.pitch}`;
      const tied=tieMap.get(tieKey);
      if(event.tieStop && tied && Math.abs(tied.notatedEnd-absolute)<EPSILON) {
        tied.notatedEnd=absolute+event.duration;
        tied.end=tied.notatedEnd;
        tied.ids.push(event.id);
        if(!event.tieStart) tieMap.delete(tieKey);
        continue;
      }
      if(event.tieStop && !tied) issues.push({code:'PERFORMED_TIE_STOP_WITHOUT_START',measure:m.number,staff:event.staff,occurrence});
      if(event.tieStop && tied && Math.abs(tied.notatedEnd-absolute)>=EPSILON) issues.push({code:'PERFORMED_TIE_NONCONTIGUOUS',measure:m.number,staff:event.staff,occurrence});
      const sameStaff=m.events.filter(e=>e.staff===event.staff && e.grace && e.onset===event.onset);
      const graceLength=sameStaff.length?Math.min(event.duration/4,0.125):0;
      const before=event.onset>0 && absolute>=graceLength;
      const graceStart=before?absolute-graceLength:absolute;
      if(graceLength && before) {
        const previous=notes.filter(n=>n.staff===event.staff&&!n.grace&&n.start<absolute&&n.end>graceStart).at(-1);
        if(previous) previous.end=graceStart;
      }
      for(const [g,grace] of sameStaff.entries()) notes.push({staff:event.staff,pitch:grace.pitch,start:graceStart+g*graceLength/sameStaff.length,
        end:graceStart+(g+1)*graceLength/sameStaff.length,notatedEnd:graceStart+(g+1)*graceLength/sameStaff.length,velocity:velocities[event.staff],ids:[grace.id],grace:true});
      let gate=1;
      if(event.articulations.includes('staccato')) gate=0.5;
      if(event.articulations.includes('staccatissimo')) gate=0.25;
      if(event.tieStart) gate=1;
      const velocity=Math.min(127,velocities[event.staff]+(event.articulations.includes('accent')?10:0));
      if(event.tremolo) {
        if(event.tremolo.type!=='single' || ![1,2,3,4].includes(event.tremolo.strokes)) throw new Error(`Tremolo não suportado em ${m.number}`);
        const subdivision=1/2**event.tremolo.strokes;
        const count=event.duration/subdivision;
        if(!Number.isInteger(count)) throw new Error(`Tremolo não integral em ${m.number}`);
        for(let t=0;t<count;t++) notes.push({staff:event.staff,pitch:event.pitch,start:absolute+t*subdivision,
          end:absolute+t*subdivision+subdivision*gate,notatedEnd:absolute+(t+1)*subdivision,velocity,ids:[event.id],grace:false,tremolo:true});
        continue;
      }
      const delay=before?0:graceLength;
      const note={staff:event.staff,pitch:event.pitch,start:absolute+delay,
        end:absolute+delay+(event.duration-delay)*gate,notatedEnd:absolute+event.duration,velocity,ids:[event.id],grace:false};
      notes.push(note);
      if(event.tieStart) tieMap.set(tieKey,note);
    }
    q+=m.duration;
  }
  for(const [key,note] of tieMap) issues.push({code:'PERFORMED_TIE_UNCLOSED',key,ids:note.ids});
  return {order,notes,tempos,markers,meters,duration:q,issues};
}

function deltaTrack(events,lastTick) {
  const sorted=events.slice().sort((a,b)=>a.tick-b.tick || a.priority-b.priority);
  let prior=0;
  const track=sorted.map(({tick,priority,...event})=>{const deltaTime=tick-prior;prior=tick;return {...event,deltaTime};});
  track.push({deltaTime:Math.max(0,lastTick-prior),meta:true,type:'endOfTrack'});
  return track;
}

function makeMidi(performance,title) {
  const tick=q=>Math.round(q*PPQ);
  const end=tick(performance.duration);
  const conductor=[{tick:0,priority:0,meta:true,type:'trackName',text:ascii(title)}];
  for(const tempo of performance.tempos) conductor.push({tick:tick(tempo.q),priority:0,meta:true,type:'setTempo',microsecondsPerBeat:Math.round(60_000_000/tempo.bpm)});
  for(const marker of performance.markers) conductor.push({tick:tick(marker.q),priority:1,meta:true,type:'marker',text:ascii(marker.text)});
  let priorMeter='';
  for(const meter of performance.meters) {
    const signature=`${meter.numerator}/${meter.denominator}`;
    if(signature===priorMeter) continue;
    priorMeter=signature;
    conductor.push({tick:tick(meter.q),priority:1,meta:true,type:'timeSignature',numerator:meter.numerator,denominator:meter.denominator,metronome:24,thirtyseconds:8});
  }
  const tracks=[deltaTrack(conductor,end)];
  for(const staff of [1,2]) {
    const channel=staff-1;
    const events=[{tick:0,priority:0,meta:true,type:'trackName',text:`Clarinete ${staff}`},
      {tick:0,priority:0,channel,type:'programChange',programNumber:71},
      {tick:0,priority:0,channel,type:'controller',controllerType:10,value:staff===1?48:80}];
    for(const note of performance.notes.filter(n=>n.staff===staff)) {
      if(!Number.isInteger(note.pitch)||note.pitch<0||note.pitch>127||note.end<=note.start) throw new Error('Nota MIDI inválida');
      events.push({tick:tick(note.start),priority:2,channel,type:'noteOn',noteNumber:note.pitch,velocity:note.velocity});
      events.push({tick:Math.max(tick(note.start)+1,tick(note.end)),priority:1,channel,type:'noteOff',noteNumber:note.pitch,velocity:0});
    }
    tracks.push(deltaTrack(events,end));
  }
  return Buffer.from(midiFile.writeMidi({header:{format:1,numTracks:3,ticksPerBeat:PPQ},tracks}));
}

function verifyMidi(buffer,performance) {
  const midi=midiFile.parseMidi(buffer);
  const actual=[];
  for(const [trackIndex,track] of midi.tracks.entries()) {
    let tick=0;
    const open=new Map();
    for(const event of track) {
      tick+=event.deltaTime;
      if(!['noteOn','noteOff'].includes(event.type)) continue;
      const key=`${event.channel}:${event.noteNumber}`;
      if(event.type==='noteOn' && event.velocity>0) {
        if(open.has(key)) throw new Error(`MIDI sobrepõe a mesma altura no canal ${event.channel}`);
        open.set(key,{staff:event.channel+1,pitch:event.noteNumber,start:tick,velocity:event.velocity,track:trackIndex});
      } else {
        const note=open.get(key);
        if(!note) throw new Error('Note-off órfão');
        actual.push({...note,end:tick});open.delete(key);
      }
    }
    if(open.size) throw new Error('Nota MIDI sem encerramento');
  }
  const signature=n=>`${n.staff}:${n.pitch}:${n.start}:${n.end}`;
  const expected=performance.notes.map(n=>({staff:n.staff,pitch:n.pitch,start:Math.round(n.start*PPQ),end:Math.max(Math.round(n.start*PPQ)+1,Math.round(n.end*PPQ))}));
  const a=actual.map(signature).sort(),e=expected.map(signature).sort();
  if(JSON.stringify(a)!==JSON.stringify(e)) throw new Error('MIDI diverge em altura, início ou duração');
  return {status:'passed',ppq:PPQ,tracks:midi.tracks.length,clarinetTracks:2,checkedAttacks:actual.length,checkedDurations:actual.length,
    transposition:'written pitch plus MusicXML chromatic/octave transpose',gracePolicy:'grace group occupies 0.125 quarter before the main note within a measure, shortening the preceding note if needed; at a measure start steals from following note',
    articulationPolicy:'staccato 50%, staccatissimo 25%, otherwise full notated duration',performanceIssues:performance.issues};
}

function compareIndependentMidi(engineMidi,directMidi) {
  const read=buffer=>{
    const parsed=midiFile.parseMidi(buffer);
    return parsed.tracks.flatMap((track,staff)=>{
      let tick=0;
      return track.flatMap(event=>{
        tick+=event.deltaTime;
        return event.type==='noteOn'&&event.velocity>0?[{staff,pitch:event.noteNumber,q:tick/parsed.header.ticksPerBeat}]:[];
      });
    });
  };
  const engine=read(engineMidi),direct=read(directMidi);
  const enginePPQ=midiFile.parseMidi(engineMidi).header.ticksPerBeat;
  const pitchDifferences=[],onsetDifferences=[];
  for(let i=0;i<Math.max(engine.length,direct.length);i++) {
    const a=engine[i],b=direct[i];
    if(!a || !b || a.staff!==b.staff || a.pitch!==b.pitch) pitchDifferences.push({index:i,engine:a,direct:b});
    else if(Math.abs(a.q-b.q)>EPSILON) onsetDifferences.push({index:i,engine:a,direct:b});
  }
  const maxOnsetDifferenceQuarters=onsetDifferences.reduce((max,d)=>Math.max(max,Math.abs(d.engine.q-d.direct.q)),0);
  return {engine:'Verovio',engineAttacks:engine.length,directAttacks:direct.length,
    status:pitchDifferences.length===0&&maxOnsetDifferenceQuarters<=1/enginePPQ+EPSILON?'passed':'differences',
    enginePPQ,onsetToleranceQuarters:1/enginePPQ,
    pitchDifferenceCount:pitchDifferences.length,onsetDifferenceCount:onsetDifferences.length,
    maxOnsetDifferenceQuarters,
    pitchDifferences:pitchDifferences.slice(0,20),onsetDifferences:onsetDifferences.slice(0,20)};
}

/** Playback comparison only: Verovio 6.1 does not apply the mid-score A -> Bb transpose change. */
function concertPitchComparisonXml(xml) {
  const document=new DOMParser().parseFromString(xml,'application/xml');
  const transposes={1:0,2:0};
  const chromatic=[['C',0],['C',1],['D',0],['D',1],['E',0],['F',0],['F',1],['G',0],['G',1],['A',0],['A',1],['B',0]];
  for(const measure of children(children(document.documentElement,'part')[0],'measure')) {
    for(const child of children(measure)) {
      if(child.nodeName==='attributes') {
        for(const key of children(child,'key')) if(one(key,'fifths')) one(key,'fifths').textContent='0';
        for(const transpose of children(child,'transpose')) {
          const staffs=transpose.hasAttribute('number')?[Number(transpose.getAttribute('number'))]:[1,2];
          for(const staff of staffs) transposes[staff]=Number(text(transpose,'chromatic') || 0)+12*Number(text(transpose,'octave-change') || 0);
          child.removeChild(transpose);
        }
      }
      if(child.nodeName!=='note' || !one(child,'pitch')) continue;
      const pitch=one(child,'pitch');
      const staff=Number(text(child,'staff') || 1);
      const number=12*(Number(text(pitch,'octave'))+1)+pitchBases[text(pitch,'step')]+Number(text(pitch,'alter') || 0)+transposes[staff];
      const [step,alter]=chromatic[((number%12)+12)%12];
      one(pitch,'step').textContent=step;
      one(pitch,'octave').textContent=String(Math.floor(number/12)-1);
      let alterElement=one(pitch,'alter');
      if(!alterElement) {alterElement=document.createElement('alter');pitch.insertBefore(alterElement,one(pitch,'octave'));}
      alterElement.textContent=String(alter);
      let accidental=one(child,'accidental');
      if(!accidental) {accidental=document.createElement('accidental');child.insertBefore(accidental,one(child,'staff') ?? one(child,'notations') ?? null);}
      accidental.textContent=alter?'sharp':'natural';
    }
  }
  return new XMLSerializer().serializeToString(document);
}

async function main() {
  const selected=process.argv.slice(2);
  const defs=selected.length?definitions.filter(d=>selected.some(s=>d.file.startsWith(s))):definitions;
  const verovioModule=await createVerovioModule();
  await fs.mkdir(PREVIEWS,{recursive:true});
  const reports=[];
  for(const definition of defs) {
    const xml=await fs.readFile(path.join(ROOT,definition.file),'utf8');
    const parsed=parseScore(xml,definition);
    const performance=buildPerformance(parsed,definition);
    const midi=makeMidi(performance,definition.title);
    const verified=verifyMidi(midi,performance);
    const xmlValidation=inspectMusicXmlValidation(xml);
    const outputFile=definition.file.replace(/\.musicxml$/,'.mid');
    if(parsed.notationIssues.length || performance.issues.length || xmlValidation.issues.length) {
      console.log(JSON.stringify({file:definition.file,notationIssues:parsed.notationIssues,performanceIssues:performance.issues,xmlIssues:xmlValidation.issues},null,2));
    }
    await fs.writeFile(path.join(ROOT,outputFile),midi);
    const toolkit=new VerovioToolkit(verovioModule);
    toolkit.setOptions({inputFrom:'xml',breaks:'auto',pageWidth:2100,pageHeight:2970,scale:50,header:'auto',footer:'auto',adjustPageHeight:false,midiNoCue:true});
    if(!toolkit.loadData(xml)) throw new Error(`Não abriu ${definition.file}`);
    const independentMidiComparison=compareIndependentMidi(Buffer.from(toolkit.renderToMIDI(),'base64'),midi);
    independentMidiComparison.engine=`Verovio ${toolkit.getVersion()}`;
    if(independentMidiComparison.pitchDifferenceCount) {
      const independent=new VerovioToolkit(verovioModule);
      independent.setOptions({inputFrom:'xml',breaks:'none',midiNoCue:true});
      if(!independent.loadData(concertPitchComparisonXml(xml))) throw new Error('Comparação em altura real não abriu');
      independentMidiComparison.concertPitchComparison=compareIndependentMidi(Buffer.from(independent.renderToMIDI(),'base64'),midi);
      independentMidiComparison.concertPitchComparison.input='Concert pitch normalized in memory only; delivered MusicXML retains original written pitches and A/Bb transposition.';
      independent.destroy();
    }
    const previewFiles=[];
    for(let page=1;page<=toolkit.getPageCount();page++) {
      const name=`${definition.file.replace('.musicxml','')}-p${page}.png`;
      await sharp(Buffer.from(toolkit.renderToSVG(page))).flatten({background:'#ffffff'}).png().toFile(path.join(PREVIEWS,name));
      previewFiles.push(path.join(PREVIEWS,name));
    }
    toolkit.destroy();
    const report={file:definition.file,midiFile:outputFile,xmlSHA256:hash(xml),midiSHA256:hash(midi),measures:parsed.measures.length,pitchedNotes:parsed.noteCount,
      notesByStaff:[1,2].map(staff=>({staff,writtenNotes:parsed.measures.flatMap(m=>m.events).filter(e=>e.staff===staff&&!e.rest).length})),
      performedMeasures:performance.order.length,performanceOrder:performance.order.map(i=>parsed.measures[i].number),durationQuarters:performance.duration,
      notationIssues:parsed.notationIssues,xmlValidation,midiValidation:verified,independentMidiComparison,defaultTempoBpm:definition.bpm,editorialSectionTempos:definition.sectionTempos ?? {},
      tempoNote:'Default metronome is editorial when the source gives a verbal tempo only.',previewFiles};
    reports.push(report);
    await fs.writeFile(path.join(ROOT,definition.file.replace('.musicxml','-validation.json')),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({file:definition.file,measures:report.measures,notes:report.pitchedNotes,notationIssues:report.notationIssues.length,xmlIssues:xmlValidation.issues.length,midi:verified.status,attacks:verified.checkedAttacks,pages:previewFiles.length}));
  }
  if(defs.length===3) await fs.writeFile(path.join(ROOT,'validation-report.json'),JSON.stringify(reports,null,2)+'\n');
}

export {parseScore,performedOrder,buildPerformance,makeMidi,verifyMidi,definitions,concertPitchComparisonXml};
if(process.argv[1] && path.resolve(process.argv[1])===new URL(import.meta.url).pathname) await main();
