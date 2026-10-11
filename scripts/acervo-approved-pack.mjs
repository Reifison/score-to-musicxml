import { createHash, randomBytes } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile as execFileCallback } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decideApproval } from './lib/acervo-approval.mjs';
import {
  compareNativeAndMusicXmlEvents,
  parseMusicXmlNativeEvents,
  parseMuseScoreNativeEvents,
} from './lib/musescore-event-reference.mjs';
import { readEvents } from './evaluate-musicxml-reference.mjs';

const execFile = promisify(execFileCallback);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
export const DEFAULT_QUEUE_PATH = path.join(REPO_ROOT, 'docs/validation/acervo-review-2026-10-07/approval-queue.json');
export const DEFAULT_CATALOG_PATH = path.join(REPO_ROOT, 'docs/validation/corpus-partituras-2026-10-07/references/native-reference-catalog.json');
export const DEFAULT_NATIVE_COMPARISON_PATH = path.join(REPO_ROOT, 'docs/validation/acervo-review-2026-10-07/reviews/native-event-comparison.json');
export const DEFAULT_NATIVE_INDEPENDENT_PATH = path.join(REPO_ROOT, 'docs/validation/acervo-review-2026-10-07/reviews/native-root-independent-check.json');
export const DEFAULT_DELIVERY_ROOT = path.join(REPO_ROOT, 'output/omr/acervo-review-2026-10-07/delivery');
export const DEFAULT_INTEGRITY_ROOT = path.join(REPO_ROOT, 'docs/validation/acervo-review-2026-10-07/reviews');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const exists = async filePath => access(filePath).then(() => true, () => false);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isHash = value => /^[a-f0-9]{64}$/.test(value ?? '');

export function assertSha256(bytes, expected, label = 'arquivo') {
  const actual = sha256(bytes);
  if (!isHash(expected) || actual !== expected) throw new Error(`${label}: SHA-256 divergente (esperado ${expected ?? 'ausente'}, atual ${actual})`);
  return actual;
}

export function selectPackageItems(queue) {
  const approved = [];
  const native = [];
  const pending = [];
  const pendingExcluded = [];
  for (const source of queue.pdfSources ?? []) {
    for (const decision of source.reviewedPieces ?? []) {
      if (decision.scope === 'complete_edition' && decision.decision === 'approved') {
        if (decision.approvedForFinalDelivery !== true || decision.approvedForTraining !== false || decision.humanHomologation !== false) {
          throw new Error(`Decisão PDF inconsistente para ${decision.pieceId}`);
        }
        approved.push({ ...decision, source: source.source, sourceSha256: source.sourceSha256 });
      }
      if (decision.decision === 'withheld') {
        if (decision.approvedForFinalDelivery !== false || decision.approvedForTraining !== false) {
          throw new Error(`Decisão retida marcada como aprovada para ${decision.pieceId}`);
        }
        const requestIsBound = typeof decision.requestPath === 'string' && /\.request\.json$/i.test(decision.requestPath)
          && isHash(decision.requestSha256) && typeof decision.candidatePath === 'string'
          && isHash(decision.candidateSha256) && isHash(decision.sourceSha256 ?? source.sourceSha256);
        if (requestIsBound) pending.push({ ...decision, source: source.source, sourceSha256: decision.sourceSha256 ?? source.sourceSha256 });
        else pendingExcluded.push({ pieceId: decision.pieceId ?? null, source: source.source ?? null, reason: 'pending_candidate_without_verified_request_binding' });
      }
    }
  }
  for (const item of queue.nativeExportDecisions ?? []) {
    if (item.decision !== 'approved' || item.scope !== 'native_written_events') continue;
    if (item.pdfApproved !== false || item.approvedForFinalDelivery !== false || item.approvedForTraining !== false
      || item.humanHomologation !== false || item.scoreOutOf10 !== null) {
      throw new Error(`Escopo de aprovação nativa inconsistente para ${item.source}`);
    }
    native.push(item);
  }
  const summaryNative = queue.summary?.nativeExportsEventsApproved;
  if (Number.isInteger(summaryNative) && summaryNative !== native.length) throw new Error(`Fila declara ${summaryNative} aprovações nativas, mas contém ${native.length}`);
  if (approved.length === 0 || native.length === 0) throw new Error('Fila sem grupos aprovados para empacotar');
  return { approved, native, pending, pendingExcluded };
}

