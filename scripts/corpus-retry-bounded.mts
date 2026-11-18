/** Offline native-PDF retry at verified bounded DPI; long books stay separate from the app flow. */
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { computeBoundedPlan } from './lib/corpus-bounded-policy.mjs';
import { inspectMusicXmlValidation } from '../apps/api/src/services/MusicXmlValidation.js';

const args=process.argv.slice(2);
const option=(name:string,fallback:string)=>{const index=args.lastIndexOf(name);return index<0?fallback:args[index+1];};
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalogPath=path.resolve(option('--catalog',path.join(repo,'docs/validation/corpus-partituras-2026-10-07/catalog/inventory.json')));
const pagesPath=path.resolve(option('--pages',path.join(repo,'docs/validation/corpus-partituras-2026-10-07/catalog/pages.json')));
const assistedPath=path.resolve(option('--assisted',path.join(repo,'docs/validation/corpus-partituras-2026-10-07/catalog/assisted_review.json')));
const baselineRoot=path.resolve(option('--baseline',path.join(repo,'output/omr/corpus-partituras-2026-10-07')));
const outputRoot=path.resolve(option('--output',path.join(repo,'output/omr/corpus-partituras-2026-10-07/bounded-retries')));
const engine=await fs.realpath(option('--engine','/private/tmp/corpus-audiveris-volume/Audiveris.app/Contents/MacOS/Audiveris'));
const python=option('--python','/Users/reifison/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');
const helper=path.join(repo,'scripts/lib/corpus-book-inspection.py');
const run=args.includes('--run'),retryFailed=args.includes('--retry-failed'),only=option('--only','');
const maxFiles=Number(option('--max-files','1000'));
if(!Number.isInteger(maxFiles)||maxFiles<1)throw new Error('Invalid --max-files');
const hashFile=async(file:string)=>{const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);return hash.digest('hex');};
const readJson=async(file:string)=>JSON.parse(await fs.readFile(file,'utf8'));
const writeJson=async(file:string,value:unknown)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});
const atomic=async(file:string,value:unknown)=>{const temp=`${file}.${process.pid}.tmp`;await writeJson(temp,value);await fs.rename(temp,file);};
const walk=async(folder:string):Promise<string[]>=>{const all:string[]=[];for(const item of await fs.readdir(folder,{withFileTypes:true})){
 const file=path.join(folder,item.name);if(item.isDirectory())all.push(...await walk(file));else if(item.isFile())all.push(file);
}return all;};
const [catalog,pageCatalog,assisted]=await Promise.all([readJson(catalogPath),readJson(pagesPath),readJson(assistedPath)]);
const sourceRoot=await fs.realpath(catalog.summary.source_root);
const provenance={workflow:'native_pdf_bounded_v1',catalogSHA256:await hashFile(catalogPath),pagesSHA256:await hashFile(pagesPath),
 assistedSHA256:await hashFile(assistedPath),runnerSHA256:await hashFile(fileURLToPath(import.meta.url)),planHelperSHA256:await hashFile(path.join(repo,'scripts/lib/corpus-bounded-policy.mts')),
 inspectionHelperSHA256:await hashFile(helper),engineSHA256:await hashFile(engine),enginePath:engine,pythonPath:python,
 renderEngine:'Audiveris PDFBox internal',productPopplerEquivalent:false,sourcePitchVerified:false,trainingEligible:false};
