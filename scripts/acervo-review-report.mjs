/** Rebuild the review queue without converting an unreviewed candidate into an approval. */
import {readFile,writeFile,readdir,access} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {decideApproval} from './lib/acervo-approval.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=path.resolve(root,process.argv[2]??'docs/validation/acervo-review-2026-10-07');
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const sha=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
const exists=async p=>access(p).then(()=>true,()=>false);
async function walk(dir){
 if(!await exists(dir))return [];
 const entries=await readdir(dir,{withFileTypes:true});
 return (await Promise.all(entries.map(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]))).flat();
}
const inventoryPath=path.join(base,'review-inventory.json'),inventory=await json(inventoryPath);
const scopePath=path.join(base,'review-scope.json');
const scope=await exists(scopePath)?await json(scopePath):null;
if(scope){
 if(!Number.isSafeInteger(scope.maxPhysicalPages)||scope.maxPhysicalPages<1
   ||scope.inventory?.sha256!==await sha(inventoryPath))throw Error('Review scope is not bound to the current inventory');
 for(const [kind,included]of[['includedSources',true],['excludedSources',false]]){
  const expected=inventory.pdfs.filter(p=>(p.physicalPages<=scope.maxPhysicalPages)===included)
    .map(p=>[p.sourceSHA256,p.physicalPages]).sort();
  const actual=(scope[kind]??[]).map(p=>[p.sha256,p.physicalPages]).sort();
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Review scope source/page coverage changed');
 }
}
const checkedDecisions=[];
for(const file of (await walk(path.join(base,'approvals'))).filter(p=>p.endsWith('.request.json'))){
 const request=await json(file);
 // Bind separately completed notation/text reviews to the bytes cited by the root reviewer.
 const proofErrors=[];
 for(const record of [...(request.candidateMusicReviews??[]),...(request.candidateTextReviews??[])]){
  if(!record.path||!record.proofSha256||!await exists(record.path)||await sha(record.path)!==record.proofSha256)proofErrors.push('CANDIDATE_REVIEW_PROOF_CHANGED');
 }
 let decision;
 try {decision=await decideApproval(request);}
 catch(error){decision={pieceId:request.pieceId,scope:request.scope,sourceSha256:request.source.sha256,candidateSha256:request.candidate.sha256,
  decision:'withheld',reasons:['APPROVAL_INPUT_UNAVAILABLE'],evaluation:null,approvedForFinalDelivery:false,approvedForTraining:false,humanHomologation:false};}
 if(proofErrors.length){decision.decision='withheld';decision.reasons=[...new Set([...decision.reasons,...proofErrors])];decision.approvedForFinalDelivery=false;}
 checkedDecisions.push({...decision,scopeDescription:request.scopeDescription??null,requestPath:file,requestSha256:await sha(file),
  candidatePath:request.candidate.path,requiredPieceIds:request.source.pieceIds});
}
// Keep the broadest decision for each immutable candidate; preserve all requests separately.
const scopeRank={written_events:1,written_music:2,complete_edition:3};
const perPiece=new Map();
for(const d of checkedDecisions){const key=d.sourceSha256+':'+d.pieceId;const prior=perPiece.get(key);
 if(!prior||(d.decision==='approved'&&prior.decision!=='approved')||(d.decision===prior.decision&&scopeRank[d.scope]>scopeRank[prior.scope]))perPiece.set(key,d);
}
const rejectedPath=path.join(base,'reviews/rejected-candidates.json');
const rejections=await exists(rejectedPath)?(await json(rejectedPath)).entries:[];
const rows=inventory.pdfs.map(p=>{
 const inCurrentReviewScope=!scope||p.physicalPages<=scope.maxPhysicalPages;
 const reviews=[...perPiece.values()].filter(d=>d.sourceSha256===p.sourceSHA256);
 const complete=reviews.length>0&&reviews.every(d=>d.decision==='approved'&&d.scope==='complete_edition')
  &&reviews.every(d=>d.requiredPieceIds.length===reviews.length&&d.requiredPieceIds.every(id=>reviews.some(other=>other.pieceId===id)));
 const approved=reviews.filter(d=>d.decision==='approved');
 const reasons=complete?[]:['COMPLETE_SOURCE_REVIEW_REQUIRED'];
 if(!inCurrentReviewScope)reasons.push('OUTSIDE_CURRENT_PAGE_LIMIT');
 if(!p.anyCandidatePresent)reasons.push('CANDIDATE_UNAVAILABLE');
 if(p.physicalPages>20||p.needsPageSelection)reasons.push('PIECE_AND_PAGE_SEGMENTATION_REQUIRED');
 if(reviews.some(d=>d.reasons.includes('UNRESOLVED_SOURCE_AMBIGUITY')))reasons.push('SOURCE_AMBIGUITY');
 const rejected=rejections.filter(r=>r.sourceSha256===p.sourceSHA256);
 if(rejected.length)reasons.push('REJECTED_VARIANT_REQUIRES_REPLACEMENT_OR_OTHER_VARIANT_REVIEW');
 return {caseId:p.caseId,source:p.source,sourceSha256:p.sourceSHA256,physicalPages:p.physicalPages,
  status:complete?'approved_source_edition':approved.length?'partially_approved':'not_approved',
  inCurrentReviewScope,
  allNotesAndNotationApproved:complete,allMusicPagesApproved:complete,
  reviewedPieces:reviews,approvedEvents:approved.reduce((sum,d)=>sum+(d.evaluation?.expectedEvents??0),0),
  rejectedCandidates:rejected.map(r=>({path:r.candidate,sha256:r.candidateSha256,codes:r.codes,fullNoteByNoteReview:r.fullNoteByNoteReview})),
  verifiedNonmusicalPages:p.verifiedNonmusicalPages,hasCandidate:p.anyCandidatePresent,reasons,
  humanHomologation:complete&&reviews.some(d=>d.humanHomologation),approvedForTraining:false,scoreOutOf10:null};
});
const nativePath=path.join(base,'approvals/native-written-events/decisions.json');
const native=await exists(nativePath)?await json(nativePath):{decisions:[]};
for(const d of native.decisions){
 const invalid=[];
 for(const p of d.proofs??[])if(!await exists(p.path)||await sha(p.path)!==p.sha256)invalid.push('NATIVE_REVIEW_PROOF_CHANGED');
 for(const [p,h]of[[d.candidatePath,d.candidateSha256],[d.sourceArchivePath,d.sourceArchiveSha256]])if(!await exists(p)||await sha(p)!==h)invalid.push('NATIVE_INPUT_CHANGED');
 if(invalid.length){d.decision='withheld';d.reasons=[...new Set([...d.reasons,...invalid])];}
}
const otherNativeSources=(inventory.nativeReferenceReview?.nativeSources??[])
 .filter(s=>!native.decisions.some(d=>d.sourceArchiveSha256===s.sourceSHA256))
 .map(s=>({source:s.sourcePath,sourceSha256:s.sourceSHA256,fileType:s.fileType,decision:'withheld',
  reason:inventory.nativeReferenceReview?.definitelyCircularNativeSources?.some(c=>c.sourceSHA256===s.sourceSHA256)?'CIRCULAR_AUTOMATIC_REFERENCE':'COMPLETE_INDEPENDENT_NATIVE_REVIEW_REQUIRED',
  approvedForFinalDelivery:false,approvedForTraining:false}));
