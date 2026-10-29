/** Export selected, already recognized sheets from a COPY of a failed native book. */
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { inspectMusicXmlValidation } from '../apps/api/src/services/MusicXmlValidation.js';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const opt=(name:string,fallback:string)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const root=path.resolve(opt('--output','output/omr/corpus-partituras-2026-10-07'));
const engine=opt('--engine','/private/tmp/corpus-audiveris-volume/Audiveris.app/Contents/MacOS/Audiveris');
const max=Number(opt('--max-files','1000'));
const retryFailed=args.includes('--retry-failed');
if(!Number.isInteger(max)||max<1)throw new Error('Invalid limit');
const sha=async(file:string)=>{const h=createHash('sha256');for await(const bytes of createReadStream(file))h.update(bytes);return h.digest('hex');};
const read=async(file:string)=>JSON.parse(await fs.readFile(file,'utf8'));
const write=async(file:string,value:unknown)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});
const assistedPath=path.resolve(opt('--catalog',path.join(repo,'docs/validation/corpus-partituras-2026-10-07/catalog/assisted_review_supplemental_v3.json')));
const assisted=await read(assistedPath);
const assistedSHA256=await sha(assistedPath);
const engineSHA256=await sha(engine),runnerSHA256=await sha(fileURLToPath(import.meta.url));
const walk=async(dir:string):Promise<string[]>=>{const all:string[]=[];for(const e of await fs.readdir(dir,{withFileTypes:true})) {const f=path.join(dir,e.name);if(e.isDirectory())all.push(...await walk(f));else if(e.isFile())all.push(f);}return all;};
let active:ReturnType<typeof spawn>|null=null,stop=false,undrainedChild:ReturnType<typeof spawn>|null=null;
const signalTimers=new Set<NodeJS.Timeout>();
const killChild=(child:ReturnType<typeof spawn>|null,signal:NodeJS.Signals)=>{try{if(child?.pid)process.kill(-child.pid,signal);}catch{}};
const groupAlive=(child:ReturnType<typeof spawn>)=>{try{if(!child.pid)return false;process.kill(-child.pid,0);return true;}catch{return false;}};
const kill=(signal:NodeJS.Signals)=>killChild(active,signal);
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,()=>{stop=true;const child=active;killChild(child,'SIGTERM');const timer=setTimeout(()=>killChild(child,'SIGKILL'),2000);signalTimers.add(timer);timer.unref();});
async function execute(argv:string[],dir:string){
 const log=await fs.open(path.join(dir,'engine.log'),'wx',0o600);
 await fs.mkdir(path.join(dir,'home'));await fs.mkdir(path.join(dir,'work'));
 let size=0,truncated=false,timedOut=false,childError:Error|undefined;
 try{
  active=spawn(engine,argv,{detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,JAVA_TOOL_OPTIONS:`-Djava.awt.headless=true -Duser.home=${path.join(dir,'home')} -Djava.io.tmpdir=${path.join(dir,'work')} -Xmx1g -XX:ActiveProcessorCount=1`}});
  const child=active;
  // Append only bounded chunks; consume both streams through a serialized promise chain.
    let writes=Promise.resolve();
    const consume=(chunk:Buffer)=>{const kept=chunk.subarray(0,Math.max(0,8*1024*1024-size));size+=kept.length;if(kept.length<chunk.length)truncated=true;if(kept.length)writes=writes.then(()=>log.write(kept).then(()=>undefined)).catch(error=>{childError=error;kill('SIGTERM');});};
  child.stdout!.on('data',consume);child.stderr!.on('data',consume);child.once('error',error=>{childError=error;});
  let hardTimer:NodeJS.Timeout|undefined;
  const timer=setTimeout(()=>{timedOut=true;killChild(child,'SIGTERM');hardTimer=setTimeout(()=>killChild(child,'SIGKILL'),2000);},180_000);
  const outcome=await new Promise<{code:number|null;signal:string|null}>(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
  clearTimeout(timer);
  if(groupAlive(child)){
   killChild(child,'SIGTERM');
   for(let i=0;i<20&&groupAlive(child);i++)await new Promise(resolve=>setTimeout(resolve,100));
   if(groupAlive(child))killChild(child,'SIGKILL');
   for(let i=0;i<20&&groupAlive(child);i++)await new Promise(resolve=>setTimeout(resolve,100));
  }
  const groupTerminationVerified=!groupAlive(child);
  if(hardTimer)clearTimeout(hardTimer);for(const timer of signalTimers)clearTimeout(timer);signalTimers.clear();
  if(!groupTerminationVerified){undrainedChild=child;stop=true;}active=null;await writes;
  if(childError)throw childError;
  return {...outcome,timedOut,logTruncated:truncated,groupTerminationVerified};
 }finally{await log.close();}
}
const leasePath=path.join(root,'.native-salvage.lock');
const lease=await fs.open(leasePath,'wx',0o600);
let processed=0;
try{
 await lease.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));
 for(const entry of await fs.readdir(root,{withFileTypes:true})){
  if(stop||processed>=max)break;
  if(!entry.isDirectory()||!/^[a-f0-9]{16}$/.test(entry.name))continue;
  try{
  const jobDir=path.join(root,entry.name),baselinePath=path.join(jobDir,'result.json');
  let raw:any;try{raw=await read(baselinePath);}catch{continue;}
  if(!raw.finishedAt||raw.exports?.length||!raw.attemptDir)continue;
  const previous=(await fs.readdir(jobDir)).filter(name=>/^native-salvage-\d{4}$/.test(name)).sort();
  let reusable=false;
  for(const name of previous){
   try{const report=await read(path.join(jobDir,name,'result.json'));
    if(report.sourceSHA256===raw.sourceSHA256&&report.exports?.length){
     reusable=true;for(const preview of report.exports)if(await sha(preview.path)!==preview.sha256)reusable=false;
     if(reusable)break;
    }
   }catch{}
  }
  if(reusable||previous.length&&!retryFailed)continue;
  const next=previous.length?Number(previous.at(-1)!.slice(-4))+1:1;
  const target=path.join(jobDir,`native-salvage-${String(next).padStart(4,'0')}`);
  let inspection:any;try{inspection=await read(path.join(raw.attemptDir,'native-inspection.json'));}catch{continue;}
  const books=(inspection.books??[]).filter((book:any)=>!book.inspectionError&&book.sheets?.some((sheet:any)=>sheet.reachedPageStep&&!sheet.invalid));
  if(books.length!==1)continue;
  const book=books[0],selected=book.sheets.filter((s:any)=>s.reachedPageStep&&!s.invalid).map((s:any)=>s.page);
  if(!selected.length||selected.some((n:number)=>!Number.isInteger(n)||n<1||n>raw.physicalPages)||new Set(selected).size!==selected.length)continue;
  const exclusions=assisted.pages.filter((p:any)=>p.pdf===raw.source&&p.pdf_sha256===raw.sourceSHA256&&p.source_sha256===raw.sourceSHA256
   &&p.api_verified_decision_status==='verified'&&p.api_verified_classification?.decision==='nonmusical'
   &&p.api_verified_classification.sourceSHA256===raw.sourceSHA256&&p.api_verified_classification.originalImageSHA256===p.image_sha256
   &&/^[a-f0-9]{64}$/.test(p.image_sha256)&&Number.isInteger(p.physical_page_number)&&p.physical_page_number>=1&&p.physical_page_number<=raw.physicalPages
   &&p.api_verified_classification.reviewer?.trim()&&p.api_verified_classification.reason?.trim()).map((p:any)=>p.physical_page_number);
  const omitted=Array.from({length:raw.physicalPages},(_,i)=>i+1).filter(n=>!selected.includes(n));
  await fs.mkdir(target,{mode:0o700});processed++;
  const exports:any[]=[],issues:any[]=[];let outcome:any=null;
  const report:any={process:'native_selected_pages',source:raw.sourceAbsolutePath,sourceRelative:raw.source,sourceSHA256:raw.sourceSHA256,
   physicalPages:raw.physicalPages,reusedPhysicalPages:selected,omittedPhysicalPages:omitted,
   verifiedNonmusicalOmittedPages:omitted.filter(n=>exclusions.includes(n)),omittedPagesNeedingReview:omitted.filter(n=>!exclusions.includes(n)),
   sourceMapping:'Sheets retained their physical numbers; no note accuracy or full export coverage inferred from PAGE',
   reviewStatus:'needs_review',accuracyVerified:false,trainingEligible:false,finalExportApproved:false,segmentationStatus:'needs_review',
   engineSHA256,runnerSHA256,assistedSHA256,baselineReportSHA256:await sha(baselinePath),startedAt:new Date().toISOString(),exports,issues};
  try{
   const nativeHash=await sha(book.file),expected=raw.artifacts?.find((a:any)=>a.path===book.file)?.sha256;
   if(nativeHash!==expected)throw new Error('Native book hash differs from immutable parent attempt');
   const inspectionPath=path.join(raw.attemptDir,'native-inspection.json');
   report.inspectionSHA256=await sha(inspectionPath);
   await fs.copyFile(inspectionPath,path.join(target,'inspection.snapshot.json'));
   await fs.copyFile(assistedPath,path.join(target,'assisted-review.snapshot.json'));
   if(await sha(path.join(target,'inspection.snapshot.json'))!==report.inspectionSHA256||await sha(path.join(target,'assisted-review.snapshot.json'))!==assistedSHA256)throw new Error('Evidence snapshot changed while copying');
   const nativeSource=path.join(target,path.basename(book.file));await fs.copyFile(book.file,nativeSource);
   if(await sha(nativeSource)!==nativeHash)throw new Error('Copy hash mismatch');
   report.nativeBookSHA256=nativeHash;report.nativeBookSource=book.file;
   const nativeDir=path.join(target,'exports');await fs.mkdir(nativeDir);
   const argv=['-batch','-transcribe','-export','-save','-swap','-constant','org.audiveris.omr.sheet.BookManager.useCompression=false','-output',nativeDir,'-sheets',...selected.map(String),'--',nativeSource];
   report.engineArguments=argv;outcome=await execute(argv,target);
   if(outcome.code!==0||outcome.timedOut)issues.push({code:outcome.timedOut?'NATIVE_SELECTED_EXPORT_TIMEOUT':'NATIVE_SELECTED_EXPORT_PROCESS_FAILED',exitCode:outcome.code,signal:outcome.signal});
   if(!outcome.groupTerminationVerified)issues.push({code:'ENGINE_GROUP_TERMINATION_UNVERIFIED'});
   if(await sha(book.file)!==nativeHash)throw new Error('Original native attempt was changed unexpectedly');
   // Loaded .omr books export beside their copy, even when -output is specified.
   const candidates=[...await walk(nativeDir),...(await fs.readdir(target,{withFileTypes:true})).filter(e=>e.isFile()).map(e=>path.join(target,e.name))];
   for(const file of candidates){
    if(!/\.(xml|musicxml)$/i.test(file)||(await fs.stat(file)).size>32*1024*1024)continue;
    const xml=await fs.readFile(file,'utf8');if(!/<score-partwise\b/.test(xml))continue;
    const errors:string[]=[];const doc=new DOMParser({errorHandler:{warning:m=>errors.push(String(m)),error:m=>errors.push(String(m)),fatalError:m=>errors.push(String(m))}}).parseFromString(xml,'application/xml');
    if(errors.length||doc.documentElement?.nodeName!=='score-partwise'){issues.push({code:'SALVAGE_XML_UNREADABLE',file});continue;}
    const preview=path.join(target,`preview-${String(exports.length+1).padStart(2,'0')}.musicxml`);
    await fs.copyFile(file,preview);const validation=inspectMusicXmlValidation(xml,{scope:'page'});
    await write(`${preview}.validation.json`,validation);
    exports.push({path:preview,sha256:await sha(preview),validationPath:`${preview}.validation.json`,pageMappingVerified:false,reviewStatus:'needs_review'});
   }
  }catch(error){issues.push({code:'NATIVE_SELECTED_EXPORT_FAILED',message:error instanceof Error?error.message:String(error)});}
  Object.assign(report,{status:exports.length?'raw_partial_exports_present':'no_export',engineOutcome:outcome,finishedAt:new Date().toISOString()});
  await write(path.join(target,'result.json'),report);
  console.log(JSON.stringify({event:'selected_pages_export',source:raw.source,selected,omitted,exports:exports.length,outcome,issues}));
  }catch(error){
   const event={event:'selected_pages_job_failed',sourceId:entry.name,message:error instanceof Error?error.message:String(error),at:new Date().toISOString()};
   console.error(JSON.stringify(event));
   await fs.appendFile(path.join(root,'native-salvage-events.jsonl'),JSON.stringify(event)+'\n',{mode:0o600}).catch(()=>undefined);
  }
 }
}finally{await lease.close();if(!undrainedChild||!groupAlive(undrainedChild))await fs.unlink(leasePath);else console.error(JSON.stringify({event:'salvage_group_alive_lease_retained',pid:undrainedChild.pid}));}
console.log(JSON.stringify({event:'selected_pages_complete',processed,interrupted:stop}));
