import { createHash } from "node:crypto";
import type { MusicalValidation } from "../domain.js";
import type { MidiExportService, MidiValidation } from "./MidiExportService.js";

/** A rendering check is tied to this XML version, never promoted to source accuracy. */
export async function inspectMidiForReview(xml: string, inspector: MidiExportService): Promise<MidiValidation> {
  const xmlSHA256 = createHash("sha256").update(xml).digest("hex");
  try {
    const report = await inspector.inspect(xml);
    if (report.xmlSHA256 !== xmlSHA256) throw new Error("stale-midi-inspection");
    return report;
  } catch {
    return { status: "unverified", checkedNotes: 0, xmlSHA256,
      issues: [{ code: "MIDI_PREFLIGHT_UNAVAILABLE", message: "A conferência do MIDI não ficou disponível nesta versão. Confira a execução antes de usar." }],
      limitations: ["Não há resultado verificável de execução MIDI para esta versão."] };
  }
}

export function withMidiValidation(validation: MusicalValidation, midiValidation: MidiValidation): MusicalValidation {
  // A corrected revision must not inherit MIDI issues or acceptance from its parent.
  const issues = validation.issues.filter((issue) => !issue.code.startsWith("MIDI_"));
  for (const issue of midiValidation.issues) issues.push({ ...issue,
    severity: midiValidation.status === "failed" ? "error" : "warning" });
  const { reviewAcceptance: _previousAcceptance, ...current } = validation;
  return { ...current, midiValidation, issues, requiresReview: true };
}

export function reviewAcceptanceFor(validation: MusicalValidation, revision: string): NonNullable<MusicalValidation["reviewAcceptance"]> {
  const visual = validation.visualReview;
  const unresolvedVisualMeasures = visual ? visual.unknownMeasures : Math.max(1, validation.checkedMeasures);
  const keptVisualProposals = visual?.proposals.filter((proposal) => proposal.status === "rejected").length ?? 0;
  const midiStatus = validation.midiValidation?.status ?? "not_checked";
  const reservations = unresolvedVisualMeasures > 0 || keptVisualProposals > 0 || validation.issues.length > 0
    || validation.skippedMeasures > 0 || (visual && visual.status !== "completed") || midiStatus !== "passed";
  return { kind: reservations ? "accepted_with_reservations" : "accepted", revision, acceptedAt: new Date().toISOString(),
    unresolvedVisualMeasures, keptVisualProposals, validationIssueCount: validation.issues.length, midiStatus,
    accuracyVerified: false, trainingEligible: false };
}
