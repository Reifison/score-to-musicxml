import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const repo=path.resolve(import.meta.dirname,'../..');
const script=path.join(repo,'scripts/corpus-retry-prepared.mts');
const sha=value=>createHash('sha256').update(value).digest('hex');
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'prepared-retry-test-'));
 const source=path.join(root,'source'),baseline=path.join(root,'baseline'),output=path.join(root,'output');
 await Promise.all([source,baseline,output].map(folder=>fs.mkdir(folder)));
 const files=[];
 for(const name of ['one.pdf','two.pdf','too-long.pdf']){
  const bytes=Buffer.from(`invalid-pdf-${name}`),digest=sha(bytes);
  await fs.writeFile(path.join(source,name),bytes);
  const pages=name==='too-long.pdf'?21:1;
  files.push({path:name,extension:'.pdf',kind:'musical_candidate',pages,sha256:digest});
  await fs.mkdir(path.join(baseline,digest.slice(0,16)));
  await fs.writeFile(path.join(baseline,digest.slice(0,16),'result.json'),JSON.stringify({source:name,sourceSHA256:digest,physicalPages:pages,
   status:'no_export',exports:[],issues:[{code:'OMR_IMAGE_TOO_LARGE',verified:true}]}));
 }
 const catalog=path.join(root,'inventory.json'),assisted=path.join(root,'assisted.json'),additional=path.join(root,'additional.json'),engine=path.join(root,'engine');
 await fs.writeFile(catalog,JSON.stringify({summary:{source_root:source},files}));
 await fs.writeFile(assisted,JSON.stringify({pages:[
  {pdf:'one.pdf',pdf_sha256:files[0].sha256,physical_page_number:1,api_verified_decision_status:'verified',image_sha256:'a'.repeat(64),
   api_verified_classification:{decision:'nonmusical',sourceSHA256:files[0].sha256,originalImageSHA256:'a'.repeat(64),reviewer:'reviewer',reason:'verified text'}},
  {pdf:'two.pdf',pdf_sha256:files[1].sha256,physical_page_number:1,api_verified_decision_status:'conflict',image_sha256:'b'.repeat(64),
   api_verified_classification:{decision:'nonmusical',sourceSHA256:files[1].sha256,originalImageSHA256:'b'.repeat(64),reviewer:'reviewer',reason:'not verified'}}
 ]}));
 await fs.writeFile(additional,JSON.stringify({visualAssets:[]}));
 await fs.writeFile(engine,'fake engine');
 const argv=['--catalog',catalog,'--assisted',assisted,'--additional',additional,'--baseline',baseline,'--output',output,'--engine',engine];
 return {root,source,baseline,output,files,argv};
}
const call=(argv)=>spawnSync(process.execPath,['--import','tsx',script,...argv],{cwd:repo,encoding:'utf8',timeout:30000});

test('plan selects only bounded verified size failures and keeps conflicted exclusions out',async()=>{
 const f=await fixture();try{
  const run=call(f.argv);assert.equal(run.status,0,run.stderr);
  const plan=JSON.parse(run.stdout);assert.equal(plan.count,2);
  assert.deepEqual(plan.selected.map(item=>item.path),['one.pdf','two.pdf']);
  assert.deepEqual(plan.selected[0].decisions,[1]);
  assert.deepEqual(plan.selected[1].decisions,[]);
  assert(!plan.selected.some(item=>item.path==='too-long.pdf'));
 }finally{await fs.rm(f.root,{recursive:true,force:true});}
});

test('verified nonmusical page alone admits a no-export retry, while a conflicted page cannot',async()=>{
 const f=await fixture();try{
  for(const item of f.files.slice(0,2)){
   const reportPath=path.join(f.baseline,item.sha256.slice(0,16),'result.json');
   const report=JSON.parse(await fs.readFile(reportPath,'utf8'));report.issues=[];
   await fs.writeFile(reportPath,JSON.stringify(report));
  }
  const run=call(f.argv);assert.equal(run.status,0,run.stderr);
  const plan=JSON.parse(run.stdout);assert.deepEqual(plan.selected.map(item=>item.path),['one.pdf']);
  assert.deepEqual(plan.selected[0].selectionReasons,['verified_nonmusical_page']);
  assert.deepEqual(plan.selected[0].decisions,[1]);
 }finally{await fs.rm(f.root,{recursive:true,force:true});}
});

