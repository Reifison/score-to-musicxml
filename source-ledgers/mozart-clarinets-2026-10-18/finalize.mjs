import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const directory=path.resolve('output/mozart-clarinets-2026-10-18');
const sha256=buffer=>createHash('sha256').update(buffer).digest('hex');
const readJson=async name=>JSON.parse(await fs.readFile(path.join(directory,name),'utf8'));
const assembly=await readJson('assembly-validation.json');
const schema=await readJson('schema-validation.json');
const midi=await readJson('midi-validation.json');
const checkpoint=await readJson('conversion-checkpoint.json');
assert.equal(assembly.parts,2);
assert.equal(assembly.measuresPerPart,538);
assert.equal(assembly.noteContentUnchangedByAssembly,true);
assert.equal(assembly.sourceHashes[0].sha256,'ff6c04bd144ee5c2dd3d1e2b14c5c6f76cee1b43292e60dbac5e98208c34d40d');
assert.equal(assembly.sourceHashes[1].sha256,'aeb19e259ff24f1da3ecb1b592c127e52c174eebde4fa6261a02e807850d0aec');
for(const source of assembly.sourceHashes) assert.equal(sha256(await fs.readFile(source.file)),source.sha256);
assert.equal(schema.valid,true);
assert.equal(midi.status,'passed');
assert.deepEqual(midi.errors,[]);
assert.equal(midi.midiValidation.status,'passed');
assert.equal(midi.midiValidation.checkedPitches,1289);
assert.equal(midi.midiValidation.checkedDurations,1289);
assert.deepEqual(checkpoint.workCompleted.finalPreviewPagesVisuallyInspected,Array.from({length:11},(_,i)=>i+1));
assert.equal(checkpoint.complete,true);
const sourceHash=sha256(await fs.readFile(checkpoint.source.path));
assert.equal(sourceHash,checkpoint.source.sha256);
const files=[];
for(const name of checkpoint.deliverables) {
  const bytes=await fs.readFile(path.join(directory,name));
  assert.ok(bytes.length>0);
  if(name.endsWith('.mid')) assert.equal(bytes.subarray(0,4).toString(),'MThd');
  files.push({name,path:path.join(directory,name),bytes:bytes.length,sha256:sha256(bytes)});
}
assert.equal(files[0].sha256,assembly.sha256);
const report={
  status:'passed-with-documented-limits',sourcePreserved:true,sourceSha256:sourceHash,
  parts:2,stavesPerPart:1,measuresPerPart:538,movements:{I:295,II:'Andante: tacet; duration unspecified',III:243},
  reviewedPartHashes:assembly.sourceHashes.map(s=>s.sha256),noteContentPreservedByAssembly:true,
  musicXml40SchemaValid:true,midiPitchAndDurationEventsChecked:1289,
  finalPreviewPagesInspected:checkpoint.workCompleted.finalPreviewPagesVisuallyInspected,
  productionModified:false,files,limits:checkpoint.validationLimits,
};
await fs.writeFile(path.join(directory,'final-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
