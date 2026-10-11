/** Sequential, immutable offline retries through the real app preparation pipeline. */
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args=process.argv.slice(2);
const option=(name:string,fallback:string)=>{const i=args.lastIndexOf(name);return i<0?fallback:args[i+1];};
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalogPath=path.resolve(option('--catalog',path.join(repo,'docs/validation/corpus-partituras-2026-10-07/catalog/inventory.json')));
const assistedPath=path.resolve(option('--assisted',path.join(repo,'docs/validation/corpus-partituras-2026-10-07/catalog/assisted_review.json')));
const additionalPath=path.resolve(option('--additional',path.join(repo,'docs/validation/corpus-partituras-2026-10-07/catalog/additional-assets.json')));
const baselineRoot=path.resolve(option('--baseline',path.join(repo,'output/omr/corpus-partituras-2026-10-07')));
const outputRoot=path.resolve(option('--output',path.join(repo,'output/omr/corpus-partituras-2026-10-07/prepared-retries')));
const engine=path.resolve(option('--engine','/private/tmp/corpus-audiveris-volume/Audiveris.app/Contents/MacOS/Audiveris'));
const wrapper=path.join(repo,'scripts/corpus-verify-prepared.mts');
const run=args.includes('--run');
const retryFailed=args.includes('--retry-failed');
const maxFiles=Number(option('--max-files','1000'));
if(!Number.isInteger(maxFiles)||maxFiles<1)throw new Error('Invalid --max-files');
const hashFile=async(file:string)=>{const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);return hash.digest('hex');};
const readJson=async(file:string)=>JSON.parse(await fs.readFile(file,'utf8'));
const writeJson=async(file:string,value:unknown)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});
const atomic=async(file:string,value:unknown)=>{const tmp=`${file}.${process.pid}.tmp`;await writeJson(tmp,value);await fs.rename(tmp,file);};
const [catalog,assisted,additional]=await Promise.all([readJson(catalogPath),readJson(assistedPath),readJson(additionalPath)]);
const sourceRoot=await fs.realpath(catalog.summary.source_root);
const [catalogSHA256,assistedSHA256,additionalSHA256,wrapperSHA256,runnerSHA256,engineSHA256]=await Promise.all([
 hashFile(catalogPath),hashFile(assistedPath),hashFile(additionalPath),hashFile(wrapper),hashFile(fileURLToPath(import.meta.url)),hashFile(engine)
]);
const provenance={catalogSHA256,assistedSHA256,additionalSHA256,wrapperSHA256,runnerSHA256,engineSHA256,enginePath:engine,
 appPreparation:'AudiverisOmrAdapter.inspectPages then convert with the same inspected paths; maxAudiverisDimension=4400',scoreSelection:'provisional; never scoreTypeSelected',
 sourcePitchVerified:false,trainingEligible:false};
const hashPattern=/^[a-f0-9]{64}$/;
// Manual visual finding: page 3 shows four separately labelled guitar staves (I-IV).
const reviewedUnsupportedFourPart={sourceSHA256:'543ff742c3d0afd8ad49068d45d2347d204f49a09cee7a61e4fb89a1bb9c888b',
 imagePath:'/private/tmp/corpus-2026-10-07/catalog/rendered_pages/087_961a3b0fc7/page-03.png',
 imageSHA256:'a5271d4674bdf801548a72e47225f6bd436d27aa92a87602296899a6a402572a',physicalPage:3,
 observation:'Four separately labelled guitar staves I-IV observed in the source preview; current app score types cover at most guitar duo.'};
