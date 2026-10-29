/** Explicit physical-page recovery from a failed bounded native book; never assembles a whole score. */
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { inspectMusicXmlValidation } from '../apps/api/src/services/MusicXmlValidation.js';

const configPath=process.argv[2];if(!configPath)throw new Error('Usage: node --import tsx scripts/corpus-bounded-subset.mts config.json');
const config=JSON.parse(await fs.readFile(configPath,'utf8'));
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const helper=path.join(repo,'scripts/lib/corpus-book-inspection.py');
const python=config.python??'/Users/reifison/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const hashFile=async(file:string)=>{const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);return hash.digest('hex');};
const readJson=async(file:string)=>JSON.parse(await fs.readFile(file,'utf8'));
const writeJson=async(file:string,value:unknown)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});
const shaPattern=/^[a-f0-9]{64}$/;
const source=await fs.realpath(config.source),engine=await fs.realpath(config.engine),outputDir=path.resolve(config.outputDir);
const parent=await readJson(config.parentReportPath);
if(!shaPattern.test(config.sourceSHA256)||!shaPattern.test(config.parentReportSHA256)||!shaPattern.test(config.parentNativeSHA256)
 ||await hashFile(source)!==config.sourceSHA256||await hashFile(config.parentReportPath)!==config.parentReportSHA256
 ||await hashFile(config.parentNativePath)!==config.parentNativeSHA256
 ||parent.sourceSHA256!==config.sourceSHA256||parent.method!=='native_pdf_bounded'
 ||!parent.artifacts?.some((item:any)=>item.path===config.parentNativePath&&item.sha256===config.parentNativeSHA256)
 ||!Number.isInteger(parent.physicalPages)||parent.physicalPages<=20
 ||!Number.isInteger(config.dpi)||config.dpi<100||config.dpi>300||config.dpi!==parent.dpi
 ||!Array.isArray(config.selectedPhysicalPages)||!config.selectedPhysicalPages.length
 ||config.selectedPhysicalPages.some((page:any)=>!Number.isInteger(page)||page<1||page>parent.physicalPages)
 ||new Set(config.selectedPhysicalPages).size!==config.selectedPhysicalPages.length
 ||config.selectedPhysicalPages.some((page:number)=>!parent.pageStageNotReached?.includes(page))
 ||typeof config.reason!=='string'||!config.reason.trim())throw new Error('Subset configuration/source/parent hashes or physical-page bounds are invalid');
const selectedPhysicalPages=[...config.selectedPhysicalPages].sort((a,b)=>a-b);
const omittedPhysicalPages=Array.from({length:parent.physicalPages},(_,index)=>index+1).filter(page=>!selectedPhysicalPages.includes(page));
const provenance={sourceSHA256:config.sourceSHA256,parentReportSHA256:config.parentReportSHA256,parentNativeSHA256:config.parentNativeSHA256,
 scriptSHA256:await hashFile(fileURLToPath(import.meta.url)),helperSHA256:await hashFile(helper),engineSHA256:await hashFile(engine),
 enginePath:engine,method:'native_pdf_bounded_partial_recovery',productPopplerEquivalent:false};
await fs.mkdir(outputDir,{recursive:false,mode:0o700});
await writeJson(path.join(outputDir,'input-config.snapshot.json'),config);
const report:any={workflow:'native_pdf_bounded_v1',method:'native_pdf_bounded_partial_recovery',source,
 sourceSHA256:config.sourceSHA256,parentReportPath:config.parentReportPath,parentNativePath:config.parentNativePath,
 physicalPages:parent.physicalPages,selectedPhysicalPages,omittedPhysicalPages,
 omittedPreviouslyObservedPageStage:omittedPhysicalPages.filter(page=>parent.pageStageReached?.includes(page)),
 omittedUnresolvedPhysicalPages:omittedPhysicalPages.filter(page=>!parent.pageStageReached?.includes(page)),
 excludedPhysicalPages:[],dpi:config.dpi,reason:config.reason,provenance,
 reviewStatus:'needs_review',accuracyVerified:false,pitchVerified:false,trainingEligible:false,finalExportApproved:false,
 pageMappingVerified:false,bookSegmentationStatus:'needs_review',combinedBookExport:false,
 coverageInterpretation:'Selected physical pages are a diagnostic subset; PAGE stage and raw XML do not establish full-book coverage or source fidelity.',
 startedAt:new Date().toISOString(),exports:[],artifacts:[],issues:[]};
