/** Private offline baseline: keeps unreviewed exports, all engine artifacts and per-file diagnostics. */
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { inspectMusicXmlValidation, audiverisVersionOf } from '../apps/api/src/services/MusicXmlValidation.js';

const args = process.argv.slice(2);
const option = (name: string, fallback?: string) => { const i=args.lastIndexOf(name); return i<0 ? fallback : args[i+1]; };
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.resolve(option('--catalog','docs/validation/corpus-partituras-2026-10-07/catalog/inventory.json')!);
const catalog = JSON.parse(await fs.readFile(catalogPath,'utf8'));
const sourceRoot = await fs.realpath(catalog.summary.source_root);
const outputRoot = path.resolve(option('--output','output/omr/corpus-partituras-2026-10-07')!);
const engine = await fs.realpath(option('--engine','/private/tmp/corpus-audiveris-volume/Audiveris.app/Contents/MacOS/Audiveris')!);
const python = option('--python','/Users/reifison/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3')!;
const phase = option('--phase','short')!;
const concurrency = Number(option('--jobs','2'));
const maxFiles = Number(option('--max-files','10000'));
const retryFailed = args.includes('--retry-failed');
if (!['short','books','all'].includes(phase) || !Number.isInteger(concurrency) || concurrency<1 || concurrency>2 || !Number.isInteger(maxFiles) || maxFiles<1) throw new Error('Invalid bounded batch options');
await fs.mkdir(outputRoot,{recursive:true,mode:0o700});
const scratch = path.join(repo,'tmp/corpus-2026-10-07/runtime');
await fs.mkdir(scratch,{recursive:true,mode:0o700});
const hashFile = async (file:string) => {const hash=createHash('sha256');for await (const bytes of createReadStream(file)) hash.update(bytes);return hash.digest('hex');};
const provenance = {catalogSHA256:await hashFile(catalogPath),runnerSHA256:await hashFile(fileURLToPath(import.meta.url)),helperSHA256:await hashFile(path.join(repo,'scripts/lib/corpus-book-inspection.py')),engineSHA256:await hashFile(engine),enginePath:engine,pythonPath:python};
const lockPath = path.join(outputRoot,'.corpus-batch.lock');
const engineArgs = (source:string,nativeDir:string) => ['-batch','-transcribe','-export','-save','-swap','-constant','org.audiveris.omr.sheet.BookManager.useCompression=false','-output',nativeDir,'--',source];
const activeChildren = new Set<ReturnType<typeof spawn>>();
let stopSignal:NodeJS.Signals|null=null;
function signalGroup(child:ReturnType<typeof spawn>,signal:NodeJS.Signals) {
 try {if(child.pid && process.platform!=='win32') process.kill(-child.pid,signal); else child.kill(signal);} catch {}
}
function requestStop(signal:NodeJS.Signals) {
 if(stopSignal) return;
 stopSignal=signal;
 for(const child of activeChildren) signalGroup(child,'SIGTERM');
 setTimeout(()=>{for(const child of activeChildren) signalGroup(child,'SIGKILL');},2000).unref();
}
process.on('SIGINT',()=>requestStop('SIGINT'));
process.on('SIGTERM',()=>requestStop('SIGTERM'));
const direct = (parent:Node,name:string):Element[] => Array.from(parent.childNodes).filter((n):n is Element=>n.nodeType===1 && n.nodeName===name);
const walk = async (folder:string):Promise<string[]> => {
 const files:string[]=[];for(const entry of await fs.readdir(folder,{withFileTypes:true})) {
  const f=path.join(folder,entry.name);if(entry.isDirectory()) files.push(...await walk(f));else if(entry.isFile()) files.push(f);
 }return files;
};
async function atomic(file:string,value:unknown) {const temp=`${file}.${process.pid}.tmp`;await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});await fs.rename(temp,file);}
async function run(command:string,argv:string[],logPath:string,timeout:number,jobScratch:string) {
 if(stopSignal) throw new Error(`Batch interrupted by ${stopSignal}`);
 await Promise.all(['home','work'].map(name=>fs.mkdir(path.join(jobScratch,name),{recursive:true,mode:0o700})));
 const log=createWriteStream(logPath,{flags:'wx',mode:0o600});
 const limit=32*1024*1024;
 return new Promise<{code:number|null;signal:string|null;timedOut:boolean;logTruncated:boolean}>((resolve,reject)=>{
  const child=spawn(command,argv,{stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32',env:{...process.env,JAVA_TOOL_OPTIONS:`-Djava.awt.headless=true -Duser.home=${path.join(jobScratch,'home')} -Djava.io.tmpdir=${path.join(jobScratch,'work')} -Xmx2g -XX:ActiveProcessorCount=2`}});
  activeChildren.add(child);
  let timedOut=false, logTruncated=false, logBytes=0;
  let processError:Error|undefined, logError:Error|undefined, hardKill:NodeJS.Timeout|undefined;
  const timer=setTimeout(()=>{timedOut=true;signalGroup(child,'SIGTERM');hardKill=setTimeout(()=>signalGroup(child,'SIGKILL'),2000);},timeout);
  const consume=(stream:NodeJS.ReadableStream)=>(chunk:Buffer)=>{
   if(logError || logBytes>=limit){logTruncated=true;return;}
   const kept=chunk.subarray(0,Math.min(chunk.length,limit-logBytes));logBytes+=kept.length;
   if(kept.length && !log.write(kept)){stream.pause();log.once('drain',()=>stream.resume());}
   if(kept.length<chunk.length)logTruncated=true;
  };
  child.stdout.on('data',consume(child.stdout));child.stderr.on('data',consume(child.stderr));
  log.on('error',error=>{logError=error;child.stdout.resume();child.stderr.resume();signalGroup(child,'SIGTERM');});
  child.on('error',error=>{processError=error;});
  child.on('close',(code,signal)=>{
   activeChildren.delete(child);clearTimeout(timer);if(hardKill)clearTimeout(hardKill);
   if(logError){log.destroy();reject(logError);return;}
   log.end(()=>processError?reject(processError):resolve({code,signal,timedOut,logTruncated}));
  });
  if(stopSignal)signalGroup(child,'SIGTERM');
 });
}
async function inspectNative(nativeDir:string,inspectionLog:string):Promise<any> {
 if(stopSignal) throw new Error(`Batch interrupted by ${stopSignal}`);
 const helper=spawn(python,[path.join(repo,'scripts/lib/corpus-book-inspection.py'),nativeDir],{stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
 activeChildren.add(helper);
 const out:Buffer[]=[],err:Buffer[]=[];let outBytes=0,errBytes=0,overflow=false,timedOut=false,processError:Error|undefined;
 const limit=8*1024*1024;
 let hardKill:NodeJS.Timeout|undefined;
 const stopHelper=()=>{signalGroup(helper,'SIGTERM');hardKill??=setTimeout(()=>signalGroup(helper,'SIGKILL'),2000);};
 const timer=setTimeout(()=>{timedOut=true;stopHelper();},60_000);
 helper.stdout.on('data',(chunk:Buffer)=>{outBytes+=chunk.length;if(outBytes<=limit)out.push(chunk);else{overflow=true;stopHelper();}});
 helper.stderr.on('data',(chunk:Buffer)=>{errBytes+=chunk.length;if(errBytes<=limit)err.push(chunk);else{overflow=true;stopHelper();}});
 helper.on('error',error=>{processError=error;});
 const code=await new Promise<number|null>(resolve=>helper.on('close',resolve));
 activeChildren.delete(helper);clearTimeout(timer);if(hardKill)clearTimeout(hardKill);
 await fs.writeFile(inspectionLog,Buffer.concat(err),{mode:0o600});
 if(processError)throw processError;
 if(timedOut)throw new Error('Native inspection timed out after 60 seconds');
 if(overflow)throw new Error('Native inspection output exceeded 8 MiB');
 if(code!==0)throw new Error('Native inspection failed; see inspection.log');
 return JSON.parse(Buffer.concat(out).toString('utf8'));
}
async function engineLogDiagnostics(engineLog:string,nativeDir:string):Promise<any[]> {
 const files=[engineLog,...(await walk(nativeDir)).filter(file=>/\.log$/i.test(file))];
 const textParts:string[]=[];
 for(const file of files) {
  try {
   const handle=await fs.open(file,'r');
   try {
    const size=(await handle.stat()).size,chunkSize=Math.min(size,1024*1024);
    const first=Buffer.alloc(chunkSize);await handle.read(first,0,chunkSize,0);textParts.push(first.toString('utf8'));
    if(size>chunkSize){const last=Buffer.alloc(chunkSize);await handle.read(last,0,chunkSize,size-chunkSize);textParts.push(last.toString('utf8'));}
   } finally {await handle.close();}
  } catch {}
 }
 const text=textParts.join('\n'),diagnostics:any[]=[];
 const add=(pattern:RegExp,code:string,severity:'error'|'warning',category:string,verification:string)=>{
  if(pattern.test(text))diagnostics.push({code,severity,category,verified:code==='OMR_IMAGE_TOO_LARGE',verification});
 };
 add(/Too large image:\s*[\d,]+\s*pixels/i,'OMR_IMAGE_TOO_LARGE','error','recognition','Explicit Audiveris image-size failure; not a music-page classification');
 const imageMatch=text.match(/Too large image:\s*([\d,]+)\s*pixels\s*\(vs\s*([\d,]+)\s*max\)/i);
 if(imageMatch)Object.assign(diagnostics.find(item=>item.code==='OMR_IMAGE_TOO_LARGE')??{},{
  observedPixels:Number(imageMatch[1].replaceAll(',','')),engineMaxPixels:Number(imageMatch[2].replaceAll(',',''))
 });
 add(/No installed OCR languages/i,'OCR_LANGUAGES_MISSING','warning','environment','Engine warning; conversion may still succeed');
 add(/invalid glyph index|font glyph|cmap.*glyph/i,'PDF_FONT_GLYPH_WARNING','warning','source-advisory','Font warning observed; no causal failure inferred');
 add(/No scale information|Could not determine scale|Scale could not be determined/i,'OMR_SCALE_UNRESOLVED','warning','recognition','Explicit engine scale diagnostic only');
 add(/No staves|No staff lines|No staff detected/i,'OMR_NO_STAFF_LINES','warning','recognition','Explicit engine staff diagnostic only; source role remains uncertain');
 return diagnostics;
}
const groups=new Map<string,any[]>();
for(const entry of catalog.files) {
 if(entry.extension!=='.pdf' || entry.kind==='non_musical_personal_admin' || !entry.pages || !entry.sha256)continue;
 if(phase==='short' && entry.pages>20 || phase==='books' && entry.pages<=20)continue;
 const group=groups.get(entry.sha256)??[];group.push(entry);groups.set(entry.sha256,group);
}
const jobs=[...groups.values()].sort((a,b)=>(a[0].pages-b[0].pages)||a[0].path.localeCompare(b[0].path)).slice(0,maxFiles);
let cursor=0,finished=0;let summaryWriting=Promise.resolve();
const eventsFile=path.join(outputRoot,'events.jsonl');
const taskVersion='raw-library-baseline-v2';
async function writeSummary() {
 summaryWriting=summaryWriting.catch(()=>undefined).then(async()=>{
  const reports=[];for(const item of await fs.readdir(outputRoot,{withFileTypes:true})) {
   if(!item.isDirectory())continue;
   try {reports.push(JSON.parse(await fs.readFile(path.join(outputRoot,item.name,'result.json'),'utf8')));} catch {}
  }
  const counts:Record<string,number>={},operationalCounts:Record<string,number>={},issueCounts:Record<string,number>={};
  for(const report of reports){counts[report.status]=(counts[report.status]??0)+1;operationalCounts[report.operationalOutcome??'legacy_unknown']=(operationalCounts[report.operationalOutcome??'legacy_unknown']??0)+1;for(const issue of report.issues??[])issueCounts[issue.code]=(issueCounts[issue.code]??0)+1;}
  await atomic(path.join(outputRoot,'summary.json'),{generatedAt:new Date().toISOString(),workflow:taskVersion,sourceRoot,catalogPath,scope:'Offline OMR baseline and internal consistency; source pitch accuracy and human review are not verified',counts,operationalCounts,issueCounts,items:reports.map(r=>({id:r.id,source:r.source,status:r.status,operationalOutcome:r.operationalOutcome,pages:r.physicalPages,report:r.reportPath,attemptId:r.attemptId,exports:r.exports,accuracyVerified:false}))});
 });await summaryWriting;
}
async function validCompletedResult(old:any,sourceSHA256:string):Promise<boolean> {
 if(!old?.finishedAt || old.sourceSHA256!==sourceSHA256)return false;
 if(!['converted_needs_review','raw_exports_present'].includes(old.status) || old.operationalOutcome && old.operationalOutcome!=='success')return false;
 if(!Array.isArray(old.exports) || !old.exports.length)return false;
 try {
  for(const item of [...old.exports,...(old.artifacts??[])]) {
   if(!item.path || !/^[a-f0-9]{64}$/.test(item.sha256) || await hashFile(item.path)!==item.sha256)return false;
  }
  return true;
 } catch {return false;}
}
async function preserveLegacyResult(jobDir:string,old:any) {
 if(old?.attemptId)return;
 try {await fs.access(path.join(jobDir,'result.json'));} catch {return;}
 const legacyDir=path.join(jobDir,'attempts','legacy-v1');
 await fs.mkdir(legacyDir,{recursive:true,mode:0o700});
 const destination=path.join(legacyDir,'result.json');
 try {await fs.access(destination);} catch {await fs.copyFile(path.join(jobDir,'result.json'),destination);}
}
async function nextAttempt(jobDir:string) {
 const attemptsDir=path.join(jobDir,'attempts');await fs.mkdir(attemptsDir,{recursive:true,mode:0o700});
 const names=await fs.readdir(attemptsDir);
 let sequence=Math.max(0,...names.map(name=>/^attempt-(\d+)$/.exec(name)).filter(Boolean).map(match=>Number(match![1])))+1;
 while(true) {
  const attemptId=`attempt-${String(sequence).padStart(4,'0')}`;
  const attemptDir=path.join(attemptsDir,attemptId);
  try {await fs.mkdir(attemptDir,{mode:0o700});return {attemptId,attemptDir};}
  catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;sequence++;}
 }
}
async function processJob(group:any[]) {
 const entry=group[0];const id=entry.sha256.slice(0,16);const jobDir=path.join(outputRoot,id);const resultPath=path.join(jobDir,'result.json');
 await fs.mkdir(jobDir,{recursive:true,mode:0o700});
 let old:any=null;
 try {old=JSON.parse(await fs.readFile(resultPath,'utf8'));} catch {}
 if(await validCompletedResult(old,entry.sha256)) {
  console.log(JSON.stringify({event:'resume_skip_verified',source:entry.path,status:old.status}));finished++;return;
 }
 if(old?.finishedAt && old.sourceSHA256===entry.sha256 && !retryFailed) {
  console.log(JSON.stringify({event:'resume_skip_failed_requires_retry_flag',source:entry.path,status:old.status}));finished++;return;
 }
 await preserveLegacyResult(jobDir,old);
 const {attemptId,attemptDir}=await nextAttempt(jobDir);
 const nativeDir=path.join(attemptDir,'native');await fs.mkdir(nativeDir,{recursive:true,mode:0o700});
 const startedAt=new Date().toISOString(),issues:any[]=[],exports:any[]=[],artifacts:any[]=[];
 let source:string|null=null,engineOutcome:any=null,inspection:any=null,operationalOutcome='success';
 const runningPath=path.join(attemptDir,'running.json');
 try {
  await atomic(runningPath,{workflow:taskVersion,id,attemptId,source:entry.path,sourceSHA256:entry.sha256,startedAt,pid:process.pid});
  if(stopSignal)throw new Error(`Batch interrupted by ${stopSignal}`);
  source=await fs.realpath(path.join(sourceRoot,entry.path));
  if(!source.startsWith(sourceRoot+path.sep))throw new Error('Source escaped the catalog root');
  if(await hashFile(source)!==entry.sha256)throw new Error(`Source changed since inventory: ${entry.path}`);
  console.log(JSON.stringify({event:'started',id,attemptId,source:entry.path,pages:entry.pages}));
  const argv=engineArgs(source,nativeDir);
  engineOutcome=await run(engine,argv,path.join(attemptDir,'engine.log'),entry.pages<=20?900000:7200000,path.join(scratch,id,attemptId));
  if(stopSignal){operationalOutcome='interrupted';throw new Error(`Batch interrupted by ${stopSignal}`);}
  if(engineOutcome.timedOut){operationalOutcome='timeout';issues.push({code:'OMR_TIMEOUT',category:'operation',severity:'error',verified:true});}
  else if(engineOutcome.code!==0){operationalOutcome='engine_failed';issues.push({code:'OMR_PROCESS_FAILED',category:'operation',severity:'error',verified:true,exitCode:engineOutcome.code,signal:engineOutcome.signal});}
  if(engineOutcome.logTruncated)issues.push({code:'ENGINE_LOG_TRUNCATED',category:'operation',severity:'warning',limitBytes:32*1024*1024});
  issues.push(...await engineLogDiagnostics(path.join(attemptDir,'engine.log'),nativeDir));
  try {
   inspection=await inspectNative(nativeDir,path.join(attemptDir,'inspection.log'));
   await atomic(path.join(attemptDir,'native-inspection.json'),inspection);
   for(const item of [...(inspection.books??[]),...(inspection.compressedExports??[])]) if(item.inspectionError)issues.push({code:'NATIVE_ARTIFACT_INSPECTION_FAILED',category:'operation',severity:'warning',file:item.file,message:item.inspectionError});
   const sheets=(inspection.books??[]).flatMap((book:any)=>book.sheets??[]);
   if(!sheets.length)issues.push({code:'PAGE_STAGE_UNVERIFIED',category:'coverage',severity:'warning'});
   for(let page=1;page<=entry.pages;page++) if(!sheets.some((sheet:any)=>sheet.page===page && sheet.reachedPageStep && !sheet.invalid)) {
    issues.push({code:'PAGE_STAGE_NOT_REACHED',category:'recognition',severity:'warning',physicalPage:page,sourceRole:'uncertain',verification:'Audiveris PAGE stage only; source music and export mapping remain unverified'});
   }
  } catch(error) {
   if(stopSignal){operationalOutcome='interrupted';throw new Error(`Batch interrupted by ${stopSignal}`);}
   if(operationalOutcome==='success')operationalOutcome='inspection_failed';
   issues.push({code:'NATIVE_INSPECTION_FAILED',category:'operation',severity:'error',message:error instanceof Error?error.message:String(error)});
  }
  for(const candidate of await walk(nativeDir)) {
   if(stopSignal){operationalOutcome='interrupted';throw new Error(`Batch interrupted by ${stopSignal}`);}
   if(!/\.(musicxml|xml)$/i.test(candidate))continue;
   try {
    const size=(await fs.stat(candidate)).size;
    if(size>32*1024*1024){issues.push({code:'XML_TOO_LARGE',category:'export',severity:'warning',file:candidate,bytes:size,limitBytes:32*1024*1024});continue;}
    const xml=await fs.readFile(candidate,'utf8');if(!/<score-partwise\b/.test(xml))continue;
    const errors:string[]=[];const doc=new DOMParser({errorHandler:{warning:m=>errors.push(String(m)),error:m=>errors.push(String(m)),fatalError:m=>errors.push(String(m))}}).parseFromString(xml,'application/xml');
    if(errors.length || doc.documentElement?.nodeName!=='score-partwise'){issues.push({code:'XML_UNREADABLE',category:'export',severity:'error',file:candidate});continue;}
    const root=doc.documentElement,parts=direct(root,'part'),measures=parts.flatMap(p=>direct(p,'measure')),notes=measures.flatMap(m=>direct(m,'note'));
    const validation=inspectMusicXmlValidation(xml),artifactHash=await hashFile(candidate),serial=String(exports.length+1).padStart(2,'0');
    const target=path.join(attemptDir,`preview-${serial}.musicxml`),validationPath=path.join(attemptDir,`preview-${serial}.validation.json`);
    await fs.copyFile(candidate,target);await fs.chmod(target,0o600);await atomic(validationPath,validation);
    for(const issue of validation.issues)issues.push({...issue,category:issue.code.startsWith('RHYTHM')||issue.code.startsWith('VOICE')||issue.code.startsWith('WRITTEN')?'rhythm':'xml-consistency',verified:false,verification:'Internal XML diagnostic; source confirmation pending',export:target});
    const staves=parts.map(p=>Math.max(1,...Array.from(p.getElementsByTagName('staves')).map(n=>Number(n.textContent)||1),...Array.from(p.getElementsByTagName('staff')).map(n=>Number(n.textContent)||1)));
    const clefsByPart=parts.map(p=>Array.from(p.getElementsByTagName('clef')).map(c=>c.getElementsByTagName('sign').item(0)?.textContent??''));
    const staffLines=parts.flatMap(p=>Array.from(p.getElementsByTagName('staff-lines')).map(n=>Number(n.textContent)));
    const outside=parts.length>2 || staves.some(s=>s>2) || staffLines.some(n=>n!==5) || clefsByPart.flat().some(c=>c==='TAB')
      || parts.length===2 && (staves.some(s=>s!==1)||clefsByPart.some(c=>c.some(sign=>sign && sign!=='G')));
    if(outside)issues.push({code:'LAYOUT_OUTSIDE_APP_CONTRACT',category:'product-support',severity:'warning',export:target,sourceVerified:false,verification:'XML shape only',partCount:parts.length,staves,clefs:clefsByPart,staffLines});
    else if(clefsByPart.some(c=>!c.length))issues.push({code:'LAYOUT_UNVERIFIED_XML',category:'product-support',severity:'warning',export:target,sourceVerified:false,verification:'Clef absent in XML'});
    exports.push({path:target,sourceRawPath:candidate,sha256:artifactHash,bytes:size,engineVersion:audiverisVersionOf(xml),partCount:parts.length,measureOccurrences:measures.length,pitchedEvents:notes.filter(n=>direct(n,'pitch').length).length,rests:notes.filter(n=>direct(n,'rest').length).length,validationPath,reviewStatus:'needs_review',accuracyVerified:false,pageMappingVerified:false,sourcePhysicalPages:[]});
   } catch(error) {
    issues.push({code:'EXPORT_INSPECTION_FAILED',category:'export',severity:'error',file:candidate,message:error instanceof Error?error.message:String(error)});
   }
  }
  const books=inspection?.books??[];
  if(exports.length===1 && books.length===1 && (books[0].movements??[]).length===1) {
   const numbers=(books[0].movements[0].pages??[]).map((page:any)=>Number(page['sheet-number']));
   if(numbers.length && numbers.every((page:number)=>Number.isInteger(page)&&page>=1&&page<=entry.pages) && new Set(numbers).size===numbers.length) {
    exports[0].pageMappingVerified=true;exports[0].sourcePhysicalPages=numbers;
   }
  }
  if(exports.some(item=>!item.pageMappingVerified))issues.push({code:'EXPORT_PAGE_MAPPING_UNVERIFIED',category:'coverage',severity:'warning',note:'No reliable movement-to-export mapping; page coverage cannot be inferred from PAGE step'});
 } catch(error) {
  if(operationalOutcome==='success')operationalOutcome=stopSignal?'interrupted':'input_or_runner_failed';
  issues.push({code:'JOB_OPERATION_FAILED',category:'operation',severity:'error',message:error instanceof Error?error.message:String(error)});
 }
 try {
  for(const file of await walk(nativeDir)) {
   try {const stat=await fs.stat(file);artifacts.push({path:file,bytes:stat.size,sha256:await hashFile(file)});}
   catch(error){issues.push({code:'ARTIFACT_INVENTORY_FAILED',category:'operation',severity:'error',file,message:error instanceof Error?error.message:String(error)});if(operationalOutcome==='success')operationalOutcome='artifact_inventory_failed';}
  }
 } catch(error){issues.push({code:'ARTIFACT_WALK_FAILED',category:'operation',severity:'error',message:error instanceof Error?error.message:String(error)});if(operationalOutcome==='success')operationalOutcome='artifact_inventory_failed';}
 const status=exports.length?'raw_exports_present':'no_export';
 const report={workflow:taskVersion,id,attemptId,attemptDir,source:entry.path,sourceAbsolutePath:source,sourceSHA256:entry.sha256,aliases:group.slice(1).map(x=>x.path),physicalPages:entry.pages,startedAt,finishedAt:new Date().toISOString(),status,operationalOutcome,engineOutcome,engineVersionObserved:inspection?.books?.map((book:any)=>book.engineVersion).filter(Boolean)??[],engineArguments:source?engineArgs(source,nativeDir):null,provenance,
  inputPreparation:{kind:'native_pdf_whole',pdfRasterization:'Audiveris internal',equivalentToProductPoppler:false},
  coverageInterpretation:'Audiveris PAGE stage is observed, not proof of source music or MusicXML page coverage',
  exports,issues,artifacts,reportPath:resultPath,selectionRequiredByPageLimit:entry.pages>20,bookSegmentationStatus:'needs_review',sourcePageRolesVerified:false,accuracyVerified:false,trainingEligible:false,finalExportApproved:false};
 await atomic(path.join(attemptDir,'result.json'),report);
 await atomic(resultPath,report);
 await fs.unlink(runningPath).catch(()=>undefined);
 await fs.appendFile(eventsFile,JSON.stringify({event:'finished',id,attemptId,source:entry.path,status,operationalOutcome,at:report.finishedAt,exports:exports.length,issueCount:issues.length})+'\n',{mode:0o600});
 finished++;await writeSummary();console.log(JSON.stringify({event:'finished',id,attemptId,source:entry.path,status,operationalOutcome,exports:exports.length,finished,planned:jobs.length}));
}
let lock;
try {lock=await fs.open(lockPath,'wx',0o600);} catch(error) {
 if((error as NodeJS.ErrnoException).code==='EEXIST') throw new Error('Another corpus batch owns this output; inspect its lock before resuming');
 throw error;
}
try {
 await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));
 console.log(JSON.stringify({event:'planned',phase,uniqueFiles:jobs.length,physicalFiles:[...groups.values()].reduce((n,g)=>n+g.length,0),physicalPages:[...groups.values()].reduce((n,g)=>n+g[0].pages,0),jobs:concurrency,workflow:taskVersion,retryFailed}));
 const workers=Array.from({length:concurrency},async()=>{
  while(cursor<jobs.length && !stopSignal) {
   const group=jobs[cursor++];
   try {await processJob(group);}
   catch(error) {
    console.error(JSON.stringify({event:'job_finalization_failed',source:group[0]?.path,error:error instanceof Error?error.message:String(error)}));
    finished++;
   }
  }
 });
 await Promise.allSettled(workers);
 await writeSummary();
 console.log(JSON.stringify({event:stopSignal?'batch_interrupted':'batch_complete',phase,finished,planned:jobs.length}));
 if(stopSignal)process.exitCode=stopSignal==='SIGINT'?130:143;
}finally {
 for(const child of activeChildren)signalGroup(child,'SIGTERM');
 await lock.close();
 await fs.unlink(lockPath).catch(error=>{if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;});
}
