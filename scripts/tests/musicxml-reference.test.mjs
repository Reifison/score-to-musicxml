import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateEvents,readEvents,ledgerEvents} from '../evaluate-musicxml-reference.mjs';
const event={part:'P1',measure:'1',voice:'1',kind:'note',pitch:'C:0:4',onset:0,duration:1,grace:false};
test('vários erros na mesma nota contam uma ocorrência, inclusive voz errada',()=>{
 const result=evaluateEvents([event],[{...event,voice:'2',pitch:'D:0:4',onset:0.5,duration:0.5}]);
 assert.equal(result.incorrect,1);assert.equal(result.changed,1);
});
test('pausa extra não mascara acorde omitido',()=>{
 const notes=[event,{...event,pitch:'E:0:4'},{...event,pitch:'G:0:4'}];
 const result=evaluateEvents(notes,[{...event,kind:'rest',pitch:null}]);
 assert.equal(result.missing,3);assert.equal(result.extra,1);assert.equal(result.incorrect,4);assert.equal(result.scoreOutOf10,0);
});
test('acorde com membros permutados mantém significado e notas iguais em vozes diferentes permanecem distintas',()=>{
 const second={...event,voice:'2',duration:2};
 assert.equal(evaluateEvents([event,second],[second,event]).incorrect,0);
 assert.equal(evaluateEvents([event,second],[event]).missing,1);
});
test('rejeita referência sem evento conferido em vez de inventar nota',()=>{
 assert.throws(()=>ledgerEvents({measures:[{measure:1,events:[{source_visual_status:'ambiguous'}]}]}));
 assert.throws(()=>evaluateEvents([],[]));
});
test('extrai acordes, grace, backup e forward sem deslocar outra voz',()=>{
 const xml='<score-partwise><part id="P1"><measure number="1"><attributes><divisions>4</divisions></attributes><note><grace/><pitch><step>D</step><octave>4</octave></pitch></note><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note><note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration></note><backup><duration>4</duration></backup><forward><duration>2</duration></forward><note><rest/><duration>2</duration><voice>2</voice></note></measure></part></score-partwise>';
 const events=readEvents(xml);assert.deepEqual(events.map(e=>[e.onset,e.duration]),[[0,0],[0,1],[0,1],[0.5,0.5]]);
 assert.equal(events[0].grace,true);
});
test('altura MusicXML usa alter explícito: armadura não transforma bequadro em sustenido',()=>{
 const xml='<score-partwise><part id="P1"><measure number="5"><attributes><divisions>4</divisions><key><fifths>2</fifths></key></attributes><note><pitch><step>F</step><alter>1</alter><octave>3</octave></pitch><duration>2</duration></note><note><pitch><step>F</step><octave>3</octave></pitch><duration>2</duration><accidental>natural</accidental></note></measure></part></score-partwise>';
 assert.deepEqual(readEvents(xml).map(e=>e.pitch),['F:1:3','F:0:3']);
});
test('staff é opcional para compatibilidade, mas validado e exposto quando solicitado',()=>{
 const xml='<score-partwise><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>2</staff></note><note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration></note></measure></part></score-partwise>';
 const legacy=readEvents(xml);
 assert.deepEqual(Object.keys(legacy[0]),['part','measure','voice','kind','pitch','onset','duration','grace']);
 assert.equal('staff' in legacy[0],false);
 assert.deepEqual(readEvents(xml,{includeStaff:true}).map(e=>e.staff),[2,1]);
 assert.throws(()=>readEvents(xml.replace('<staff>2</staff>','<staff>0</staff>'),{includeStaff:true}),/Staff MusicXML inválido/);
});
test('staff diferente conta como evento alterado mesmo com voz, altura e tempo iguais',()=>{
 const result=evaluateEvents([{...event,staff:1}],[{...event,staff:2}]);
 assert.equal(result.changed,1);assert.equal(result.incorrect,1);
});
test('ledgerEvents preserva staff, usa pauta 1 por omissão e valida valores',()=>{
 const entry={source_visual_status:'confirmed',event:'note',voice:'1',onset_quarters:0,duration_quarters:1,step:'C',alter_effective:0,octave:4};
 const ledger=staff=>ledgerEvents({measures:[{measure:'1',events:[{...entry,...(staff===undefined?{}:{staff})}]}]});
 assert.equal(ledger(2)[0].staff,2);assert.equal(ledger()[0].staff,1);
 assert.throws(()=>ledger(0),/Evento de referência incompleto/);
 assert.throws(()=>ledger('2'),/Evento de referência incompleto/);
});
