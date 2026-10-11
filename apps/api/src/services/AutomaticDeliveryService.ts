import { createHash } from "node:crypto";
import type { MusicalValidation, Score } from "../domain.js";
import type { AuditRepository, ScoreRepository } from "../repositories/contracts.js";
import { FileStorageService } from "./FileStorageService.js";
import { MidiExportService } from "./MidiExportService.js";
import { inspectMidiForReview, reviewAcceptanceFor, withMidiValidation } from "./MidiReviewPreflight.js";
import { reviewRevision } from "./MusicalReview.js";
import { inspectMusicXmlValidation } from "./MusicXmlValidation.js";

/** Deliver the immutable selected MusicXML without promoting uncertain source-reading proposals. */
export class AutomaticDeliveryService {
  constructor(private scores: ScoreRepository, private audits: AuditRepository,
    private storage: FileStorageService, private midiInspector: MidiExportService) {}

  async finalize(scoreId: string): Promise<Score | null> {
    const score = await this.scores.findById(scoreId);
    if (!score || score.deletedAt || score.conversionStatus !== "converted" || score.reviewStatus !== "needs_review"
      || !score.musicxmlFilename || !score.reviewRevision) return score;
    const xml = await this.storage.readExport(score.musicxmlFilename);
    const xmlSHA256 = createHash("sha256").update(xml).digest("hex");
    if (reviewRevision(score.musicxmlFilename, xml) !== score.reviewRevision
      || (score.validation?.visualReview && score.validation.visualReview.xmlSHA256 !== xmlSHA256)) return score;

    const validation: MusicalValidation = score.validation ? structuredClone(score.validation) : inspectMusicXmlValidation(xml);
    const visual = validation.visualReview;
    const pending = visual?.proposals.filter((proposal) => proposal.status === "pending") ?? [];
    if (visual && visual.history.length + pending.length > 5000) return score;
    for (const proposal of pending) {
      proposal.status = "rejected";
      visual!.history.push({ proposalId: proposal.id, decision: "reject", baseRevision: score.reviewRevision,
        revision: score.reviewRevision, actorId: "system:automatic_delivery_v1", at: new Date().toISOString(),
        exportFilename: score.musicxmlFilename, previousExportFilename: score.musicxmlFilename });
    }
    const midi = validation.midiValidation?.xmlSHA256 === xmlSHA256
      ? validation.midiValidation : await inspectMidiForReview(xml, this.midiInspector);
    const checked = withMidiValidation(validation, midi);
    checked.reviewAcceptance = { ...reviewAcceptanceFor(checked, score.reviewRevision), method: "automatic_delivery_v1" };
    const approved = await this.scores.approveAutomatic(scoreId, score.reviewRevision, checked);
    if (!approved) return (await this.scores.findById(scoreId)) ?? score;
    await this.audits.create({ actorId: null, action: "score_reviewed", entity: "score", entityId: scoreId,
      metadata: { decision: "automatic_delivery", method: "automatic_delivery_v1", revision: score.reviewRevision,
        selectedXmlSHA256: xmlSHA256, rejectedVisualProposals: pending.map((proposal) => proposal.id),
        acceptance: checked.reviewAcceptance, midiValidationStatus: midi.status,
        accuracyVerified: false, trainingEligible: false } }).catch(() => undefined);
    return approved;
  }
}