export function assertExactArchiveEntries(actualEntries, expectedEntries) {
  const actual = [...actualEntries].sort();
  const expected = [...expectedEntries].sort();
  if (new Set(actual).size !== actual.length) throw new Error('ZIP contém nomes de entrada duplicados');
  if (!same(actual, expected)) {
    const missing = expected.filter(entry => !actual.includes(entry));
    const extra = actual.filter(entry => !expected.includes(entry));
    throw new Error(`Entradas do ZIP divergentes (faltando: ${missing.join(', ') || 'nenhuma'}; extras: ${extra.join(', ') || 'nenhuma'})`);
  }
  return true;
}

function decisionComparable(decision) {
  return {
    pieceId: decision.pieceId,
    scope: decision.scope,
    decision: decision.decision,
    sourceSha256: decision.sourceSha256,
    candidateSha256: decision.candidateSha256,
    reasons: [...(decision.reasons ?? [])].sort(),
    approvedForFinalDelivery: decision.approvedForFinalDelivery,
    approvedForTraining: decision.approvedForTraining,
    humanHomologation: decision.humanHomologation,
  };
}

export async function revalidatePdfDecision(queueDecision, { read = readFile } = {}) {
  if (!queueDecision.requestPath || !queueDecision.requestSha256 || !queueDecision.candidatePath || !queueDecision.candidateSha256) {
    throw new Error(`Pedido sem caminhos ou hashes completos: ${queueDecision.pieceId}`);
  }
  const requestBytes = await read(queueDecision.requestPath);
  assertSha256(requestBytes, queueDecision.requestSha256, `pedido ${queueDecision.pieceId}`);
  const request = JSON.parse(requestBytes.toString('utf8'));
  if (request.scope !== queueDecision.scope || request.pieceId !== queueDecision.pieceId
      || path.resolve(request.candidate?.path ?? '') !== path.resolve(queueDecision.candidatePath)
      || request.candidate?.sha256 !== queueDecision.candidateSha256
      || request.source?.sha256 !== queueDecision.sourceSha256) {
    throw new Error(`Pedido e fila não correspondem para ${queueDecision.pieceId}`);
  }
  const storedDecisionPath = queueDecision.requestPath.replace(/\.request\.json$/i, '.decision.json');
  const storedBytes = await read(storedDecisionPath);
  const storedDecision = JSON.parse(storedBytes.toString('utf8'));
  if (!same(decisionComparable(storedDecision), decisionComparable(queueDecision))) {
    throw new Error(`Decisão salva e fila não correspondem para ${queueDecision.pieceId}`);
  }
  const reviewProofGroups = [];
  if (request.scope === 'written_music' || request.scope === 'complete_edition') {
    reviewProofGroups.push(['candidateMusicReviews', 'parecer musical']);
  }
  if (request.scope === 'complete_edition') {
    reviewProofGroups.push(['candidateTextReviews', 'parecer textual']);
  }
  const candidateReviewProofs = [];
  for (const [field, label] of reviewProofGroups) {
    const reviews = request[field];
    if (!Array.isArray(reviews) || reviews.length === 0) {
      throw new Error(`${label} ausente para ${queueDecision.pieceId}`);
    }
    for (let index = 0; index < reviews.length; index++) {
      const review = reviews[index];
      if (!review?.path || !isHash(review.proofSha256)) {
        throw new Error(`${label} sem caminho ou proofSha256 para ${queueDecision.pieceId} (registro ${index + 1})`);
      }
      const proofBytes = await read(review.path);
      assertSha256(proofBytes, review.proofSha256, `${label} ${review.reviewerId ?? index + 1}`);
      candidateReviewProofs.push({ field, reviewerId: review.reviewerId ?? null, path: review.path, sha256: review.proofSha256 });
    }
  }
  const fresh = await decideApproval(request, read);
  if (!same(decisionComparable(fresh), decisionComparable(queueDecision))) {
    throw new Error(`Revalidação atual diverge da decisão registrada para ${queueDecision.pieceId}: ${fresh.reasons.join(', ') || fresh.decision}`);
  }
  return {
    requestPath: queueDecision.requestPath,
    requestSha256: queueDecision.requestSha256,
    storedDecisionPath,
    storedDecisionSha256: sha256(storedBytes),
    candidateReviewProofs,
    freshDecision: fresh,
  };
}

