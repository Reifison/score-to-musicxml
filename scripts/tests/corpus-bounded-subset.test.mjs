import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const repo=path.resolve(import.meta.dirname,'../..'),script=path.join(repo,'scripts/corpus-bounded-subset.mts');
const sha=value=>createHash('sha256').update(value).digest('hex');
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bounded-subset-test-'));
 const source=path.join(root,'source.pdf'),native=path.join(root,'parent.omr'),parentPath=path.join(root,'parent-result.json'),engine=path.join(root,'fake-engine'),outputDir=path.join(root,'partial');
 await fs.writeFile(source,'fake-pdf');await fs.writeFile(native,'immutable-parent');
 const parent={method:'native_pdf_bounded',sourceSHA256:sha('fake-pdf'),physicalPages:21,dpi:135,
  pageStageReached:Array.from({length:15},(_,i)=>i+1),pageStageNotReached:[16,17,18,19,20,21],
  artifacts:[{path:native,sha256:sha('immutable-parent')}]};
 await fs.writeFile(parentPath,JSON.stringify(parent));
 await fs.writeFile(engine,`#!/bin/sh\nout=""\nwhile [ "$#" -gt 0 ]; do\n if [ "$1" = "-output" ]; then shift; out="$1"; fi\n shift\ndone\nmkdir -p "$out"\nprintf 'INFO Loaded image #17 3187x4383 from fake\\n'\nprintf '<score-partwise version="4.0"></score-partwise>' > "$out/partial.xml"\n`);await fs.chmod(engine,0o700);
 const config={source,sourceSHA256:sha('fake-pdf'),parentReportPath:parentPath,parentReportSHA256:sha(await fs.readFile(parentPath)),
  parentNativePath:native,parentNativeSHA256:sha('immutable-parent'),engine,outputDir,dpi:135,
  selectedPhysicalPages:[17,18,19,20,21],reason:'Recover physical pages after internal engine failure at page 16; never exclude page 16.'};
 const configPath=path.join(root,'config.json');await fs.writeFile(configPath,JSON.stringify(config));
 return {root,source,native,parentPath,engine,outputDir,config,configPath};
}
const call=configPath=>spawnSync(process.execPath,['--import','tsx',script,configPath],{cwd:repo,encoding:'utf8',timeout:30000});

test('bounded subset keeps page 16 unresolved, parent immutable, and validates raw XML',async()=>{
 const f=await fixture();try{
  const run=call(f.configPath);assert.equal(run.status,0,run.stderr);
  const report=JSON.parse(await fs.readFile(path.join(f.outputDir,'result.json'),'utf8'));
  assert.equal(report.status,'raw_partial_exports_present');assert.equal(report.method,'native_pdf_bounded_partial_recovery');
  assert.deepEqual(report.selectedPhysicalPages,[17,18,19,20,21]);assert.deepEqual(report.omittedUnresolvedPhysicalPages,[16]);
  assert.deepEqual(report.excludedPhysicalPages,[]);assert.equal(report.combinedBookExport,false);assert.equal(report.trainingEligible,false);
  assert.equal(report.exports.length,1);assert.equal(report.exports[0].pageMappingVerified,false);
  assert(report.exports[0].validationPath);assert.equal(await fs.readFile(f.native,'utf8'),'immutable-parent');
 }finally{await fs.rm(f.root,{recursive:true,force:true});}
});

test('rejects repeated or parent-unrecognized physical pages before creating output',async()=>{
 const f=await fixture();try{
  const bad={...f.config,selectedPhysicalPages:[17,17]};await fs.writeFile(f.configPath,JSON.stringify(bad));
  const run=call(f.configPath);assert.notEqual(run.status,0);await assert.rejects(fs.access(f.outputDir));
 }finally{await fs.rm(f.root,{recursive:true,force:true});}
});
