import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { computeBoundedPlan } from '../lib/corpus-bounded-policy.mts';

const sha=value=>createHash('sha256').update(value).digest('hex');
const repo=path.resolve(import.meta.dirname,'../..');
const script=path.join(repo,'scripts/corpus-retry-bounded.mts');
const sourceSHA='a'.repeat(64);
const entry={path:'book.pdf',sha256:sourceSHA,pages:21};
const pages=(width,height)=>Array.from({length:21},(_,index)=>({pdf:entry.path,pdf_sha256:entry.sha256,physical_page_number:index+1,
 mediabox_width_points:width,mediabox_height_points:height}));

test('uniform oversized book uses bounded DPI with physical pages intact',()=>{
 const plan=computeBoundedPlan(entry,pages(1700,2338),[]);
 assert.equal(plan.status,'eligible');assert.equal(plan.dpi,135);assert.equal(plan.selectedPhysicalPages.length,21);
 assert.equal(plan.expectedImages[0].width,3187);assert.equal(plan.expectedImages[0].height,4383);
 assert(plan.expectedImages.every(item=>item.pixels<20_000_000&&item.height<=4400));
});

test('mixed sizes defer unless large page has exact verified nonmusical evidence',()=>{
 const physical=pages(600,800);physical[0].mediabox_width_points=1700;physical[0].mediabox_height_points=2338;
 assert.equal(computeBoundedPlan(entry,physical,[]).status,'deferred_mixed_page_sizes');
 const valid={pdf:'book.pdf',pdf_sha256:sourceSHA,source_sha256:sourceSHA,physical_page_number:1,
  api_verified_decision_status:'verified',api_conflict_code:null,image_sha256:'b'.repeat(64),image_render_max_dimension_px:4400,
  api_verified_classification:{method:'verified_manual_v1',decision:'nonmusical',sourceSHA256:sourceSHA,
   originalImageSHA256:'b'.repeat(64),reviewer:'human',reason:'cover verified'}};
 const safe=computeBoundedPlan(entry,physical,[valid]);assert.equal(safe.status,'eligible');assert.equal(safe.dpi,300);
 assert.deepEqual(safe.excludedPhysicalPages,[1]);assert.equal(safe.selectedPhysicalPages[0],2);
 assert.equal(computeBoundedPlan(entry,physical,[{...valid,image_sha256:'c'.repeat(64)}]).status,'deferred_mixed_page_sizes');
});

test('offline fake engine run preserves provenance and resumes only verified export',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bounded-retry-test-'));
 try{
  const sourceRoot=path.join(root,'source'),baseline=path.join(root,'baseline'),output=path.join(root,'output');
  await Promise.all([sourceRoot,baseline,output].map(folder=>fs.mkdir(folder)));
  const input=path.join(sourceRoot,'book.pdf'),bytes=Buffer.from('fake-pdf');await fs.writeFile(input,bytes);
  const digest=sha(bytes),item={path:'book.pdf',sha256:digest,extension:'.pdf',pages:21,kind:'musical_candidate'};
  const job=path.join(baseline,digest.slice(0,16));await fs.mkdir(job);
  await fs.writeFile(path.join(job,'result.json'),JSON.stringify({source:'book.pdf',sourceSHA256:digest,physicalPages:21,finishedAt:'2026-10-07T00:00:00Z',exports:[],
   issues:[{code:'OMR_IMAGE_TOO_LARGE',verified:true}]}));
  const catalog=path.join(root,'inventory.json'),pageFile=path.join(root,'pages.json'),assisted=path.join(root,'assisted.json'),engine=path.join(root,'fake-engine');
  await fs.writeFile(catalog,JSON.stringify({summary:{source_root:sourceRoot},files:[item]}));
  await fs.writeFile(pageFile,JSON.stringify({pages:pages(1700,2338).map(page=>({...page,pdf_sha256:digest}))}));
  await fs.writeFile(assisted,JSON.stringify({pages:[]}));
  await fs.writeFile(engine,`#!/bin/sh\nout=""\nwhile [ "$#" -gt 0 ]; do\n if [ "$1" = "-output" ]; then shift; out="$1"; fi\n shift\ndone\nmkdir -p "$out"\nprintf 'INFO Loaded image #1 3187x4383 from fake\\n'\nprintf '<score-partwise version="4.0"></score-partwise>' > "$out/one.xml"\n`);await fs.chmod(engine,0o700);
  const argv=['--catalog',catalog,'--pages',pageFile,'--assisted',assisted,'--baseline',baseline,'--output',output,'--engine',engine];
  const call=extra=>spawnSync(process.execPath,['--import','tsx',script,...argv,...extra],{cwd:repo,encoding:'utf8',timeout:30000});
  const first=call(['--run']);assert.equal(first.status,0,first.stderr);
  const dir=path.join(output,digest.slice(0,16));const reportPath=path.join(dir,'attempts/attempt-0001/result.json');
  const result=JSON.parse(await fs.readFile(reportPath,'utf8'));
  assert.equal(result.status,'raw_exports_present');assert.equal(result.dpi,135);assert.equal(result.exports.length,1);
  assert.equal(result.exports[0].pageMappingVerified,false);assert.equal(result.trainingEligible,false);
  assert(result.exports[0].validationPath);assert.equal(result.validationIssueCounts.ZERO_MEASURES,1);
  assert.equal(result.pitchVerified,false);
  assert.equal(result.observedImages[0].pixels,3187*4383);assert.equal(result.selectedPhysicalPages.length,21);
  const firstBytes=await fs.readFile(reportPath,'utf8');
  const second=call(['--run']);assert.equal(second.status,0,second.stderr);assert.match(second.stdout,/bounded_skip_verified/);
  assert.equal(await fs.readFile(reportPath,'utf8'),firstBytes);
  assert.deepEqual(await fs.readdir(path.join(dir,'attempts')),['attempt-0001']);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