const jobs:any[]=[];
for(const entry of catalog.files??[]){
 if(entry.extension!=='.pdf'||entry.kind==='non_musical_personal_admin'||!Number.isInteger(entry.pages)||entry.pages<=20||!entry.sha256||only&&!entry.sha256.startsWith(only))continue;
 const baselinePath=path.join(baselineRoot,entry.sha256.slice(0,16),'result.json');
 let baseline:any;try{baseline=await readJson(baselinePath);}catch{continue;}
 if(!baseline.finishedAt||baseline.sourceSHA256!==entry.sha256||baseline.physicalPages!==entry.pages
  ||!baseline.issues?.some((issue:any)=>issue.code==='OMR_IMAGE_TOO_LARGE'&&issue.verified===true))continue;
 const plan=computeBoundedPlan(entry,pageCatalog.pages??[],assisted.pages??[]);
 jobs.push({entry,baselinePath,baselineSHA256:await hashFile(baselinePath),plan});
}
jobs.sort((a,b)=>a.entry.pages-b.entry.pages||a.entry.path.localeCompare(b.entry.path));
const selected=jobs.slice(0,maxFiles);
if(!run){console.log(JSON.stringify({event:'bounded_retry_plan',count:selected.length,items:selected.map(job=>({source:job.entry.path,sourceSHA256:job.entry.sha256,pages:job.entry.pages,
  status:job.plan.status,dpi:job.plan.dpi,sizeRatio:job.plan.sizeRatio,selectedPhysicalPages:job.plan.selectedPhysicalPages,excludedPhysicalPages:job.plan.excludedPhysicalPages,reason:job.plan.reason})),provenance},null,2));process.exit(0);}
await fs.mkdir(outputRoot,{recursive:true,mode:0o700});
const lockPath=path.join(outputRoot,'.bounded-retry.lock');
const lease=await fs.open(lockPath,'wx',0o600);
let stopSignal:NodeJS.Signals|null=null,activeChild:ReturnType<typeof spawn>|null=null,stopHardTimer:NodeJS.Timeout|undefined;
const signalGroup=(child:ReturnType<typeof spawn>,signal:NodeJS.Signals)=>{try{if(process.platform!=='win32'&&child.pid)process.kill(-child.pid,signal);else child.kill(signal);}catch{}};
const groupAlive=(child:ReturnType<typeof spawn>)=>{if(process.platform==='win32'||!child.pid)return false;try{process.kill(-child.pid,0);return true;}catch{return false;}};
function requestStop(signal:NodeJS.Signals){if(stopSignal)return;stopSignal=signal;if(activeChild){const child=activeChild;signalGroup(child,'SIGTERM');
 stopHardTimer=setTimeout(()=>signalGroup(child,'SIGKILL'),2000);stopHardTimer.unref();}}
