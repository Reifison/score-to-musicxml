import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { evaluateEvents, readEvents } from '../evaluate-musicxml-reference.mjs';

export const REVIEW_SCOPES = ['written_events', 'written_music', 'complete_edition'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const signature = e => JSON.stringify([e.part,e.measure,e.voice,e.kind,e.pitch,e.onset,e.duration,e.grace,e.staff??1]);
const stableEvents = events => events.map(signature).sort();
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);

/** A decision is bound to immutable files and complete source-only ledgers, never to an OMR confidence score. */
export async function decideApproval(request, read = readFile) {
  const reasons = [];
  const sourceBytes = await read(request.source.path);
  const candidateBytes = await read(request.candidate.path);
  const sourceHash = sha(sourceBytes), candidateHash = sha(candidateBytes);
  if (sourceHash !== request.source.sha256) reasons.push('SOURCE_HASH_CHANGED');
  if (candidateHash !== request.candidate.sha256) reasons.push('CANDIDATE_HASH_CHANGED');
  if (!REVIEW_SCOPES.includes(request.scope)) reasons.push('INVALID_SCOPE');
  if (!request.source.pieceIds?.length || !request.source.pieceIds.includes(request.pieceId)) reasons.push('SOURCE_PIECE_INVENTORY_REQUIRED');
  const references = [];
  for (const reference of request.references ?? []) {
    const bytes = await read(reference.path);
    if (sha(bytes) !== reference.sha256) reasons.push('REFERENCE_HASH_CHANGED');
    references.push(JSON.parse(bytes));
  }
  if (references.length < 2) reasons.push('SECOND_SOURCE_READING_REQUIRED');
  const reviewers = references.map(r=>r.reviewer?.id);
  if (new Set(reviewers).size !== reviewers.length || reviewers.some(id=>!id)) reasons.push('REVIEWERS_NOT_DISTINCT');
  let expected;
  for (const ref of references) {
    if (ref.source?.sha256 !== sourceHash) reasons.push('REFERENCE_SOURCE_MISMATCH');
    if (!same((ref.pieces??[]).map(p=>p.id).sort(),[...(request.source.pieceIds??[])].sort())) reasons.push('SOURCE_PIECE_COVERAGE_MISMATCH');
    if (!ref.reviewer?.sourceOnly || ref.reviewer?.candidateConsultedBeforeReading) reasons.push('CIRCULAR_REFERENCE');
    if (ref.reviewer?.otherReferenceConsulted) {
      // Reconciliation after two sealed blind readings is allowed; reading a candidate to create the first reference is not.
      const initial = ref.adjudication?.initialIndependentReading;
      if (!initial?.path || !initial?.sha256 || ref.adjudication?.status !== 'source_confirmed'
        || !ref.adjudication?.resolvedFields?.length || !ref.adjudication?.sourceEvidence?.length) reasons.push('CIRCULAR_REFERENCE');
      else {
        const bytes = await read(initial.path);
        const previous = JSON.parse(bytes);
        if (sha(bytes)!==initial.sha256 || previous.source?.sha256!==sourceHash
          || previous.reviewer?.id!==ref.reviewer.id || !previous.reviewer?.sourceOnly
          || previous.reviewer?.otherReferenceConsulted || previous.reviewer?.candidateConsultedBeforeReading) reasons.push('UNVERIFIED_INITIAL_SOURCE_READING');
        for (const evidence of ref.adjudication.sourceEvidence) {
          if (!evidence.path || !evidence.sha256 || sha(await read(evidence.path))!==evidence.sha256) reasons.push('ADJUDICATION_EVIDENCE_CHANGED');
        }
      }
    }
    const coverage = ref.coverage ?? {};
    if (!coverage.allPages || !coverage.allPieces || !coverage.allWrittenParts || !coverage.allMeasures
      || !same([...(coverage.musicPages??[])].sort((a,b)=>a-b),[...request.source.musicPages].sort((a,b)=>a-b))) reasons.push('INCOMPLETE_SOURCE_COVERAGE');
    if (!Array.isArray(ref.uncertainties) || ref.uncertainties.some(u=>typeof u==='string'||!u.pieceId||u.pieceId===request.pieceId)) reasons.push('UNRESOLVED_SOURCE_AMBIGUITY');
    const piece = ref.pieces?.find(p=>p.id===request.pieceId);
    if (!piece || !(piece.events?.length > 0) || piece.events.some(e=>e.sourceStatus!=='confirmed')) {reasons.push('UNCONFIRMED_SOURCE_EVENTS');continue;}
    if (piece.events.some(e=>!e.part || !e.measure || !e.voice || !['note','rest'].includes(e.kind)
      || !(Number.isFinite(e.onset)&&e.onset>=0&&Number.isFinite(e.duration)&&e.duration>=0)
      || !Number.isSafeInteger(e.staff??1) || (e.staff??1)<1
      || (e.kind==='note'&&!/^[A-G]:-?\d+:\d+$/.test(e.pitch)))) {reasons.push('INVALID_REFERENCE_EVENT');continue;}
    if (!piece.measures?.length || piece.events.some(e=>!piece.measures.includes(e.measure))) reasons.push('INCOMPLETE_MEASURE_COVERAGE');
    if (!expected) expected=piece;
    else {
      if (!same(stableEvents(expected.events),stableEvents(piece.events)) || !same(expected.measures,piece.measures)) reasons.push('INDEPENDENT_READINGS_DISAGREE');
      if (request.scope !== 'written_events' && !same(expected.musicStructure,piece.musicStructure)) reasons.push('INDEPENDENT_STRUCTURE_READINGS_DISAGREE');
    }
    if (request.scope !== 'written_events' && (!piece.musicStructure || piece.musicStructureStatus!=='confirmed')) reasons.push('MUSIC_STRUCTURE_UNREVIEWED');
    if (request.scope==='complete_edition' && piece.textStatus!=='confirmed') reasons.push('TEXT_UNREVIEWED');
  }
  let evaluation = null;
  try {
    if (expected) {
      const expectedEvents=expected.events.map(event=>({...event,staff:event.staff??1}));
      evaluation = evaluateEvents(expectedEvents,readEvents(candidateBytes.toString('utf8'),{includeStaff:true}));
      if (evaluation.incorrect) reasons.push('WRITTEN_EVENT_DIFFERENCE');
      // A perfect event match is not a global quality grade for the score or its playback interpretation.
      for (const field of ['scoreOutOf10','accuracyPercent','errorPercent']) evaluation[field] = null;
    }
  } catch(error) {reasons.push('EVENT_EVALUATION_FAILED');}
  // Structure/text evidence must be a separately completed source-to-candidate review, not an inferred event-match.
  if (request.scope !== 'written_events') {
    const reviews=request.candidateMusicReviews??[];
    if (!reviewers.every(id=>reviews.some(r=>r.reviewerId===id && r.status==='confirmed' && r.candidateSha256===candidateHash && r.sourceSha256===sourceHash)) ) reasons.push('CANDIDATE_MUSIC_STRUCTURE_UNREVIEWED');
  }
  if (request.scope==='complete_edition') {
    const reviews=request.candidateTextReviews??[];
    if (!reviewers.every(id=>reviews.some(r=>r.reviewerId===id && r.status==='confirmed' && r.candidateSha256===candidateHash && r.sourceSha256===sourceHash))) reasons.push('CANDIDATE_TEXT_UNREVIEWED');
  }
  const approved = reasons.length === 0;
  return {schemaVersion:1,decidedAt:new Date().toISOString(),pieceId:request.pieceId,scope:request.scope,
    decision:approved?'approved':'withheld',sourceSha256:sourceHash,candidateSha256:candidateHash,
    reasons:[...new Set(reasons)],reviewerKinds:references.map(r=>r.reviewer?.kind),
    humanHomologation:approved && references.some(r=>r.reviewer?.kind==='human'),
    approvedForFinalDelivery:approved && request.scope==='complete_edition',
    approvedForTraining:false,evaluation,referenceHashes:(request.references??[]).map(r=>r.sha256)};
}
