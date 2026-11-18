import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const runner=path.join(repo,'scripts/corpus-convert.mts');
const sha=data=>createHash('sha256').update(data).digest('hex');
const xml='<score-partwise><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><note><rest/><duration>4</duration></note></measure></part></score-partwise>';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function setup() {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'corpus-runner-fixture-'));
 const input=path.join(dir,'input'),output=path.join(dir,'output'),pdf=path.join(input,'sample.pdf'),engine=path.join(dir,'fake-engine.cjs'),catalog=path.join(dir,'inventory.json');
 await fs.mkdir(input);
 const content='%PDF-1.4\nfake fixture\n%%EOF\n';
 await fs.writeFile(pdf,content);
 await fs.writeFile(catalog,JSON.stringify({summary:{source_root:input},files:[{path:'sample.pdf',extension:'.pdf',kind:'musical_candidate',pages:1,sha256:sha(content)}]}));
 await fs.writeFile(engine,`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),out=args[args.indexOf('-output')+1];
fs.mkdirSync(out,{recursive:true});
if(process.env.FAKE_PID_PATH)fs.writeFileSync(process.env.FAKE_PID_PATH,String(process.pid));
if(process.env.FAKE_HANG==='1'){setInterval(()=>{},1000);}
else if(process.env.FAKE_FAIL==='1'){console.error('Too large image: 217,458,800 pixels (vs 20,000,000 max)');console.error('No installed OCR languages');console.error('invalid glyph index');process.exit(1);}
else {fs.writeFileSync(path.join(out,'score.xml'),${JSON.stringify(xml)});process.exit(0);}
`);
 await fs.chmod(engine,0o755);
 const argv=['--catalog',catalog,'--output',output,'--engine',engine,'--python','/usr/bin/python3','--phase','short','--jobs','1','--max-files','1'];
 return {dir,output,engine,argv,id:sha(content).slice(0,16)};
}
async function runFixture(f,extra=[],env={}) {
 const child=spawn(process.execPath,['--import','tsx',runner,...f.argv,...extra],{cwd:repo,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';
 child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
 return {code,stdout,stderr};
}

test('failure is retained, rerun is explicit, successful retry is immutable and resumable',async()=>{
 const f=await setup();
 try {
  const first=await runFixture(f,[],{FAKE_FAIL:'1'});
  assert.equal(first.code,0,first.stderr);
  const job=path.join(f.output,f.id),firstReport=JSON.parse(await fs.readFile(path.join(job,'result.json'),'utf8'));
  assert.equal(firstReport.status,'no_export');
  assert.equal(firstReport.operationalOutcome,'engine_failed');
  assert.equal(firstReport.attemptId,'attempt-0001');
  assert(firstReport.issues.some(issue=>issue.code==='OMR_IMAGE_TOO_LARGE' && issue.observedPixels===217458800 && issue.engineMaxPixels===20000000));
  assert(firstReport.issues.some(issue=>issue.code==='OCR_LANGUAGES_MISSING'));
  assert(firstReport.issues.some(issue=>issue.code==='PDF_FONT_GLYPH_WARNING'));
  assert.match(firstReport.provenance.catalogSHA256,/^[a-f0-9]{64}$/);
  const original=await fs.readFile(path.join(job,'attempts/attempt-0001/result.json'),'utf8');
  const skipped=await runFixture(f);
  assert.equal(skipped.code,0,skipped.stderr);
  assert.match(skipped.stdout,/resume_skip_failed_requires_retry_flag/);
  const second=await runFixture(f,['--retry-failed']);
  assert.equal(second.code,0,second.stderr);
  const latest=JSON.parse(await fs.readFile(path.join(job,'result.json'),'utf8'));
  assert.equal(latest.attemptId,'attempt-0002');
  assert.equal(latest.status,'raw_exports_present');
  assert.equal(latest.operationalOutcome,'success');
  assert.equal(latest.exports[0].pageMappingVerified,false);
  assert.equal(latest.trainingEligible,false);
  assert.equal(await fs.readFile(path.join(job,'attempts/attempt-0001/result.json'),'utf8'),original);
  const verified=await runFixture(f);
  assert.equal(verified.code,0,verified.stderr);
  assert.match(verified.stdout,/resume_skip_verified/);
  assert.deepEqual((await fs.readdir(path.join(job,'attempts'))).sort(),['attempt-0001','attempt-0002']);
 } finally {await fs.rm(f.dir,{recursive:true,force:true});}
});

test('legacy v1 report and preview remain intact when a failed job is retried',async()=>{
 const f=await setup();
 try {
  const job=path.join(f.output,f.id),oldPreview=path.join(job,'preview-01.musicxml');
  await fs.mkdir(job,{recursive:true});
  await fs.writeFile(oldPreview,'old preview bytes');
  const inventory=JSON.parse(await fs.readFile(f.argv[1],'utf8'));
  const old={workflow:'raw-library-baseline-v1',id:f.id,source:'sample.pdf',sourceSHA256:inventory.files[0].sha256,finishedAt:'2026-10-07T00:00:00Z',status:'no_export_needs_review',exports:[]};
  const oldBytes=JSON.stringify(old);
  await fs.writeFile(path.join(job,'result.json'),oldBytes);
  const run=await runFixture(f,['--retry-failed']);
  assert.equal(run.code,0,run.stderr);
  assert.equal(await fs.readFile(path.join(job,'attempts/legacy-v1/result.json'),'utf8'),oldBytes);
  assert.equal(await fs.readFile(oldPreview,'utf8'),'old preview bytes');
  const latest=JSON.parse(await fs.readFile(path.join(job,'result.json'),'utf8'));
  assert.equal(latest.attemptId,'attempt-0001');
  assert.equal(latest.status,'raw_exports_present');
 } finally {await fs.rm(f.dir,{recursive:true,force:true});}
});

test('one missing source records a failed attempt while the other job completes',async()=>{
 const f=await setup();
 try {
  const inventory=JSON.parse(await fs.readFile(f.argv[1],'utf8'));
  const missingHash=sha('missing source');
  inventory.files.unshift({path:'a-missing.pdf',extension:'.pdf',kind:'musical_candidate',pages:1,sha256:missingHash});
  await fs.writeFile(f.argv[1],JSON.stringify(inventory));
  const run=await runFixture(f,['--max-files','2','--jobs','2']);
  assert.equal(run.code,0,run.stderr);
  const missing=JSON.parse(await fs.readFile(path.join(f.output,missingHash.slice(0,16),'result.json'),'utf8'));
  const good=JSON.parse(await fs.readFile(path.join(f.output,f.id,'result.json'),'utf8'));
  assert.equal(missing.status,'no_export');
  assert.equal(missing.operationalOutcome,'input_or_runner_failed');
  assert.equal(good.status,'raw_exports_present');
  await assert.rejects(fs.access(path.join(f.output,'.corpus-batch.lock')));
 } finally {await fs.rm(f.dir,{recursive:true,force:true});}
});

test('SIGTERM drains the job, kills the engine and removes the global lock',async()=>{
 const f=await setup();
 const pidPath=path.join(f.dir,'child.pid');
 let child;
 try {
  child=spawn(process.execPath,['--import','tsx',runner,...f.argv],{cwd:repo,env:{...process.env,FAKE_HANG:'1',FAKE_PID_PATH:pidPath},stdio:['ignore','pipe','pipe']});
  child.stdout.resume();child.stderr.resume();
  const deadline=Date.now()+8000;
  while(Date.now()<deadline) {
   try {await fs.access(pidPath);break;} catch {await sleep(50);}
  }
  const pid=Number(await fs.readFile(pidPath,'utf8'));
  const contender=await runFixture(f,['--phase','books']);
  assert.equal(contender.code,1);
  assert.match(contender.stderr,/Another corpus batch owns this output/);
  process.kill(child.pid,'SIGTERM');
  const code=await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(new Error('runner did not stop')),8000);
   child.on('close',value=>{clearTimeout(timeout);resolve(value);});
  });
  assert.equal(code,143);
  await assert.rejects(fs.access(path.join(f.output,'.corpus-batch.lock')));
  assert.throws(()=>process.kill(pid,0));
  const report=JSON.parse(await fs.readFile(path.join(f.output,f.id,'result.json'),'utf8'));
  assert.equal(report.operationalOutcome,'interrupted');
 } finally {
  if(child && child.exitCode===null)child.kill('SIGKILL');
  await fs.rm(f.dir,{recursive:true,force:true});
 }
});
