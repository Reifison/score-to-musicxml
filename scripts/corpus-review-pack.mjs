#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_REL = path.join('output', 'omr', 'corpus-partituras-2026-10-07');
const RESULTS_REL = path.join('docs', 'validation', 'corpus-partituras-2026-10-07', 'results.json');
const MAX_XML_BYTES = 32 * 1024 * 1024;
const PACK_VERSION = 4;

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const cleanText = (value) => typeof value === 'string' ? value.trim() : '';
const asArray = (value) => Array.isArray(value) ? value : [];
const toPosIntArray = (value) => [...new Set(asArray(value).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
const isSha256 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);

export function slug(value, fallback = 'score', limit = 48) {
  const normalized = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, limit)
    .replace(/-+$/g, '');
  return normalized || fallback;
}

function isWithin(parent, candidate) {
  const rel = path.relative(path.resolve(parent), path.resolve(candidate));
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

function localPath(rootDir, inputPath) {
  if (typeof inputPath !== 'string' || !inputPath) return null;
  return path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(rootDir, inputPath);
}

function displaySource(source, sourceRelative) {
  const value = cleanText(sourceRelative) || cleanText(source) || '(origem sem nome)';
  const normalized = value.split(path.sep).join('/');
  const idx = normalized.toLowerCase().lastIndexOf('/partituras/');
  if (idx >= 0) return normalized.slice(idx + '/partituras/'.length);
  if (path.isAbsolute(value)) return path.basename(value);
  return normalized.replace(/^\.\//, '');
}

function sourceTitle(source) {
  const display = displaySource(source);
  return path.basename(display).replace(/\.(pdf|musicxml|mxl|xml|heic|heif|svg|png|jpe?g|tiff?)$/i, '') || 'score';
}

function movementLabel(exportRow, outputPath, index) {
  const labels = [exportRow?.movementTitle, exportRow?.movement, exportRow?.title, exportRow?.label, exportRow?.displayName, exportRow?.name];
  for (const item of labels) {
    const value = typeof item === 'string' ? item : item && typeof item === 'object' ? (item.title ?? item.name) : '';
    if (cleanText(value)) return cleanText(value);
  }
  const basename = path.basename(outputPath ?? '', path.extname(outputPath ?? ''));
  if (basename && !/^preview(?:[-_ ]?\d+)?$/i.test(basename) && !/^movement(?:[-_ ]?\d+)?$/i.test(basename)) return basename;
  return `export-${String(index).padStart(2, '0')}`;
}

function normalizePages({ record, exportRow, method }) {
  const pagesTotal = Number.isInteger(record?.physicalPages) ? record.physicalPages : Number.isInteger(record?.coverage?.totalPages) ? record.coverage.totalPages : null;
  const mappingVerified = exportRow?.pageMappingVerified === true || record?.pageMappingVerified === true;
  let known = [];
  let reportedMissing = [];
  const verifiedNonmusical = toPosIntArray(record?.verifiedNonmusicalOmittedPages ?? record?.verifiedNonmusicalPages);
  if (method === 'raw_baseline' || method.startsWith('bounded_')) {
    known = toPosIntArray(exportRow?.sourcePhysicalPages ?? exportRow?.physicalPages);
  } else if (method === 'native_selected_pages') {
    known = toPosIntArray(exportRow?.sourcePhysicalPages ?? record?.reusedPhysicalPages);
    reportedMissing = toPosIntArray(exportRow?.omittedPhysicalPages ?? record?.omittedPhysicalPages);
  } else if (record?.coverage && typeof record.coverage === 'object') {
    known = toPosIntArray(exportRow?.sourcePhysicalPages ?? record.coverage.processedPages);
    reportedMissing = toPosIntArray(record.coverage.missingPages);
  } else if (Array.isArray(record?.physicalPagesKnown)) {
    known = toPosIntArray(record.physicalPagesKnown);
    reportedMissing = toPosIntArray(record.physicalPagesMissing);
  }
  const verifiedNonmusicalSet = new Set(verifiedNonmusical);
  reportedMissing = reportedMissing.filter((page) => !verifiedNonmusicalSet.has(page));

  let physicalPagesKnown = mappingVerified ? known : [];
  let physicalPagesMissing = mappingVerified ? reportedMissing : [];
  if (mappingVerified && pagesTotal && known.length && !reportedMissing.length) {
    const knownSet = new Set(known);
    for (const page of verifiedNonmusical) knownSet.add(page);
    physicalPagesMissing = Array.from({ length: pagesTotal }, (_, i) => i + 1).filter((page) => !knownSet.has(page));
  }
  return {
    physicalPageMappingVerified: mappingVerified,
    physicalPagesKnown,
    physicalPagesMissing,
    physicalPagesReported: known,
    physicalPagesReportedMissing: reportedMissing,
    physicalPagesVerifiedNonmusicalOmitted: verifiedNonmusical,
    physicalPageCountKnown: pagesTotal,
  };
}

function reportMethod(record, fallback) {
  const processName = cleanText(record?.process) || cleanText(record?.workflow) || fallback;
  if (fallback === 'native_score_export') return cleanText(record?.method) || 'native_score_export';
  if (fallback === 'raw_baseline' || /raw.*baseline/i.test(processName)) return 'raw_baseline';
  if (fallback === 'prepared' || /prepared/i.test(processName)) return 'prepared';
  if (fallback === 'native_selected_pages' || /native_selected_pages/i.test(processName)) return 'native_selected_pages';
  if (fallback === 'source_reviewed' || /source_assisted_copy/i.test(processName)) return 'source_reviewed';
  return slug(processName, fallback, 48).replace(/-/g, '_');
}

async function readJsonWithin(rootDir, corpusRoot, filePath) {
  const absolute = localPath(rootDir, filePath);
  if (!absolute || !isWithin(corpusRoot, absolute)) throw new Error(`Caminho de relatório fora da raiz autorizada: ${filePath}`);
  const raw = await fs.readFile(absolute);
  return { absolute, value: JSON.parse(raw.toString('utf8')) };
}

function makeArtifact({ record, exportRow, source, sourceRelative, sourceSHA, method, reportPath, ordinal, pendingReason, nativeMetadata = null }) {
  const originalAsset = record?.originalAsset && typeof record.originalAsset === 'object' ? record.originalAsset : null;
  const hasOriginalAssetPath = Boolean(cleanText(originalAsset?.path));
  const identitySource = hasOriginalAssetPath ? originalAsset.path : source ?? record?.source ?? null;
  const identitySourceSHA = hasOriginalAssetPath ? originalAsset.sha256 ?? null : sourceSHA ?? record?.sourceSHA256 ?? null;
  const originalPath = cleanText(exportRow?.path) || cleanText(exportRow?.outputPath) || cleanText(record?.outputPath) || null;
  const expectedSHA = cleanText(exportRow?.sha256) || cleanText(exportRow?.outputSHA256) || cleanText(record?.outputSHA256) || null;
  const title = movementLabel(exportRow, originalPath, ordinal);
  const pages = nativeMetadata ? {
    physicalPageMappingVerified: false,
    physicalPagesKnown: [],
    physicalPagesMissing: [],
    physicalPagesReported: [],
    physicalPagesReportedMissing: [],
    physicalPagesVerifiedNonmusicalOmitted: [],
    physicalPageCountKnown: null,
  } : normalizePages({ record, exportRow, method });
  const explicitlyApproved = exportRow?.finalExportApproved === true || record?.finalExportApproved === true ||
    ['approved', 'final', 'final_approved'].includes(String(exportRow?.reviewStatus ?? record?.reviewStatus ?? '').toLowerCase());
  const sourceReviewMetadata = method === 'source_reviewed' ? {
    eventComparisonScope: cleanText(record?.eventComparisonScope) || null,
    referenceStatus: cleanText(record?.referenceStatus) || null,
    textReviewStatus: cleanText(record?.textReviewStatus) || null,
    textAccuracyVerified: record?.textAccuracyVerified === true,
    remainingReview: asArray(record?.remainingReview),
  } : {};
  return {
    artifactId: null,
    source: identitySource,
    sourceDisplay: displaySource(identitySource, hasOriginalAssetPath ? null : sourceRelative ?? record?.sourceRelative),
    sourceSHA: identitySourceSHA,
    sourceKind: nativeMetadata ? 'native_score_input' : null,
    sourceFormat: nativeMetadata?.sourceFormat ?? null,
    sourceIdentity: nativeMetadata ? {
      source: identitySource,
      display: displaySource(identitySource, sourceRelative ?? record?.sourceRelative),
      sha256: isSha256(identitySourceSHA) ? identitySourceSHA.toLowerCase() : null,
      hashStatus: isSha256(identitySourceSHA) ? 'valid_sha256_format_only' : 'invalid_or_missing',
    } : null,
    nativeAttemptId: nativeMetadata?.nativeAttemptId ?? null,
    referenceIndependence: nativeMetadata ? 'unknown' : null,
    isGoldReference: nativeMetadata ? false : null,
    operationalOutcome: nativeMetadata?.operationalOutcome ?? null,
    attemptStatus: nativeMetadata?.attemptStatus ?? null,
    preparedInputPath: hasOriginalAssetPath ? record.preparedInput?.path ?? record.source ?? null : null,
    preparedInputSHA: hasOriginalAssetPath ? record.preparedInput?.sha256 ?? record.sourceSHA256 ?? null : null,
    originalAssetFormat: hasOriginalAssetPath ? originalAsset.format ?? path.extname(originalAsset.path).slice(1).toUpperCase() : null,
    originalPath,
    copyPath: null,
    XMLSHA: null,
    reportedXMLSHA: expectedSHA,
    method,
    movement: title,
    exportOrdinal: ordinal,
    reportPath: reportPath ?? record?.reportPath ?? null,
    artifactState: 'pending',
    pendingReason: pendingReason ?? null,
    excludedReason: explicitlyApproved ? 'A fonte marcou esta exportação como aprovada/final; não foi copiada para o pacote de revisão.' : null,
    reviewStatus: 'needs_review',
    finalExportApproved: false,
    trainingEligible: false,
    ...sourceReviewMetadata,
    ...pages,
    reportedReviewStatus: cleanText(exportRow?.reviewStatus) || cleanText(record?.reviewStatus) || null,
    reportedFinalExportApproved: exportRow?.finalExportApproved === true || record?.finalExportApproved === true,
  };
}

function nativeAttemptIdentity(record, reportPath) {
  const sourceSHA = isSha256(record?.sourceSHA256) ? record.sourceSHA256.toLowerCase() : '';
  const method = cleanText(record?.method) || 'native_score_export';
  return sha256(Buffer.from([sourceSHA, reportPath ?? record?.reportPath ?? '', method].join('\n'))).slice(0, 16);
}

function nativeFormat(record) {
  const declared = cleanText(record?.sourceFormat);
  const extension = path.extname(cleanText(record?.source) || '');
  const value = declared || extension;
  if (!value) return 'unknown';
  return value.startsWith('.') ? value.toLowerCase() : `.${value.toLowerCase()}`;
}

function nativeAttemptManifestRow(record, reportPath, artifactRows) {
  const sourceSHA = isSha256(record?.sourceSHA256) ? record.sourceSHA256.toLowerCase() : null;
  const source = cleanText(record?.source) || '(origem nativa sem nome)';
  const sourceDisplay = displaySource(source, record?.sourceRelative);
  const id = nativeAttemptIdentity(record, reportPath);
  const rows = artifactRows.filter((row) => row.nativeAttemptId === id);
  const exports = asArray(record?.exports);
  const copiedRows = rows.filter((row) => row.artifactState === 'copied');
  return {
    nativeAttemptId: id,
    identity: {
      source,
      sourceDisplay,
      sourceSHA256: sourceSHA,
      hashStatus: sourceSHA ? 'valid_sha256_format_only' : 'invalid_or_missing',
    },
    sourceFormat: nativeFormat(record),
    sourceKind: 'native_score_input',
    method: cleanText(record?.method) || 'native_score_export',
    reportPath: reportPath ?? record?.reportPath ?? null,
    operationalOutcome: cleanText(record?.operationalOutcome) || 'not_reported',
    status: cleanText(record?.status) || 'not_reported',
    candidateExportRecordCount: exports.length,
    candidateExportsCopied: copiedRows.length,
    candidateExportsPending: rows.filter((row) => row.artifactState === 'pending').length,
    candidateExportsExcludedForInvalidSourceHash: sourceSHA ? 0 : exports.length,
    distinctCopiedXMLSHA256Count: new Set(copiedRows.map((row) => row.XMLSHA)).size,
    referenceIndependence: 'unknown',
    reportedReferenceStatus: cleanText(record?.referenceStatus) || null,
    reportedIndependentReference: typeof record?.independentReference === 'boolean' ? record.independentReference : null,
    accuracyVerified: false,
    reviewStatus: 'needs_review',
    finalExportApproved: false,
    trainingEligible: false,
    isGoldReference: false,
  };
}

function candidateRowsForRecord(record, method, reportPath) {
  const exports = asArray(record?.exports);
  if (method === 'prepared' || method === 'source_reviewed') {
    if (record?.outputPath || record?.outputSHA256 || record?.outputPath === null) {
      return [makeArtifact({ record, exportRow: record, source: record.source, sourceRelative: record.sourceRelative, sourceSHA: record.sourceSHA256, method, reportPath, ordinal: 1, pendingReason: record.outputPath ? null : 'Relatório sem outputPath de MusicXML.' })];
    }
  }
  if (exports.length) {
    return exports.map((row, index) => makeArtifact({
      record,
      exportRow: row,
      source: record.source,
      sourceRelative: record.sourceRelative,
      sourceSHA: record.sourceSHA256,
      method,
      reportPath,
      ordinal: index + 1,
      pendingReason: row?.path || row?.outputPath ? null : 'Exportação listada sem caminho de arquivo.',
    }));
  }
  return [makeArtifact({ record, exportRow: null, source: record.source, sourceRelative: record.sourceRelative, sourceSHA: record.sourceSHA256, method, reportPath, ordinal: 1, pendingReason: 'Tentativa registrada sem prévia MusicXML.' })];
}

function candidateRowsForNativeReport(record, reportPath) {
  const sourceSHA = cleanText(record?.sourceSHA256).toLowerCase();
  if (!isSha256(sourceSHA)) return [];
  const method = reportMethod(record, 'native_score_export');
  const nativeAttemptId = nativeAttemptIdentity(record, reportPath);
  const nativeMetadata = {
    sourceFormat: nativeFormat(record),
    nativeAttemptId,
    operationalOutcome: cleanText(record?.operationalOutcome) || 'not_reported',
    attemptStatus: cleanText(record?.status) || 'not_reported',
  };
  return asArray(record?.exports).map((row, index) => makeArtifact({
    record,
    exportRow: row,
    source: record.source,
    sourceRelative: record.sourceRelative,
    sourceSHA,
    method,
    reportPath,
    ordinal: index + 1,
    pendingReason: row?.path || row?.outputPath ? null : 'Exportação nativa listada sem caminho de arquivo.',
    nativeMetadata,
  }));
}

function summarizeNativeAttempts(nativeReports, nativeArtifactRows) {
  const reports = nativeReports.map((item) => nativeAttemptManifestRow(item.record, item.reportPath, nativeArtifactRows));
  const countBy = (key) => reports.reduce((counts, row) => {
    counts[row[key]] = (counts[row[key]] ?? 0) + 1;
    return counts;
  }, {});
  const validSources = new Set(reports.map((row) => row.identity.sourceSHA256).filter(Boolean));
  const sourcesWithCopiedCandidate = new Set(nativeArtifactRows
    .filter((row) => row.artifactState === 'copied' && isSha256(row.sourceSHA))
    .map((row) => row.sourceSHA.toLowerCase()));
  const copiedRows = nativeArtifactRows.filter((row) => row.artifactState === 'copied');
  return {
    reports,
    metrics: {
      attemptCount: reports.length,
      operationalOutcomeCounts: countBy('operationalOutcome'),
      candidateStatusCounts: countBy('status'),
      operationalSuccessAttemptCount: reports.filter((row) => row.operationalOutcome === 'success').length,
      rawPartialCandidateNeedsReviewAttemptCount: reports.filter((row) => row.status === 'raw_partial_candidate_needs_review').length,
      uniqueSourceCountWithValidSHA256: validSources.size,
      attemptsWithCopiedCandidate: reports.filter((row) => row.candidateExportsCopied > 0).length,
      uniqueSourcesWithCopiedCandidate: sourcesWithCopiedCandidate.size,
      copiedCandidateExportCount: copiedRows.length,
      distinctCopiedXMLSHA256Count: new Set(copiedRows.map((row) => row.XMLSHA)).size,
      pendingCandidateExportCount: nativeArtifactRows.filter((row) => row.artifactState === 'pending').length,
      reportsWithInvalidSourceSHA256: reports.filter((row) => row.identity.hashStatus !== 'valid_sha256_format_only').length,
      candidateExportRecordsExcludedForInvalidSourceHash: reports.reduce((n, row) => n + row.candidateExportsExcludedForInvalidSourceHash, 0),
    },
  };
}

function idArtifact(row) {
  const seed = [row.sourceSHA ?? '', row.method, row.reportPath ?? '', row.originalPath ?? '', row.exportOrdinal, row.movement].join('\n');
  return sha256(Buffer.from(seed)).slice(0, 16);
}

async function enrichArtifact(row, { rootDir, corpusRoot }) {
  row.artifactId = idArtifact(row);
  if (row.excludedReason) {
    row.artifactState = 'excluded_approved';
    return row;
  }
  if (!row.originalPath) return row;
  const absolute = localPath(rootDir, row.originalPath);
  if (!absolute || !isWithin(corpusRoot, absolute)) {
    row.pendingReason = 'Caminho de prévia fora da raiz local do corpus.';
    return row;
  }
  let stat;
  try { stat = await fs.stat(absolute); } catch { row.pendingReason = row.pendingReason || 'Arquivo de prévia não encontrado.'; return row; }
  if (!stat.isFile()) { row.pendingReason = 'Caminho da prévia não é arquivo regular.'; return row; }
  if (!/\.(musicxml|xml)$/i.test(absolute)) { row.pendingReason = 'Formato fora do escopo MusicXML/XML.'; return row; }
  if (stat.size > MAX_XML_BYTES) { row.pendingReason = `Prévia maior que o limite de ${MAX_XML_BYTES} bytes.`; return row; }
  const bytes = await fs.readFile(absolute);
  const actualSHA = sha256(bytes);
  if (!isSha256(row.reportedXMLSHA)) {
    row.pendingReason = 'SHA-256 registrado da prévia ausente ou inválido; cópia bloqueada.';
    row.XMLSHA = actualSHA;
    return row;
  }
  if (!isSha256(row.sourceSHA)) {
    row.pendingReason = 'SHA-256 registrado da fonte ausente ou inválido; cópia bloqueada.';
    row.XMLSHA = actualSHA;
    return row;
  }
  if (actualSHA.toLowerCase() !== row.reportedXMLSHA.toLowerCase()) {
    row.pendingReason = 'SHA-256 da prévia diverge do valor registrado no relatório.';
    row.XMLSHA = actualSHA;
    return row;
  }
  row.XMLSHA = actualSHA;
  row._bytes = bytes;
  row.artifactState = 'copied';
  row.pendingReason = null;
  return row;
}

function outputFilename(row) {
  const source = slug(sourceTitle(row.sourceDisplay), 'score', 42);
  const sourceHash = slug(row.sourceSHA?.slice(0, 8) || 'no-source-hash', 'no-source-hash', 8);
  const method = slug(row.method, 'method', 30);
  const movement = slug(row.movement, `export-${String(row.exportOrdinal).padStart(2, '0')}`, 32);
  const candidate = row.artifactId.slice(0, 8);
  return `${source}--${sourceHash}--${method}--${movement}--${candidate}.musicxml`;
}

function makeIndex(manifest) {
  const rows = manifest.artifacts;
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.sourceSHA ?? 'sem-sha'}\n${row.sourceDisplay}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const copied = rows.filter((r) => r.artifactState === 'copied');
  const pending = rows.filter((r) => r.artifactState === 'pending');
  const excluded = rows.filter((r) => r.artifactState === 'excluded_approved');
  const nativeReports = asArray(manifest.nativeReports);
  const nativeMetrics = manifest.nativeMetrics ?? {};
  const lines = [
    '# Pacote de prévias para revisão',
    '',
    'Este pacote contém candidatos MusicXML para inspeção humana. Nenhuma prévia foi aprovada para exportação final ou treinamento; a cópia não certifica notas, ritmo, cobertura de páginas, integridade de livro ou organização de movimentos.',
    '',
    `Pacote v${manifest.packVersion}, snapshot de \`results.json\`: \`${manifest.resultsSHA256}\` (gerado em ${manifest.generatedAt}).`,
    '',
    `- Prévias copiadas: ${copied.length}`,
    `- Tentativas/variantes registradas: ${manifest.artifactAttemptCount}`,
    `- Fontes únicas com prévia copiada: ${manifest.uniqueSourcesWithCopiedArtifacts}`,
    `- Registros pendentes sem cópia: ${pending.length}`,
    `- Exportações explicitamente aprovadas excluídas: ${excluded.length}`,
    `- Fontes PDF sem nenhuma cópia incluída: ${manifest.pendingSources.length}`,
    `- Tentativas de exportação a partir de partituras nativas: ${nativeMetrics.attemptCount ?? 0}`,
    `- Sucessos operacionais nativos: ${nativeMetrics.operationalSuccessAttemptCount ?? 0}`,
    `- Tentativas nativas com candidato parcial para revisão: ${nativeMetrics.rawPartialCandidateNeedsReviewAttemptCount ?? 0}`,
    `- Fontes nativas únicas com candidato copiado: ${nativeMetrics.uniqueSourcesWithCopiedCandidate ?? 0}`,
    `- Fontes nativas sem candidato copiado: ${(nativeMetrics.uniqueSourceCountWithValidSHA256 ?? 0)-(nativeMetrics.uniqueSourcesWithCopiedCandidate ?? 0)}`,
    '',
    'Cada exportação e método aparecem separadamente. Um livro com uma ou mais prévias não é considerado completo; páginas omitidas ou sem mapa verificado estão indicadas por item.',
    '',
    '## Fontes e variantes',
    '',
  ];
  if (nativeReports.length) {
    lines.push('## Tentativas de exportação de partituras nativas', '');
    lines.push('Estas entradas são fontes em formato nativo (por exemplo, MSCZ ou GPX), não PDFs. A independência da referência é desconhecida; a exportação não é tratada como gabarito musical. Sucesso operacional e existência de um candidato são estados separados.', '');
    for (const attempt of nativeReports) {
      const identity = attempt.identity ?? {};
      const copiedLabel = attempt.candidateExportsCopied ? `${attempt.candidateExportsCopied} candidato(s) MusicXML copiado(s)` : 'nenhum candidato MusicXML copiado';
      lines.push(`- **${identity.sourceDisplay ?? '(origem nativa sem nome)'}** — formato ${attempt.sourceFormat}; método ${attempt.method}; resultado operacional ${attempt.operationalOutcome}; estado do candidato ${attempt.status}; ${copiedLabel}; independência de referência ${attempt.referenceIndependence}; revisão ${attempt.reviewStatus}.`);
      if (attempt.reportPath) lines.push(`  - Relatório: ${attempt.reportPath}.`);
      if (attempt.identity?.hashStatus !== 'valid_sha256_format_only') lines.push('  - SHA-256 da fonte ausente ou inválido; esta tentativa não identifica um candidato copiável.');
    }
    lines.push('');
  }
  const sorted = [...groups.values()].sort((a, b) => a[0].sourceDisplay.localeCompare(b[0].sourceDisplay, 'pt-BR'));
  for (const group of sorted) {
    const first = group[0];
    lines.push(`### ${first.sourceDisplay}`);
    lines.push('');
    lines.push(`SHA da fonte: \`${first.sourceSHA ?? 'não registrado'}\`. Variantes registradas: ${group.length}.`);
    if (first.sourceKind === 'native_score_input') lines.push(`Formato da fonte nativa: \`${first.sourceFormat}\`; independência de referência: \`${first.referenceIndependence}\`; identidade por SHA-256 registrado válido, sem inferir mapa de páginas PDF.`);
    lines.push('');
    for (const row of group) {
      const state = row.artifactState === 'copied' ? `[MusicXML](./${row.copyPath})` : row.artifactState === 'pending' ? 'pendente, sem cópia' : 'excluída por aprovação explícita';
      const mapping = row.sourceKind === 'native_score_input'
        ? `entrada nativa ${row.sourceFormat}; sem mapeamento físico de PDF`
        : row.physicalPageMappingVerified ? 'mapa físico verificado' : 'mapa físico não verificado';
      const known = row.physicalPagesKnown.length ? row.physicalPagesKnown.join(', ') : 'nenhuma';
      const missing = row.physicalPagesMissing.length ? row.physicalPagesMissing.join(', ') : 'nenhuma declarada/verificada';
      const coverage = row.sourceKind === 'native_score_input' ? 'sem mapeamento físico de PDF; cobertura de páginas físicas não aplicável' : `${mapping}; páginas físicas conhecidas: ${known}; omitidas: ${missing}`;
      lines.push(`- **${row.method} / ${row.movement}** — ${state}; ${coverage}.`);
      if (row.sourceKind === 'native_score_input') lines.push(`  - Resultado operacional: \`${row.operationalOutcome}\`; estado do candidato: \`${row.attemptStatus}\`; independência de referência: \`${row.referenceIndependence}\`; sempre pendente de revisão.`);
      if (row.method === 'source_reviewed' && row.textReviewStatus === 'unverified_ocr_draft') {
        lines.push('  - Notas comparadas com referência assistida; letra/cifras OCR ainda não conferidas.');
      }
      if (row.artifactState === 'pending' && row.pendingReason) lines.push(`  - Motivo: ${row.pendingReason}`);
      if (row.artifactState === 'copied') lines.push(`  - SHA XML: \`${row.XMLSHA}\`; relatório: \`${row.reportPath ?? 'não indicado'}\`.`);
      if (row.artifactState === 'excluded_approved') lines.push(`  - Motivo: ${row.excludedReason}`);
      if (row.physicalPagesVerifiedNonmusicalOmitted.length) lines.push(`  - Páginas omitidas e verificadas como não musicais: ${row.physicalPagesVerifiedNonmusicalOmitted.join(', ')}; não contam como páginas musicais faltantes.`);
      if (row.physicalPagesReportedMissing.length && !row.physicalPageMappingVerified) lines.push(`  - O relatório declara páginas ausentes ${row.physicalPagesReportedMissing.join(', ')}, mas o vínculo a páginas físicas não foi verificado.`);
    }
    lines.push('');
  }
  if (manifest.pendingSources.length) {
    lines.push('## Fontes ainda sem prévia incluída', '');
    lines.push('Estas fontes constam no catálogo de casos, mas este snapshot não contém uma cópia revisável correspondente. O status é pendente, não uma decisão de exclusão musical.', '');
    for (const source of manifest.pendingSources) lines.push(`- ${source.sourceDisplay} — ${source.reason}`);
    lines.push('');
  }
  if (manifest.pendingAttempts.length) {
    lines.push('## Relatórios ou tentativas sem caminho de prévia', '');
    for (const item of manifest.pendingAttempts) lines.push(`- ${item.sourceDisplay} / ${item.method}: ${item.reason}${item.reportPath ? ` (relatório: \`${item.reportPath}\`)` : ''}.`);
    lines.push('');
  }
  lines.push('## Manifesto', '', 'Os caminhos, hashes, decisões de mapeamento e estados por artefato estão em [manifest.json](./manifest.json).', '');
  return `${lines.join('\n')}\n`;
}

async function allFiles(root) {
  const out = [];
  async function walk(dir) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Snapshot contém symlink, recusado: ${full}`);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) out.push(path.relative(root, full));
      else throw new Error(`Snapshot contém entrada não regular, recusada: ${full}`);
    }
  }
  await walk(root);
  return out.sort();
}