const decisionsFor=(entry:any)=>{
 if(entry.path==='Document.pdf')return [];
 return (assisted.pages??[]).filter((page:any)=>page.pdf===entry.path&&page.pdf_sha256===entry.sha256&&page.api_verified_decision_status==='verified'
  &&page.api_verified_classification?.decision==='nonmusical'&&page.api_verified_classification.sourceSHA256===entry.sha256
  &&page.api_verified_classification.originalImageSHA256===page.image_sha256&&page.physical_page_number>=1&&page.physical_page_number<=entry.pages)
  .map((page:any)=>({page:page.physical_page_number,role:'nonmusical',sourceSHA256:entry.sha256,
   originalImageSHA256:page.api_verified_classification.originalImageSHA256,reviewer:page.api_verified_classification.reviewer,reason:page.api_verified_classification.reason}));
};
const provisionalScoreType=(entry:any)=>{
 const label=entry.path.toLowerCase();
 if(/viol[aã]o|guitarr?a|brouwer|carlevaro/.test(label))return {scoreType:'guitar_solo',scoreTypeBasis:'provisional directory/title cue; musical layout not visually confirmed'};
 if(/piano/.test(label))return {scoreType:'piano',scoreTypeBasis:'provisional directory/title cue; musical layout not visually confirmed'};
 return {scoreType:'melody',scoreTypeBasis:'provisional fallback for diagnostic retry; musical layout not visually confirmed'};
};
const existingCarinhoso=async(entry:any)=>{
 if(entry.sha256!=='4cf5e6657885b269c7ad6b9a6c6e073490b702d7b3cc36905a0792c22b368c1c')return false;
 const dir=path.join(baselineRoot,entry.sha256.slice(0,16),'prepared-application-0001');
 try{const old=await readJson(path.join(dir,'result.json'));return old.sourceSHA256===entry.sha256&&old.reviewStatus==='needs_review'
  &&old.coverage?.totalPages===entry.pages&&hashPattern.test(old.outputSHA256)&&await hashFile(old.outputPath)===old.outputSHA256;}catch{return false;}
};
const jobs:any[]=[];
for(const entry of catalog.files??[]){
 if(entry.extension!=='.pdf'||entry.kind==='non_musical_personal_admin'||!Number.isInteger(entry.pages)||entry.pages<1||entry.pages>20||!hashPattern.test(entry.sha256))continue;
 const baselinePath=path.join(baselineRoot,entry.sha256.slice(0,16),'result.json');
 let baseline:any;try{baseline=await readJson(baselinePath);}catch{continue;}
 if(baseline.sourceSHA256!==entry.sha256||baseline.physicalPages!==entry.pages||!Array.isArray(baseline.exports)||baseline.exports.length)continue;
 const pageDecisions=decisionsFor(entry);
 const selectionReasons=[
  ...(baseline.issues?.some((issue:any)=>issue.code==='OMR_IMAGE_TOO_LARGE'&&issue.verified===true)?['image_too_large_verified']:[]),
  ...(pageDecisions.length?['verified_nonmusical_page']:[])
 ];
 if(!selectionReasons.length)continue;
 const baselineSHA256=await hashFile(baselinePath);
 if(await existingCarinhoso(entry)){jobs.push({kind:'pdf',entry,status:'already_prepared_verified',baselinePath,baselineSHA256,selectionReasons});continue;}
 let nativeInspectionEvidence:any=null;
 let movements:any[]=[];
 if(baseline.attemptDir){
  const nativePath=path.join(baseline.attemptDir,'native-inspection.json');
  try{const native=await readJson(nativePath);movements=(native.books??[]).flatMap((book:any)=>book.movements??[]);
   nativeInspectionEvidence={path:nativePath,sha256:await hashFile(nativePath),movementCount:movements.length};}catch{}
 }
 if(movements.length>1){jobs.push({kind:'pdf',entry,status:'deferred_multiple_movements',baselinePath,baselineSHA256,selectionReasons,
  nativeInspectionEvidence,movementCount:movements.length});continue;}
 if(entry.sha256===reviewedUnsupportedFourPart.sourceSHA256){
  const visualEvidenceValid=await hashFile(reviewedUnsupportedFourPart.imagePath).catch(()=>null)===reviewedUnsupportedFourPart.imageSHA256;
  jobs.push({kind:'pdf',entry,status:visualEvidenceValid?'deferred_unsupported_four_part':'deferred_visual_evidence_mismatch',
   baselinePath,baselineSHA256,selectionReasons,nativeInspectionEvidence,visualEvidence:reviewedUnsupportedFourPart});continue;
 }
 const isCoverCase=entry.path==='Meus estudos/sons_de_carrilhoes.pdf'&&entry.sha256==='0c90eecb6c3e03a80e79f78da7a2525e255b1166fa562368c3735dd3004bb2d9';
 jobs.push({kind:'pdf',entry,status:'eligible',baselinePath,baselineSHA256,selectionReasons,nativeInspectionEvidence,
  ...(isCoverCase?{scoreType:'guitar_solo',scoreTypeBasis:'provisional guitar_solo chosen for known score; selected=false'}:provisionalScoreType(entry)),pageDecisions});
}
// Explicit cover regression: include even when native baseline generated an export or lacks the size issue.
const cover=catalog.files?.find((item:any)=>item.path==='Meus estudos/sons_de_carrilhoes.pdf');
if(cover&&cover.sha256==='0c90eecb6c3e03a80e79f78da7a2525e255b1166fa562368c3735dd3004bb2d9'&&cover.pages===2&&!jobs.some(job=>job.entry.sha256===cover.sha256)){
 jobs.push({kind:'pdf',entry:cover,status:'eligible',specialCase:'verified_cover_regression',scoreType:'guitar_solo',scoreTypeBasis:'provisional guitar_solo chosen for known score; selected=false',
  pageDecisions:decisionsFor(cover),selectionReasons:['verified_cover_regression'],baselinePath:path.join(baselineRoot,cover.sha256.slice(0,16),'result.json')});
}
for(const asset of additional.visualAssets??[]){
 const preview=asset.convertedPreviewPng??asset.renderedPreviewPng;
 if(!preview||!hashPattern.test(asset.sourceSha256)||!hashPattern.test(preview.sha256))continue;
 jobs.push({kind:'image_asset',asset,entry:{path:asset.sourcePath,sha256:preview.sha256,pages:1},status:'eligible',scoreType:'melody',
  scoreTypeBasis:'provisional fallback for confirmed musical visual asset; staff/part layout not confirmed',selectionReasons:['visual_asset_prepared_input'],pageDecisions:[]});
}
const selected=jobs.slice(0,maxFiles);
if(!run){console.log(JSON.stringify({event:'prepared_retry_plan',selected:selected.map(job=>({path:job.entry.path,kind:job.kind,status:job.status,pages:job.entry.pages,decisions:job.pageDecisions?.map((d:any)=>d.page)??[],scoreType:job.scoreType??null,selectionReasons:job.selectionReasons})),count:selected.length,provenance},null,2));process.exit(0);}
await fs.mkdir(outputRoot,{recursive:true,mode:0o700});
const lockPath=path.join(outputRoot,'.prepared-retry.lock');
const lease=await fs.open(lockPath,'wx',0o600);
let stopSignal:NodeJS.Signals|null=null;
let activeChild:ReturnType<typeof spawn>|null=null;
const signalGroup=(child:ReturnType<typeof spawn>,signal:NodeJS.Signals)=>{try{if(child.pid&&process.platform!=='win32')process.kill(-child.pid,signal);else child.kill(signal);}catch{}};
const requestStop=(signal:NodeJS.Signals)=>{if(stopSignal)return;stopSignal=signal;if(activeChild)signalGroup(activeChild,'SIGTERM');setTimeout(()=>{if(activeChild)signalGroup(activeChild,'SIGKILL');},2000).unref();};
process.on('SIGINT',()=>requestStop('SIGINT'));process.on('SIGTERM',()=>requestStop('SIGTERM'));
async function nextAttempt(jobDir:string){const base=path.join(jobDir,'prepared-attempts');await fs.mkdir(base,{recursive:true,mode:0o700});
 const names=await fs.readdir(base);let n=Math.max(0,...names.map(name=>Number(/^attempt-(\d+)$/.exec(name)?.[1]??0)))+1;
 while(true){const attemptId=`attempt-${String(n).padStart(4,'0')}`,attemptDir=path.join(base,attemptId);
  try{await fs.mkdir(attemptDir,{mode:0o700});return {attemptId,attemptDir};}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;n++;}}
}
async function validExisting(jobDir:string,sourceSHA256:string,expectedPages:number,kind:string,hasDecisions:boolean){
 const base=path.join(jobDir,'prepared-attempts');let names:string[];
 try{names=(await fs.readdir(base)).filter(name=>/^attempt-\d{4}$/.test(name)).sort().reverse();}catch{return null;}
 for(const attemptId of names){
  try{
   const attemptDir=path.join(base,attemptId),result=await readJson(path.join(attemptDir,'application','result.json'));
   if(result.sourceSHA256!==sourceSHA256||result.expectedPages!==expectedPages||result.reviewStatus!=='needs_review'||result.trainingEligible!==false
    ||result.scoreTypeSelected!==false||result.catalogEvidence?.sha256!==(kind==='pdf'?catalogSHA256:additionalSHA256)
    ||hasDecisions&&result.assistedReviewEvidence?.sha256!==assistedSHA256
    ||!hashPattern.test(result.outputSHA256)||await hashFile(result.outputPath)!==result.outputSHA256)continue;
   if(result.originalAsset&&await hashFile(result.originalAsset.path)!==result.originalAsset.sha256)continue;
   if(result.preparedInput&&await hashFile(result.preparedInput.path)!==result.preparedInput.sha256)continue;
   return {attemptId,attemptDir,result};
  }catch{}
 }
 return null;
}
async function childRun(configPath:string,logPath:string){
 const log=createWriteStream(logPath,{flags:'wx',mode:0o600});const limit=16*1024*1024;let bytes=0,truncated=false,logError:Error|undefined;
 return await new Promise<{exitCode:number|null;signal:string|null;timedOut:boolean;logTruncated:boolean}>((resolve,reject)=>{
  const child=spawn(process.execPath,['--import','tsx',wrapper,configPath],{cwd:repo,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});activeChild=child;
  let timedOut=false,processError:Error|undefined;
  const hardKill=()=>signalGroup(child,'SIGKILL');
  const timeout=setTimeout(()=>{timedOut=true;signalGroup(child,'SIGTERM');setTimeout(hardKill,2000).unref();},930_000);
  const consume=(stream:NodeJS.ReadableStream)=>(chunk:Buffer)=>{if(logError||bytes>=limit){truncated=true;return;}
   const kept=chunk.subarray(0,Math.min(chunk.length,limit-bytes));bytes+=kept.length;if(kept.length&&!log.write(kept)){stream.pause();log.once('drain',()=>stream.resume());}
   if(kept.length<chunk.length)truncated=true;};
  child.stdout.on('data',consume(child.stdout));child.stderr.on('data',consume(child.stderr));
  log.on('error',error=>{logError=error;child.stdout.resume();child.stderr.resume();signalGroup(child,'SIGTERM');});
  child.on('error',error=>{processError=error;});
  child.on('close',(exitCode,signal)=>{activeChild=null;clearTimeout(timeout);if(logError){log.destroy();reject(logError);return;}
   log.end(()=>processError?reject(processError):resolve({exitCode,signal,timedOut,logTruncated:truncated}));});
  if(stopSignal)signalGroup(child,'SIGTERM');
 });
}
const counters={selected:selected.length,converted:0,failed:0,skippedVerified:0,skippedFailed:0,deferred:0};
try{
 await writeJson(lockPath+'.info',{pid:process.pid,startedAt:new Date().toISOString(),selected:selected.length});
 const queueSnapshotDir=path.join(outputRoot,'queue-snapshots');await fs.mkdir(queueSnapshotDir,{recursive:true,mode:0o700});
 await writeJson(path.join(queueSnapshotDir,`queue-${Date.now()}-${process.pid}.json`),{createdAt:new Date().toISOString(),provenance,
  selected:selected.map(job=>({path:job.entry.path,sourceSHA256:job.entry.sha256,pages:job.entry.pages,kind:job.kind,status:job.status,
   baselineSHA256:job.baselineSHA256??null,nativeInspectionEvidence:job.nativeInspectionEvidence??null,visualEvidence:job.visualEvidence??null,
   selectionReasons:job.selectionReasons,verifiedExcludedPages:job.pageDecisions?.map((item:any)=>item.page)??[]}))});
 for(const job of selected){
  if(stopSignal)break;
  const entry=job.entry;
  if(job.status==='already_prepared_verified'){counters.skippedVerified++;continue;}
  if(job.status.startsWith('deferred_')){counters.deferred++;continue;}
  const jobId=job.kind==='pdf'?entry.sha256.slice(0,16):`asset-${job.asset.sourceSha256.slice(0,16)}`;
  const jobDir=path.join(outputRoot,jobId);await fs.mkdir(jobDir,{recursive:true,mode:0o700});
  try{
   const existing=await validExisting(jobDir,entry.sha256,entry.pages,job.kind,Boolean(job.pageDecisions?.length));
   if(existing){
    let pointer:any=null;try{pointer=await readJson(path.join(jobDir,'prepared-current-result.json'));}catch{}
    if(pointer?.attemptId!==existing.attemptId||pointer?.outcome!=='converted')await atomic(path.join(jobDir,'prepared-current-result.json'),{
     attemptId:existing.attemptId,attemptDir:existing.attemptDir,source:entry.path,sourceSHA256:entry.sha256,kind:job.kind,outcome:'converted',
     recoveredFromAttempt: pointer?.attemptId??null,selectionReasons:job.selectionReasons,errorMessage:null,
     reviewStatus:'needs_review',trainingEligible:false,accuracyVerified:false,finishedAt:new Date().toISOString()});
    counters.skippedVerified++;console.log(JSON.stringify({event:'skip_verified',path:entry.path,attemptId:existing.attemptId}));continue;
   }
   let previous:any=null;try{previous=await readJson(path.join(jobDir,'prepared-current-result.json'));}catch{}
   if(previous?.outcome==='failed'&&!retryFailed){counters.skippedFailed++;console.log(JSON.stringify({event:'skip_failed_requires_retry_flag',path:entry.path}));continue;}
   const {attemptId,attemptDir}=await nextAttempt(jobDir);
   let outcome:'converted'|'failed'='failed';let errorMessage:string|null=null;
   try{
    const source=job.kind==='pdf'?await fs.realpath(path.join(sourceRoot,entry.path)):await fs.realpath(job.asset.convertedPreviewPng?.path??job.asset.renderedPreviewPng.path);
    if(job.kind==='pdf'&&!(source===path.join(sourceRoot,entry.path)||source.startsWith(sourceRoot+path.sep)))throw new Error('Source escaped inventory root');
    if(await hashFile(source)!==entry.sha256)throw new Error('Source hash changed after catalog snapshot');
    const catalogSnapshot=path.join(attemptDir,job.kind==='pdf'?'inventory.snapshot.json':'additional-assets.snapshot.json');
    await fs.copyFile(job.kind==='pdf'?catalogPath:additionalPath,catalogSnapshot);
    if(await hashFile(catalogSnapshot)!==(job.kind==='pdf'?catalogSHA256:additionalSHA256))throw new Error('Catalog snapshot copy mismatch');
    let baselineEvidence:any=null;
    if(job.baselinePath){try{const baselineSHA256=await hashFile(job.baselinePath);if(job.baselineSHA256&&baselineSHA256!==job.baselineSHA256)throw new Error('Baseline result changed after queue selection');
      const target=path.join(attemptDir,'baseline-result.snapshot.json');await fs.copyFile(job.baselinePath,target);
      if(await hashFile(target)!==baselineSHA256)throw new Error('Baseline snapshot changed while copying');
      const baseline=await readJson(target);
      if(!job.specialCase&&(!(baseline.sourceSHA256===entry.sha256&&baseline.physicalPages===entry.pages&&Array.isArray(baseline.exports)&&baseline.exports.length===0)
        ||job.selectionReasons.includes('image_too_large_verified')&&!baseline.issues?.some((issue:any)=>issue.code==='OMR_IMAGE_TOO_LARGE'&&issue.verified===true)))throw new Error('Baseline snapshot no longer satisfies retry criteria');
      baselineEvidence={path:target,sha256:baselineSHA256};}catch(error){if(job.specialCase)baselineEvidence=null;else throw error;}}
    if(job.nativeInspectionEvidence&&await hashFile(job.nativeInspectionEvidence.path)!==job.nativeInspectionEvidence.sha256)throw new Error('Native movement inspection changed after queue selection');
    let assistedReviewEvidence:any=null;
    if(job.pageDecisions?.length){const target=path.join(attemptDir,'assisted-review.snapshot.json');await fs.copyFile(assistedPath,target);
     if(await hashFile(target)!==assistedSHA256)throw new Error('Assisted snapshot copy mismatch');assistedReviewEvidence={path:target,sha256:assistedSHA256};}
    const originalAsset=job.kind==='image_asset'?{path:path.join(sourceRoot,job.asset.sourcePath),sha256:job.asset.sourceSha256,format:job.asset.sourceFormat}:null;
    const preparedInput=job.kind==='image_asset'?{path:source,sha256:entry.sha256,conversionTool:job.asset.conversion}:null;
    const config={attemptId,source,sourceSHA256:entry.sha256,outputDir:path.join(attemptDir,'application'),expectedPages:entry.pages,
     scoreType:job.scoreType,scoreTypeBasis:job.scoreTypeBasis,scoreTypeSelected:false,pageDecisions:job.pageDecisions??[],engine,
     catalogEvidence:{kind:job.kind==='pdf'?'inventory':'additional_visual_asset',path:catalogSnapshot,sha256:job.kind==='pdf'?catalogSHA256:additionalSHA256,entryPath:entry.path},
     assistedReviewEvidence,baselineEvidence,nativeInspectionEvidence:job.nativeInspectionEvidence??null,
     unitBoundaryStatus:job.nativeInspectionEvidence?.movementCount===1?'one_engine_movement_observed_not_human_verified':'unverified',
     originalAsset,preparedInput,selectionReasons:job.selectionReasons,provenance};
    const configPath=path.join(attemptDir,'config.json');await writeJson(configPath,config);
    const child=await childRun(configPath,path.join(attemptDir,'wrapper.log'));
    await writeJson(path.join(attemptDir,'execution.json'),{...child,provenance,finishedAt:new Date().toISOString()});
    if(child.exitCode===0){const result=await readJson(path.join(attemptDir,'application/result.json'));
     if(result.sourceSHA256!==entry.sha256||result.expectedPages!==entry.pages||result.reviewStatus!=='needs_review'||result.trainingEligible!==false
      ||!hashPattern.test(result.outputSHA256)||await hashFile(result.outputPath)!==result.outputSHA256)throw new Error('Prepared output integrity check failed');
     outcome='converted';counters.converted++;
    }else{errorMessage=`Wrapper exit ${child.exitCode} signal ${child.signal??'none'}`;counters.failed++;}
   }catch(error){errorMessage=error instanceof Error?error.message:String(error);counters.failed++;
    await writeJson(path.join(attemptDir,'runner-failure.json'),{code:'PREPARED_RUNNER_FAILURE',message:errorMessage,reviewStatus:'needs_review',trainingEligible:false,accuracyVerified:false});}
   await atomic(path.join(jobDir,'prepared-current-result.json'),{attemptId,attemptDir,source:entry.path,sourceSHA256:entry.sha256,kind:job.kind,outcome,selectionReasons:job.selectionReasons,
    errorMessage,reviewStatus:'needs_review',trainingEligible:false,accuracyVerified:false,finishedAt:new Date().toISOString()});
   console.log(JSON.stringify({event:'prepared_retry_finished',path:entry.path,attemptId,outcome,errorMessage}));
  }catch(error){counters.failed++;console.log(JSON.stringify({event:'prepared_job_setup_failed',path:entry.path,message:error instanceof Error?error.message:String(error)}));}
 }
 await atomic(path.join(outputRoot,'prepared-summary.json'),{generatedAt:new Date().toISOString(),provenance,counters,selection:selected.map(job=>({path:job.entry.path,kind:job.kind,status:job.status,scoreType:job.scoreType??null,selectionReasons:job.selectionReasons}))});
}finally{await lease.close();await fs.rm(lockPath,{force:true});await fs.rm(lockPath+'.info',{force:true});}
console.log(JSON.stringify({event:'prepared_retry_complete',counters}));