const pendingAssets=(inventory.preparedAttemptsOutsideCanonicalPdfs??[]).map(a=>({originalAsset:a.originalAsset,status:'not_approved',
 reason:'COMPLETE_SOURCE_REVIEW_REQUIRED',candidateReports:a.reportPath,approvedForFinalDelivery:false,approvedForTraining:false}));
const activeRows=rows.filter(r=>r.inCurrentReviewScope);
const activeApproved=activeRows.filter(r=>r.allNotesAndNotationApproved).length;
const result={schemaVersion:1,generatedAt:new Date().toISOString(),inputInventory:{path:inventoryPath,sha256:await sha(inventoryPath)},
 currentReviewScope:{maxPhysicalPages:scope?.maxPhysicalPages??null,scopeProof:scope?{path:scopePath,sha256:await sha(scopePath)}:null,
  pdfSources:activeRows.length,physicalPages:activeRows.reduce((s,r)=>s+r.physicalPages,0),excludedPdfs:rows.length-activeRows.length,
  fullyApprovedPdfs:activeApproved,partiallyApprovedPdfs:activeRows.filter(r=>r.status==='partially_approved').length,
  remainingPdfPercent:100*(activeRows.length-activeApproved)/activeRows.length,
  allIncludedPdfEditionsApproved:activeRows.every(r=>r.allNotesAndNotationApproved)},
 policy:'Approval is attached to exact candidate bytes and stated scope. Unreviewed PDFs and source ambiguities are never promoted by XML consistency or a matching file name.',
 summary:{pdfSources:rows.length,physicalPages:rows.reduce((s,r)=>s+r.physicalPages,0),
  fullPdfEditionsApproved:rows.filter(r=>r.allNotesAndNotationApproved).length,
  partiallyApprovedPdfSources:rows.filter(r=>r.status==='partially_approved').length,
  approvedPdfTranscriptions:[...perPiece.values()].filter(d=>d.decision==='approved').length,
  approvedPdfEvents:rows.reduce((s,r)=>s+r.approvedEvents,0),
  nativeExportsEventsApproved:native.decisions.filter(d=>d.decision==='approved').length,
  nativeEventsApproved:native.decisions.filter(d=>d.decision==='approved').reduce((s,d)=>s+d.events,0),
  allPdfEditionsApproved:rows.every(r=>r.allNotesAndNotationApproved),
  entireCorpusApproved:rows.every(r=>r.allNotesAndNotationApproved)&&otherNativeSources.every(r=>r.approvedForFinalDelivery)
   &&native.decisions.every(r=>r.approvedForFinalDelivery)&&pendingAssets.every(r=>r.approvedForFinalDelivery),trainingApproved:false},
 pdfSources:rows,nativeExportDecisions:native.decisions,
 otherNativeSources,pendingAssets,
 limitations:['AI-assisted review; no human gold reference claimed','Native approvals certify supplied native event encoding, not fidelity to a paired PDF','Additional canon voices and sounding instrument performance require their own review','Global accuracy grades and model training remain unavailable']};
