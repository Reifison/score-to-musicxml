import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{existsSync}from'node:fs';import{dirname,resolve}from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';import{DOMParser}from'@xmldom/xmldom';import{readEvents,evaluateEvents}from'../evaluate-musicxml-reference.mjs';
const dir=new URL('./fixtures/acervo-review/csm100/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',dir)));const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),corpusTest=manifest.sourceOnlyReadings.every(ref=>existsSync(resolve(root,ref.path)))?test:test.skip;const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(label){const record=manifest.files.find(x=>x.label===label),bytes=await readFile(new URL(record.file,dir));assert.equal(sha(bytes),record.sha256);return bytes.toString('utf8');}
corpusTest('CSM100 source ledger hashes match the private readings when available',async()=>{
 for(const ref of manifest.sourceOnlyReadings)assert.equal(sha(await readFile(resolve(root,ref.path))),ref.sha256);
});
test('CSM100 source excerpts detect invented rests, shifted onsets, wrong durations, missing notes and a false voice split',async()=>{
 const original=evaluateEvents(manifest.expectedSourceEvents,readEvents(await fixture('original'),{includeStaff:true})),corrected=evaluateEvents(manifest.expectedSourceEvents,readEvents(await fixture('v2'),{includeStaff:true}));
 assert.equal(original.expectedEvents,13);assert.equal(original.changed,6);assert.equal(original.missing,2);assert.equal(original.extra,2);assert.equal(original.incorrect,10);assert.equal(corrected.incorrect,0);
 const missing=original.issues.filter(x=>x.kind==='missing').map(x=>[x.expected.measure,x.expected.pitch,x.expected.onset]);assert.deepEqual(missing,[['19','A:0:4',3],['31','C:0:4',3]]);
});
test('CSM100 m8 removes an unwritten tie and m19 restores the source eighth-note beam without changing the source half notes',async()=>{
 const old=new DOMParser().parseFromString(await fixture('original'),'application/xml'),v2=new DOMParser().parseFromString(await fixture('v2'),'application/xml');
 assert.equal(old.getElementsByTagName('tie').length,2);assert.equal(v2.getElementsByTagName('tie').length,0);
 const bar=d=>Array.from(d.getElementsByTagName('measure')).find(x=>x.getAttribute('number')==='19'),notes=d=>Array.from(bar(d).getElementsByTagName('note'));
 assert.deepEqual(notes(old).map(x=>x.getElementsByTagName('type')[0].textContent),['quarter','quarter','quarter','quarter']);
 assert.deepEqual(notes(v2).map(x=>x.getElementsByTagName('type')[0].textContent),['quarter','quarter','eighth','eighth','quarter']);
 assert.deepEqual(Array.from(bar(v2).getElementsByTagName('beam')).map(x=>x.textContent),['begin','end']);
});