let activeChild:ReturnType<typeof spawn>|null=null,stopSignal:NodeJS.Signals|null=null,stopTimer:NodeJS.Timeout|undefined;
const signalGroup=(child:ReturnType<typeof spawn>,signal:NodeJS.Signals)=>{try{if(process.platform!=='win32'&&child.pid)process.kill(-child.pid,signal);else child.kill(signal);}catch{}};
const groupAlive=(child:ReturnType<typeof spawn>)=>{if(process.platform==='win32'||!child.pid)return false;try{process.kill(-child.pid,0);return true;}catch{return false;}};
function requestStop(signal:NodeJS.Signals){if(stopSignal)return;stopSignal=signal;if(activeChild){const child=activeChild;signalGroup(child,'SIGTERM');stopTimer=setTimeout(()=>signalGroup(child,'SIGKILL'),2000);stopTimer.unref();}}
process.on('SIGINT',()=>requestStop('SIGINT'));process.on('SIGTERM',()=>requestStop('SIGTERM'));
async function runCommand(command:string,args:string[],logPath:string,timeoutMs:number,env:NodeJS.ProcessEnv,limitBytes:number,capture=false){
 const log=createWriteStream(logPath,{flags:'wx',mode:0o600});
 return await new Promise<{code:number|null;signal:string|null;timedOut:boolean;logTruncated:boolean;stdout?:string}>((resolve,reject)=>{
  const child=spawn(command,args,{detached:process.platform!=='win32',stdio:['ignore','pipe','pipe'],env});activeChild=child;
  let bytes=0,outBytes=0,truncated=false,timedOut=false,error:Error|undefined,logError:Error|undefined,hardTimer:NodeJS.Timeout|undefined;const out:Buffer[]=[];
  const timeout=setTimeout(()=>{timedOut=true;signalGroup(child,'SIGTERM');hardTimer=setTimeout(()=>signalGroup(child,'SIGKILL'),2000);hardTimer.unref();},timeoutMs);
  const consume=(stream:NodeJS.ReadableStream,isStdout:boolean)=>(chunk:Buffer)=>{
   if(capture&&isStdout){outBytes+=chunk.length;if(outBytes<=limitBytes)out.push(chunk);else truncated=true;}
   if(logError||bytes>=limitBytes){truncated=true;return;}
   const kept=chunk.subarray(0,Math.min(chunk.length,limitBytes-bytes));bytes+=kept.length;
   if(kept.length&&!log.write(kept)){stream.pause();log.once('drain',()=>stream.resume());}if(kept.length<chunk.length)truncated=true;
  };
  child.stdout.on('data',consume(child.stdout,true));child.stderr.on('data',consume(child.stderr,false));
  child.on('error',cause=>{error=cause;});log.on('error',cause=>{logError=cause;child.stdout.resume();child.stderr.resume();signalGroup(child,'SIGTERM');});
  child.on('close',async(code,signal)=>{clearTimeout(timeout);if(hardTimer)clearTimeout(hardTimer);if(stopTimer){clearTimeout(stopTimer);stopTimer=undefined;}
   try{if(stopSignal||timedOut||groupAlive(child)){signalGroup(child,'SIGKILL');for(let n=0;n<40&&groupAlive(child);n++)await delay(50);}
    activeChild=null;if(groupAlive(child))throw new Error('Child process group survived shutdown');if(logError)throw logError;
    log.end(()=>error?reject(error):resolve({code,signal,timedOut,logTruncated:truncated,...(capture?{stdout:Buffer.concat(out).toString('utf8')}: {})}));
   }catch(cause){activeChild=null;log.destroy();reject(cause);}
  });
  if(stopSignal)signalGroup(child,'SIGTERM');
 });
}
const walk=async(folder:string):Promise<string[]>=>{const files:string[]=[];for(const item of await fs.readdir(folder,{withFileTypes:true})){
 const file=path.join(folder,item.name);if(item.isDirectory())files.push(...await walk(file));else if(item.isFile())files.push(file);
}return files;};
try{
 const nativeDir=path.join(outputDir,'native');await fs.mkdir(nativeDir,{mode:0o700});
 const home=path.join(outputDir,'home'),work=path.join(outputDir,'work');await fs.mkdir(home,{mode:0o700});await fs.mkdir(work,{mode:0o700});
 const argv=['-batch','-transcribe','-export','-save','-swap','-constant',`org.audiveris.omr.image.ImageLoading.pdfResolution=${config.dpi}`,
  '-constant','org.audiveris.omr.sheet.BookManager.useCompression=false','-output',nativeDir,'-sheets',...selectedPhysicalPages.map(String),'--',source];
 report.engineArguments=[engine,...argv];
 const engineOutcome=await runCommand(engine,argv,path.join(outputDir,'engine.log'),Math.max(300_000,selectedPhysicalPages.length*120_000),
  {...process.env,JAVA_TOOL_OPTIONS:`-Djava.awt.headless=true -Duser.home=${home} -Djava.io.tmpdir=${work} -Xmx2g -XX:ActiveProcessorCount=2`},32*1024*1024);
 report.engineOutcome=engineOutcome;report.operationalOutcome=engineOutcome.timedOut?'timeout':engineOutcome.code===0?'success':'engine_failed';
 if(engineOutcome.code!==0)report.issues.push({code:'OMR_PROCESS_FAILED',exitCode:engineOutcome.code,signal:engineOutcome.signal});
 if(engineOutcome.logTruncated)report.issues.push({code:'ENGINE_LOG_TRUNCATED',limitBytes:32*1024*1024});
 const nativeFiles=await walk(nativeDir);
 const observed=new Map<number,{width:number;height:number;pixels:number}>();
 for(const file of [path.join(outputDir,'engine.log'),...nativeFiles.filter(item=>/\.log$/i.test(item))]){
  try{let tail='';for await(const chunk of createReadStream(file)){const raw=tail+chunk.toString('utf8');
   for(const match of raw.matchAll(/Loaded image #(\d+) (\d+)x(\d+) from /g)){
    const page=Number(match[1]),width=Number(match[2]),height=Number(match[3]);observed.set(page,{width,height,pixels:width*height});
   }tail=raw.slice(-200);}}catch{}
 }
 report.observedImages=[...observed].sort((a,b)=>a[0]-b[0]).map(([page,image])=>({page,...image}));
 for(const image of report.observedImages)if(Math.max(image.width,image.height)>4400||image.pixels>20_000_000)report.issues.push({code:'OMR_RENDER_BOUND_EXCEEDED',...image});
 try{const inspectionOutcome=await runCommand(python,[helper,nativeDir],path.join(outputDir,'inspection.log'),60_000,process.env,8*1024*1024,true);
  report.inspectionOutcome={code:inspectionOutcome.code,signal:inspectionOutcome.signal,timedOut:inspectionOutcome.timedOut,logTruncated:inspectionOutcome.logTruncated};
  if(inspectionOutcome.code===0&&!inspectionOutcome.logTruncated){const inspection=JSON.parse(inspectionOutcome.stdout??'');
   await writeJson(path.join(outputDir,'native-inspection.json'),inspection);
   report.pageStageReached=[...new Set((inspection.books??[]).flatMap((book:any)=>book.sheets??[]).filter((sheet:any)=>sheet.reachedPageStep&&!sheet.invalid).map((sheet:any)=>sheet.page))].sort((a:any,b:any)=>a-b);
   report.selectedPageStageNotReached=selectedPhysicalPages.filter(page=>!report.pageStageReached.includes(page));
   report.movementCountObserved=(inspection.books??[]).flatMap((book:any)=>book.movements??[]).length;
  }else report.issues.push({code:'NATIVE_INSPECTION_FAILED'});
 }catch(error){report.issues.push({code:'NATIVE_INSPECTION_FAILED',message:error instanceof Error?error.message:String(error)});}
 const validationDir=path.join(outputDir,'validation');await fs.mkdir(validationDir,{mode:0o700});const issueCounts:Record<string,number>={};
 for(const file of nativeFiles){const size=(await fs.stat(file)).size;
  if(/\.(xml|musicxml)$/i.test(file)){
   if(size>32*1024*1024){report.issues.push({code:'EXPORT_TOO_LARGE_TO_INSPECT',path:file,bytes:size});continue;}
   const xml=await fs.readFile(file,'utf8'),errors:string[]=[];
   const doc=new DOMParser({errorHandler:{warning:message=>errors.push(String(message)),error:message=>errors.push(String(message)),fatalError:message=>errors.push(String(message))}}).parseFromString(xml,'application/xml');
   if(errors.length||doc.documentElement?.nodeName!=='score-partwise'){report.issues.push({code:'RAW_EXPORT_XML_UNREADABLE',path:file});continue;}
   const exportItem:any={path:file,bytes:size,sha256:await hashFile(file),pageMappingVerified:false,accuracyVerified:false,reviewStatus:'needs_review'};
   try{const validation=inspectMusicXmlValidation(xml,{scope:'score'}),validationPath=path.join(validationDir,`export-${String(report.exports.length+1).padStart(3,'0')}.json`);
    await writeJson(validationPath,validation);exportItem.validationPath=validationPath;exportItem.internalConsistencyRequiresReview=validation.requiresReview;
    for(const issue of validation.issues)issueCounts[issue.code]=(issueCounts[issue.code]??0)+1;
   }catch(error){report.issues.push({code:'EXPORT_INTERNAL_VALIDATION_FAILED',path:file,message:error instanceof Error?error.message:String(error)});}
   report.exports.push(exportItem);
  }else if(/\.(omr|log)$/i.test(file))report.artifacts.push({path:file,bytes:size,sha256:await hashFile(file)});
 }
 report.validationIssueCounts=issueCounts;
 report.validationLimitations=['Internal MusicXML consistency only; source pitch and note correspondence are not verified.'];
 report.status=report.exports.length?'raw_partial_exports_present':'no_export';
}catch(error){report.status='no_export';report.operationalOutcome='failed';report.issues.push({code:'BOUNDED_SUBSET_FAILED',message:error instanceof Error?error.message:String(error)});}
report.finishedAt=new Date().toISOString();await writeJson(path.join(outputDir,'result.json'),report);
console.log(JSON.stringify({event:'bounded_subset_finished',status:report.status,source:report.source,selectedPhysicalPages,omittedUnresolvedPhysicalPages:report.omittedUnresolvedPhysicalPages,
 pageStageReached:report.pageStageReached??[],exports:report.exports.length,issues:report.issues.map((issue:any)=>issue.code)}));