function safeBaseName(text, fallback) {
  const cleaned = String(text ?? fallback).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-');
  return cleaned || fallback;
}

function ensureInsideRoot(root, filePath, label) {
  const resolved = path.resolve(filePath);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error(`${label} fora do repositório: ${filePath}`);
  }
  return resolved;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function addAsset({ sourcePath, archivePath, kind, scope, label, metadata = {}, root, stageDir, fileRows }) {
  const resolved = ensureInsideRoot(root, sourcePath, label);
  const bytes = await readFile(resolved);
  const digest = sha256(bytes);
  if (kind === 'musicxml') {
    readEvents(bytes.toString('utf8'));
  } else if (kind === 'layout-preview-pdf') {
    if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error(`${label}: arquivo não tem cabeçalho PDF`);
  } else {
    throw new Error(`Tipo de arquivo não permitido: ${kind}`);
  }
  const dest = path.join(stageDir, archivePath);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, bytes, { flag: 'wx' });
  const row = { archivePath, kind, scope, label, bytes: bytes.length, sha256: digest, ...metadata };
  fileRows.push(row);
  return row;
}

async function validateNativeProofs(item, catalog, comparisonReport, independentReport, read) {
  const sourceRecord = (catalog.sources ?? []).find(source => source.sourceSha256 === item.sourceArchiveSha256);
  if (!sourceRecord || sourceRecord.sourceFileName !== item.source || sourceRecord.embeddedSha256 !== item.sourceMainSha256) {
    throw new Error(`Catálogo nativo não confirma fonte/MSCX para ${item.source}`);
  }
  if (!item.proofs || item.proofs.length !== 2) throw new Error(`Duas provas independentes são necessárias para ${item.source}`);
  const proofMap = new Map();
  for (const proof of item.proofs) {
    const bytes = await read(proof.path);
    assertSha256(bytes, proof.sha256, `prova ${path.basename(proof.path)}`);
    proofMap.set(path.basename(proof.path), JSON.parse(bytes.toString('utf8')));
  }
  const comparisonProof = proofMap.get('native-event-comparison.json');
  const independentProof = proofMap.get('native-root-independent-check.json');
  if (!comparisonProof || !independentProof) throw new Error(`Provas inesperadas para ${item.source}`);
  if (comparisonProof.approvedForFinalDelivery !== false || comparisonProof.trainingEligible !== false
      || comparisonProof.humanApproved !== false || comparisonProof.independentPdfReference !== false || comparisonProof.equivalentToPdf !== false) {
    throw new Error('Relatório nativo declara indevidamente aprovação PDF, humana ou de treino');
  }
  const proofRow = (comparisonProof.sources ?? []).find(row => row.source?.fileName === item.source);
  const independentRow = (independentProof.results ?? []).find(row => row.source === item.source);
  if (!proofRow || !independentRow || proofRow.status !== 'compared' || proofRow.comparison?.differentEventCount !== 0
      || independentRow.matches !== true || independentRow.sourceEventsComplete !== true
      || independentRow.missing?.length !== 0 || independentRow.extra?.length !== 0
      || proofRow.source?.archiveSha256 !== item.sourceArchiveSha256
      || proofRow.source?.embeddedMainSha256Expected !== item.sourceMainSha256
      || proofRow.candidate?.exportSha256Actual !== item.candidateSha256
      || independentRow.sourceSha256 !== item.sourceMainSha256
      || independentRow.candidateSha256 !== item.candidateSha256) {
    throw new Error(`Provas armazenadas não confirmam eventos completos e iguais para ${item.source}`);
  }
  const sourcePath = ensureInsideRoot(REPO_ROOT, sourceRecord.extractedMainPath, `MSCX de ${item.source}`);
  const candidatePath = ensureInsideRoot(REPO_ROOT, item.candidatePath, `MusicXML de ${item.source}`);
  const [sourceBytes, candidateBytes] = await Promise.all([read(sourcePath), read(candidatePath)]);
  assertSha256(sourceBytes, item.sourceMainSha256, `MSCX extraído ${item.source}`);
  assertSha256(candidateBytes, item.candidateSha256, `exportação ${item.source}`);
  const source = parseMuseScoreNativeEvents(sourceBytes.toString('utf8'));
  const candidate = parseMusicXmlNativeEvents(candidateBytes.toString('utf8'));
  const compared = compareNativeAndMusicXmlEvents(source, candidate);
  const sourceEventCount = source.noteCount + source.restCount;
  const candidateEventCount = candidate.noteCount + candidate.restCount;
  if (compared.status !== 'compared' || compared.comparison?.differentEventCount !== 0
      || compared.unsupported?.length !== 0 || source.unsupported?.length !== 0 || candidate.unsupported?.length !== 0
      || sourceEventCount !== item.events || candidateEventCount !== item.events
      || source.eventCount !== item.nativeEventGroups || candidate.eventCount !== item.nativeEventGroups) {
    throw new Error(`Comparação nativa atual não fecha sem recursos pendentes para ${item.source}`);
  }
  return {
    sourceMainSha256: sourceRecord.embeddedSha256,
    sourceEventCount,
    eventGroups: source.eventCount,
    candidateSha256: item.candidateSha256,
    proofSha256: item.proofs.map(proof => ({ path: proof.path, sha256: proof.sha256 })),
    comparison: compared.comparison,
  };
}

