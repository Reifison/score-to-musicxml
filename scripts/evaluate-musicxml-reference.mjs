import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';

const elements = (parent, tag) => Array.from(parent.childNodes).filter(n => n.nodeType === 1 && n.localName === tag);
const text = (parent, tag) => elements(parent, tag)[0]?.textContent;

export function readEvents(xml, {includeStaff = false} = {}) {
  const errors = [];
  const document = new DOMParser({errorHandler:{warning:m=>errors.push(m),error:m=>errors.push(m),fatalError:m=>errors.push(m)}}).parseFromString(xml,'application/xml');
  if (errors.length || document.documentElement?.localName !== 'score-partwise') throw new Error('MusicXML inválido');
  const events = [];
  for (const part of elements(document.documentElement,'part')) {
    let divisions = null;
    for (const measure of elements(part,'measure')) {
      let cursor = 0, anchor = null;
      for (const child of Array.from(measure.childNodes).filter(n=>n.nodeType===1)) {
        if (child.localName === 'attributes' && text(child,'divisions')) divisions = Number(text(child,'divisions'));
        if (!['note','backup','forward'].includes(child.localName)) continue;
        const grace = elements(child,'grace').length > 0;
        if (!(divisions > 0)) throw new Error('Divisions não declarado: avaliação impossível');
        const duration = grace ? 0 : Number(text(child,'duration')) / divisions;
        if (!Number.isFinite(duration) || duration < 0) throw new Error('Duração inválida');
        if (child.localName === 'backup') {cursor-=duration; anchor=null; continue;}
        if (child.localName === 'forward') {cursor+=duration; anchor=null; continue;}
        const chord = elements(child,'chord').length > 0;
        if (chord && anchor === null) throw new Error('Membro de acorde sem nota-base');
        const pitch = elements(child,'pitch')[0];
        const kind = elements(child,'rest').length ? 'rest' : 'note';
        if (kind === 'note' && !pitch) throw new Error('Nota sem altura: avaliação não suportada');
        const event = {part:part.getAttribute('id'), measure:measure.getAttribute('number'), voice:text(child,'voice')||'1',
          kind, pitch:pitch ? `${text(pitch,'step')}:${Number(text(pitch,'alter')||0)}:${text(pitch,'octave')}` : null,
          onset:chord ? anchor : cursor, duration, grace};
        if (includeStaff) {
          const rawStaff = text(child,'staff');
          const staffText = rawStaff?.trim();
          const staff = staffText === undefined ? 1 : Number(staffText);
          if ((staffText !== undefined && !/^\d+$/.test(staffText)) || !Number.isSafeInteger(staff) || staff < 1) {
            throw new Error(`Staff MusicXML inválido: ${rawStaff}`);
          }
          event.staff = staff;
        }
        events.push(event);
        if (!chord) {anchor=cursor;cursor+=duration;}
      }
    }
  }
  return events;
}

const signature = event => JSON.stringify([event.kind,event.pitch,event.voice,Number(event.onset.toFixed(8)),Number(event.duration.toFixed(8)),event.grace,event.staff??1]);
const groupKey = event => JSON.stringify([event.part,event.measure]);

/** Count a changed event once even when pitch, time and voice all differ. Rests never substitute pitched notes. */
export function evaluateEvents(expected, actual) {
  if (!expected.length) throw new Error('Referência vazia');
  let correct=0, changed=0, missing=0, extra=0;
  const issues=[];
  const groups = new Map();
  for (const [name,events] of [['expected',expected],['actual',actual]]) for (const event of events) {
    const key=groupKey(event);if (!groups.has(key)) groups.set(key,{expected:[],actual:[]});groups.get(key)[name].push(event);
  }
  for (const group of groups.values()) {
    const remaining=[...group.actual], unmatched=[];
    for (const event of group.expected) {
      const index=remaining.findIndex(e=>signature(e)===signature(event));
      if (index<0) unmatched.push(event);else {remaining.splice(index,1);correct++;}
    }
    // Match source occurrences, prioritizing equal written pitch, voice and closest onset.
    for (const event of unmatched) {
      const options=remaining.map((candidate,index)=>({candidate,index}))
        .filter(({candidate})=>candidate.kind===event.kind && candidate.grace===event.grace)
        .sort((a,b)=>distance(event,a.candidate)-distance(event,b.candidate));
      if (!options.length) {missing++;issues.push({kind:'missing',expected:event});continue;}
      const selected=options[0];remaining.splice(selected.index,1);changed++;issues.push({kind:'changed',expected:event,actual:selected.candidate});
    }
    extra+=remaining.length;issues.push(...remaining.map(actual=>({kind:'extra',actual})));
  }
  const incorrect=changed+missing+extra;
  const errorPercent=100*incorrect/expected.length;
  return {expectedEvents:expected.length,actualEvents:actual.length,correct,changed,missing,extra,incorrect,
    errorPercent,accuracyPercent:Math.max(0,100-errorPercent),scoreOutOf10:Math.max(0,10-errorPercent/10),issues,
    scope:'Altura escrita, duração, início, voz, pauta e pausa. Navegação, articulação e transposição sonora são avaliadas separadamente.'};
}

function distance(a,b) {return (a.pitch===b.pitch?0:100)+(a.voice===b.voice?0:10)+((a.staff??1)===(b.staff??1)?0:10)+Math.abs(a.onset-b.onset)+Math.abs(a.duration-b.duration);}

export function ledgerEvents(ledger) {
  if (!ledger.measures?.length) throw new Error('Ledger vazio');
  return ledger.measures.flatMap(m=>m.events.map(e=>{
    if (!/^confirmed/.test(e.source_visual_status||'')) throw new Error(`Evento sem confirmação visual no compasso ${m.measure}`);
    const staff=e.staff??1;
    if (!['note','rest'].includes(e.event) || !e.voice || !Number.isFinite(e.onset_quarters)
      || !Number.isFinite(e.duration_quarters) || e.onset_quarters < 0 || e.duration_quarters < 0
      || !Number.isSafeInteger(staff) || staff < 1
      || (e.event === 'note' && (!/^[A-G]$/.test(e.step) || !Number.isFinite(e.alter_effective) || !Number.isInteger(e.octave)))) {
      throw new Error(`Evento de referência incompleto no compasso ${m.measure}`);
    }
    return {part:m.partId||'P1',measure:String(m.measure),voice:e.voice,kind:e.event,
      pitch:e.event==='note'?`${e.step}:${e.alter_effective}:${e.octave}`:null,staff,
      onset:e.onset_quarters,duration:e.duration_quarters,grace:Boolean(e.candidate_grace)};
  }));
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [ledgerPath,xmlPath,resultPath]=process.argv.slice(2);
  if (!ledgerPath || !xmlPath || !resultPath) throw new Error('Uso: node scripts/evaluate-musicxml-reference.mjs ledger.json candidate.musicxml resultado.json');
  const [ledgerText,xml]=await Promise.all([readFile(ledgerPath,'utf8'),readFile(xmlPath,'utf8')]);
  const result=evaluateEvents(ledgerEvents(JSON.parse(ledgerText)),readEvents(xml,{includeStaff:true}));
  result.sourceReferenceSha256=createHash('sha256').update(ledgerText).digest('hex');
  result.candidateSha256=createHash('sha256').update(xml).digest('hex');
  result.referenceType='Revisão visual assistida; homologação editorial humana independente não registrada';
  await writeFile(resultPath,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({...result,issues:result.issues.length}));
}
