import { describe, expect, it } from "vitest";
import { recoverNativeMeasureEvents, type NativeEventCandidate, type NativeMeasureEvidence } from "../services/NativeMeasureEventRecovery.js";

const sourceImageSha256 = "a".repeat(64);
const note = (step: string, x: number, duration: number, extras = "") =>
  `<note default-x="${x}"><pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration><voice>1</voice><type>${duration === 4 ? "whole" : duration === 2 ? "half" : "quarter"}</type>${extras}</note>`;
const rest = (duration: number) => `<note><rest/><duration>${duration}</duration><voice>1</voice><type>${duration === 3 ? "half" : "half"}</type>${duration === 3 ? "<dot/>" : ""}</note>`;
const measure = (index: number, contents: string, key = "") => `<measure number="${index}">${index === 1
  ? `<attributes><divisions>1</divisions><key><fifths>${key || "0"}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>` : ""}${contents}</measure>`;
const xml = (donor: boolean, options: { extraMeasure?: boolean; differentKey?: boolean; lostPitch?: boolean; tied?: boolean } = {}) => {
  const first = measure(1, note("E", 10, 4), options.differentKey ? "1" : "0");
  const baseSecond = note("C", 10, 1, options.tied ? `<tie type="stop"/><notations><tied type="stop"/></notations>` : "") + rest(3);
  const donorSecond = (options.lostPitch ? note("D", 10, 1) + note("E", 30, 1) : note("C", 10, 1) + note("D", 30, 1,
    `<notations><articulations><staccato/></articulations></notations>`)) + rest(2);
  return `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1">${first}${measure(2, donor ? donorSecond : baseSecond)}${options.extraMeasure ? measure(3, donor ? donorSecond : baseSecond) : ""}</part></score-partwise>`;
};
const evidence = (index: number, abnormal: boolean, headCount: number): NativeMeasureEvidence => ({
  measureIndex: index, systemIndex: 0, sourceWidth: 500, sourceHeight: 200,
  rectangle: { left: index * 100, top: 60, width: 100, height: 30 }, abnormal,
  heads: Array.from({ length: headCount }, (_, offset) => ({ id: String(index * 10 + offset + 1),
    rectangle: { left: index * 100 + 20 + offset * 40, top: 65, width: 10, height: 8 }, grade: 0.7, sourceInkRatio: 0.7 }))
});
const candidate = (id: string, donor: boolean, options: Parameters<typeof xml>[1] = {}): NativeEventCandidate => ({
  id, xml: xml(donor, options), sourceImageSha256,
  measures: [evidence(0, false, 1), evidence(1, !donor, donor ? 2 : 1), ...(options.extraMeasure ? [evidence(2, !donor, donor ? 2 : 1)] : [])]
});

describe("experimental native measure event recovery", () => {
  it("recovers a single abnormal measure while keeping the base score's other measures and requiring review", () => {
    const base = candidate("base", false);
    const recovered = recoverNativeMeasureEvents({ base, donors: [candidate("donor", true)] });
    expect(recovered.report.changes).toMatchObject([{ measureIndex: 1, recoveredPitchedNotes: 1,
      nativeHeadIds: ["11", "12"], omittedDonorNotationTags: ["notations"] }]);
    expect(recovered.musicXml).toContain("<step>D</step>");
    expect(recovered.musicXml).not.toContain("staccato");
    expect(recovered.report.requiresReview).toBe(true);
    expect(recovered.report.trainingEligible).toBe(false);
    expect(recovered.musicXml).toContain('<measure number="1">');
  });

  it("keeps the base unchanged when no extra event is supported, a pitch is lost or a tie crosses the boundary", () => {
    for (const [base, donor] of [
      [candidate("base", false), candidate("donor", false)],
      [candidate("base", false), candidate("donor", true, { lostPitch: true })],
      [candidate("base", false, { tied: true }), candidate("donor", true)]
    ]) {
      const recovered = recoverNativeMeasureEvents({ base, donors: [donor] });
      expect(recovered.musicXml).toBe(base.xml);
      expect(recovered.report.changes).toEqual([]);
    }
  });

  it("rejects changed effective key, ungrounded head boxes, and more than one eligible measure", () => {
    const base = candidate("base", false);
    const ungrounded = candidate("donor", true);
    ungrounded.measures[1].heads[0].rectangle.top = 190;
    for (const donor of [candidate("donor", true, { differentKey: true }), ungrounded]) {
      expect(recoverNativeMeasureEvents({ base, donors: [donor] }).musicXml).toBe(base.xml);
    }
    const multipleBase = candidate("base", false, { extraMeasure: true });
    const multipleDonor = candidate("donor", true, { extraMeasure: true });
    const recovered = recoverNativeMeasureEvents({ base: multipleBase, donors: [multipleDonor] });
    expect(recovered.musicXml).toBe(multipleBase.xml);
    expect(recovered.report.rejected).toContainEqual({ code: "MULTIPLE_ELIGIBLE_MEASURES" });
  });

  it("does not move interleaved directions or erase donor ties, tuplets or ambiguous repeated pitches", () => {
    const base = candidate("base", false);
    const marker = "<direction><direction-type><words>rit.</words></direction-type></direction>";
    const directedBase = { ...base, xml: base.xml.replace('</note><note><rest', `</note>${marker}<note><rest`) };
    const directedDonor = candidate("donor", true);
    directedDonor.xml = directedDonor.xml.replace('</note><note default-x="30"', `</note>${marker}<note default-x="30"`);
    const tied = candidate("donor", true);
    tied.xml = tied.xml.replace("<notations><articulations><staccato", '<tie type="start"/><notations><articulations><staccato');
    const tuplet = candidate("donor", true);
    tuplet.xml = tuplet.xml.replace("<notations><articulations><staccato", '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><notations><articulations><staccato');
    const duplicate = candidate("donor", true);
    duplicate.xml = duplicate.xml.replace("<step>D</step>", "<step>C</step>");
    const markedBase = candidate("base", false);
    markedBase.xml = markedBase.xml.replace(
      '<step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>',
      '<step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><notations><articulations><accent/></articulations></notations></note>');
    const movedDonor = candidate("donor", true);
    movedDonor.xml = movedDonor.xml.replace('<measure number="2"><note default-x="10">', '<measure number="2"><note default-x="45">');
    const shapedBase = candidate("base", false);
    shapedBase.xml = shapedBase.xml.replace(
      '<step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>',
      '<step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><notehead>diamond</notehead></note>');
    for (const [original, donor] of [[directedBase, directedDonor], [base, tied], [base, tuplet], [base, duplicate],
      [markedBase, movedDonor], [shapedBase, candidate("donor", true)]]) {
      const recovered = recoverNativeMeasureEvents({ base: original, donors: [donor] });
      expect(recovered.musicXml).toBe(original.xml);
      expect(recovered.report.changes).toEqual([]);
    }
  });
});
