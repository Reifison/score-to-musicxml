/** Derived consistency checks for immutable native-PDF retry exports. */
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectMusicXmlValidation } from '../apps/api/src/services/MusicXmlValidation.js';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.join(repo,'output/omr/corpus-partituras-2026-10-07/bounded-retries');
const out=path.join(root,'derived-validation');
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const validatorDependencies=await Promise.all(['MusicXmlValidation.ts','MusicXmlRhythm.ts','MusicXmlVoiceRhythm.ts'].map(async name=>({name,sha256:hash(await fs.readFile(path.join(repo,'apps/api/src/services',name)))})));
const validatorSHA256=hash(Buffer.from(JSON.stringify(validatorDependencies)));
const runnerSHA256=hash(await fs.readFile(fileURLToPath(import.meta.url)));
const exists=async(file:string)=>{try{return await fs.readFile(file);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}};
let checked=0;
await fs.mkdir(out,{recursive:true,mode:0o700});
for(const dir of await fs.readdir(root,{withFileTypes:true})){
 if(!dir.isDirectory()||!/^[a-f0-9]{16}$/.test(dir.name))continue;
 const attempts=path.join(root,dir.name,'attempts');let names:string[];
 try{names=await fs.readdir(attempts);}catch{continue;}
 for(const name of names.filter(n=>/^attempt-\d{4}$/.test(n)).sort()){
  const file=path.join(attempts,name,'result.json'),bytes=await exists(file);if(!bytes)continue;
  const parent=JSON.parse(bytes.toString('utf8'));if(!parent.finishedAt||parent.workflow!=='native_pdf_bounded_v1')continue;
  const parentSHA256=hash(bytes),exports:any[]=[];
  for(const preview of parent.exports??[]){
   const resolved=await fs.realpath(preview.path);
   if(!resolved.startsWith(path.resolve(attempts,name)+path.sep))throw new Error('Export outside immutable retry');
   if((await fs.stat(resolved)).size>32*1024*1024)throw new Error('Export exceeds inspection bound');
   const xml=await fs.readFile(resolved);
   if(!/^[a-f0-9]{64}$/.test(preview.sha256)||hash(xml)!==preview.sha256)throw new Error('Export hash differs from parent');
   exports.push({path:resolved,sha256:preview.sha256,validation:inspectMusicXmlValidation(xml.toString('utf8'),{scope:'score'}),
    reviewStatus:'needs_review',accuracyVerified:false});checked++;
  }
  const report={process:'bounded_derived_consistency',parentReport:file,parentSHA256,sourceSHA256:parent.sourceSHA256,
   validatorSHA256,validatorDependencies,runnerSHA256,validationScope:'score',scope:'XML consistency only; no source pitch or physical export coverage certification',exports,
   finalExportApproved:false,trainingEligible:false};
  const destination=path.join(out,`${parentSHA256}-${validatorSHA256.slice(0,12)}-${runnerSHA256.slice(0,12)}.json`);
  const result=Buffer.from(JSON.stringify(report,null,2)+'\n'),old=await exists(destination);
  if(old&&!old.equals(result))throw new Error('Derived validation identity collision');
  if(!old)await fs.writeFile(destination,result,{flag:'wx',mode:0o600});
 }
}
console.log(JSON.stringify({checked,output:out}));
