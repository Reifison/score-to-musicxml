/** Native-score exports are candidates for comparison, never automatic gold references. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectMusicXmlValidation } from '../apps/api/src/services/MusicXmlValidation.js';
import { readEvents } from './evaluate-musicxml-reference.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalogPath=path.join(repo,'docs/validation/corpus-partituras-2026-10-07/catalog/inventory.json');
const catalog=JSON.parse(await fs.readFile(catalogPath,'utf8'));
const root=path.join(repo,'output/omr/corpus-partituras-2026-10-07/native-exports');
const engine='/private/tmp/corpus-musescore-volume/MuseScore 4.app/Contents/MacOS/mscore';
const retryFailed=process.argv.includes('--retry-failed');
const hash=async(file:string)=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
const engineSHA256=await hash(engine),runnerSHA256=await hash(fileURLToPath(import.meta.url));
const write=async(file:string,value:any)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const provenance={engine,engineSHA256,runnerSHA256,engineVersion:'MuseScore4 4.7.5',catalogSHA256:await hash(catalogPath),
 officialDownload:'https://musescore.org/en/download/musescore.dmg',packageSHA256:'5a8cc26994d3f346d3e7d88c6a1583959e990ee9346b00d7b1d3f9498de6473a',
 signatureVerification:'codesign --verify --deep --strict succeeded outside restricted sandbox',
 documentation:'https://handbook.musescore.org/appendix/command-line-usage'};
await fs.mkdir(root,{recursive:true,mode:0o700});
const lock=path.join(root,'.native-export.lock'),lease=await fs.open(lock,'wx',0o600);
let active:ReturnType<typeof spawn>|null=null,stop=false,undrainedPid:number|undefined;
const signalKillTimers=new Set<NodeJS.Timeout>();
const signal=(pid:number|undefined,sig:NodeJS.Signals)=>{try{if(pid)process.kill(-pid,sig);}catch{}};
const alive=(pid:number|undefined)=>{try{if(!pid)return false;process.kill(-pid,0);return true;}catch{return false;}};
for(const sig of ['SIGTERM','SIGINT'] as const)process.once(sig,()=>{stop=true;const pid=active?.pid;if(!pid)return;signal(pid,'SIGTERM');const t=setTimeout(()=>signal(pid,'SIGKILL'),2000);signalKillTimers.add(t);t.unref();});
async function execute(argv:string[],dir:string){
 const log=await fs.open(path.join(dir,'engine.log'),'wx',0o600);let writes=Promise.resolve(),bytes=0,truncated=false,timedOut=false;
 const child=spawn(engine,argv,{detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,XDG_CONFIG_HOME:path.join(dir,'config'),XDG_DATA_HOME:path.join(dir,'data')}});
 active=child;const pid=child.pid;let error:Error|undefined,hard:NodeJS.Timeout|undefined;
 const timer=setTimeout(()=>{timedOut=true;signal(pid,'SIGTERM');hard=setTimeout(()=>signal(pid,'SIGKILL'),2000);},90_000);
 const consume=(chunk:Buffer)=>{const keep=chunk.subarray(0,Math.max(0,4*1024*1024-bytes));bytes+=keep.length;if(keep.length<chunk.length)truncated=true;
  if(keep.length)writes=writes.then(()=>log.write(keep).then(()=>undefined)).catch(e=>{error=e;signal(pid,'SIGTERM');});};
 child.stdout!.on('data',consume);child.stderr!.on('data',consume);child.on('error',e=>{error=e;});
 const result=await new Promise<{code:number|null;signal:string|null}>(resolve=>child.on('close',(code,signal)=>resolve({code,signal})));
 clearTimeout(timer);
 if(alive(pid)){
  signal(pid,'SIGTERM');for(let n=0;n<20&&alive(pid);n++)await new Promise(r=>setTimeout(r,100));
  if(alive(pid))signal(pid,'SIGKILL');for(let n=0;n<20&&alive(pid);n++)await new Promise(r=>setTimeout(r,100));
 }
 if(hard)clearTimeout(hard);for(const t of signalKillTimers)clearTimeout(t);signalKillTimers.clear();
 const terminated=!alive(pid);if(!terminated){undrainedPid=pid;stop=true;}
 active=null;await writes;await log.close();if(error)throw error;
 return {...result,timedOut,logTruncated:truncated,groupTerminationVerified:!alive(pid)};
}
try{
 await lease.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));
 for(const item of catalog.files.filter((i:any)=>['.mscz','.musicxml','.gpx','.4sc'].includes(i.extension))){
  if(stop)break;
  const job=path.join(root,item.sha256.slice(0,16));await fs.mkdir(job,{recursive:true,mode:0o700});
  const previous=(await fs.readdir(job)).filter(n=>/^attempt-\d{4}$/.test(n)).sort();
  let reusable=false;
  for(const p of previous){try{const r=JSON.parse(await fs.readFile(path.join(job,p,'result.json'),'utf8'));
   if(r.sourceSHA256!==item.sha256||r.status!=='candidate_present'||!r.exports?.length)continue;
   if(await hash(path.join(catalog.summary.source_root,item.path))!==item.sha256)continue;
   reusable=true;for(const e of r.exports)if(!/^[a-f0-9]{64}$/.test(e.sha256)||await hash(e.path)!==e.sha256)reusable=false;
   if(reusable)break;
  }catch{}}
  if(reusable||previous.length&&(!retryFailed||item.extension==='.4sc')){console.log(JSON.stringify({event:reusable?'native_resume_verified':'native_failed_attempt_preserved',source:item.path}));continue;}
  const next=previous.length?Number(previous.at(-1)!.slice(-4))+1:1;
  const dir=path.join(job,`attempt-${String(next).padStart(4,'0')}`);await fs.mkdir(dir,{mode:0o700});
  const issues:any[]=[],exports:any[]=[];
  const report:any={process:'native_score_export',source:item.path,sourceSHA256:item.sha256,sourceFormat:item.extension,
   provenance,startedAt:new Date().toISOString(),issues,exports,reviewStatus:'needs_review',accuracyVerified:false,
   independentReference:false,referenceStatus:'candidate_reference',finalExportApproved:false,trainingEligible:false};
  try{
   const source=await fs.realpath(path.join(catalog.summary.source_root,item.path));
   if(!source.startsWith(catalog.summary.source_root+path.sep)||await hash(source)!==item.sha256)throw new Error('Source path/hash changed');
   if(item.extension==='.4sc'){issues.push({code:'NATIVE_FORMAT_UNSUPPORTED',message:'Unknown native binary format; preserved for identification, not treated as an invalid score.'});}
   else{
    const copy=path.join(dir,`source${item.extension}`);await fs.copyFile(source,copy);await fs.chmod(copy,0o444);
    if(await hash(copy)!==item.sha256)throw new Error('Native input copy differs');
    const output=path.join(dir,'preview.musicxml');
    if(item.extension==='.musicxml'){await fs.copyFile(copy,output);report.method='existing_musicxml_copy';}
    else{
     await Promise.all(['config','data'].map(n=>fs.mkdir(path.join(dir,n),{mode:0o700})));
     // Verified against 4.7.5 --help: older -c, -m and -s flags are no longer supported.
     const argv=['-o',output,copy];report.engineArguments=argv;
     const outcome=await execute(argv,dir);report.engineOutcome=outcome;report.method='musescore_native_export';
     report.operationalOutcome=outcome.timedOut?'timeout':outcome.code===0&&outcome.groupTerminationVerified?'success':'engine_failed';
     if(outcome.code!==0||outcome.timedOut)issues.push({code:outcome.timedOut?'NATIVE_EXPORT_TIMEOUT':'NATIVE_EXPORT_PROCESS_FAILED',exitCode:outcome.code,signal:outcome.signal});
     if(!outcome.groupTerminationVerified)issues.push({code:'ENGINE_GROUP_TERMINATION_UNVERIFIED'});
    }
    try{
     if((await fs.stat(output)).size>32*1024*1024)throw new Error('XML too large');
     const xml=await fs.readFile(output,'utf8');if(!/<score-partwise\b/.test(xml))throw new Error('Output is not MusicXML score-partwise');
     const validation=inspectMusicXmlValidation(xml,{scope:'score'}),events=readEvents(xml),validationPath=path.join(dir,'validation.json');
     if(!events.length)throw new Error('MusicXML has no written events; not a useful candidate');
     await write(validationPath,validation);
     exports.push({path:output,sha256:await hash(output),validationPath,eventCount:events.length,reviewStatus:'needs_review',pageMappingVerified:false});
    }catch(e){issues.push({code:'NATIVE_XML_NOT_AVAILABLE',message:e instanceof Error?e.message:String(e)});}
   }
   if(await hash(source)!==item.sha256)throw new Error('Original native source changed');
  }catch(e){issues.push({code:'NATIVE_EXPORT_FAILED',message:e instanceof Error?e.message:String(e)});}
  report.operationalOutcome??=report.method==='existing_musicxml_copy'&&exports.length?'success':'unsupported_or_failed';
  report.status=exports.length?(report.operationalOutcome==='success'?'candidate_present':'raw_partial_candidate_needs_review'):'no_candidate';report.finishedAt=new Date().toISOString();
  await write(path.join(dir,'result.json'),report);
  console.log(JSON.stringify({event:'native_export_finished',source:item.path,status:report.status,issues:issues.map(i=>i.code),events:exports[0]?.eventCount??null}));
 }
}finally{await lease.close();if(!alive(undrainedPid))await fs.rm(lock,{force:true});else console.error(JSON.stringify({event:'native_group_still_alive_lock_retained',pid:undrainedPid}));}
