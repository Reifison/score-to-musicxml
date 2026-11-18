/** Offline application preparation of one immutable, catalogued score candidate. */
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const configPath=process.argv[2];
if(!configPath)throw new Error('Usage: node --import tsx scripts/corpus-verify-prepared.mts config.json [--prepare-only]');
const config=JSON.parse(await fs.readFile(configPath,'utf8'));
const shaPattern=/^[a-f0-9]{64}$/;
const hashFile=async(file:string)=>{const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);return hash.digest('hex');};
const sameHash=async(file:string,expected:string)=>shaPattern.test(expected) && await hashFile(file)===expected;
const exact=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const source=await fs.realpath(config.source);
const outputDir=path.resolve(config.outputDir);
await fs.mkdir(outputDir,{recursive:false,mode:0o700});
const write=async(name:string,value:unknown)=>fs.writeFile(path.join(outputDir,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
let sourceSHA256:string|null=null;
let controller:AbortController|undefined;
let timer:NodeJS.Timeout|undefined;
try {
 if(!['melody','piano','guitar_solo','guitar_duo'].includes(config.scoreType))throw new Error('Explicit supported provisional scoreType required');
 if(typeof config.scoreTypeBasis!=='string'||!config.scoreTypeBasis.trim())throw new Error('scoreTypeBasis required');
 if(!Number.isInteger(config.expectedPages)||config.expectedPages<1||config.expectedPages>20)throw new Error('Expected page count must be within app limit 1..20');
 if(!await sameHash(source,config.sourceSHA256))throw new Error('Source hash mismatch');
 sourceSHA256=config.sourceSHA256;
 if(config.catalogEvidence){
  const evidence=config.catalogEvidence;
  if(!await sameHash(evidence.path,evidence.sha256))throw new Error('Catalog snapshot hash mismatch');
  const catalog=JSON.parse(await fs.readFile(evidence.path,'utf8'));
  if(evidence.kind==='inventory'){
   const item=catalog.files?.find((candidate:any)=>candidate.path===evidence.entryPath);
   if(!item||item.extension!=='.pdf'||item.sha256!==sourceSHA256||item.pages!==config.expectedPages)throw new Error('Source does not match inventory entry');
   const root=await fs.realpath(catalog.summary.source_root);
   if(source!==await fs.realpath(path.join(root,item.path)))throw new Error('Source path does not match inventory root');
  } else if(evidence.kind==='additional_visual_asset'){
   const item=catalog.visualAssets?.find((candidate:any)=>candidate.sourcePath===evidence.entryPath);
   const preview=item?.convertedPreviewPng??item?.renderedPreviewPng;
   if(!item||!preview||config.expectedPages!==1||preview.sha256!==sourceSHA256||source!==await fs.realpath(preview.path)
     ||!config.originalAsset||config.originalAsset.sha256!==item.sourceSha256||config.originalAsset.format!==item.sourceFormat
     ||config.originalAsset.path!==path.join(catalog.sourceRoot,item.sourcePath)
     ||config.preparedInput?.sha256!==sourceSHA256||config.preparedInput?.path!==source||config.preparedInput?.conversionTool!==item.conversion)throw new Error('Prepared asset does not match additional-assets snapshot');
  } else throw new Error('Unknown catalog evidence kind');
 } else throw new Error('Catalog evidence required');
 if(config.originalAsset && !await sameHash(config.originalAsset.path,config.originalAsset.sha256))throw new Error('Original asset hash mismatch');
 if(config.preparedInput && (!await sameHash(config.preparedInput.path,config.preparedInput.sha256)||config.preparedInput.path!==source))throw new Error('Prepared input hash mismatch');
 if(config.baselineEvidence && !await sameHash(config.baselineEvidence.path,config.baselineEvidence.sha256))throw new Error('Baseline result snapshot hash mismatch');
 if(config.nativeInspectionEvidence && !await sameHash(config.nativeInspectionEvidence.path,config.nativeInspectionEvidence.sha256))throw new Error('Native movement inspection snapshot hash mismatch');
 if(config.provenance){
  if(!await sameHash(fileURLToPath(import.meta.url),config.provenance.wrapperSHA256))throw new Error('Wrapper code hash changed after queue snapshot');
  if(!await sameHash(config.engine,config.provenance.engineSHA256))throw new Error('Engine binary hash changed after queue snapshot');
 }
 if(config.pageDecisions?.length){
  if(!config.assistedReviewEvidence || !await sameHash(config.assistedReviewEvidence.path,config.assistedReviewEvidence.sha256))throw new Error('Assisted review snapshot required for exclusions');
  const review=JSON.parse(await fs.readFile(config.assistedReviewEvidence.path,'utf8'));
  if(!Array.isArray(config.pageDecisions)||config.pageDecisions.some((decision:any)=>{
   if(decision.role!=='nonmusical'||!Number.isInteger(decision.page)||decision.page<1||decision.page>config.expectedPages)return true;
   const page=review.pages?.find((item:any)=>item.pdf===config.catalogEvidence.entryPath&&item.physical_page_number===decision.page&&item.pdf_sha256===sourceSHA256);
   const expected=page?.api_verified_classification;
   return page?.api_verified_decision_status!=='verified'||expected?.decision!=='nonmusical'||expected?.sourceSHA256!==sourceSHA256
     ||expected?.originalImageSHA256!==decision.originalImageSHA256||!exact(decision,{page:decision.page,role:'nonmusical',sourceSHA256:expected.sourceSHA256,originalImageSHA256:expected.originalImageSHA256,reviewer:expected.reviewer,reason:expected.reason});
  }))throw new Error('Page exclusion lacks exact verified assisted review evidence');
 }
 // Isolated configuration: importing API modules must not read the repository .env.
 dotenv.config=()=>({parsed:{}});
 Object.assign(process.env,{
  NODE_ENV:'test',DATABASE_URL:'postgresql://disabled:disabled@127.0.0.1:1/disabled',
  SESSION_SECRET:'offline-corpus-prepared-score-validation-only',
  STORAGE_DIR:outputDir,OMR_ENGINE:'audiveris',AUDIVERIS_BIN:config.engine??'/private/tmp/corpus-audiveris-volume/Audiveris.app/Contents/MacOS/Audiveris',
  OMR_MAX_PAGES:'20',OMR_CONVERSION_TIMEOUT_MS:'900000',OMR_AUDIVERIS_TIMEOUT_MS:'300000',
  JAVA_TOOL_OPTIONS:`-Djava.awt.headless=true -Duser.home=${path.join(outputDir,'java-home')} -Djava.io.tmpdir=${path.join(outputDir,'java-work')} -Xmx2g -XX:ActiveProcessorCount=2`
 });
 await Promise.all(['java-home','java-work'].map(name=>fs.mkdir(path.join(outputDir,name),{mode:0o700})));
 const [{AudiverisOmrAdapter},{withConversionSignal}]=await Promise.all([
  import('../apps/api/src/services/OmrAdapter.js'),import('../apps/api/src/services/SubprocessRunner.js')
 ]);
 const adapter=new AudiverisOmrAdapter();
 controller=new AbortController();
 timer=setTimeout(()=>controller!.abort(new Error('Prepared unit deadline exceeded')),900000);
 for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>controller!.abort(new Error(`Prepared unit cancelled: ${signal}`)));
 const inspection=await withConversionSignal(controller.signal,()=>adapter.inspectPages(source,outputDir,{pageDecisions:config.pageDecisions}));
 if(inspection.pages.length!==config.expectedPages||inspection.sourceSHA256!==sourceSHA256)throw new Error('Prepared inspection page count or source hash mismatch');
 await write('inspection.json',inspection);
 console.log(JSON.stringify({event:'prepared_inspection',source:config.source,pages:inspection.pages.map(p=>({page:p.page,role:p.contentRole,evidence:p.classification.evidence,image:p.originalImagePath,imageSHA256:p.originalImageSHA256}))}));
 if(!process.argv.includes('--prepare-only')) {
  const result=await withConversionSignal(controller.signal,()=>adapter.convert(source,path.basename(source),outputDir,{
   preparedInspection:inspection,pageDecisions:config.pageDecisions,scoreType:config.scoreType,scoreTypeSelected:false
  }));
  const target=path.join(outputDir,'preview.musicxml');await fs.writeFile(target,result.musicXml,{mode:0o600});
  await write('validation.json',result.validation);await write('coverage.json',result.coverage);await write('evidence.json',result.evidence);
  const report={source,sourceSHA256,outputPath:target,outputSHA256:createHash('sha256').update(result.musicXml).digest('hex'),
   process:'application_prepared_unit',attemptId:config.attemptId??null,expectedPages:config.expectedPages,
   scoreType:config.scoreType,scoreTypeSelected:false,scoreTypeBasis:config.scoreTypeBasis,scoreTypeStatus:'provisional',
   selectionReasons:config.selectionReasons??[],
   unitBoundaryStatus:config.unitBoundaryStatus??'unverified',nativeInspectionEvidence:config.nativeInspectionEvidence??null,
   originalAsset:config.originalAsset??null,preparedInput:config.preparedInput??null,
   catalogEvidence:config.catalogEvidence,assistedReviewEvidence:config.assistedReviewEvidence??null,baselineEvidence:config.baselineEvidence??null,
   coverage:result.coverage,validation:result.validation,warnings:result.warnings,engine:result.engine,
   reviewWarnings:['Score type is provisional until original notation is visually confirmed.','Pitch correspondence to the source image is not verified.',
    ...(result.coverage?.unsupportedPages?.length?['Some source notation is outside the selected supported layout; the source score is not thereby invalid.']:[])],
   reviewStatus:'needs_review',accuracyVerified:false,pitchVerified:false,trainingEligible:false,finalExportApproved:false,finishedAt:new Date().toISOString()};
  await write('result.json',report);console.log(JSON.stringify({event:'prepared_conversion_finished',source,pages:result.coverage?.totalPages,issues:result.validation?.issues.length,output:target}));
 }
}catch(error) {
 const code=typeof error==='object'&&error&&'code'in error?String(error.code):'PREPARED_UNIT_FAILED';
 const report={source,sourceSHA256,process:'application_prepared_unit',attemptId:config.attemptId??null,failedAt:new Date().toISOString(),code,
  message:error instanceof Error?error.message:String(error),scoreType:config.scoreType,scoreTypeSelected:false,scoreTypeBasis:config.scoreTypeBasis??null,
  selectionReasons:config.selectionReasons??[],
  unitBoundaryStatus:config.unitBoundaryStatus??'unverified',nativeInspectionEvidence:config.nativeInspectionEvidence??null,
  scoreTypeStatus:'provisional',originalAsset:config.originalAsset??null,preparedInput:config.preparedInput??null,
  catalogEvidence:config.catalogEvidence??null,assistedReviewEvidence:config.assistedReviewEvidence??null,baselineEvidence:config.baselineEvidence??null,
  reviewStatus:'needs_review',accuracyVerified:false,pitchVerified:false,trainingEligible:false,finalExportApproved:false,
  interpretation:['OMR_PART_INTEGRITY','OMR_STAFF_INTEGRITY','OMR_PART_IDENTITY_AMBIGUOUS','OMR_UNSUPPORTED_LAYOUT'].includes(code)?'unsupported_or_unverified_layout;not_evidence_of_invalid_source_score':null};
 await write('failure.json',report);console.log(JSON.stringify({event:'prepared_conversion_failed',code,message:report.message,source}));process.exitCode=1;
}finally {if(timer)clearTimeout(timer);}
