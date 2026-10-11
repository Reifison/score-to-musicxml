import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { MusicalValidation } from "../domain.js";
import type { MidiExportService } from "../services/MidiExportService.js";
import { inspectMidiForReview, reviewAcceptanceFor, withMidiValidation } from "../services/MidiReviewPreflight.js";

const xml = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>1</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note></measure></part></score-partwise>`;
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");

describe("MIDI review preflight", () => {
  it("keeps an inspector report only when it belongs to the exact MusicXML", async () => {
    const report = {
      status: "passed" as const,
      checkedNotes: 1,
      checkedDurations: 1,
      issues: [],
      limitations: [],
      xmlSHA256: hash(xml)
    };
    const inspector = { inspect: vi.fn().mockResolvedValue(report) } as unknown as MidiExportService;

    await expect(inspectMidiForReview(xml, inspector)).resolves.toEqual(report);
    expect(inspector.inspect).toHaveBeenCalledWith(xml);
  });

  it("uses an unverified fallback when the inspector is unavailable or returns a stale hash", async () => {
    const unavailable = { inspect: vi.fn().mockRejectedValue(new Error("inspector unavailable")) } as unknown as MidiExportService;
    const unavailableReport = await inspectMidiForReview(xml, unavailable);
    expect(unavailableReport).toMatchObject({
      status: "unverified",
      checkedNotes: 0,
      xmlSHA256: hash(xml),
      issues: [{ code: "MIDI_PREFLIGHT_UNAVAILABLE" }]
    });

    const stale = { inspect: vi.fn().mockResolvedValue({
      status: "passed", checkedNotes: 1, issues: [], limitations: [], xmlSHA256: "0".repeat(64)
    }) } as unknown as MidiExportService;
    expect(await inspectMidiForReview(xml, stale)).toMatchObject({
      status: "unverified",
      xmlSHA256: hash(xml),
      issues: [{ code: "MIDI_PREFLIGHT_UNAVAILABLE" }]
    });
  });

  it("records a manual acceptance with reservations without verifying accuracy or training eligibility", () => {
    const validation: MusicalValidation = {
      version: 1,
      issues: [{ code: "MIDI_PREFLIGHT_UNAVAILABLE", severity: "warning", message: "MIDI não verificado." }],
      checkedMeasures: 3,
      skippedMeasures: 1,
      requiresReview: true,
      midiValidation: {
        status: "unverified",
        checkedNotes: 0,
        issues: [{ code: "MIDI_PREFLIGHT_UNAVAILABLE", message: "MIDI não verificado." }],
        limitations: ["Não há resultado verificável."],
        xmlSHA256: hash(xml)
      }
    };
    const acceptance = reviewAcceptanceFor(validation, hash(xml));

    expect(acceptance).toMatchObject({
      kind: "accepted_with_reservations",
      revision: hash(xml),
      unresolvedVisualMeasures: 3,
      validationIssueCount: 1,
      midiStatus: "unverified",
      accuracyVerified: false,
      trainingEligible: false
    });
  });

  it("replaces inherited MIDI issues and clears an earlier acceptance for a new revision", () => {
    const validation: MusicalValidation = {
      version: 1,
      issues: [
        { code: "RHYTHM_SHORT", severity: "warning", message: "Ritmo incompleto." },
        { code: "MIDI_EVENT_MISMATCH", severity: "error", message: "Relatório MIDI antigo." }
      ],
      checkedMeasures: 1,
      skippedMeasures: 0,
      requiresReview: true,
      reviewAcceptance: {
        kind: "accepted_with_reservations", revision: "old", acceptedAt: "2026-10-01T00:00:00.000Z",
        unresolvedVisualMeasures: 1, keptVisualProposals: 0, validationIssueCount: 1, midiStatus: "failed",
        accuracyVerified: false, trainingEligible: false
      }
    };

    const updated = withMidiValidation(validation, {
      status: "passed", checkedNotes: 1, checkedDurations: 1, issues: [], limitations: [], xmlSHA256: hash(xml)
    });
    expect(updated.issues.map((issue) => issue.code)).toEqual(["RHYTHM_SHORT"]);
    expect(updated.reviewAcceptance).toBeUndefined();
    expect(updated.midiValidation?.xmlSHA256).toBe(hash(xml));
  });
});
