import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyAssistedPolyphonicRepairPlan, createAssistedPolyphonicRepairPlan } from "../services/AssistedPolyphonicScoreRepair.js";

const sha256 = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");
const source = Buffer.from("synthetic source image");
const wrapper = (measure: string, title = "Score"): string => `<?xml version="1.0"?>\n<score-partwise version="4.0"><work><work-title>${title}</work-title></work><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1">${measure}</part></score-partwise>`;
const header = "<attributes><divisions>4</divisions><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>";
const note = (step: string, duration: number, extra = "", voice = "1"): string => `<note>${extra}<pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><type>quarter</type></note>`;
const baseline = wrapper(`<measure number="1">${header}${note("C", 4)}${note("D", 4)}${note("E", 4)}</measure>`);
const reviewed = wrapper(`<measure number="1">${header}${note("C", 4)}<note><grace slash="yes"/><pitch><step>D</step><octave>4</octave></pitch><voice>1</voice><type>eighth</type></note>${note("E", 8)}<backup><duration>12</duration></backup>${note("G", 4, "", "2")}${note("B", 4, "<chord/>", "2")}${note("F", 8, "", "2")}</measure>`, "Reviewed Score");

describe("explicit assisted polyphonic score repair", () => {
  it("replaces reviewed voices, chord and grace with exact-byte source and baseline binding", () => {
    const plan = createAssistedPolyphonicRepairPlan({ sourceBytes: source, baseXml: baseline, reviewedXml: reviewed });
    const result = applyAssistedPolyphonicRepairPlan({ sourceBytes: source, baseXml: baseline, plan });

    expect(plan.sourceSha256).toBe(sha256(source));
    expect(plan.baseXmlSha256).toBe(sha256(baseline));
    expect(plan.reviewedXmlSha256).toBe(sha256(reviewed));
    expect(plan.operations.map((operation) => operation.kind)).toEqual(["replace_score_metadata", "replace_measure"]);
    expect(plan.operations[1]).toMatchObject({ measure: "1", measureIndex: 0,
      before: { events: 3, graces: 0, chords: 0 }, after: { events: 6, graces: 1, chords: 1, voices: ["1", "2"] } });
    expect(result.musicXml).toBe(reviewed);
    expect(result.inventory).toMatchObject({ before: { events: 3 }, after: { events: 6, graces: 1, chords: 1 } });
    expect(result).toMatchObject({ humanEditorialApproval: false, accuracyVerified: false,
      trainingEligible: false, requiresReview: true });
  });

  it("rejects altered source, baseline, payload, operation and editorial claims", () => {
    const plan = createAssistedPolyphonicRepairPlan({ sourceBytes: source, baseXml: baseline, reviewedXml: reviewed });
    const apply = (overrides: Partial<Parameters<typeof applyAssistedPolyphonicRepairPlan>[0]> = {}) =>
      applyAssistedPolyphonicRepairPlan({ sourceBytes: source, baseXml: baseline, plan, ...overrides });
    expect(() => apply({ sourceBytes: Buffer.from("different source") })).toThrow(/Hash/);
    expect(() => apply({ baseXml: baseline + " " })).toThrow(/Hash/);
    expect(() => apply({ plan: { ...plan, reviewedXml: plan.reviewedXml + " " } })).toThrow(/Hash/);
    expect(() => apply({ plan: { ...plan, operations: plan.operations.slice(1) } })).toThrow(/Operações/);
    expect(() => apply({ plan: { ...plan, review: { ...plan.review, trainingEligible: true as false } } })).toThrow(/Operações/);
  });

  it("rejects ambiguous review alignment, chord after a rest, and cursor corruption", () => {
    const create = (reviewedXml: string) => createAssistedPolyphonicRepairPlan({ sourceBytes: source, baseXml: baseline, reviewedXml });
    expect(() => create(reviewed.replace('number="1"', 'number="2"'))).toThrow(/compassos/);
    expect(() => create(reviewed.replace(`${note("G", 4, "", "2")}${note("B", 4, "<chord/>", "2")}`,
      '<note><rest/><duration>4</duration><voice>2</voice></note>' + note("B", 4, "<chord/>", "2")))).toThrow(/Acorde sem nota-base/);
    expect(() => create(reviewed.replace("<backup><duration>12</duration></backup>", "<backup><duration>13</duration></backup>"))).toThrow(/Backup/);
    expect(() => create(reviewed.replace("<backup><duration>12</duration></backup>", "<backup><duration>11</duration></backup>"))).toThrow(/Backup/);
    expect(() => create(reviewed.replace(note("E", 8), note("E", 4)))).toThrow(/Backup antes/);
    expect(() => create(reviewed.replace(note("B", 4, "<chord/>", "2"), note("B", 8, "<chord/>", "2")))).toThrow(/duração diferente/);
    expect(() => create(reviewed.replace("<score-partwise", '<!DOCTYPE score-partwise [<!ENTITY x "unsafe">]><score-partwise'))).toThrow(/MusicXML inválido/);
    expect(() => create(reviewed.replace("<score-partwise", '<!DOCTYPE score-partwise SYSTEM "https://example.org/x.dtd"><score-partwise'))).toThrow(/DTD/);
  });

  it("strips an external Audiveris DTD from the baseline before parsing", () => {
    const audiverisBaseline = baseline.replace("<score-partwise", '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0.3 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd"><score-partwise');
    const plan = createAssistedPolyphonicRepairPlan({ sourceBytes: source, baseXml: audiverisBaseline, reviewedXml: reviewed });
    const output = applyAssistedPolyphonicRepairPlan({ sourceBytes: source, baseXml: audiverisBaseline, plan });
    expect(plan.baseXmlSha256).toBe(sha256(audiverisBaseline));
    expect(output.musicXml).toBe(reviewed);
    expect(output.musicXml).not.toContain("<!DOCTYPE");
  });

  it("creates and applies a plan for the preserved Adelita source review", () => {
    const dir = new URL("../../../../source-ledgers/adelita-2026-10-10/", import.meta.url);
    const sourceBytes = readFileSync(new URL("original.pdf", dir));
    const baseXml = readFileSync(new URL("converted-original.musicxml", dir), "utf8");
    const reviewedXml = readFileSync(new URL("reviewed.musicxml", dir), "utf8");
    const plan = createAssistedPolyphonicRepairPlan({ sourceBytes, baseXml, reviewedXml });
    const result = applyAssistedPolyphonicRepairPlan({ sourceBytes, baseXml, plan });

    expect(plan.sourceSha256).toBe("d51b949f2f2e76967402ffb7228adf17656263bac87cbb7df4bf5f195e22b115");
    expect(result.inventory.before.events).toBe(108);
    expect(result.inventory.after).toMatchObject({ events: 147, graces: 12, chords: 29, voices: ["1", "2", "3"] });
    expect(result.musicXml).toBe(reviewedXml);
    expect(result.history.filter((operation) => operation.kind === "replace_measure").length).toBeGreaterThan(0);
    expect(result.provenance.outputXmlSha256).toBe(sha256(reviewedXml));
  });
});