function readmeText(manifest) {
  const approvedCount = manifest.groups.aprovadosDaPartitura.items.length;
  const nativeCount = manifest.groups.eventosNativosConferidos.items.length;
  const pendingCount = manifest.groups.previasPendentes.items.length;
  const pendingDetails = pendingCount === 0
    ? 'Não há prévias pendentes com candidato e pedido verificáveis nesta fila.'
    : `As prévias abaixo permanecem retidas segundo as decisões e razões registradas:\n\n${manifest.groups.previasPendentes.items.map(item => `- **${item.label}** — ${item.reasons?.join(', ') || 'decisão retida'}; incluída somente como prévia pendente.`).join('\n')}`;
  const editionStatus = manifest.status.allPdfEditionsApproved ? 'Todas as edições PDF estão aprovadas na fila.' : 'Nem todas as edições PDF estão aprovadas na fila.';
  const corpusStatus = manifest.status.entireCorpusApproved ? 'O acervo completo está aprovado na fila.' : 'O acervo completo não está aprovado na fila.';
  return `# Entrega do acervo — revisão de 7 de outubro de 2026\n\n`+
    `Este snapshot contém ${approvedCount} transcrições MusicXML cuja edição completa foi aprovada, ${nativeCount} exportações comparadas com a codificação de eventos dos arquivos nativos MuseScore e ${pendingCount} prévia(s) pendente(s). A identidade desta versão é o SHA-256 da fila: \`${manifest.snapshot.queueSha256}\`.\n\n`+
    `## Aprovados da partitura\n\n`+
    `Os XMLs deste grupo têm decisão atual de escopo \`complete_edition\`, revalidada pelos pedidos, referências, hashes e gate de aprovação. Os PDFs incluídos ao lado são prévias de layout geradas a partir desses XMLs; não são fac-símiles nem provas independentes da partitura. A aprovação é assistida por IA e não declara homologação humana.\n\n`+
    `## Eventos nativos conferidos\n\n`+
    `Cada XML deste grupo foi comparado com o MSCX principal extraído do respectivo MSCZ, após confirmar seus hashes, e passou por uma segunda verificação independente. O escopo cobre os eventos escritos suportados pelo parser. Esses itens não têm aprovação de PDF, notação completa, navegação ou execução sonora; não são referências gold.\n\n`+
    `## Prévias pendentes\n\n`+
    `${pendingDetails}\n\n`+
    `${editionStatus} ${corpusStatus} Não há aprovação para treino nesta entrega. Veja \`manifest.json\` para os hashes, escopos e evidências.\n`;
}

