import type { MusicXmlValidationIssue } from "./MusicXmlValidation.js";

/** Exit status zero is not sufficient: Audiveris can skip a measure while
 * exporting and still announce that the MusicXML file was written. */
export function inspectAudiverisProcessOutput(output: string): {
  exportIncomplete: boolean;
  issues: MusicXmlValidationIssue[];
} {
  const exportIncomplete = /^score-to-musicxml:export-incomplete$/m.test(output)
    || /PartwiseBuilder[^\r\n]*\bError visiting\b/i.test(output)
    || /(?:ScoreExporter|Book)[^\r\n]*\bError (?:exporting|writing)\b/i.test(output);
  const unresolved = /^score-to-musicxml:rhythm-unresolved$/m.test(output)
    || /\bNo timeOffset for (?:Head|Rest)ChordInter\b|\bMeasureStack#[^\r\n]*\bno correct rhythm\b/i.test(output);
  // Native stack IDs need not equal exported labels (notably with anacrusis).
  // Keep page-level context until an independent mapping establishes a label.
  return { exportIncomplete, issues: unresolved ? [{ code: "OMR_RHYTHM_UNRESOLVED", severity: "warning",
    message: "O reconhecimento não resolveu a posição de algumas notas ou pausas; confira os compassos com o original." }] : [] };
}

/** Persist only diagnostic flags. Raw engine output can contain private paths,
 * filenames and OCR text; native evidence is downloadable by the score owner. */
export function redactedAudiverisProcessLog(output: string): string {
  const diagnosis = inspectAudiverisProcessOutput(output);
  return ["score-to-musicxml:audiveris-diagnostics-v1",
    ...(diagnosis.exportIncomplete ? ["score-to-musicxml:export-incomplete"] : []),
    ...(diagnosis.issues.length ? ["score-to-musicxml:rhythm-unresolved"] : [])].join("\n") + "\n";
}
