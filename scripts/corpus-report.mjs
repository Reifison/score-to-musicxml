/** Rebuild a factual, review-only corpus report from immutable attempts. */
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const reportDir = path.resolve(option('--report', path.join(repo, 'docs/validation/corpus-partituras-2026-10-07')));
const outputDir = path.resolve(option('--output', path.join(repo, 'output/omr/corpus-partituras-2026-10-07')));
const catalogDir = path.join(reportDir, 'catalog');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const optional = async file => { if (!file) return null; try { return await read(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
const hash = async file => { const h = createHash('sha256'); for await (const chunk of createReadStream(file)) h.update(chunk); return h.digest('hex'); };
const relative = file => path.relative(reportDir, file).split(path.sep).join('/');
const link = (label, file) => `[${label.replaceAll('[', '(').replaceAll(']', ')')}](${encodeURI(relative(file)).replaceAll('(', '%28').replaceAll(')', '%29')})`;
const csv = rows => rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n') + '\n';
const counts = items => items.reduce((all, value) => { all[value] = (all[value] ?? 0) + 1; return all; }, {});
const inventory = await read(path.join(catalogDir, 'inventory.json'));
const pageCatalog = await read(path.join(catalogDir, 'pages.json'));
const assisted = await optional(path.join(catalogDir, 'assisted_review_supplemental_v3.json')) ?? await optional(path.join(catalogDir, 'assisted_review_supplemental.json')) ?? await read(path.join(catalogDir, 'assisted_review.json'));
const assets = await optional(path.join(catalogDir, 'additional-assets.json'));
const sourceReviews = [];
const spotchecksPath = path.join(reportDir, 'cases/spotchecks/findings.json');
const spotchecks = await optional(spotchecksPath);
const nativeOperationReviewPath=path.join(reportDir,'references/native-export-operation-review.json');
const nativeOperationReview=await optional(nativeOperationReviewPath);
const failedPageReviewPath=path.join(catalogDir,'failed-page-review.json');
const failedPageReview=await optional(failedPageReviewPath);
const notationSupportReviewPath=path.join(reportDir,'cases/pozzoli/support-diagnostic.json');
const notationSupportReview=await optional(notationSupportReviewPath);
const baselineOperationDiagnosticsPath=path.join(reportDir,'references/baseline-operation-diagnostics.json');
const baselineOperationDiagnostics=await optional(baselineOperationDiagnosticsPath);
const unconvertedSupportPath=path.join(reportDir,'cases/unconverted/source-support-review.json');
const unconvertedSupport=await optional(unconvertedSupportPath);
const boundedInterruptionPath=path.join(outputDir,'bounded-retries/d2f7b31b528c4ae7/attempts/attempt-0001/operator-interruption.json');
const boundedInterruption=await optional(boundedInterruptionPath);
const ocrComparisonPath=path.join(reportDir,'cases/carinhoso/ocr-experiment.json');
const ocrComparison=await optional(ocrComparisonPath);
const ocrComparisonVerified=ocrComparison?await hash(ocrComparison.before.path).then(h=>h===ocrComparison.before.sha256).catch(()=>false)
 &&await hash(ocrComparison.after.path).then(h=>h===ocrComparison.after.sha256).catch(()=>false)
 &&await hash(ocrComparison.writtenEventComparison.referencePath).then(h=>h===ocrComparison.writtenEventComparison.referenceSHA256).catch(()=>false):false;
try {
  for (const item of await fs.readdir(path.join(reportDir, 'cases'), { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    const dir=path.join(reportDir,'cases',item.name);
    const versions=(await fs.readdir(dir)).filter(n=>/^source-patch-v\d+\.json$/.test(n)).sort((a,b)=>Number(b.match(/v(\d+)/)[1])-Number(a.match(/v(\d+)/)[1]));
    const file=path.join(dir,versions[0]??'source-patch.json');
    const review = await optional(file);
    if (!review) continue;
    const supersession=await optional(path.join(reportDir,'cases',item.name,'review-supersession.json'));
    sourceReviews.push({ ...review, reportPath: file, referenceStatus:review.referenceStatus??supersession?.status??'source_assisted_only',supersession,
      correctedHashVerified: await hash(review.outputPath).then(h => h === review.outputSHA256).catch(() => false),
      referenceHashVerified: await hash(review.referencePath).then(h => h === review.referenceSHA256).catch(() => false) });
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const unique = new Map();
for (const item of inventory.files) {
  if (item.extension !== '.pdf' || item.kind === 'non_musical_personal_admin' || !item.pages) continue;
  const list = unique.get(item.sha256) ?? []; list.push(item); unique.set(item.sha256, list);
}
const preparedReports = [];
const salvagedReports = [];
const boundedReports = [];
const nativeReports = [];
async function findPrepared(dir) {
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    if (!item.isDirectory() || ['native', 'attempts', 'java-home', 'java-work', 'home', 'work'].includes(item.name)) continue;
    const folder = path.join(dir, item.name);
    for (const name of ['result.json', 'failure.json']) {
      const file = path.join(folder, name), result = await optional(file);
      if (result?.process === 'application_prepared_unit') {
        const previewValid = result.outputPath ? await hash(result.outputPath).then(value => value === result.outputSHA256).catch(() => false) : null;
        preparedReports.push({ ...result, reportPath: file, previewHashVerified: previewValid });
      }
      if (result?.process === 'native_selected_pages') {
        const exports = [];
        for (const preview of result.exports ?? []) {
          exports.push({ ...preview, previewHashVerified: await hash(preview.path).then(h => h === preview.sha256).catch(() => false),
            validation: await optional(preview.validationPath) });
        }
        salvagedReports.push({ ...result, exports, reportPath: file });
      }
    }
    await findPrepared(folder);
  }
}
await findPrepared(outputDir);
const boundedRoot=path.join(outputDir,'bounded-retries');
const derived=[];
try{for(const file of await fs.readdir(path.join(boundedRoot,'derived-validation'))){if(file.endsWith('.json')){const p=path.join(boundedRoot,'derived-validation',file);derived.push({...await read(p),reportPath:p});}}}catch(e){if(e.code!=='ENOENT')throw e;}
try{
  for(const dir of await fs.readdir(boundedRoot,{withFileTypes:true})){
    if(!dir.isDirectory()||!/^[a-f0-9]{16}$/.test(dir.name))continue;
    const attempts=path.join(boundedRoot,dir.name,'attempts');
    for(const name of await fs.readdir(attempts)){
      if(!/^attempt-\d{4}$/.test(name))continue;
      const file=path.join(attempts,name,'result.json'),r=await optional(file);if(!r?.finishedAt||r.workflow!=='native_pdf_bounded_v1')continue;
      const digest=await hash(file),extra=derived.filter(d=>d.parentSHA256===digest).sort((a,b)=>Number(b.validationScope==='score')-Number(a.validationScope==='score'))[0],exports=[];
      for(const p of r.exports??[])exports.push({...p,previewHashVerified:await hash(p.path).then(h=>h===p.sha256).catch(()=>false),
        validation:await optional(p.validationPath??`${p.path}.validation.json`)??extra?.exports.find(e=>e.sha256===p.sha256)?.validation??null});
      boundedReports.push({...r,exports,reportPath:file,derivedValidationReport:extra?.reportPath??null});
    }
  }
}catch(e){if(e.code!=='ENOENT')throw e;}
const nativeRoot=path.join(outputDir,'native-exports');
try{for(const dir of await fs.readdir(nativeRoot,{withFileTypes:true})){
  if(!dir.isDirectory()||!/^[a-f0-9]{16}$/.test(dir.name))continue;
  for(const name of await fs.readdir(path.join(nativeRoot,dir.name))){
    if(!/^attempt-\d{4}$/.test(name))continue;
    const file=path.join(nativeRoot,dir.name,name,'result.json'),r=await optional(file);if(r?.process!=='native_score_export'||!r.finishedAt)continue;
    const exports=[];for(const p of r.exports??[])exports.push({...p,previewHashVerified:await hash(p.path).then(h=>h===p.sha256).catch(()=>false),validation:await optional(p.validationPath)});
    nativeReports.push({...r,exports,reportPath:file,knownAutomaticReference:r.sourceSHA256==='1e3aa6f150bcc2332b2abc8263c4a065eefbba46fcfd37751d824b519d63ca71'});
  }
}}catch(e){if(e.code!=='ENOENT')throw e;}
const nativeLatest = [...new Map(nativeReports.sort((a,b)=>a.reportPath.localeCompare(b.reportPath)).map(r=>[r.sourceSHA256,r])).values()];
const cases = [], issues = [], outputIntegrityFailures = [];
for (const [sha, sources] of unique) {
  const id = sha.slice(0, 16), resultPath = path.join(outputDir, id, 'result.json');
  const raw = await optional(resultPath);
  const pages = pageCatalog.pages.filter(p => p.pdf_sha256 === sha);
  const exclusions = assisted.pages.filter(p => p.source_sha256 === sha && p.api_verified_decision_status === 'verified' && p.api_verified_classification?.decision === 'nonmusical');
  const retries = preparedReports.filter(p => p.sourceSHA256 === sha);
  const salvages = salvagedReports.filter(p => p.sourceSHA256 === sha);
  const bounded = boundedReports.filter(p => p.sourceSHA256 === sha);
  const sourceReview = sourceReviews.find(p => p.sourceSHA256 === sha);
  const previews = raw?.exports ?? [];
  let rawVerifiedExportCount=0;
  for (const preview of previews) {
    const valid = await hash(preview.path).then(value => value === preview.sha256).catch(() => false);
    if (!valid) outputIntegrityFailures.push({ id, file: preview.path, code: 'PREVIEW_HASH_MISMATCH' });
    else rawVerifiedExportCount++;
  }
  const item = {
    id, source: sources[0].path, sourceSHA256: sha, aliases: sources.slice(1).map(s => s.path), physicalPages: sources[0].pages,
    baselineFinished: Boolean(raw?.finishedAt && raw.sourceSHA256 === sha),
    baselineStatus: raw?.status ?? 'queued', operationalOutcome: raw?.operationalOutcome ?? (raw ? 'legacy_unknown' : 'queued'),
    rawExportCount: previews.length, rawVerifiedExportCount,baselineReport: raw ? resultPath : null,
    verifiedNonmusicalPages: exclusions.map(p => p.physical_page_number),
    uncertainAdvisorPages: pages.filter(p => p.advisor_role === 'uncertain').map(p => p.physical_page_number),
    preparedAttempts: retries.map(p => ({ report: p.reportPath, status: p.code ? 'failed' : 'preview_present', code: p.code ?? null, previewHashVerified: p.previewHashVerified, coverage: p.coverage })),
    salvagedAttempts: salvages.map(p => ({ report: p.reportPath, status: p.status, exports: p.exports, reusedPhysicalPages: p.reusedPhysicalPages, omittedPagesNeedingReview: p.omittedPagesNeedingReview })),
    boundedAttempts: bounded.map(p=>({report:p.reportPath,status:p.status,exports:p.exports,dpi:p.dpi,selectedPhysicalPages:p.selectedPhysicalPages,excludedPhysicalPages:p.excludedPhysicalPages})),
    anyCandidatePresent: rawVerifiedExportCount > 0 || retries.some(p => p.previewHashVerified) || salvages.some(p => p.exports.some(e => e.previewHashVerified)) || bounded.some(p=>p.exports.some(e=>e.previewHashVerified)),
    needsPageSelection: sources[0].pages > 20, segmentationStatus: 'needs_review',
    sourceSupportReview:unconvertedSupport?.cases?.find(r=>r.sourceSHA256===sha)??null,
    sourceAssistedEventReview: sourceReview ? { report: sourceReview.reportPath, expectedEvents: sourceReview.before.expectedEvents,eventComparisonComplete:sourceReview.eventComparisonComplete===true, beforeIncorrect: sourceReview.before.incorrect,
      afterIncorrect: sourceReview.after.incorrect,structure:sourceReview.after, correctedHashVerified: sourceReview.correctedHashVerified, referenceHashVerified: sourceReview.referenceHashVerified,
      scope: sourceReview.eventComparisonScope, remainingReview: sourceReview.remainingReview } : null,
    fidelityStatus: sourceReview ? sourceReview.eventComparisonComplete===true?'source_assisted_written_events_only':'source_assisted_reference_under_recheck' : 'not_verified', reviewStatus: 'needs_review', trainingEligible: false, finalExportApproved: false
  };
  cases.push(item);
  for (const patch of sourceReview?.patches ?? []) issues.push({ source: item.source, sourceSHA256: sha, phase: patch.code==='OCR_TEXT_DRAFT_IMPORTED'?'ocr_text_draft':'source_visual_comparison', ...patch,
    category: patch.code==='OCR_TEXT_DRAFT_IMPORTED'?'text-recognition-review':({MISSED_REAL_TUPLET:'confirmed-rhythm',KEY_SIGNATURE_ACCIDENTAL_LOST:'confirmed-pitch',KEY_CHANGE_DISPLACED:'confirmed-key-context',SOURCE_MEASURE_OMITTED:'confirmed-coverage'}[patch.code]??'confirmed-notation'), severity: patch.code==='OCR_TEXT_DRAFT_IMPORTED'?'warning':'error', sourceConfirmed: patch.code!=='OCR_TEXT_DRAFT_IMPORTED', report: sourceReview.reportPath,
    message: `${patch.before} → ${patch.after}; corrected copy remains in review` });
  if(sourceReview?.supersededLocalCorrection)issues.push({source:item.source,sourceSHA256:sha,phase:'reference_visual_review',code:sourceReview.supersededLocalCorrection.code,category:'reference-quality',severity:'warning',sourceConfirmed:true,report:sourceReview.reportPath,message:sourceReview.supersededLocalCorrection.reason});
  for (const issue of raw?.issues ?? []) {
    const page = issue.physicalPage ?? issue.page ?? null;
    const exclusion = exclusions.find(p => p.physical_page_number === page);
    // A failed PAGE step on a visually verified cover is accounted for as a cover, not a failed music page.
    if (issue.code === 'PAGE_STAGE_NOT_REACHED' && exclusion) continue;
    issues.push({ source: item.source, sourceSHA256: sha, phase: 'native_pdf_whole', report: resultPath,
      physicalPage: page, measure: issue.measure ?? null, part: issue.partId ?? issue.part ?? null,
      sourceRole: exclusion ? 'verified_nonmusical' : page ? pages.find(p => p.physical_page_number === page)?.advisor_role ?? 'uncertain' : null,
      ...issue, sourceConfirmed:false, operationConfirmed:issue.verified===true&&['operation','preparation','environment'].includes(issue.category) });
  }
  for (const retry of retries) {
    if (retry.code) issues.push({ source: item.source, sourceSHA256: sha, phase: 'application_prepared_unit', code: retry.code, category: 'prepared-conversion', severity: 'error', report: retry.reportPath, message: retry.message, sourceConfirmed: false });
    for (const issue of retry.validation?.issues ?? []) issues.push({ source: item.source, sourceSHA256: sha, phase: 'application_prepared_unit', ...issue, category: 'xml-consistency', report: retry.reportPath, sourceConfirmed: false });
  }
}
for (const retry of preparedReports.filter(p => !unique.has(p.sourceSHA256))) {
  const source = retry.originalAsset?.path ?? retry.source;
  if (retry.code) issues.push({ source, phase: 'application_prepared_asset', code: retry.code, category: 'prepared-conversion', severity: 'error', report: retry.reportPath, sourceConfirmed: false });
  for (const issue of retry.validation?.issues ?? []) issues.push({ source, phase: 'application_prepared_asset', ...issue, category: 'xml-consistency', report: retry.reportPath, sourceConfirmed: false });
}
for (const salvage of salvagedReports) {
  for (const issue of salvage.issues ?? []) issues.push({ source: salvage.sourceRelative, sourceSHA256: salvage.sourceSHA256, phase: 'native_selected_pages', ...issue, report: salvage.reportPath, sourceConfirmed: false });
  for (const preview of salvage.exports) {
    if (!preview.previewHashVerified) outputIntegrityFailures.push({ file: preview.path, code: 'SALVAGE_PREVIEW_HASH_MISMATCH' });
    for (const issue of preview.validation?.issues ?? []) issues.push({ source: salvage.sourceRelative, sourceSHA256: salvage.sourceSHA256, phase: 'native_selected_pages', ...issue, category: 'xml-consistency', report: salvage.reportPath, sourceConfirmed: false });
  }
}
for(const retry of boundedReports){
  for(const issue of retry.issues??[])if(issue.category!=='xml-consistency')issues.push({source:retry.source,sourceSHA256:retry.sourceSHA256,phase:'native_pdf_bounded',...issue,report:retry.reportPath,sourceConfirmed:false,operationConfirmed:issue.verified===true||issue.code==='OMR_PROCESS_FAILED'});
  for(const preview of retry.exports){
    if(!preview.previewHashVerified)outputIntegrityFailures.push({file:preview.path,code:'BOUNDED_PREVIEW_HASH_MISMATCH'});
    for(const issue of preview.validation?.issues??[])issues.push({source:retry.source,sourceSHA256:retry.sourceSHA256,phase:'native_pdf_bounded',...issue,category:'xml-consistency',report:retry.reportPath,sourceConfirmed:false});
  }
}
for(const r of nativeReports){
  if(r.engineArguments?.some(a=>['-c','-m','-s'].includes(a))){
   const log=await fs.readFile(path.join(path.dirname(r.reportPath),'engine.log'),'utf8').catch(()=>null);
   if(log&&/Unknown options:.*[cms]/i.test(log))issues.push({source:r.source,sourceSHA256:r.sourceSHA256,phase:'native_score_export_diagnosis',code:'NATIVE_EXPORT_UNSUPPORTED_CLI_OPTIONS',category:'harness-operation',severity:'warning',sourceConfirmed:false,operationConfirmed:true,report:r.reportPath,message:'Historical exporter attempt used options rejected by MuseScore4 4.7.5; helper fixed and separate attempt preserved. Not a score-content defect.'});
  }
  for(const issue of r.issues??[])issues.push({source:r.source,sourceSHA256:r.sourceSHA256,phase:'native_score_export',...issue,
    code:typeof issue.code==='string'?issue.code:'NATIVE_EXPORT_PROCESS_FAILED',
    exitCode:typeof issue.code==='number'?issue.code:issue.exitCode,legacyNumericCode:typeof issue.code==='number'?issue.code:null,
    category:'native-operation',report:r.reportPath,sourceConfirmed:false,operationConfirmed:typeof issue.code==='number'||['NATIVE_EXPORT_PROCESS_FAILED','NATIVE_FORMAT_UNSUPPORTED'].includes(issue.code)});
  for(const p of r.exports){
    if(!p.previewHashVerified)outputIntegrityFailures.push({file:p.path,code:'NATIVE_PREVIEW_HASH_MISMATCH'});
    for(const issue of p.validation?.issues??[])issues.push({source:r.source,sourceSHA256:r.sourceSHA256,phase:'native_score_export',...issue,category:'xml-consistency',report:r.reportPath,sourceConfirmed:false});
  }
}
for (const p of assisted.pages.filter(p => p.api_verified_decision_status === 'conflict')) {
  issues.push({ source: p.pdf, sourceSHA256: p.source_sha256, physicalPage: p.physical_page_number,
    phase: 'page_classification', code: p.api_conflict_code, category: 'classification', severity: 'warning', sourceConfirmed: true,
    sourceRole: 'visually_nonmusical', message: 'Visual review found nonmusical content; geometric classifier conflicted. No exclusion was forced.' });
}
for (const finding of spotchecks?.cases ?? []) {
  const sourceVerified = await hash(finding.source.path).then(h => h === finding.source.sha256).catch(() => false);
  const exportVerified = await hash(finding.export.path).then(h => h === finding.export.sha256).catch(() => false);
  const confirmed = finding.classification === 'confirmed_musical_error' && sourceVerified && exportVerified;
  issues.push({ source: path.relative(inventory.summary.source_root, finding.source.path), sourceSHA256: finding.source.sha256,
    phase: 'source_visual_spotcheck', code: confirmed ? 'POLYPHONIC_TIMELINE_SERIALIZED' : 'MUSICAL_ALERT_UNRESOLVED',
    originalAlert: finding.alert.code, category: confirmed ? 'confirmed-rhythm' : 'source-review-pending', severity: confirmed ? 'error' : 'warning',
    physicalPage: finding.source.physical_page, measure: finding.alert.xml_measure, part: finding.alert.part_id,
    sourceConfirmed: confirmed, sourceHashVerified: sourceVerified, exportHashVerified: exportVerified,
    report: spotchecksPath, message: finding.comparison.expected_vs_observed, claimScope: 'Selected measure only; not full-piece accuracy.' });
}
for(const r of nativeOperationReview?.records??[])issues.push({source:r.source,sourceSHA256:r.sourceSHA256,phase:'native_score_export_diagnosis',code:'NATIVE_EXPORT_POST_WRITE_CRASH',category:'native-operation',severity:'warning',sourceConfirmed:false,operationConfirmed:true,report:nativeOperationReviewPath,message:'SIGABRT mutex exception after XML write; structural counts match native staff/parts, full musical fidelity pending.'});
for(const p of notationSupportReview?.visualEvidence??[]){
 const verified=await hash(path.join(inventory.summary.source_root,notationSupportReview.source)).then(h=>h===notationSupportReview.sourceSHA256).catch(()=>false)&&await hash(p.originalPng).then(h=>h===p.originalPngSHA256).catch(()=>false);
 if(!verified)continue;
 const code=p.role==='musical_nonstandard_rhythm_notation'?'NOTATION_WITHOUT_STAFF_UNSUPPORTED':p.role==='musical_multiple_exercises'?'MULTIPLE_EXERCISES_ON_PAGE':'MIXED_CONTENT_PAGE';
 issues.push({source:notationSupportReview.source,sourceSHA256:notationSupportReview.sourceSHA256,physicalPage:p.physicalPage,phase:'source_notation_support_review',code,category:'source-support',severity:'warning',sourceConfirmed:true,report:notationSupportReviewPath,message:p.visual});
}
for(const p of failedPageReview?.pages??[]){
 const review=p.fullResolutionReview,src=path.join(inventory.summary.source_root,p.source);
 const verified=await hash(src).then(h=>h===p.sourceSHA256).catch(()=>false)&&await hash(review.imagePath).then(h=>h===review.imageSHA256).catch(()=>false);
 if(!verified)continue;
 if(review.visualRole==='musical')issues.push({source:p.source,sourceSHA256:p.sourceSHA256,physicalPage:p.physicalPage,phase:'source_page_visual_review',code:'SOURCE_MUSIC_PAGE_NOT_RECOGNIZED',category:'confirmed-coverage',severity:'warning',sourceConfirmed:true,report:failedPageReviewPath,message:review.reason});
 if(p.manualNegativeApiValidation.errorCode==='PAGE_DECISION_CONFLICT')issues.push({source:p.source,sourceSHA256:p.sourceSHA256,physicalPage:p.physicalPage,phase:'page_classification',code:'PAGE_DECISION_CONFLICT',category:'classification',severity:'warning',sourceConfirmed:false,operationConfirmed:true,report:failedPageReviewPath,message:'Visual nonmusical proposal conflicts with detected staff geometry; retain uncertain, do not exclude.'});
}
const finished = cases.filter(c => c.baselineFinished).length;
for(const record of baselineOperationDiagnostics?.cases??[]){
 const reportPath=path.resolve(repo,record.resultPath),logPath=path.resolve(repo,record.engineLogPath);
 const verified=await hash(reportPath).then(h=>h===record.resultSHA256).catch(()=>false)&&await hash(logPath).then(h=>h===record.engineLogSHA256).catch(()=>false);
 if(!verified)continue;
 for(const signature of record.observedSignatures??[]){
  const code={staffbarline_getBounds_npe:'OMR_INTERNAL_STAFF_BARLINE_SERIALIZATION',zipfs_file_system_already_exists:'OMR_ZIPFS_ALREADY_EXISTS',sheet_structure_unmarshal_failure:'OMR_SHEET_STATE_UNMARSHAL_FAILED',slurs_builder_staff_context_npe_warning:'OMR_SLUR_STAFF_CONTEXT_WARNING',symbols_builder_staff_context_npe_warning:'OMR_SYMBOL_STAFF_CONTEXT_WARNING'}[signature.type];
  if(!code)continue;
  issues.push({source:record.source,sourceSHA256:record.sourceSHA256,phase:'baseline_operation_diagnosis',code,category:'engine-operation',severity:'warning',sourceConfirmed:false,operationConfirmed:true,
   report:baselineOperationDiagnosticsPath,message:`Observed log signature ${signature.type}; lines ${(signature.lineRefs??[]).join(',')}. Not a proven score-content defect or cause of every subsequent failure.`});
 }
}
for(const record of unconvertedSupport?.cases??[]){
 const verified=await hash(path.join(inventory.summary.source_root,record.source)).then(h=>h===record.sourceSHA256).catch(()=>false);
 const imagesVerified=(await Promise.all(record.images.map(p=>hash(p.path).then(h=>h===p.sha256).catch(()=>false)))).every(Boolean);
 if(verified&&imagesVerified)issues.push({source:record.source,sourceSHA256:record.sourceSHA256,phase:'unconverted_source_support_review',code:record.code,category:'source-support',severity:'warning',sourceConfirmed:true,operationConfirmed:false,report:unconvertedSupportPath,message:record.description});
}
const interruptedAttempt=boundedReports.find(r=>r.reportPath===boundedInterruption?.resultPath);
if(boundedInterruption&&interruptedAttempt&&await hash(boundedInterruption.resultPath).then(h=>h===boundedInterruption.resultSHA256).catch(()=>false)&&await hash(boundedInterruption.engineLogPath).then(h=>h===boundedInterruption.engineLogSHA256).catch(()=>false)){
 issues.push({source:interruptedAttempt.source,sourceSHA256:interruptedAttempt.sourceSHA256,phase:'native_pdf_bounded_diagnosis',code:'OMR_CURVES_OPERATOR_INTERRUPTION',category:'engine-operation',severity:'warning',physicalPage:boundedInterruption.stalledPhysicalPage,sourceConfirmed:false,operationConfirmed:true,signal:boundedInterruption.stopSignal,report:boundedInterruptionPath,message:`Controlled stop after ${boundedInterruption.durationSeconds}s during Curves; not a natural timeout. Original attempt/log preserved.`});
}
if(ocrComparisonVerified)issues.push({source:'Flauta/Carinhoso (com letra) - Pixinguinha.pdf',sourceSHA256:ocrComparison.sourceSHA256,
 phase:'ocr_environment_comparison',code:'OCR_TEXT_REVIEW_REQUIRED',category:'text-recognition-review',severity:'warning',sourceConfirmed:false,operationConfirmed:true,
 report:ocrComparisonPath,message:'Controlled attempt adds lyric/harmony drafts and reduces spurious expressive marks, but the same ten written-event differences remain. OCR spelling, syllable placement and chords require review.'});
const measuredCarinhoso=sourceReviews.find(r=>r.sourceSHA256==='4cf5e6657885b269c7ad6b9a6c6e073490b702d7b3cc36905a0792c22b368c1c'&&r.eventComparisonComplete===true&&r.correctedHashVerified&&r.referenceHashVerified);
const summary = {
  generatedAt: new Date().toISOString(), inventorySHA256: await hash(path.join(catalogDir, 'inventory.json')),
  physicalFiles: inventory.summary.file_count, physicalPdfs: inventory.summary.physical_pdf_count,
  physicalPdfPages: inventory.summary.physical_pdf_pages_readable,
  musicCandidatePdfFiles: inventory.summary.musical_candidate_pdf_count, musicCandidatePhysicalPages: inventory.summary.musical_candidate_pdf_pages,
  canonicalPdfCases: cases.length, canonicalPdfPages: cases.reduce((n, c) => n + c.physicalPages, 0),
  baselineFinished: finished, baselineQueuedOrRunning: cases.length - finished, baselineComplete: finished === cases.length,
  baselineStatuses: counts(cases.map(c => c.baselineStatus)), rawVerifiedExportCount: cases.reduce((n,c)=>n+c.rawVerifiedExportCount,0), rawExportCount: cases.reduce((n, c) => n + c.rawExportCount, 0),
  preparedAttemptCount: preparedReports.length, preparedSuccessCount: preparedReports.filter(p => p.outputPath && p.previewHashVerified).length,
  preparedFailureCount: preparedReports.filter(p => p.code).length,
  preparedUniqueSourcesWithCandidate: new Set(preparedReports.filter(p => p.previewHashVerified).map(p => p.originalAsset?.sha256 ?? p.sourceSHA256)).size,
  preparedPdfSourcesWithCandidate: new Set(preparedReports.filter(p => p.previewHashVerified && unique.has(p.sourceSHA256)).map(p => p.sourceSHA256)).size,
  preparedSourcesWithoutCandidate: new Set(preparedReports.filter(p => p.code && !preparedReports.some(other => other.sourceSHA256 === p.sourceSHA256 && other.previewHashVerified)).map(p => p.sourceSHA256)).size,
  salvagedAttemptCount: salvagedReports.length, salvagedExportCount: salvagedReports.reduce((n, s) => n + s.exports.filter(e => e.previewHashVerified).length, 0),
  boundedAttemptCount:boundedReports.length,boundedExportCount:boundedReports.reduce((n,r)=>n+r.exports.filter(e=>e.previewHashVerified).length,0),
  boundedExportsAwaitingConsistency:boundedReports.reduce((n,r)=>n+r.exports.filter(e=>!e.validation).length,0),
  nativeAttemptCount:nativeReports.length,nativeInputCasesFinished:nativeLatest.length,
  nativeUniqueSourcesWithCandidate:nativeLatest.filter(r=>r.exports.some(e=>e.previewHashVerified)).length,
  nativeSuccessfulOperationSources:nativeLatest.filter(r=>r.operationalOutcome==='success'&&r.method!=='existing_musicxml_copy').length,
  nativePartialOperationSources:nativeLatest.filter(r=>r.status==='raw_partial_candidate_needs_review').length,
  nativeExistingMusicXmlSources:nativeLatest.filter(r=>r.method==='existing_musicxml_copy').length,
  nativeCandidates:nativeReports.reduce((n,r)=>n+r.exports.filter(e=>e.previewHashVerified).length,0),
  nativeInputStatuses:counts(nativeLatest.map(r=>r.status)),
  canonicalPdfSourcesWithAnyCandidate: cases.filter(c => c.anyCandidatePresent).length,
  sourceAssistedCasesMeasured: sourceReviews.filter(r=>r.eventComparisonComplete===true&&r.correctedHashVerified&&r.referenceHashVerified).length,
  sourceAssistedWrittenEvents: sourceReviews.filter(r=>r.eventComparisonComplete===true&&r.correctedHashVerified&&r.referenceHashVerified).reduce((n, r) => n + r.before.expectedEvents, 0),
  confirmedIncorrectEventsInMeasuredOriginals: sourceReviews.filter(r=>r.eventComparisonComplete===true&&r.correctedHashVerified&&r.referenceHashVerified).reduce((n, r) => n + r.before.incorrect, 0),
  suspendedReviewHistoricalIncorrectEvents:sourceReviews.filter(r=>r.referenceStatus==='suspended_pending_independent_recount').reduce((n,r)=>n+r.before.incorrect,0),
  visualSpotcheckCount: spotchecks?.cases.length ?? 0,
  confirmedSpotcheckCount: issues.filter(i => i.phase === 'source_visual_spotcheck' && i.sourceConfirmed).length,
  verifiedNonmusicalMusicPages: cases.reduce((n, c) => n + c.verifiedNonmusicalPages.length, 0),
  issueCounts: counts(issues.map(i => `${i.phase}:${i.code}`)), outputIntegrityFailures,
  additionalAssets: assets?.summary ?? null,
  ocrComparison:ocrComparisonVerified?{caseCount:1,lyricEntries:ocrComparison.after.counts.lyric,harmonies:ocrComparison.after.counts.harmony,
   falsePhysicalMarksBefore:ocrComparison.before.falsePhysicalMarks,falsePhysicalMarksAfter:ocrComparison.after.falsePhysicalMarks,
   writtenEventsUnchanged:ocrComparison.controlledEvidence.writtenEventsIdentical,textAccuracyVerified:false}:null,
  fidelityMeasuredForFullCorpus: false, finalExportApproved: false, trainingEligible: false,
  scope: 'Recognition attempts and XML consistency. PAGE stage and absence of warnings do not prove note accuracy. Source-assisted comparisons are separate.'
};
await fs.writeFile(path.join(reportDir, 'results.json'), JSON.stringify({ summary, cases, preparedReports, salvagedReports, boundedReports, nativeReports, sourceReviews, spotchecks, nativeLatest, nativeOperationReview,notationSupportReview,failedPageReview,ocrComparison,ocrComparisonVerified,baselineOperationDiagnostics,unconvertedSupport,boundedInterruption,issues }, null, 2) + '\n');
await fs.writeFile(path.join(reportDir, 'cases.csv'), csv([
  ['source', 'sha256', 'physical_pages', 'baseline_finished', 'baseline_status', 'raw_exports', 'raw_verified_exports', 'verified_nonmusical_pages', 'prepared_attempts', 'salvaged_attempts', 'any_candidate_present', 'fidelity_status', 'review_status', 'report'],
  ...cases.map(c => [c.source, c.sourceSHA256, c.physicalPages, c.baselineFinished, c.baselineStatus, c.rawExportCount,c.rawVerifiedExportCount, c.verifiedNonmusicalPages.join(' '), c.preparedAttempts.length, c.salvagedAttempts.length, c.anyCandidatePresent, c.fidelityStatus, c.reviewStatus, c.baselineReport])
]));
await fs.writeFile(path.join(reportDir,'native-cases.csv'),csv([
 ['source','source_sha256','source_format','attempts','latest_status','method','operational_outcome','candidate_count','review_status','independent_reference','report'],
 ...nativeLatest.map(r=>[r.source,r.sourceSHA256,r.sourceFormat,nativeReports.filter(a=>a.sourceSHA256===r.sourceSHA256).length,r.status,r.method,r.operationalOutcome??'legacy_unknown',r.exports.filter(e=>e.previewHashVerified).length,'needs_review',false,r.reportPath])
]));
await fs.writeFile(path.join(reportDir, 'errors.csv'), csv([
  ['source', 'source_sha256', 'phase', 'code', 'category', 'severity', 'physical_page', 'measure', 'part', 'source_confirmed', 'operation_confirmed', 'exit_code', 'signal', 'message', 'report'],
  ...issues.map(i => [i.source, i.sourceSHA256, i.phase, i.code, i.category, i.severity, i.physicalPage, i.measure, i.part, i.sourceConfirmed, i.operationConfirmed??false,i.exitCode,i.signal, i.message ?? i.verification, i.report])
]));
const issueRows = Object.entries(summary.issueCounts).sort((a, b) => b[1] - a[1]).map(([code, n]) => `| ${code} | ${n} |`).join('\n');
const caseRows = cases.map(c => `| ${c.source.replaceAll('|', '\\|')} | ${c.physicalPages} | ${c.baselineFinished ? '☑ Sim' : '☐ Não'} | ${c.rawExportCount} | ${c.baselineStatus}${c.anyCandidatePresent ? '; prévia disponível' : ''} | ${c.baselineReport ? link('Registro', c.baselineReport) : 'Na fila'} |`).join('\n');
const pendingActions={
 d2f7b31b528c4ae7:'Investigar a etapa Curves na página 3 e definir uma seleção revisável; a tentativa limitada foi interrompida por controle de recursos.',
 e01d9583ea630eaf:'Separar as peças do livro de piano e reprocessar uma seleção; fronteiras editoriais ainda pendentes.',
 '1bc069cd1a4fc7d6':'Separar exercícios e escolher leitura adequada para notação rítmica sem pauta; investigar a exceção interna da página 51.',
 '4af14157004aada2':'Usar fluxo de cifras/letra; a fonte não contém melodia e duração escritas para reconstrução fiel de eventos.',
 '62c4672683807bf9':'Usar fluxo de cifras/letra e diagramas de acorde; preservar ausência de melodia e duração escritas.',
 '32bcc98acd12d263':'Ampliar suporte a duas vozes e piano e revisar as exceções de estado serializado; não reduzir a obra a uma parte.',
 '66c700feeeea0a28':'Revisar identidade/integridade das partes nas imagens antes de reprocessar; o app bloqueou a prévia por OMR_PART_INTEGRITY.'
};
await fs.writeFile(path.join(reportDir,'UNCONVERTED.md'),`# Fontes ainda sem prévia XML\n\n${cases.filter(c=>!c.anyCandidatePresent).length} PDFs tiveram tentativa encerrada e continuam sem candidato. Ausência de saída não anula a obra. [Evidência de suporte musical](cases/unconverted/source-support-review.md), [diagnóstico operacional](references/baseline-operation-diagnostics.md) e [ocorrências](errors.csv).\n\n| Fonte | Feita? Tentativa | Feita? XML disponível | Próxima atividade — Feita? ☐ Não |\n| --- | --- | --- | --- |\n${cases.filter(c=>!c.anyCandidatePresent).map(c=>`| ${c.source.replaceAll('|','\\|')} | ${c.baselineFinished?'☑ Sim':'☐ Não'} | ☐ Não | ${pendingActions[c.id]??'Conferir fonte e diagnóstico antes de definir outra tentativa.'} |`).join('\n')}\n`);
await fs.writeFile(path.join(reportDir, 'BATCH_RESULTS.md'), `# Conversão e validação do acervo\n\nAtualizado em ${summary.generatedAt}. Documento gerado a partir das tentativas preservadas; não é certificado de precisão musical.\n\nA pasta contém ${summary.physicalFiles} arquivos, ${summary.physicalPdfs} PDFs e ${summary.physicalPdfPages} páginas físicas. Após separar dois documentos administrativos e uma cópia PDF repetida, a fila tem **${cases.length} PDFs únicos / ${summary.canonicalPdfPages} páginas**. Os 14 PDFs nos ZIPs são duplicatas e não ampliam a fila. HEIC/SVG são entradas musicais adicionais, preparadas separadamente.\n\n- [${summary.baselineComplete ? 'x' : ' '}] **Feita? ${summary.baselineComplete ? 'Sim' : 'Não'} — Executar o lote completo de PDFs:** ${finished}/${cases.length} casos com tentativa final registrada; ${cases.length - finished} aguardando ou em execução.\n- [x] **Feita? Sim — Registrar decisões de página verificadas:** ${summary.verifiedNonmusicalMusicPages} capas/textos/brancos em PDFs musicais, sem descartar a obra. A identificação automática é apenas triagem; incertezas exigem revisão.\n- [x] **Feita? Sim — Validar consistência dos XMLs disponíveis:** ${summary.rawExportCount} saídas brutas até este retrato.\n- [ ] **Feita? Não — Conferir todas as notas contra as fontes:** sem referência completa independente para o acervo.\n- [ ] **Feita? Não — Aprovar todas as saídas para entrega/treinamento:** todas mantêm revisão pendente.\n\n## Como ler os resultados\n\nA primeira passagem lê os PDFs diretamente no Audiveris e preserva movimentos separados. É uma linha de base interna; a preparação de imagens do aplicativo é outra etapa e suas tentativas aparecem separadamente em results.json. Há ${summary.preparedSuccessCount} prévias preparadas com hash conferido e ${summary.preparedFailureCount} falhas preparadas registradas neste retrato.\n\nSaída bruta presente não significa documento integral, obra única ou notas corretas. O estágio PAGE do motor não comprova cobertura no XML. Livros, métodos e coleções precisam de seleção/segmentação; o limite de 20 páginas do app não identifica por si só uma coleção. Falta de leitura em capa não conta como falha de página musical confirmada. Quartetos, tablaturas e outras formações são limitações de suporte, não partituras inválidas.\n\nControles rítmicos apontam suspeitas: um alerta só se torna erro musical confirmado depois de comparação com o original. Alertas de ambiente e de fonte não são tratados como causa de toda falha. Cada caso mantém SHA da fonte, versão/parâmetros do motor, tentativas, artefatos e diagnósticos. Integridade dos previews: ${outputIntegrityFailures.length ? `${outputIntegrityFailures.length} divergências; revisar results.json` : 'os hashes das prévias MusicXML conferidas correspondem aos registros'}.\n\n## Ocorrências por etapa e tipo\n\n| Etapa:tipo | Ocorrências |\n| --- | --- |\n${issueRows}\n\nA tabela conta ocorrências diagnósticas, não notas erradas. Um caso pode ter vários avisos. O registro completo está em [errors.csv](errors.csv); casos e saídas em [cases.csv](cases.csv) e [results.json](results.json).\n\n## Casos PDF\n\n| Fonte | Páginas físicas | Feita? Tentativa | XMLs brutos | Estado | Evidência |\n| --- | --- | --- | --- | --- | --- |\n${caseRows}\n\n## Limites e próxima revisão\n\n- [ ] **Feita? Não — Resolver páginas incertas e selecionar obras nos livros.** Rótulos geométricos não equivalem a revisão editorial.\n- [ ] **Feita? Não — Homologar referências candidatas nativas.** Arquivos MSCZ/MusicXML precisam de correspondência completa; o MusicXML de Sons de Carrilhões no acervo é uma saída automática anterior, não referência independente.\n- [ ] **Feita? Não — Promover melhorias após avaliação separada por obra.** Este lote não altera o modelo automaticamente. Correções precisam de evidência, regressão e comparação em peças novas.\n`);
console.log(JSON.stringify(summary));
await fs.writeFile(path.join(reportDir, 'REPORT.md'), `# Resultado da conversão e validação\n\nAtualizado em ${summary.generatedAt}. Fontes: /Users/reifison/Downloads/partituras/. Todos os resultados são **prévias para revisão**.\n\n| Resultado | Quantidade |\n| --- | --- |\n| Arquivos catalogados | ${summary.physicalFiles} |\n| PDFs únicos na fila musical | ${summary.canonicalPdfCases} |\n| Páginas físicas desses PDFs | ${summary.canonicalPdfPages} |\n| PDFs com tentativa encerrada | ${summary.baselineFinished}/${summary.canonicalPdfCases} |\n| PDFs com pelo menos um candidato MusicXML | ${summary.canonicalPdfSourcesWithAnyCandidate} |\n| Capas/textos/brancos conferidos em PDFs musicais | ${summary.verifiedNonmusicalMusicPages} páginas |\n| Entradas HEIC/SVG musicais adicionais | 2 |\n\n**${summary.canonicalPdfCases-summary.canonicalPdfSourcesWithAnyCandidate} PDFs ainda não têm XML candidato.** O [quadro de pendências](UNCONVERTED.md) registra o motivo e a próxima atividade. Dois são cifras/letra sem melodia e duração escritas; continuam classificados como material musical.

Um candidato pode ser parcial ou conter erros. A contagem acima não significa aprovação musical nem cobertura integral. A pasta conserva os arquivos originais, e cada tentativa registra parâmetros, versão do leitor, hashes e diagnósticos. [Resultados por PDF](BATCH_RESULTS.md), [casos](cases.csv) e [registro de erros](errors.csv).\n\n## Capas e páginas de texto\n\nA exclusão exige conferência visual e correspondência dos hashes do PDF e da imagem. A página continua na contagem física, e as páginas musicais continuam elegíveis. A ausência de linhas de pauta deixa a página incerta; não a elimina automaticamente.\n\nEm Sons de Carrilhões, a página física 1 foi conferida como capa e a música foi processada na página 2 pelo fluxo do app. Em cpc_arue_arua_violao, a primeira tentativa deixou a página 2 ausente/incerta. A conferência visual mostrou que ela está em branco; uma nova tentativa preservada excluiu a capa 1 e a página em branco 2, e processou a música na página 3. As incertezas musicais da saída continuam sinalizadas.\n\n## Recuperação e conferência\n\nO fluxo preparado do app gerou candidatos em **${summary.preparedUniqueSourcesWithCandidate} fontes distintas**, sendo ${summary.preparedPdfSourcesWithCandidate} PDFs e duas imagens. Há ${summary.preparedSourcesWithoutCandidate} fontes tentadas por esse fluxo que ainda não têm candidato. O histórico preserva ${summary.preparedAttemptCount} tentativas, inclusive repetições e uma interrupção; contagem de tentativas não é contagem de obras. A recuperação de folhas já reconhecidas conservou ${summary.salvagedExportCount} fragmentos XML. Fragmentos e movimentos precisam de seleção editorial. As tentativas com resolução limitada geraram ${summary.boundedExportCount} XMLs, com ${summary.boundedExportsAwaitingConsistency} aguardando consistência.

Nos arquivos nativos, há ${summary.nativeUniqueSourcesWithCandidate}/${summary.nativeInputCasesFinished} fontes com XML candidato: ${summary.nativeExistingMusicXmlSources} são MusicXML preexistentes. ${summary.nativePartialOperationSources} conversões produziram arquivo e depois terminaram com falha; a [conferência operacional](references/native-export-operation-review.md) registra os detalhes. Nenhum nativo foi homologado como referência independente. O formato 4sc permanece sem leitor identificado.\n\n${measuredCarinhoso ? "Em [Carinhoso](cases/carinhoso/source-review-v5.md), a leitura assistida da fonte registra **43 compassos e 155 eventos**. O XML anterior tinha 42 compassos/154 eventos. A [nova cópia](cases/carinhoso/source-patch-v4.json) repõe o compasso 2, corrige a tercina e a posição da mudança de armadura, preserva as 13 ligaduras de duração, inclui tempo 60 e navegação confirmada e remove 49 símbolos ausentes na fonte. O comparativo dos 155 eventos escritos contra a referência assistida registra dez divergências no original — uma nota/compasso ausente, três durações e seis acidentes — e nenhuma na cópia atual. Isso vale dentro da referência assistida, sem homologação humana nem nota global de fidelidade. O [experimento OCR](cases/carinhoso/ocr-experiment.md) acrescentou 97 entradas de letra, 30 cifras e seis linhas de cifra em texto livre, reduzindo as marcas indevidas de 49 para 15 sem mudar os eventos musicais. A cópia atual reúne a música revisada e esse texto provisório; letra, alinhamento e cifras continuam sem homologação. Uma correção anterior de Si♭ no compasso 24 foi revertida após identificar a mudança de armadura no compasso 20; o erro da referência e todo o histórico foram preservados." : 'A conferência escrita de Carinhoso não tem evidência completa e hashes válidos neste retrato; consulte o histórico antes de emitir qualquer métrica.'}\n\nA [conferência de três alertas](cases/spotchecks/report.md) confirmou um erro local de simultaneidade das vozes em Sor e deixou dois casos inconclusivos. Os alertas automáticos de compasso longo, curto ou voz incompleta permanecem suspeitas até serem confrontados com a fonte.\n\nEm [Pozzoli](cases/pozzoli/support-diagnostic.md), há exercícios rítmicos impressos sem pauta convencional. A falta de cinco linhas é uma limitação do leitor, não motivo para excluir a música. A falha interna na página 51 e as páginas ainda não reconhecidas permanecem registradas.\n\n## Registro para melhorar o processo\n\nO [registro completo](results.json) distingue preparação, classificação de página, reconhecimento, estrutura/cobertura, consistência XML e suporte/operação. Cada ocorrência informa o que foi observado e se houve confirmação no original. O [diagnóstico operacional](references/baseline-operation-diagnostics.md) conferiu 48 logs de tentativas sem exportação: seis têm exceção em StaffBarlineInter.getBounds e sete têm FileSystemAlreadyExistsException. São assinaturas de falha do motor, sem atribuição de causa à partitura. Alertas de ambiente, como idiomas de OCR ausentes, ficam separados de erros de nota. Correções em cópias não substituem as saídas anteriores.\n\n| Atividade | Feita? |\n| --- | --- |\n| Catalogar e deduplicar as fontes | ☑ Sim |\n| Implementar exclusão interna de capa/texto com evidência | ☑ Sim |\n| Executar tentativa em todos os PDFs únicos | ${summary.baselineComplete ? '☑ Sim' : '☐ Não'} — ${summary.baselineFinished}/${summary.canonicalPdfCases} |\n| Verificar consistência dos candidatos já gerados | ☑ Sim |\n| Comparar 155 eventos escritos de Carinhoso com referência assistida | ${measuredCarinhoso?'☑ Sim — aprovação humana e fidelidade completa pendentes':'☐ Não — evidência/hash incompletos neste retrato'} |\n| Conferir todas as notas e símbolos do acervo | ☐ Não |\n| Selecionar e revisar obras/exercícios nos livros | ☐ Não |\n| Aprovar arquivos finais e referências independentes | ☐ Não |\n| Promover mudanças no leitor ou treinar novo modelo | ☐ Não |\n\nO [roadmap](../../CORPUS_CONVERSION_AND_VALIDATION_ROADMAP.md) separa execução, validação musical e melhorias do produto. Nenhuma prévia foi aprovada automaticamente, e este lote não treinou o modelo.\n`);