await writeFile(path.join(base,'approval-queue.json'),JSON.stringify(result,null,2)+'\n');
const escape=s=>String(s).replaceAll('|','\\|');
const humanStatus={approved_source_edition:'Aprovada no escopo registrado',partially_approved:'Parte aprovada; restante pendente',not_approved:'Pendente'};
const humanReason={COMPLETE_SOURCE_REVIEW_REQUIRED:'Conferir todas as notas e os símbolos da fonte',CANDIDATE_UNAVAILABLE:'Criar uma conversão revisável',
 OUTSIDE_CURRENT_PAGE_LIMIT:'Fora desta rodada por ter mais páginas que o limite autorizado',
 PIECE_AND_PAGE_SEGMENTATION_REQUIRED:'Separar obras/exercícios e conferir páginas',SOURCE_AMBIGUITY:'Resolver a ambiguidade indicada',
 REJECTED_VARIANT_REQUIRES_REPLACEMENT_OR_OTHER_VARIANT_REVIEW:'Substituir a variante rejeitada ou conferir outra'};
const queueLines=['# Conferência e aprovação do acervo','',
 'Cada aprovação corresponde à versão exata do MusicXML conferida. **A revisão do grupo autorizado ainda não está concluída.**',
 '',scope?`Escopo atual solicitado: PDFs com até ${scope.maxPhysicalPages} páginas. São ${activeRows.length} PDFs / ${result.currentReviewScope.physicalPages} páginas; ${rows.length-activeRows.length} PDFs maiores ficam fora desta rodada, com seus históricos preservados.`:'Escopo: todos os PDFs catalogados.',
 '',`Fontes: ${result.summary.pdfSources} PDFs únicos, ${result.summary.physicalPages} páginas. Edições PDF integralmente aprovadas: ${result.summary.fullPdfEditionsApproved}; fontes com aprovação parcial: ${result.summary.partiallyApprovedPdfSources}.`,
 `Transcrições de PDF aprovadas no escopo registrado: ${result.summary.approvedPdfTranscriptions}, com ${result.summary.approvedPdfEvents} notas e pausas. Exportações nativas com eventos aprovados: ${result.summary.nativeExportsEventsApproved}, com ${result.summary.nativeEventsApproved} eventos. Essas duas contagens têm fontes e escopos diferentes.`,
 '', '| PDF | Páginas | Conferência integral feita? | Estado | Pendência |','|---|---:|---|---|---|',
 ...activeRows.map(r=>`| ${escape(r.source)} | ${r.physicalPages} | ${r.allNotesAndNotationApproved?'☑ Sim':'☐ Não'} | ${humanStatus[r.status]} | ${r.reasons.map(code=>humanReason[code]??code).join('; ')||'—'} |`),
 '',`Os ${rows.length-activeRows.length} PDFs fora do limite continuam no inventário e nos dados completos; não foram anulados nem aprovados por exclusão.`,
 '', 'Referências, versões, decisões e motivos por peça: [dados completos](approval-queue.json). Nenhum arquivo foi autorizado para treinamento.'];
await writeFile(path.join(base,'APPROVAL_QUEUE.md'),queueLines.join('\n')+'\n');
console.log(JSON.stringify(result.summary));