async function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tempPath, json(value), { flag: 'wx' });
  await rename(tempPath, filePath);
}

async function listFiles(rootDir, relativeDir = '') {
  const entries = await readdir(path.join(rootDir, relativeDir), { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const rel = path.posix.join(relativeDir.split(path.sep).join(path.posix.sep), entry.name).replace(/^\.?\/$/, '');
    if (entry.isDirectory()) out.push(...await listFiles(rootDir, rel.split(path.posix.sep).join(path.sep)));
    else if (entry.isFile()) out.push(rel);
    else throw new Error(`Entrada especial no pacote: ${rel}`);
  }
  return out.sort();
}

async function createSnapshotDirectory(deliveryRoot, queueSha, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', 'Z');
  const snapshots = path.join(deliveryRoot, 'snapshots');
  await mkdir(snapshots, { recursive: true });
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = `snapshot-${queueSha}-${stamp}-${randomBytes(3).toString('hex')}`;
    const dir = path.join(snapshots, id);
    try { await mkdir(dir); return { id, dir }; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  throw new Error('Não foi possível alocar um diretório de snapshot exclusivo');
}

export async function buildApprovedPack({
  repoRoot = REPO_ROOT,
  queuePath = path.join(repoRoot, path.relative(REPO_ROOT, DEFAULT_QUEUE_PATH)),
  catalogPath = path.join(repoRoot, path.relative(REPO_ROOT, DEFAULT_CATALOG_PATH)),
  nativeComparisonPath = path.join(repoRoot, path.relative(REPO_ROOT, DEFAULT_NATIVE_COMPARISON_PATH)),
  nativeIndependentPath = path.join(repoRoot, path.relative(REPO_ROOT, DEFAULT_NATIVE_INDEPENDENT_PATH)),
  deliveryRoot = path.join(repoRoot, path.relative(REPO_ROOT, DEFAULT_DELIVERY_ROOT)),
  integrityRoot = path.join(repoRoot, path.relative(REPO_ROOT, DEFAULT_INTEGRITY_ROOT)),
  read = readFile,
  now = new Date(),
} = {}) {
  const queueBytes = await read(queuePath);
  const queueSha = sha256(queueBytes);
  const queue = JSON.parse(queueBytes.toString('utf8'));
  const selected = selectPackageItems(queue);
  const catalog = await readJson(catalogPath);
  const nativeComparison = await readJson(nativeComparisonPath);
  const nativeIndependent = await readJson(nativeIndependentPath);
  const snapshot = await createSnapshotDirectory(deliveryRoot, queueSha, now);
  const stage = await mkdtemp(path.join(os.tmpdir(), 'acervo-approved-pack-'));
  const fileRows = [];
  const groups = {
    aprovadosDaPartitura: { title: 'Aprovados da partitura', items: [] },
    eventosNativosConferidos: { title: 'Eventos nativos conferidos', items: [] },
    previasPendentes: { title: 'Prévias pendentes', items: [] },
  };
  const validations = { pdfDecisions: [], nativeComparisons: [], pendingExcluded: [...selected.pendingExcluded], queueSha256: queueSha };
  let integrityPath = null;
  let indexCommitted = false;
  try {
    for (const decision of selected.approved) {
      const fresh = await revalidatePdfDecision(decision, { read });
      const xmlPath = ensureInsideRoot(repoRoot, decision.candidatePath, `XML ${decision.pieceId}`);
      const base = safeBaseName(decision.pieceId, 'partitura');
      const xmlArchivePath = `aprovados-da-partitura/${base}.musicxml`;
      const previewPath = xmlPath.replace(/\.musicxml$/i, '.pdf');
      if (previewPath === xmlPath || !(await exists(previewPath))) throw new Error(`Prévia de layout não encontrada para ${decision.pieceId}`);
      const xml = await addAsset({ sourcePath: xmlPath, archivePath: xmlArchivePath, kind: 'musicxml', scope: decision.scope, label: decision.pieceId, metadata: { source: decision.source, sourceSha256: decision.sourceSha256, candidateSha256: decision.candidateSha256 }, root: repoRoot, stageDir: stage, fileRows });
      if (xml.sha256 !== decision.candidateSha256) throw new Error(`SHA do XML diverge para ${decision.pieceId}`);
      const pdf = await addAsset({ sourcePath: previewPath, archivePath: `aprovados-da-partitura/previas-de-layout/${base}.pdf`, kind: 'layout-preview-pdf', scope: 'layout_preview_only', label: `Prévia de layout: ${decision.pieceId}`, metadata: { derivedFromMusicXmlSha256: xml.sha256 }, root: repoRoot, stageDir: stage, fileRows });
      groups.aprovadosDaPartitura.items.push({ pieceId: decision.pieceId, scope: decision.scope, source: decision.source, candidateSha256: xml.sha256, musicxml: xml.archivePath, layoutPreviewPdf: pdf.archivePath, decision: 'approved', humanHomologation: false, approvedForTraining: false });
      validations.pdfDecisions.push({ pieceId: decision.pieceId, decision: fresh.freshDecision.decision, scope: fresh.freshDecision.scope, requestSha256: fresh.requestSha256, storedDecisionSha256: fresh.storedDecisionSha256, candidateSha256: fresh.freshDecision.candidateSha256, candidateReviewProofs: fresh.candidateReviewProofs, reasons: fresh.freshDecision.reasons });
    }

    for (const item of selected.native) {
      const proofValidation = await validateNativeProofs(item, catalog, nativeComparison, nativeIndependent, read);
      const candidatePath = ensureInsideRoot(repoRoot, item.candidatePath, `XML nativo ${item.source}`);
      const base = safeBaseName(path.basename(item.source).replace(/\.mscz$/i, ''), 'exportacao-nativa');
      const asset = await addAsset({ sourcePath: candidatePath, archivePath: `eventos-nativos-conferidos/${base}.musicxml`, kind: 'musicxml', scope: item.scope, label: item.source, metadata: { candidateSha256: item.candidateSha256, sourceArchiveSha256: item.sourceArchiveSha256, sourceMainSha256: item.sourceMainSha256 }, root: repoRoot, stageDir: stage, fileRows });
      if (asset.sha256 !== item.candidateSha256) throw new Error(`SHA do XML nativo diverge para ${item.source}`);
      groups.eventosNativosConferidos.items.push({ source: item.source, sourceArchiveSha256: item.sourceArchiveSha256, sourceMainSha256: item.sourceMainSha256, events: item.events, eventGroups: item.nativeEventGroups, musicxml: asset.archivePath, candidateSha256: asset.sha256, decision: 'approved_for_native_written_events_only', pdfApproved: false, completeNotationApproved: false, humanHomologation: false, approvedForTraining: false });
      validations.nativeComparisons.push({ source: item.source, ...proofValidation });
    }

    for (const decision of selected.pending) {
      const xmlPath = ensureInsideRoot(repoRoot, decision.candidatePath, `XML pendente ${decision.pieceId}`);
      if (!(await exists(xmlPath))) {
        validations.pendingExcluded.push({ pieceId: decision.pieceId, source: decision.source, reason: 'candidate_file_missing' });
        continue;
      }
      const fresh = await revalidatePdfDecision(decision, { read });
      if (fresh.freshDecision.decision !== 'withheld') throw new Error(`Decisão retida passou a aprovada para ${decision.pieceId}; atualize a fila antes da entrega`);
      const base = `${safeBaseName(decision.pieceId, 'pendente')}-${decision.sourceSha256.slice(0, 8)}-${decision.candidateSha256.slice(0, 8)}`;
      const label = decision.scopeDescription ?? `${decision.source} — ${decision.pieceId}`;
      const xmlArchivePath = `previas-pendentes/${base}.musicxml`;
      const previewPath = xmlPath.replace(/\.musicxml$/i, '.pdf');
      const xml = await addAsset({ sourcePath: xmlPath, archivePath: xmlArchivePath, kind: 'musicxml', scope: 'pending_preview', label, metadata: { source: decision.source, candidateSha256: decision.candidateSha256, pieceId: decision.pieceId, reasons: fresh.freshDecision.reasons }, root: repoRoot, stageDir: stage, fileRows });
      if (xml.sha256 !== decision.candidateSha256) throw new Error(`SHA do XML pendente diverge para ${decision.pieceId}`);
      if (await exists(previewPath)) {
        const pdf = await addAsset({ sourcePath: previewPath, archivePath: `previas-pendentes/${base}-preview.pdf`, kind: 'layout-preview-pdf', scope: 'pending_preview_only', label: `Prévia de layout: ${label}`, metadata: { derivedFromMusicXmlSha256: xml.sha256 }, root: repoRoot, stageDir: stage, fileRows });
        groups.previasPendentes.items.push({ pieceId: decision.pieceId, label, scope: decision.scope, decision: 'withheld', reasons: fresh.freshDecision.reasons, musicxml: xml.archivePath, layoutPreviewPdf: pdf.archivePath, candidateSha256: xml.sha256 });
      } else {
        groups.previasPendentes.items.push({ pieceId: decision.pieceId, label, scope: decision.scope, decision: 'withheld', reasons: fresh.freshDecision.reasons, musicxml: xml.archivePath, candidateSha256: xml.sha256 });
      }
      validations.pdfDecisions.push({ pieceId: decision.pieceId, decision: fresh.freshDecision.decision, scope: fresh.freshDecision.scope, requestSha256: fresh.requestSha256, storedDecisionSha256: fresh.storedDecisionSha256, candidateSha256: fresh.freshDecision.candidateSha256, candidateReviewProofs: fresh.candidateReviewProofs, reasons: fresh.freshDecision.reasons });
    }

    const manifest = {
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      snapshot: { queuePath: path.relative(repoRoot, queuePath), queueSha256: queueSha, queueGeneratedAt: queue.generatedAt },
      status: { allPdfEditionsApproved: queue.summary?.allPdfEditionsApproved === true, entireCorpusApproved: queue.summary?.entireCorpusApproved === true, approvedForTraining: false, humanHomologation: false },
      groups,
      files: fileRows,
      limitations: [
        `${groups.eventosNativosConferidos.items.length} itens nativos representam comparações da codificação de eventos do MSCX com MusicXML; não atestam equivalência com PDF ou notação completa.`,
        'Os PDFs incluídos são prévias de layout geradas dos MusicXML, não fac-símiles nem provas independentes.',
        'Cada item pendente permanece retido pelas razões do seu pedido; consistência entre XMLs não converte decisão retida em aprovação.',
        'Não há nota global, homologação humana ou aprovação para treino nesta entrega.',
      ],
    };
    const readme = readmeText(manifest);
    await writeFile(path.join(stage, 'README.md'), readme, { flag: 'wx' });
    await writeFile(path.join(stage, 'manifest.json'), json(manifest), { flag: 'wx' });
    const stageFiles = await listFiles(stage);
    const archivePath = path.join(snapshot.dir, 'acervo-approved-pack.zip');
    await execFile('zip', ['-q', '-X', archivePath, ...stageFiles], { cwd: stage, maxBuffer: 8 * 1024 * 1024 });
    await execFile('unzip', ['-tqq', archivePath], { maxBuffer: 2 * 1024 * 1024 });
    const { stdout: memberOutput } = await execFile('unzip', ['-Z1', archivePath], { maxBuffer: 2 * 1024 * 1024 });
    const archiveEntries = memberOutput.trim().split(/\r?\n/).filter(Boolean).sort();
    assertExactArchiveEntries(archiveEntries, stageFiles);
    const extractDir = await mkdtemp(path.join(os.tmpdir(), 'acervo-approved-unzip-'));
    let extractedRows;
    let extractedManifestSha256;
    try {
      await execFile('unzip', ['-qq', archivePath, '-d', extractDir], { maxBuffer: 2 * 1024 * 1024 });
      const extractedFiles = await listFiles(extractDir);
      assertExactArchiveEntries(extractedFiles, stageFiles);
      extractedRows = [];
      for (const row of fileRows) {
        const bytes = await readFile(path.join(extractDir, row.archivePath));
        assertSha256(bytes, row.sha256, `conteúdo extraído ${row.archivePath}`);
        extractedRows.push({ path: row.archivePath, bytes: bytes.length, sha256: sha256(bytes) });
      }
      for (const docName of ['README.md', 'manifest.json']) {
        const sourceBytes = await readFile(path.join(stage, docName));
        const archiveBytes = await readFile(path.join(extractDir, docName));
        assertSha256(archiveBytes, sha256(sourceBytes), `documento extraído ${docName}`);
        if (docName === 'manifest.json') extractedManifestSha256 = sha256(archiveBytes);
      }
    } finally { await rm(extractDir, { recursive: true, force: true }); }
    const archiveBytes = await readFile(archivePath);
    const integrity = {
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      snapshotId: snapshot.id,
      queueSha256: queueSha,
      archive: { path: path.relative(repoRoot, archivePath), bytes: archiveBytes.length, sha256: sha256(archiveBytes), crcTest: 'passed', expectedEntries: stageFiles, actualEntries: archiveEntries, exactEntrySet: true },
      contentVerification: { verifiedFiles: extractedRows, manifestSha256: extractedManifestSha256 },
      counts: { approvedScoreTranscriptions: groups.aprovadosDaPartitura.items.length, nativeEventExports: groups.eventosNativosConferidos.items.length, pendingPreviews: groups.previasPendentes.items.length, includedFiles: stageFiles.length },
      validation: validations,
    };
    await mkdir(integrityRoot, { recursive: true });
    integrityPath = path.join(integrityRoot, `delivery-integrity-${queueSha}-${snapshot.id.slice(-6)}.json`);
    await writeFile(integrityPath, json(integrity), { flag: 'wx' });

    const publicSnapshot = { id: snapshot.id, queueSha256: queueSha, archive: path.relative(deliveryRoot, archivePath), archiveSha256: integrity.archive.sha256, generatedAt: now.toISOString(), counts: integrity.counts, integrityReport: path.relative(repoRoot, integrityPath) };
    const indexPath = path.join(deliveryRoot, 'index.json');
    let index = { schemaVersion: 1, snapshots: [] };
    if (await exists(indexPath)) index = await readJson(indexPath);
    if (!Array.isArray(index.snapshots)) throw new Error('Índice de entrega inválido');
    index.snapshots.push(publicSnapshot);
    index.latestSnapshot = snapshot.id;
    await writeJsonAtomic(indexPath, index);
    indexCommitted = true;
    const topReadme = `# Pacotes de entrega do acervo\n\nÚltimo snapshot: \`${snapshot.id}\` (fila SHA-256 \`${queueSha}\`).\n\n- Aprovados da partitura: ${integrity.counts.approvedScoreTranscriptions}\n- Eventos nativos conferidos: ${integrity.counts.nativeEventExports}\n- Prévias pendentes: ${integrity.counts.pendingPreviews}\n\nCada snapshot preserva seu próprio ZIP, manifesto e README. Os escopos e limites constam no manifesto dentro do pacote.\n`;
    await writeFile(path.join(deliveryRoot, 'README.md'), topReadme);
    await writeFile(path.join(snapshot.dir, 'manifest.json'), json(manifest), { flag: 'wx' });
    await writeFile(path.join(snapshot.dir, 'README.md'), readme, { flag: 'wx' });
    return { snapshotId: snapshot.id, archivePath, archiveSha256: integrity.archive.sha256, integrityPath, indexPath, counts: integrity.counts, queueSha256: queueSha };
  } catch (error) {
    if (!indexCommitted) {
      await rm(snapshot.dir, { recursive: true, force: true });
      if (integrityPath) await rm(integrityPath, { force: true });
    }
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write('Uso: node scripts/acervo-approved-pack.mjs\nCria um ZIP em um snapshot novo, revalida pedidos e provas e grava o relatório de integridade.\n');
  } else {
    buildApprovedPack().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => {
      process.stderr.write(`${error.stack ?? error}\n`);
      process.exitCode = 1;
    });
  }
}