test('multiple native movements defer whole-PDF assembly',async()=>{
 const f=await fixture();try{
  const item=f.files[0],nativeDir=path.join(f.root,'native');await fs.mkdir(nativeDir);
  await fs.writeFile(path.join(nativeDir,'native-inspection.json'),JSON.stringify({books:[{movements:[{id:1},{id:2}]}]}));
  const reportPath=path.join(f.baseline,item.sha256.slice(0,16),'result.json');
  const report=JSON.parse(await fs.readFile(reportPath,'utf8'));report.attemptDir=nativeDir;
  await fs.writeFile(reportPath,JSON.stringify(report));
  const run=call(f.argv);assert.equal(run.status,0,run.stderr);
  const plan=JSON.parse(run.stdout);assert.equal(plan.selected.find(entry=>entry.path==='one.pdf')?.status,'deferred_multiple_movements');
 }finally{await fs.rm(f.root,{recursive:true,force:true});}
});

test('resume finds the application result in an older immutable attempt after a failed retry',async()=>{
 const f=await fixture();try{
  const item=f.files[0],job=path.join(f.output,item.sha256.slice(0,16));
  const first=path.join(job,'prepared-attempts/attempt-0001/application');
  const failed=path.join(job,'prepared-attempts/attempt-0002');
  await fs.mkdir(first,{recursive:true});await fs.mkdir(failed,{recursive:true});
  const xml=path.join(first,'preview.musicxml');await fs.writeFile(xml,'<score-partwise/>');
  await fs.writeFile(path.join(first,'result.json'),JSON.stringify({sourceSHA256:item.sha256,expectedPages:1,reviewStatus:'needs_review',
   trainingEligible:false,scoreTypeSelected:false,catalogEvidence:{sha256:sha(await fs.readFile(f.argv[1]))},
   assistedReviewEvidence:{sha256:sha(await fs.readFile(f.argv[3]))},outputPath:xml,outputSHA256:sha('<score-partwise/>')}));
  await fs.writeFile(path.join(job,'prepared-current-result.json'),JSON.stringify({attemptId:'attempt-0002',sourceSHA256:item.sha256,outcome:'failed'}));
  const run=call([...f.argv,'--run','--max-files','1']);assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/skip_verified/);
  const pointer=JSON.parse(await fs.readFile(path.join(job,'prepared-current-result.json'),'utf8'));
  assert.equal(pointer.attemptId,'attempt-0001');assert.equal(pointer.recoveredFromAttempt,'attempt-0002');
  assert.deepEqual((await fs.readdir(path.join(job,'prepared-attempts'))).sort(),['attempt-0001','attempt-0002']);
 }finally{await fs.rm(f.root,{recursive:true,force:true});}
});

test('failed files are isolated; default resumes failures without mutating attempt; retry creates a new attempt',async()=>{
 const f=await fixture();try{
  const first=call([...f.argv,'--run']);assert.equal(first.status,0,first.stderr);
  const job1=path.join(f.output,f.files[0].sha256.slice(0,16)),job2=path.join(f.output,f.files[1].sha256.slice(0,16));
  const pointer1=JSON.parse(await fs.readFile(path.join(job1,'prepared-current-result.json'),'utf8'));
  const pointer2=JSON.parse(await fs.readFile(path.join(job2,'prepared-current-result.json'),'utf8'));
  assert.equal(pointer1.outcome,'failed');assert.equal(pointer2.outcome,'failed');
  assert.equal(pointer1.attemptId,'attempt-0001');assert.equal(pointer2.attemptId,'attempt-0001');
  const original=await fs.readFile(path.join(job1,'prepared-attempts/attempt-0001/config.json'),'utf8');
  const second=call([...f.argv,'--run']);assert.equal(second.status,0,second.stderr);
  assert.equal((await fs.readdir(path.join(job1,'prepared-attempts'))).length,1);
  const third=call([...f.argv,'--run','--retry-failed']);assert.equal(third.status,0,third.stderr);
  assert.equal((await fs.readdir(path.join(job1,'prepared-attempts'))).length,2);
  assert.equal(await fs.readFile(path.join(job1,'prepared-attempts/attempt-0001/config.json'),'utf8'),original);
  assert.equal(JSON.parse(await fs.readFile(path.join(job1,'prepared-current-result.json'),'utf8')).attemptId,'attempt-0002');
 }finally{await fs.rm(f.root,{recursive:true,force:true});}
});
