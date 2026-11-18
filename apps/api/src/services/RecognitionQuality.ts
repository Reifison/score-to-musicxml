import type { RecognitionQuality, Score } from "../domain.js";

// These describe an unperformed check or a declared instrument convention,
// rather than a detected change to the written music.
const inconclusiveIssues = new Set([
  "GUITAR_TRANSPOSITION_NORMALIZED", "RHYTHM_UNCHECKED", "VOICE_RHYTHM_UNCHECKED",
  "CANDIDATE_AGREEMENT_UNCHECKED", "MIDI_EVENTS_UNVERIFIED", "MIDI_PREFLIGHT_UNAVAILABLE"
]);
const sourceDifferences = new Set([
  "VISUAL_MEASURE_COUNT_MISMATCH", "VISUAL_SOURCE_MEASURE_UNMAPPED",
  "VISUAL_KEY_SIGNATURE_MISMATCH", "VISUAL_KEY_AFFECTED_PITCH_MISMATCH",
  "VISUAL_RHYTHM_EDIT_REQUIRES_MANUAL", "VISUAL_CONTEXT_ONLY_PROPOSALS_MANUAL"
]);
const incompleteSourceChecks = new Set([
  "HOMR_EMPTY_MEASURE", "HOMR_UNSUPPORTED_STRUCTURE", "VISUAL_READER_NOT_CONFIGURED",
  "VISUAL_READER_INVALID_RESPONSE", "VISUAL_READER_FAILED", "VISUAL_READER_TIMEOUT",
  "VISUAL_READER_OUTPUT_LIMIT", "VISUAL_READER_EXECUTION_FAILED", "VISUAL_READER_SOURCE_MISMATCH",
  "VISUAL_READER_DUPLICATE_MEASURES", "VISUAL_SOURCE_CHANGED", "VISUAL_CROP_LIMIT",
  "VISUAL_SOURCE_COVERAGE_UNCONFIRMED", "VISUAL_MEASURE_UNREADABLE",
  "VISUAL_PAGE_MAPPING_AMBIGUOUS", "VISUAL_SOURCE_UNAVAILABLE", "VISUAL_SOURCE_UNSAFE",
  "VISUAL_XML_UNINDEXABLE", "VISUAL_PAGE_LIMIT", "VISUAL_MEASURE_LIMIT", "VISUAL_IMAGE_LIMIT",
  "VISUAL_READER_VERSION_CHANGED"
]);

function messageFor(code: string): string {
  if (code === "OMR_RHYTHM_UNRESOLVED") return "O reconhecimento não resolveu a posição de algumas notas ou pausas. Confira os compassos com o original.";
  if (code === "VISUAL_PAGE_LIMIT" || code === "VISUAL_MEASURE_LIMIT" || code === "VISUAL_IMAGE_LIMIT") {
    return "A comparação automática não cobriu todo este documento. Confira o restante no original.";
  }
  if (incompleteSourceChecks.has(code)) return "Não foi possível conferir todos os compassos da imagem. Compare esta página com o original.";
  if (code === "PAGE_COVERAGE_INCOMPLETE") return "Há páginas ausentes ou cuja leitura não pôde ser confirmada.";
  if (code === "VISUAL_MEASURE_COUNT_MISMATCH" || code === "VISUAL_SOURCE_MEASURE_UNMAPPED") {
    return "As leituras divergem na quantidade de compassos. Confira se toda a música aparece no resultado.";
  }
  if (code.includes("KEY_SIGNATURE") || code.includes("KEY_AFFECTED_PITCH")) {
    return "As leituras da armadura de clave divergem. Confira os sustenidos, bemóis e as notas no original.";
  }
  if (code.startsWith("RHYTHM_") || code.startsWith("VOICE_") || code === "VISUAL_RHYTHM_EDIT_REQUIRES_MANUAL") {
    return "Há uma diferença na duração das notas ou pausas. Confira o ritmo com o original.";
  }
  if (code.startsWith("CANDIDATE_") || code === "VISUAL_SOURCE_EVENT_DIFFERENCE") {
    return "As leituras musicais divergem. Compare as notas, pausas e sinais com o original.";
  }
  if (code.includes("STAFF") || code.includes("SYSTEM") || code.includes("PART_INTEGRITY")) {
    return "A quantidade de pautas ou partes precisa ser conferida com o original.";
  }
  if (code.startsWith("MIDI_")) return "A reprodução precisa ser conferida com a partitura original.";
  if (code.includes("TIE") || code.includes("SLUR")) return "Confira as ligaduras e a duração das notas no original.";
  if (code.includes("ACCIDENTAL")) return "Confira os acidentes musicais e as notas no original.";
  if (code.includes("REPEAT") || code.includes("ENDING") || code.includes("NAVIGATION") || code.includes("SEGNO")) {
    return "Confira os sinais de repetição e a ordem de execução no original.";
  }
  return "Há um trecho musical que precisa ser conferido com a partitura original.";
}

/** A response summary, never a stored or inferred certificate of accuracy. */
export function recognitionQualityFor(score: Pick<Score, "conversionStatus" | "resultStatus" | "coverage" | "validation">): RecognitionQuality | undefined {
  if (score.conversionStatus !== "converted") return undefined;
  const visual = score.validation?.visualReview;
  const issues: RecognitionQuality["issues"] = [];
  let musicalProblem = false;
  const keys = new Set<string>();
  const add = (code: string, context: { page?: number; measure?: string } = {}, isMusicalProblem = true) => {
    musicalProblem ||= isMusicalProblem;
    const page = Number.isInteger(context.page) && context.page! > 0 ? context.page : undefined;
    const label = typeof context.measure === "string" ? context.measure.trim() : "";
    const measure = /^\d+(?:[a-z]|\.\d+)?$/i.test(label) && label.length <= 32 ? label : undefined;
    const key = JSON.stringify([code, page, measure]);
    if (keys.has(key)) return;
    keys.add(key);
    issues.push({ code, message: messageFor(code), ...(page !== undefined ? { page } : {}), ...(measure !== undefined ? { measure } : {}) });
  };
  if (score.resultStatus === "partial") add("PAGE_COVERAGE_INCOMPLETE");
  for (const issue of score.validation?.issues ?? []) {
    if (issue.severity === "error" || !inconclusiveIssues.has(issue.code)) add(issue.code, issue);
  }
  for (const diagnostic of visual?.diagnostics ?? []) {
    if (sourceDifferences.has(diagnostic.code)) add(diagnostic.code, diagnostic);
    else if (incompleteSourceChecks.has(diagnostic.code)) add(diagnostic.code, diagnostic, false);
  }
  // Automatic delivery keeps the original candidate when an independent
  // reader disagrees. A kept/rejected proposal still represents disagreement.
  for (const proposal of visual?.proposals ?? []) {
    if (proposal.status !== "accepted") add("VISUAL_SOURCE_EVENT_DIFFERENCE", proposal);
  }
  const sourceComparison = !visual ? "unavailable"
    : visual.status === "skipped" || visual.status === "unavailable" ? visual.status
    : visual.status === "completed" && visual.unknownMeasures === 0 && visual.checkedMeasures > 0 && !visual.sourceMeasures?.length
      ? "compared" : "partial";
  return {
    status: musicalProblem ? "needs_review" : "unverified",
    sourceComparison,
    checkedMeasures: Math.max(0, visual?.checkedMeasures ?? 0),
    accuracyVerified: false,
    issues
  };
}