async function verifyExistingSnapshot(snapshotDir, expectedFiles) {
  const existing = await allFiles(snapshotDir);
  const expectedNames = [...expectedFiles.keys()].sort();
  if (JSON.stringify(existing) !== JSON.stringify(expectedNames)) throw new Error(`Snapshot existente difere do plano; recusando sobrescrita: ${snapshotDir}`);
  for (const [relative, expected] of expectedFiles) {
    const actual = await fs.readFile(path.join(snapshotDir, relative));
    if (!actual.equals(expected)) throw new Error(`Snapshot existente difere do plano em ${relative}; recusando sobrescrita.`);
  }
}

function noPreviewReason(caseRow) {
  if (caseRow.needsPageSelection) return 'requer seleção de páginas ou revisão de segmentação';
  if (caseRow.baselineStatus === 'queued' || !caseRow.baselineFinished) return 'conversão de linha de base ainda não finalizada no snapshot';
  if (caseRow.baselineStatus === 'no_export') return 'linha de base finalizada sem exportação MusicXML';
  return 'nenhuma prévia copiada neste snapshot';
}

export async function generateReviewPack({ rootDir = DEFAULT_ROOT, resultsPath = path.join(rootDir, RESULTS_REL), packRoot = path.join(rootDir, CORPUS_REL, 'review-pack') } = {}) {
  rootDir = path.resolve(rootDir);
  resultsPath = path.resolve(rootDir, resultsPath);
  packRoot = path.resolve(rootDir, packRoot);
  const corpusRoot = path.resolve(rootDir, CORPUS_REL);
  if (!isWithin(rootDir, packRoot) || !isWithin(rootDir, resultsPath)) throw new Error('Resultados ou diretório do pacote fora do repositório.');
  const resultsBytes = await fs.readFile(resultsPath);
  const resultsSHA256 = sha256(resultsBytes);
  const results = JSON.parse(resultsBytes.toString('utf8'));
  const resultsStat = await fs.stat(resultsPath);
  const snapshotCreatedAt = cleanText(results?.summary?.generatedAt) || resultsStat.mtime.toISOString();
  const snapshotName = `snapshot-v${PACK_VERSION}-${resultsSHA256.slice(0, 16)}`;
  const runnerSHA256 = sha256(await fs.readFile(fileURLToPath(import.meta.url)));

  const artifacts = [];
  const pendingAttempts = [];
  const cases = asArray(results.cases);
  const addRecord = (record, fallback, reportPath) => {
    const identitySHA = record?.originalAsset?.sha256 && isSha256(record.originalAsset.sha256) ? record.originalAsset.sha256 : record?.sourceSHA256;
    const matchingCase = cases.find((caseRow) => caseRow.sourceSHA256 === identitySHA);
    const resolvedRecord = {
      ...record,
      source: record?.source ?? matchingCase?.source,
      sourceRelative: record?.sourceRelative ?? matchingCase?.sourceRelative,
      physicalPages: record?.physicalPages ?? matchingCase?.physicalPages,
    };
    const method = reportMethod(resolvedRecord, fallback);
    const items = candidateRowsForRecord(resolvedRecord, method, reportPath);
    artifacts.push(...items);
    if (items.every((row) => !row.originalPath)) pendingAttempts.push({ sourceDisplay: displaySource(resolvedRecord.source, resolvedRecord.sourceRelative), sourceSHA: items[0]?.sourceSHA ?? resolvedRecord.sourceSHA256 ?? null, method, reportPath: reportPath ?? resolvedRecord.reportPath ?? null, reason: items[0]?.pendingReason ?? 'nenhum caminho de prévia declarado' });
  };

  for (const caseRow of cases) {
    const reportPath = caseRow.baselineReport;
    if (!reportPath) continue;
    try {
      const report = await readJsonWithin(rootDir, corpusRoot, reportPath);
      const rawRows = candidateRowsForRecord({ ...report.value, source: report.value.source ?? caseRow.source, sourceSHA256: report.value.sourceSHA256 ?? caseRow.sourceSHA256, physicalPages: report.value.physicalPages ?? caseRow.physicalPages }, 'raw_baseline', report.absolute);
      artifacts.push(...rawRows);
      if (rawRows.every((row) => !row.originalPath)) pendingAttempts.push({ sourceDisplay: displaySource(caseRow.source), sourceSHA: caseRow.sourceSHA256, method: 'raw_baseline', reportPath: report.absolute, reason: rawRows[0]?.pendingReason ?? 'linha de base sem exportação' });
    } catch (error) {
      pendingAttempts.push({ sourceDisplay: displaySource(caseRow.source), sourceSHA: caseRow.sourceSHA256, method: 'raw_baseline', reportPath, reason: `relatório indisponível: ${error.message}` });
    }
  }

  for (const record of asArray(results.preparedReports)) addRecord(record, 'prepared', record.reportPath);
  for (const record of asArray(results.salvagedReports)) addRecord(record, 'native_selected_pages', record.reportPath);
  for (const record of asArray(results.sourceReviews)) addRecord(record, 'source_reviewed', record.reportPath);
  for (const [key, method] of [['boundedReports', 'bounded_raw'], ['boundedRawReports', 'bounded_raw'], ['boundedPreparedReports', 'prepared'], ['boundedSalvagedReports', 'native_selected_pages'], ['boundedSourceReviews', 'source_reviewed']]) {
    for (const record of asArray(results[key])) addRecord(record, method, record.reportPath);
  }
  const nativeReportInputs = asArray(results.nativeReports).map((record) => ({ record, reportPath: record.reportPath ?? null }));
  for (const { record, reportPath } of nativeReportInputs) {
    const nativeRows = candidateRowsForNativeReport(record, reportPath);
    artifacts.push(...nativeRows);
  }

  const enriched = [];
  for (const row of artifacts) enriched.push(await enrichArtifact(row, { rootDir, corpusRoot }));
  const ids = new Set();
  for (const row of enriched) {
    if (ids.has(row.artifactId)) throw new Error(`Colisão de identidade de candidato ${row.artifactId}; nenhum pacote foi gravado.`);
    ids.add(row.artifactId);
    if (row.artifactState === 'copied') row.copyPath = path.posix.join('previews', outputFilename(row));
  }

  const copied = enriched.filter((row) => row.artifactState === 'copied');
  const copiedNames = new Set();
  for (const row of copied) {
    if (copiedNames.has(row.copyPath)) throw new Error(`Colisão de nome de arquivo ${row.copyPath}; nenhum pacote foi gravado.`);
    copiedNames.add(row.copyPath);
  }
  const bySource = new Map();
  for (const row of enriched) {
    if (!row.sourceSHA) continue;
    bySource.set(row.sourceSHA, (bySource.get(row.sourceSHA) ?? 0) + (row.artifactState === 'copied' ? 1 : 0));
  }
  const pendingSources = cases.filter((caseRow) => (bySource.get(caseRow.sourceSHA256) ?? 0) === 0).map((caseRow) => ({
    sourceDisplay: displaySource(caseRow.source),
    sourceSHA: caseRow.sourceSHA256,
    reason: noPreviewReason(caseRow),
    reviewStatus: 'needs_review',
    finalExportApproved: false,
    trainingEligible: false,
  }));
  const nativeSummary = summarizeNativeAttempts(nativeReportInputs, enriched.filter((row) => row.sourceKind === 'native_score_input'));

  const manifest = {
    schemaVersion: 2,
    packVersion: PACK_VERSION,
    runnerSHA256,
    generatedAt: snapshotCreatedAt,
    snapshot: snapshotName,
    resultsPath: path.relative(rootDir, resultsPath),
    resultsSHA256,
    sourceCaseCount: cases.length,
    maxXmlBytes: MAX_XML_BYTES,
    artifactAttemptCount: enriched.length,
    uniqueSourcesWithCopiedArtifacts: new Set(copied.filter((row) => isSha256(row.sourceSHA)).map((row) => row.sourceSHA.toLowerCase())).size,
    copiedCount: copied.length,
    pendingArtifactCount: enriched.filter((row) => row.artifactState === 'pending').length,
    excludedApprovedCount: enriched.filter((row) => row.artifactState === 'excluded_approved').length,
    pendingSources,
    pendingAttempts,
    nativeMetrics: nativeSummary.metrics,
    nativeReports: nativeSummary.reports,
    artifacts: enriched.map(({ _bytes, ...row }) => row),
  };
  const index = makeIndex(manifest);
  const expectedFiles = new Map();
  for (const row of copied) expectedFiles.set(row.copyPath, row._bytes);
  expectedFiles.set('manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  expectedFiles.set('index.md', Buffer.from(index));

  const snapshotDir = path.join(packRoot, snapshotName);
  await fs.mkdir(packRoot, { recursive: true });
  let exists = true;
  try { await fs.access(snapshotDir); } catch { exists = false; }
  if (exists) {
    await verifyExistingSnapshot(snapshotDir, expectedFiles);
  } else {
    const stagingDir = path.join(packRoot, `.staging-${snapshotName}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
    await fs.mkdir(path.join(stagingDir, 'previews'), { recursive: true });
    try {
      for (const row of copied) await fs.writeFile(path.join(stagingDir, row.copyPath), row._bytes, { flag: 'wx' });
      await fs.writeFile(path.join(stagingDir, 'manifest.json'), expectedFiles.get('manifest.json'), { flag: 'wx' });
      await fs.writeFile(path.join(stagingDir, 'index.md'), expectedFiles.get('index.md'), { flag: 'wx' });
      await fs.rename(stagingDir, snapshotDir);
    } catch (error) {
      await fs.rm(stagingDir, { recursive: true, force: true });
      throw error;
    }
  }

  const latest = {
    schemaVersion: 3,
    packVersion: PACK_VERSION,
    snapshot: snapshotName,
    resultsPath: path.relative(rootDir, resultsPath),
    resultsSHA256,
    manifestPath: path.posix.join(snapshotName, 'manifest.json'),
    indexPath: path.posix.join(snapshotName, 'index.md'),
    updatedAt: new Date().toISOString(),
  };
  const latestTemp = path.join(packRoot, `.latest-${process.pid}-${crypto.randomBytes(4).toString('hex')}.tmp`);
  await fs.writeFile(latestTemp, `${JSON.stringify(latest, null, 2)}\n`, { flag: 'wx' });
  await fs.rename(latestTemp, path.join(packRoot, 'latest.json'));
  return { snapshotDir, latestPath: path.join(packRoot, 'latest.json'), manifest, reusedSnapshot: exists };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--root') out.rootDir = argv[++i];
    else if (arg === '--results') out.resultsPath = argv[++i];
    else if (arg === '--pack-root') out.packRoot = argv[++i];
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write('Uso: node scripts/corpus-review-pack.mjs [--root REPO] [--results results.json] [--pack-root DIRETORIO]\n');
      process.exit(0);
    }
    const result = await generateReviewPack(options);
    process.stdout.write(`${JSON.stringify({ snapshotDir: result.snapshotDir, latestPath: result.latestPath, copiedCount: result.manifest.copiedCount, artifactAttemptCount: result.manifest.artifactAttemptCount, uniqueSourcesWithCopiedArtifacts: result.manifest.uniqueSourcesWithCopiedArtifacts, pendingArtifactCount: result.manifest.pendingArtifactCount, excludedApprovedCount: result.manifest.excludedApprovedCount, nativeMetrics: result.manifest.nativeMetrics, pendingSources: result.manifest.pendingSources.length, reusedSnapshot: result.reusedSnapshot }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`corpus-review-pack: ${error.message}\n`);
    process.exitCode = 1;
  }
}