process.on('SIGTERM',()=>requestStop('SIGTERM'));process.on('SIGINT',()=>requestStop('SIGINT'));
async function runChild(command:string,argv:string[],logPath:string,timeoutMs:number,env:NodeJS.ProcessEnv,limitBytes:number,captureStdout=false){
 if(stopSignal)throw new Error(`Interrupted by ${stopSignal}`);
 const log=createWriteStream(logPath,{flags:'wx',mode:0o600});
 return await new Promise<{code:number|null;signal:string|null;timedOut:boolean;logTruncated:boolean;stdout?:string}>((resolve,reject)=>{
  const child=spawn(command,argv,{detached:process.platform!=='win32',stdio:['ignore','pipe','pipe'],env});activeChild=child;
  let bytes=0,truncated=false,timedOut=false,error:Error|undefined,logError:Error|undefined;const stdoutChunks:Buffer[]=[];let stdoutBytes=0;
  let hardTimer:NodeJS.Timeout|undefined;
  const timer=setTimeout(()=>{timedOut=true;signalGroup(child,'SIGTERM');hardTimer=setTimeout(()=>signalGroup(child,'SIGKILL'),2000);hardTimer.unref();},timeoutMs);
  const consume=(stream:NodeJS.ReadableStream,isStdout:boolean)=>(chunk:Buffer)=>{if(captureStdout&&isStdout){
    stdoutBytes+=chunk.length;if(stdoutBytes<=limitBytes)stdoutChunks.push(chunk);else truncated=true;
   }if(logError||bytes>=limitBytes){truncated=true;return;}
   const kept=chunk.subarray(0,Math.min(chunk.length,limitBytes-bytes));bytes+=kept.length;
   if(kept.length&&!log.write(kept)){stream.pause();log.once('drain',()=>stream.resume());}
   if(kept.length<chunk.length)truncated=true;};
  child.stdout.on('data',consume(child.stdout,true));child.stderr.on('data',consume(child.stderr,false));
  log.on('error',cause=>{logError=cause;child.stdout.resume();child.stderr.resume();signalGroup(child,'SIGTERM');});
  child.on('error',cause=>{error=cause;});
  child.on('close',async(code,signal)=>{clearTimeout(timer);if(hardTimer)clearTimeout(hardTimer);if(stopHardTimer){clearTimeout(stopHardTimer);stopHardTimer=undefined;}
   try{
    if(stopSignal||timedOut||groupAlive(child)){signalGroup(child,'SIGKILL');for(let n=0;n<40&&groupAlive(child);n++)await delay(50);}
    activeChild=null;
    if(groupAlive(child))throw new Error('Process group did not terminate');
    if(logError)throw logError;
    log.end(()=>error?reject(error):resolve({code,signal,timedOut,logTruncated:truncated,
     ...(captureStdout?{stdout:Buffer.concat(stdoutChunks).toString('utf8')}: {})}));
   }catch(cause){activeChild=null;log.destroy();reject(cause);}
  });
  if(stopSignal)signalGroup(child,'SIGTERM');
 });
}
async function nextAttempt(jobDir:string){const base=path.join(jobDir,'attempts');await fs.mkdir(base,{recursive:true,mode:0o700});
 const names=await fs.readdir(base);let number=Math.max(0,...names.map(name=>Number(/^attempt-(\d+)$/.exec(name)?.[1]??0)))+1;
 while(true){const attemptId=`attempt-${String(number).padStart(4,'0')}`,attemptDir=path.join(base,attemptId);
  try{await fs.mkdir(attemptDir,{mode:0o700});return {attemptId,attemptDir};}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;number++;}}
}
async function validCompleted(jobDir:string,sourceSHA256:string){
 const base=path.join(jobDir,'attempts');let names:string[];try{names=(await fs.readdir(base)).filter(name=>/^attempt-\d{4}$/.test(name)).sort().reverse();}catch{return null;}
 for(const attemptId of names){try{const result=await readJson(path.join(base,attemptId,'result.json'));
  if(result.sourceSHA256!==sourceSHA256||result.status!=='raw_exports_present'||result.operationalOutcome!=='success'||result.provenance?.catalogSHA256!==provenance.catalogSHA256
   ||result.provenance?.pagesSHA256!==provenance.pagesSHA256||result.provenance?.assistedSHA256!==provenance.assistedSHA256||!result.exports?.length)continue;
  let valid=true;for(const artifact of [...result.exports,...(result.artifacts??[])])if(await hashFile(artifact.path)!==artifact.sha256){valid=false;break;}
  if(valid)return {attemptId,result};
 }catch{}}
 return null;
}
async function observedImages(logPaths:string[]){const images=new Map<number,{width:number;height:number;pixels:number}>();
 for(const file of logPaths){try{let tail='';for await(const chunk of createReadStream(file)){
   const raw=tail+chunk.toString('utf8');
   for(const match of raw.matchAll(/Loaded image #(\d+) (\d+)x(\d+) from /g)){
    const page=Number(match[1]),width=Number(match[2]),height=Number(match[3]);images.set(page,{width,height,pixels:width*height});
   }
   tail=raw.slice(-200);
  }}catch{}
 }return [...images].sort((a,b)=>a[0]-b[0]).map(([page,image])=>({page,...image}));
}
async function engineDiagnostics(logPath:string){let tail='';let tooLarge=false,staffBarlineSerialization=false,zipfsCascade=false;
 try{for await(const chunk of createReadStream(logPath)){const raw=tail+chunk.toString('utf8');
  if(/Too large image:\s*[\d,]+\s*pixels/i.test(raw))tooLarge=true;
  if(/StaffBarlineInter\.getBounds/i.test(raw)&&/NullPointerException/i.test(raw))staffBarlineSerialization=true;
  if(/FileSystemAlreadyExistsException/i.test(raw))zipfsCascade=true;
  tail=raw.slice(-250);
 }}catch{}
 return [...(tooLarge?[{code:'OMR_IMAGE_TOO_LARGE',verified:true,interpretation:'Renderer bound still exceeded; not source-role evidence'}]:[]),
  ...(staffBarlineSerialization?[{code:'OMR_INTERNAL_STAFF_BARLINE_SERIALIZATION',verified:true,interpretation:'Engine internal exception; not evidence of invalid source notation'}]:[]),
  ...(zipfsCascade?[{code:'OMR_ZIPFS_CASCADE',verified:true,interpretation:'Subsequent book-storage failure observed; causal order requires review'}]:[])];
}
const counts={selected:selected.length,convertedCandidates:0,noExport:0,failed:0,skippedVerified:0,skippedFailed:0,deferred:0};
try{
 await lease.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString(),selected:selected.length}));
 const queueDir=path.join(outputRoot,'queue-snapshots');await fs.mkdir(queueDir,{recursive:true,mode:0o700});
 await writeJson(path.join(queueDir,`queue-${Date.now()}-${process.pid}.json`),{createdAt:new Date().toISOString(),provenance,
  items:selected.map(job=>({source:job.entry.path,sourceSHA256:job.entry.sha256,baselineSHA256:job.baselineSHA256,plan:job.plan}))});
 for(const job of selected){
  if(stopSignal)break;
  const {entry,plan}=job;
  if(plan.status!=='eligible'){counts.deferred++;console.log(JSON.stringify({event:'bounded_deferred',source:entry.path,status:plan.status,reason:plan.reason}));continue;}
  const jobDir=path.join(outputRoot,entry.sha256.slice(0,16));await fs.mkdir(jobDir,{recursive:true,mode:0o700});
  try{
   const existing=await validCompleted(jobDir,entry.sha256);
   if(existing){counts.skippedVerified++;console.log(JSON.stringify({event:'bounded_skip_verified',source:entry.path,attemptId:existing.attemptId}));continue;}
   let pointer:any=null;try{pointer=await readJson(path.join(jobDir,'current-result.json'));}catch{}
   if(pointer?.outcome!=='success'&&pointer?.finishedAt&&!retryFailed){counts.skippedFailed++;console.log(JSON.stringify({event:'bounded_skip_failed_requires_retry_flag',source:entry.path}));continue;}
   const {attemptId,attemptDir}=await nextAttempt(jobDir);
   let report:any={workflow:'native_pdf_bounded_v1',attemptId,source:entry.path,sourceSHA256:entry.sha256,physicalPages:entry.pages,
    method:'native_pdf_bounded',selectedPhysicalPages:plan.selectedPhysicalPages,excludedPhysicalPages:plan.excludedPhysicalPages,
    verifiedExclusionDecisions:plan.excludedDecisions,dpi:plan.dpi,expectedImages:plan.expectedImages,sizeRatio:plan.sizeRatio,
    reviewStatus:'needs_review',accuracyVerified:false,pitchVerified:false,trainingEligible:false,finalExportApproved:false,
    pageMappingVerified:false,bookSegmentationStatus:'needs_review',coverageInterpretation:'PAGE stage and raw exports are not proof of score coverage or source accuracy',
    provenance,baselineReportSHA256:job.baselineSHA256,startedAt:new Date().toISOString(),exports:[],artifacts:[],issues:[]};
   let outcome='failed';
   try{
    const source=await fs.realpath(path.join(sourceRoot,entry.path));if(!source.startsWith(sourceRoot+path.sep)||await hashFile(source)!==entry.sha256)throw new Error('Source path/hash changed since inventory');
    const snapshots=path.join(attemptDir,'snapshots');await fs.mkdir(snapshots,{mode:0o700});
    for(const [name,file,expected] of [['inventory.json',catalogPath,provenance.catalogSHA256],['pages.json',pagesPath,provenance.pagesSHA256],
     ['assisted_review.json',assistedPath,provenance.assistedSHA256],['baseline-result.json',job.baselinePath,job.baselineSHA256]] as const){
     const target=path.join(snapshots,name);await fs.copyFile(file,target);if(await hashFile(target)!==expected)throw new Error(`Snapshot changed while copying: ${name}`);
    }
    const baseline=await readJson(path.join(snapshots,'baseline-result.json'));
    if(baseline.sourceSHA256!==entry.sha256||!baseline.finishedAt||!baseline.issues?.some((issue:any)=>issue.code==='OMR_IMAGE_TOO_LARGE'&&issue.verified===true))throw new Error('Baseline snapshot does not prove the image-size failure');
    const nativeDir=path.join(attemptDir,'native');await fs.mkdir(nativeDir,{mode:0o700});
    const scratch=path.join(attemptDir,'runtime');await fs.mkdir(scratch,{mode:0o700});await Promise.all(['home','work'].map(name=>fs.mkdir(path.join(scratch,name),{mode:0o700})));
    const argv=['-batch','-transcribe','-export','-save','-swap','-constant',`org.audiveris.omr.image.ImageLoading.pdfResolution=${plan.dpi}`,
     '-constant','org.audiveris.omr.sheet.BookManager.useCompression=false','-output',nativeDir,'-sheets',...plan.selectedPhysicalPages.map(String),'--',source];
    report.engineArguments=[engine,...argv];
    await writeJson(path.join(attemptDir,'config.json'),report);
    const timeoutMs=Math.min(10_800_000,Math.max(900_000,plan.selectedPhysicalPages.length*90_000+180_000));
    const engineOutcome=await runChild(engine,argv,path.join(attemptDir,'engine.log'),timeoutMs,{...process.env,
     JAVA_TOOL_OPTIONS:`-Djava.awt.headless=true -Duser.home=${path.join(scratch,'home')} -Djava.io.tmpdir=${path.join(scratch,'work')} -Xmx2g -XX:ActiveProcessorCount=2`},32*1024*1024);
    report.engineOutcome=engineOutcome;report.operationalOutcome=engineOutcome.timedOut?'timeout':engineOutcome.code===0?'success':'engine_failed';
    if(engineOutcome.logTruncated)report.issues.push({code:'ENGINE_LOG_TRUNCATED',limitBytes:32*1024*1024});
    if(engineOutcome.timedOut)report.issues.push({code:'OMR_TIMEOUT'});
    else if(engineOutcome.code!==0)report.issues.push({code:'OMR_PROCESS_FAILED',exitCode:engineOutcome.code,signal:engineOutcome.signal});
    report.issues.push(...await engineDiagnostics(path.join(attemptDir,'engine.log')));
    const nativeFiles=await walk(nativeDir);
    report.observedImages=await observedImages([path.join(attemptDir,'engine.log'),...nativeFiles.filter(file=>/\.log$/i.test(file))]);
    for(const image of report.observedImages)if(Math.max(image.width,image.height)>4400||image.pixels>20_000_000)report.issues.push({code:'OMR_RENDER_BOUND_EXCEEDED',page:image.page,...image});
    if(!report.observedImages.length)report.issues.push({code:'OMR_RENDER_DIMENSIONS_UNOBSERVED'});
    try{
     const helperLog=path.join(attemptDir,'inspection.log');
     const helperOutcome=await runChild(python,[helper,nativeDir],helperLog,60_000,process.env,8*1024*1024,true);
     report.inspectionOutcome={code:helperOutcome.code,signal:helperOutcome.signal,timedOut:helperOutcome.timedOut,logTruncated:helperOutcome.logTruncated};
     if(helperOutcome.code===0&&!helperOutcome.logTruncated){
      const inspection=JSON.parse(helperOutcome.stdout??'');await writeJson(path.join(attemptDir,'native-inspection.json'),inspection);
      report.pageStageReached=[...new Set((inspection.books??[]).flatMap((book:any)=>book.sheets??[]).filter((sheet:any)=>sheet.reachedPageStep&&!sheet.invalid).map((sheet:any)=>sheet.page))].sort((a:any,b:any)=>a-b);
      report.pageStageNotReached=plan.selectedPhysicalPages.filter(page=>!report.pageStageReached.includes(page));
      report.movementCountObserved=(inspection.books??[]).flatMap((book:any)=>book.movements??[]).length;
     }else report.issues.push({code:'NATIVE_INSPECTION_FAILED',outcome:helperOutcome});
    }catch(error){report.issues.push({code:'NATIVE_INSPECTION_FAILED',message:error instanceof Error?error.message:String(error)});}
    const validationDir=path.join(attemptDir,'validation');await fs.mkdir(validationDir,{mode:0o700});
    const validationIssueCounts:Record<string,number>={};
    for(const file of nativeFiles){const size=(await fs.stat(file)).size;
     if(/\.(xml|musicxml)$/i.test(file)){
      if(size>32*1024*1024){report.issues.push({code:'EXPORT_TOO_LARGE_TO_INSPECT',path:file,bytes:size});continue;}
      const xml=await fs.readFile(file,'utf8'),errors:string[]=[];
      const document=new DOMParser({errorHandler:{warning:message=>errors.push(String(message)),error:message=>errors.push(String(message)),fatalError:message=>errors.push(String(message))}}).parseFromString(xml,'application/xml');
      if(errors.length||document.documentElement?.nodeName!=='score-partwise'){report.issues.push({code:'RAW_EXPORT_XML_UNREADABLE',path:file});continue;}
      const exportItem:any={path:file,bytes:size,sha256:await hashFile(file),pageMappingVerified:false,accuracyVerified:false,reviewStatus:'needs_review'};
      try{const validation=inspectMusicXmlValidation(xml,{scope:'score'});
       const validationPath=path.join(validationDir,`export-${String(report.exports.length+1).padStart(3,'0')}.json`);
       await writeJson(validationPath,validation);exportItem.validationPath=validationPath;exportItem.internalConsistencyRequiresReview=validation.requiresReview;
       for(const issue of validation.issues)validationIssueCounts[issue.code]=(validationIssueCounts[issue.code]??0)+1;
      }catch(error){report.issues.push({code:'EXPORT_INTERNAL_VALIDATION_FAILED',path:file,message:error instanceof Error?error.message:String(error)});}
      report.exports.push(exportItem);
     }else if(/\.(omr|log)$/i.test(file))report.artifacts.push({path:file,bytes:size,sha256:await hashFile(file)});
    }
    report.validationIssueCounts=validationIssueCounts;
    report.validationLimitations=['Internal MusicXML consistency only; pitch and source correspondence are not verified.'];
    report.status=report.exports.length?'raw_exports_present':'no_export';
    outcome=report.operationalOutcome==='success'?'success':'failed';
    if(report.exports.length)counts.convertedCandidates++;else counts.noExport++;
   }catch(error){report.operationalOutcome='failed';report.status='no_export';report.issues.push({code:'BOUNDED_RETRY_FAILED',message:error instanceof Error?error.message:String(error)});counts.failed++;}
   report.finishedAt=new Date().toISOString();
   await writeJson(path.join(attemptDir,'result.json'),report);
   await atomic(path.join(jobDir,'current-result.json'),{attemptId,attemptDir,source:entry.path,sourceSHA256:entry.sha256,outcome,status:report.status,finishedAt:report.finishedAt});
   console.log(JSON.stringify({event:'bounded_retry_finished',source:entry.path,attemptId,status:report.status,operationalOutcome:report.operationalOutcome,
    pageStageReached:report.pageStageReached?.length??0,exports:report.exports.length,issues:report.issues.map((issue:any)=>issue.code)}));
  }catch(error){counts.failed++;console.log(JSON.stringify({event:'bounded_setup_failed',source:entry.path,message:error instanceof Error?error.message:String(error)}));}
 }
 await atomic(path.join(outputRoot,'bounded-summary.json'),{generatedAt:new Date().toISOString(),provenance,counts,
  selection:selected.map(job=>({source:job.entry.path,sourceSHA256:job.entry.sha256,pages:job.entry.pages,status:job.plan.status,dpi:job.plan.dpi,
   selectedPhysicalPages:job.plan.selectedPhysicalPages,excludedPhysicalPages:job.plan.excludedPhysicalPages}))});
}finally{await lease.close();await fs.rm(lockPath,{force:true});}
console.log(JSON.stringify({event:'bounded_retry_complete',counts,interrupted:stopSignal}));
