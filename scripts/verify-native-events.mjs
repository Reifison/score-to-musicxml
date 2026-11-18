import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  compareNativeAndMusicXmlEvents,
  parseMusicXmlNativeEvents,
  parseMuseScoreNativeEvents,
} from './lib/musescore-event-reference.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const CATALOG_PATH = path.join(REPO_ROOT, 'docs/validation/corpus-partituras-2026-10-07/references/native-reference-catalog.json');
const RESULTS_PATH = path.join(REPO_ROOT, 'docs/validation/corpus-partituras-2026-10-07/results.json');
const OUTPUT_DIR = path.join(REPO_ROOT, 'docs/validation/acervo-review-2026-10-07/reviews');
const JSON_OUTPUT = path.join(OUTPUT_DIR, 'native-event-comparison.json');
const MARKDOWN_OUTPUT = path.join(OUTPUT_DIR, 'native-event-comparison.md');

const readJson = async filePath => JSON.parse(await readFile(filePath, 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async filePath => access(filePath).then(() => true, () => false);
const list = value => Array.isArray(value) ? value : [];

function parseOptions(argv) {
  const options = { limit: null, names: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--limit') options.limit = Number(argv[++index]);
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--names') options.names = (argv[++index] ?? '').split(',').filter(Boolean);
    else if (arg.startsWith('--names=')) options.names = arg.slice('--names='.length).split(',').filter(Boolean);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Opção desconhecida: ${arg}`);
  }
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) throw new Error('--limit precisa ser um inteiro maior que zero');
  return options;
}

function selectReports(results, sourceSha256) {
  const unique = new Map();
  for (const report of [...list(results.nativeLatest), ...list(results.nativeReports)]) {
    if (report?.sourceSHA256 !== sourceSha256 || report?.method !== 'musescore_native_export') continue;
    const key = report.reportPath ?? JSON.stringify([report.sourceSHA256, report.finishedAt, report.status]);
    const existing = unique.get(key);
    unique.set(key, existing ? { ...existing, ...report, fromLatest: existing.fromLatest || report.fromLatest } : {
      ...report,
      fromLatest: list(results.nativeLatest).some(item => item?.reportPath === report.reportPath),
    });
  }
  return [...unique.values()].sort((left, right) => {
    const timestamp = String(right.finishedAt ?? '').localeCompare(String(left.finishedAt ?? ''));
    if (timestamp !== 0) return timestamp;
    return Number(right.fromLatest) - Number(left.fromLatest);
  });
}

async function chooseCandidateExport(reports, sourceSha256) {
  const rejected = [];
  for (const report of reports) {
    if (report.sourceSHA256 !== sourceSha256) continue;
    const exports = list(report.exports).filter(item => typeof item?.path === 'string' && /\.musicxml$/i.test(item.path));
    for (const candidate of exports) {
      if (!(await exists(candidate.path))) {
        rejected.push({ reportPath: report.reportPath ?? null, path: candidate.path, reason: 'missing' });
        continue;
      }
      const bytes = await readFile(candidate.path);
      const actualSha256 = sha256(bytes);
      if (actualSha256 !== candidate.sha256) {
        rejected.push({ reportPath: report.reportPath ?? null, path: candidate.path, reason: 'sha256-mismatch', expectedSha256: candidate.sha256 ?? null, actualSha256 });
        continue;
      }
      return { report, export: candidate, bytes, actualSha256, rejected };
    }
  }
  return { report: reports[0] ?? null, export: null, bytes: null, actualSha256: null, rejected };
}

function countRow(source, candidate, selected) {
  return {
    sourceEventGroups: source?.eventCount ?? null,
    sourcePitchedNotes: source?.noteCount ?? null,
    sourceRests: source?.restCount ?? null,
    candidateEventGroups: candidate?.eventCount ?? null,
    candidatePitchedNotes: candidate?.noteCount ?? null,
    candidateRests: candidate?.restCount ?? null,
    candidateReportedNoteAndRestCount: selected?.export?.eventCount ?? null,
    candidateParsedNoteAndRestCount: candidate ? candidate.noteCount + candidate.restCount : null,
  };
}

async function reviewSource(sourceRecord, results) {
  const row = {
    source: {
      fileName: sourceRecord.sourceFileName,
      archivePath: sourceRecord.sourcePath,
      archiveSha256: sourceRecord.sourceSha256,
      embeddedMainMember: sourceRecord.embeddedMainMember ?? null,
      embeddedMainPath: sourceRecord.extractedMainPath ?? null,
      embeddedMainSha256Expected: sourceRecord.embeddedSha256 ?? null,
      embeddedMainSha256Actual: null,
      referenceStatus: 'native-encoding-source-only',
      independentPdfReference: false,
      equivalentToPdf: false,
    },
    candidate: null,
    status: 'pending',
    counts: null,
    unsupported: [],
    comparison: null,
    sourceEvents: [],
    candidateEvents: [],
    sourceMeasures: [],
    sourceVoiceTopology: [],
    candidateMeasures: [],
    candidateVoiceTopology: [],
  };

  if (!sourceRecord.extractedMainPath || !sourceRecord.embeddedSha256) {
    row.status = 'source-main-path-or-hash-missing';
    row.unsupported.push({ code: 'source-main-path-or-hash-missing' });
    return row;
  }
  if (!(await exists(sourceRecord.extractedMainPath))) {
    row.status = 'source-main-missing';
    row.unsupported.push({ code: 'source-main-missing', path: sourceRecord.extractedMainPath });
    return row;
  }
  const sourceBytes = await readFile(sourceRecord.extractedMainPath);
  const actualMainSha256 = sha256(sourceBytes);
  row.source.embeddedMainSha256Actual = actualMainSha256;
  if (actualMainSha256 !== sourceRecord.embeddedSha256) {
    row.status = 'source-main-hash-mismatch';
    row.unsupported.push({ code: 'source-main-hash-mismatch', expected: sourceRecord.embeddedSha256, actual: actualMainSha256 });
    return row;
  }

  let source;
  try {
    source = parseMuseScoreNativeEvents(sourceBytes.toString('utf8'));
    row.sourceEvents = source.events;
    row.sourceMeasures = source.measures;
    row.sourceVoiceTopology = source.voiceTopology;
    row.source.parts = source.parts;
    row.source.staffCount = source.staffCount;
    row.source.measureCounts = source.measureCounts;
    row.source.programVersion = source.programVersion;
    row.source.relationshipLinks = source.sourceRelationshipLinks;
    row.source.spannerTypes = source.sourceSpannerTypes;
    row.source.voiceLocationOffsets = source.sourceVoiceLocationOffsets;
    row.source.outOfScopeModifiers = source.sourceOutOfScopeModifiers;
  } catch (error) {
    row.status = 'source-parse-unsupported';
    row.unsupported.push({ code: 'source-parse-error', message: String(error?.message ?? error) });
    return row;
  }

  const reports = selectReports(results, sourceRecord.sourceSha256);
  const selected = await chooseCandidateExport(reports, sourceRecord.sourceSha256);
  if (!selected.export) {
    row.status = 'candidate-unavailable';
    row.candidate = {
      reportPath: selected.report?.reportPath ?? null,
      reportStatus: selected.report?.status ?? null,
      operationalOutcome: selected.report?.operationalOutcome ?? null,
      sourceSha256InReport: selected.report?.sourceSHA256 ?? null,
      rejectedExports: selected.rejected,
    };
    row.unsupported.push({ code: 'musicxml-candidate-unavailable' });
    row.counts = countRow(source, null, null);
    row.unsupported.push(...source.unsupported);
    return row;
  }

  row.candidate = {
    reportPath: selected.report.reportPath ?? null,
    reportStatus: selected.report.status ?? null,
    operationalOutcome: selected.report.operationalOutcome ?? null,
    engineOutcome: selected.report.engineOutcome ?? null,
    reportSourceSha256: selected.report.sourceSHA256,
    exportPath: selected.export.path,
    exportSha256Expected: selected.export.sha256,
    exportSha256Actual: selected.actualSha256,
    exportSha256Verified: true,
    reportExportEventCount: selected.export.eventCount ?? null,
    usedNativeLatest: Boolean(selected.report.fromLatest),
    rejectedNewerExports: selected.rejected,
  };

  let candidate;
  try {
    candidate = parseMusicXmlNativeEvents(selected.bytes.toString('utf8'));
    row.candidateEvents = candidate.events;
    row.candidateMeasures = candidate.measures;
    row.candidateVoiceTopology = candidate.voiceTopology;
    row.candidate.parts = candidate.parts;
    row.candidate.transpositions = candidate.transpositions;
  } catch (error) {
    row.status = 'candidate-parse-unsupported';
    row.unsupported.push({ code: 'candidate-parse-error', message: String(error?.message ?? error) });
    row.unsupported.push(...source.unsupported);
    row.counts = countRow(source, null, selected);
    return row;
  }

  row.counts = countRow(source, candidate, selected);
  const candidateComparable = { ...candidate, unsupported: [...candidate.unsupported] };
  const parsedEventCount = candidate.noteCount + candidate.restCount;
  if (selected.export.eventCount !== undefined && selected.export.eventCount !== parsedEventCount) {
    candidateComparable.unsupported.push({
      code: 'candidate-reported-event-count-does-not-match-parser',
      reported: selected.export.eventCount,
      parsed: parsedEventCount,
    });
  }
  const evaluated = compareNativeAndMusicXmlEvents(source, candidateComparable);
  row.status = evaluated.status;
  row.comparison = evaluated.comparison;
  row.scoreOutOf10 = evaluated.scoreOutOf10;
  row.globalGrades = evaluated.globalGrades;
  row.approvedForFinalDelivery = evaluated.approvedForFinalDelivery;
  row.trainingEligible = evaluated.trainingEligible;
  row.humanApproved = evaluated.humanApproved;
  row.independentPdfReference = evaluated.independentPdfReference;
  row.equivalentToPdf = evaluated.equivalentToPdf;
  row.unsupported = evaluated.unsupported;
  return row;
}

function summarizeField(event, fieldName) {
  if (fieldName === 'pitches') {
    return (event?.pitches ?? []).map(pitch => {
      const spelling = pitch.spelling ?? pitch;
      return `${spelling.step ?? '?'}${spelling.alter > 0 ? '#'.repeat(Math.min(3, spelling.alter)) : spelling.alter < 0 ? 'b'.repeat(Math.min(3, -spelling.alter)) : ''}${pitch.octave ?? '?'}`;
    }).join('+') || (event?.kind === 'rest' ? 'pausa' : '?');
  }
  if (fieldName === 'kind') return event?.kind ?? '?';
  if (fieldName === 'onsetQ') return `início ${event?.onsetQ ?? '?'}`;
  if (fieldName === 'durationQ') return `duração ${event?.durationQ ?? '?'}`;
  return String(event?.[fieldName] ?? '?');
}

function unsupportedLabel(items) {
  return [...new Set((items ?? []).map(item => item.code))].join(', ') || '—';
}

function markdownReport(report) {
  const lines = [
    '# Comparação de eventos MSCX → MusicXML',
    '',
    `Gerado em ${report.generatedOn}. Escopo: comparar eventos completos do MSCX nativo extraído com a exportação MusicXML registrada no acervo, após conferir hashes do MSCX embutido e do XML candidato.`,
    '',
    `Snapshot anterior à correção pitch/TPC: [JSON histórico](native-event-comparison-pre-tpc-octave-fix-2026-10-07.json), SHA-256 ${report.scope.preTpcOctaveFixSnapshot.jsonSha256}; [Markdown histórico](native-event-comparison-pre-tpc-octave-fix-2026-10-07.md), SHA-256 ${report.scope.preTpcOctaveFixSnapshot.markdownSha256}.`,
    '',
    'Este relatório não verifica equivalência com PDF, não cria uma referência visual independente e não homologa automaticamente o MusicXML. `scoreOutOf10` e notas globais permanecem nulos; aprovação final, aprovação humana e elegibilidade de treino permanecem falsas.',
    '',
    `Fontes `.concat(String(report.totals.sourcesInCatalog), `; fontes MSCZ processadas nesta execução: ${report.totals.sourcesProcessed}. Estados: ${JSON.stringify(report.totals.byStatus)}.`),
    '',
    '| Fonte MSCZ | MSCX extraído | Exportação nativa | Eventos fonte / XML | Comparação | Exatas | Alteradas | Ausentes | Extras | Não suportado |',
    '|---|---:|---|---:|---|---:|---:|---:|---:|---|',
  ];
  for (const row of report.sources) {
    const counts = row.counts ?? {};
    const comparison = row.comparison ?? {};
    const sourceEvents = counts.sourcePitchedNotes === null || counts.sourcePitchedNotes === undefined
      ? '—' : `${counts.sourcePitchedNotes}+${counts.sourceRests}`;
    const candidateEvents = counts.candidatePitchedNotes === null || counts.candidatePitchedNotes === undefined
      ? '—' : `${counts.candidatePitchedNotes}+${counts.candidateRests}`;
    const nativeStatus = row.candidate?.reportStatus ?? row.status;
    lines.push(`| ${row.source.fileName} | ${row.source.embeddedMainSha256Actual === row.source.embeddedMainSha256Expected ? 'verificado' : 'falhou'} | ${nativeStatus} | ${sourceEvents} / ${candidateEvents} | ${row.status} | ${comparison.exact ?? '—'} | ${comparison.changed ?? '—'} | ${comparison.missing ?? '—'} | ${comparison.extra ?? '—'} | ${unsupportedLabel(row.unsupported)} |`);
  }
  lines.push('', '## Divergências de evento em comparações suportadas', '');
  const supportedRows = report.sources.filter(row => row.status === 'compared' && row.comparison);
  const differences = supportedRows.flatMap(row => row.comparison.differences.map(diff => ({ row, diff })));
  if (!differences.length) lines.push('Nenhuma divergência de evento foi confirmada nas comparações suportadas desta execução.');
  else {
    for (const { row, diff } of differences.slice(0, 60)) {
      const event = diff.source ?? diff.candidate;
      const fieldSummary = diff.kind === 'changed'
        ? diff.fields.map(field => `${field.field}: ${JSON.stringify(field.expected)} → ${JSON.stringify(field.actual)}`).join('; ')
        : diff.kind === 'missing' ? 'evento presente no MSCX e ausente no MusicXML' : 'evento presente no MusicXML e ausente no MSCX';
      lines.push(`- **${row.source.fileName}**, compasso índice ${event?.measureIndex ?? '?'}, pauta ${event?.localStaff ?? '?'}, voz ${event?.voiceOrdinal ?? '?'}, início ${event?.onsetQ ?? '?'}: ${diff.kind}; ${fieldSummary}.`);
    }
    if (differences.length > 60) lines.push('', `A lista resume 60 de ${differences.length} diferenças; o JSON guarda todas as diferenças e os dois fluxos de eventos completos.`);
  }
  lines.push('', 'Adjudicação de pitch/TPC: a revisão identificou um erro no validador anterior. A fórmula `floor(pitch/12)-1` atribuía oitava 4 a B#3 com MIDI 60; agora a oitava é derivada de MIDI menos classe natural da letra menos alteração, dividido por 12 e menos 1, aceitando somente resultado inteiro. Isso removeu o falso bloqueio de Brejeiro e de uma nota em a56; não é divergência atribuída ao exportador ou à partitura.');
  lines.push('', 'Exemplo de interpretação ainda bloqueada: em **Libertango-rearranjo.mscz**, 10 grupos de notas nos índices de compasso 113–115 têm alturas XML uma oitava acima dos valores `pitch` do MSCX, enquanto os inícios e durações coincidem. O trecho contém `Ottava` com subtipo `8va` e o MusicXML traz `octave-shift`; esta execução preserva ambos e não classifica esses grupos como divergência.');
  lines.push('', '## Recursos que permanecem sem interpretação', '');
  const unsupportedRows = report.sources.filter(row => row.status !== 'compared');
  if (!unsupportedRows.length) lines.push('Nenhuma fonte ficou sem suporte nesta execução.');
  else for (const row of unsupportedRows) lines.push(`- **${row.source.fileName}**: ${row.status}; ${unsupportedLabel(row.unsupported)}.`);
  lines.push('', 'As vozes vazias e a numeração original de compassos são preservadas nas topologias por fonte e MusicXML. A comparação de eventos usa índice do compasso, pauta e voz; diferenças de rótulos de compasso, expansões de multicompasso e slots de voz vazios não contam como defeito musical. A largura `stretch` de compasso é mantida como metadado de layout e não altera os eventos, conforme o [Handbook oficial do MuseScore](https://handbook.musescore.org/formatting/systems-and-horizontal-spacing#layout-stretch). Localizações diretas na voz com uma fração simples são aplicadas como deslocamento aditivo; formas com `timeTick`, localização não zero em compassos ou dados extras continuam sem suporte. Links `<next>/<prev><location>` de spanner são preservados em `relationshipLinks` e ficam fora da comparação de início/duração, seguindo a [issue oficial do MuseScore #23688](https://github.com/musescore/MuseScore/issues/23688). Arpejos, ornamentos e tremolos fonte são retidos em `outOfScopeModifiers` porque esta comparação cobre os eventos escritos, não instruções adicionais de execução.');
  return `${lines.join('\n')}\n`;
}

export async function verifyNativeEvents({ limit = null, names = null } = {}) {
  const [catalog, results] = await Promise.all([readJson(CATALOG_PATH), readJson(RESULTS_PATH)]);
  const msczSources = list(catalog.sources).filter(source => source.fileType === 'MSZip archive (.mscz)');
  const selectedSources = names?.length ? msczSources.filter(source => names.includes(source.sourceFileName)) : msczSources;
  const runSources = limit ? selectedSources.slice(0, limit) : selectedSources;
  const sources = [];
  for (const source of runSources) sources.push(await reviewSource(source, results));

  const byStatus = Object.fromEntries([...new Set(sources.map(source => source.status))].sort().map(status => [status, sources.filter(source => source.status === status).length]));
  const report = {
    schemaVersion: 1,
    generatedOn: new Date().toISOString(),
    scope: {
      sourceCatalog: path.relative(REPO_ROOT, CATALOG_PATH),
      nativeResultIndex: path.relative(REPO_ROOT, RESULTS_PATH),
      sourceFormat: 'MSCZ embedded main member (.mscx), parsed only after exact SHA-256 verification against embeddedSha256',
      candidateFormat: 'MusicXML exported from the same MSCZ according to nativeLatest/nativeReports, parsed only after exact SHA-256 verification against report.exports[].sha256',
      comparedFields: ['part', 'staff', 'voice', 'measure index', 'written pitch spelling', 'chord membership', 'onset in quarter lengths', 'duration in quarter lengths', 'duration type', 'dots', 'grace', 'measure rest'],
      measureNumbering: 'Original/source and MusicXML measure labels, plus MusicXML implicit pickup marker, are retained as metadata. Event alignment uses per-part measure index so numbering labels cannot create false music differences.',
      emptyVoices: 'Every MSCX measure voice node is retained, including empty slots. MusicXML voice labels and empty staff/voice coverage are retained separately; empty-slot count differences are not musical errors.',
      unsupportedPolicy: 'Any unverified event/timing encoding blocks comparison and produces no score. Unsupported records include the raw element evidence when available.',
      layoutStretch: {
        officialMuseScoreHandbook: 'https://handbook.musescore.org/formatting/systems-and-horizontal-spacing#layout-stretch',
        interpretationUsed: 'Measure stretch is documented as a factor for horizontal measure width. The raw value is retained with the measure and does not change event onset or duration.',
      },
      locationEvidence: {
        officialMuseScoreIssue: 'https://github.com/musescore/MuseScore/issues/23688',
        interpretationUsed: 'Direct voice locations with exactly one whole-note fraction and no nonzero measure displacement or extra fields are applied as additive offsets, converting whole-note fractions to quarter-length units by multiplying by four. Their raw values and computed offsets are retained. The official issue describes next/prev Location entries under Spanner as endpoint relationship pointers; those are retained as relationshipLinks and excluded from onset/duration fields. Other Location/tick encodings remain unsupported.',
      },
      outOfScopeWrittenEvents: 'Arpeggio, Ornament, Tremolo, and TremoloSingleChord source markers are preserved in source.outOfScopeModifiers. They do not change the written notehead pitch, chord membership, or notated duration fields compared here; performance realization is not compared.',
      pitchTpcAdjudication: {
        origin: 'validator bug identified in independent review; no issue attributed to the conversion engine or source score',
        correction: 'Derive written octave as (MIDI pitch - natural pitch class for the TPC letter - TPC alteration) / 12 - 1, accepting only an integer result. This handles enharmonic spellings that cross a MIDI octave boundary, including B#3 at MIDI 60 and Cb4 at MIDI 59.',
        independentPythonReferenceConsultedOrImported: false,
      },
      preTpcOctaveFixSnapshot: {
        jsonPath: 'docs/validation/acervo-review-2026-10-07/reviews/native-event-comparison-pre-tpc-octave-fix-2026-10-07.json',
        jsonSha256: 'eaf91fbc1e417107da52e8cdd13cfcd8610ede86ee1f8b3f00a0da1ee1ed718a',
        markdownPath: 'docs/validation/acervo-review-2026-10-07/reviews/native-event-comparison-pre-tpc-octave-fix-2026-10-07.md',
        markdownSha256: '6b26175d3d47608a5fa00f27a1b2e48d5d5caaee4a53c257794bb9ae9947fdec',
      },
      withheldInterpretationExamples: [
        'Libertango-rearranjo.mscz: 10 note groups in measure indexes 113–115 have XML pitches an octave above MSCX pitch values while onset and duration align. The source has an Ottava subtype=8va and MusicXML octave-shift; those groups are withheld as unresolved written-pitch interpretation, not classified as a confirmed event divergence.',
      ],
      referencePolicy: 'Native encoding source and same-source export comparison only. No PDF equivalence, independent visual reference, human approval, or training eligibility is asserted.',
    },
    totals: {
      sourcesInCatalog: msczSources.length,
      sourcesSelected: selectedSources.length,
      sourcesProcessed: sources.length,
      byStatus,
    },
    scoreOutOf10: null,
    globalGrades: null,
    approvedForFinalDelivery: false,
    trainingEligible: false,
    humanApproved: false,
    independentPdfReference: false,
    equivalentToPdf: false,
    sources,
  };
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(MARKDOWN_OUTPUT, markdownReport(report), 'utf8');
  return { report, jsonPath: JSON_OUTPUT, markdownPath: MARKDOWN_OUTPUT };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log('Uso: node scripts/verify-native-events.mjs [--limit N] [--names arquivo1.mscz,arquivo2.mscz]');
  } else {
    const { report, jsonPath, markdownPath } = await verifyNativeEvents(options);
    console.log(JSON.stringify({
      sourcesInCatalog: report.totals.sourcesInCatalog,
      sourcesProcessed: report.totals.sourcesProcessed,
      byStatus: report.totals.byStatus,
      jsonPath,
      markdownPath,
      scoreOutOf10: report.scoreOutOf10,
      globalGrades: report.globalGrades,
    }, null, 2));
  }
}
