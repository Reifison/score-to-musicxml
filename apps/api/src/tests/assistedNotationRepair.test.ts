import { createHash } from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { applyAssistedNotationRepair, type AssistedNotationRepairPlan, type AssistedRepairOperation } from "../services/AssistedNotationRepair.js";

const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const syntheticSource = (): Buffer => Buffer.from("portable synthetic score source");
const note = (step = "C", duration = 4, extra = "", type = "quarter"): string =>
  `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration><voice>1</voice><type>${type}</type>${extra}</note>`;
const rest = (duration = 4): string =>
  `<note><rest/><duration>${duration}</duration><voice>1</voice><type>quarter</type></note>`;
const attributes = (divisions = 4, beats = 4, beatType = 4, fifths?: number): string =>
  `<attributes><divisions>${divisions}</divisions>${fifths === undefined ? "" : `<key><fifths>${fifths}</fifths></key>`}<time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time></attributes>`;
const measureXml = (number: string, contents: string): string => `<measure number="${number}">${contents}</measure>`;
const scoreXml = (measures: string[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Synthetic</part-name></score-part></part-list><part id="P1">${measures.join("")}</part></score-partwise>`;
const inputFor = (baseXml: string, operations: AssistedRepairOperation[], expectedBaseMeasureCount?: number) => {
  const sourceBytes = syntheticSource();
  const plan: AssistedNotationRepairPlan = {
    version: 1,
    sourceSha256: sha256(sourceBytes),
    baseXmlSha256: sha256(baseXml),
    partId: "P1",
    expectedBaseMeasureCount: expectedBaseMeasureCount ?? [...baseXml.matchAll(/<measure(?=[\s>])/g)].length,
    operations,
    review: { mode: "ai_agent_assisted", editoriallyVerified: false, sourceFullyVerified: false },
  };
  return { sourceBytes, baseXml, plan };
};
const documentOf = (xml: string): Document => new DOMParser().parseFromString(xml, "application/xml");
const measures = (xml: string): Element[] => Array.from(documentOf(xml).getElementsByTagName("measure"));
const measure = (xml: string, number: string): Element => {
  const matches = measures(xml).filter((item) => item.getAttribute("number") === number);
  expect(matches).toHaveLength(1);
  return matches[0];
};
const notes = (xml: string, number: string): Element[] => Array.from(measure(xml, number).getElementsByTagName("note"));
const event = (item: Element): string => {
  const duration = item.getElementsByTagName("duration")[0]?.textContent?.trim();
  if (item.getElementsByTagName("rest").length) return `R:${duration}`;
  const pitch = item.getElementsByTagName("pitch")[0];
  const step = pitch?.getElementsByTagName("step")[0]?.textContent?.trim();
  const alter = pitch?.getElementsByTagName("alter")[0]?.textContent?.trim();
  const octave = pitch?.getElementsByTagName("octave")[0]?.textContent?.trim();
  return `${step}${alter === "-1" ? "b" : alter === "1" ? "#" : ""}${octave}:${duration}`;
};
const events = (xml: string, number: string): string[] => notes(xml, number).map(event);
const rawMeasure = (xml: string, number: string): string => {
  const match = [...xml.matchAll(/<measure(?=[\s>])[\s\S]*?<\/measure>/g)]
    .map((item) => item[0]).find((chunk) => new RegExp(`<measure[^>]*number="${number}"`).test(chunk));
  expect(match).toBeDefined();
  return match!;
};

describe("applyAssistedNotationRepair", () => {
  it("applies declared key, pitch, event and measure edits while preserving undeclared metadata", () => {
    const baseXml = scoreXml([
      measureXml("1", `${attributes(4, 4, 4, 0)}${note("C")}${note("D")}<direction><direction-type><words>synthetic metadata</words></direction-type><staff>1</staff></direction><direction><direction-type><dynamics><mf/></dynamics></direction-type><staff>1</staff></direction>`),
      measureXml("2", `${attributes()}${note("G")}${note("A")}${note("G")}${note("A")}`),
      measureXml("3", `${attributes()}${note("E")}${note("F")}`),
    ]);
    const input = inputFor(baseXml, [
      { kind: "setInitialKey", measure: "1", expectedFifths: 0, fifths: -1 },
      { kind: "setPitch", measure: "1", noteIndex: 0, expected: { kind: "note", duration: 4, pitch: { step: "C", octave: 4 } }, pitch: { step: "E", octave: 4 } },
      { kind: "insertEvent", measure: "1", atIndex: 1, expectedEventCount: 2, eventXml: rest() },
      { kind: "insertMeasure", beforeMeasure: "3", newMeasure: "3", expectedPreviousMeasure: "2", expectedDivisions: 4,
        expectedDurationTicks: 16, measureXml: measureXml("3", note("C") + note("D") + note("E") + note("F")) },
    ]);

    const output = applyAssistedNotationRepair(input);

    expect(measures(output.musicXml)).toHaveLength(4);
    expect(measure(output.musicXml, "1").getElementsByTagName("fifths")[0]?.textContent).toBe("-1");
    expect(events(output.musicXml, "1")).toEqual(["E4:4", "R:4", "D4:4"]);
    expect(events(output.musicXml, "3")).toEqual(["C4:4", "D4:4", "E4:4", "F4:4"]);
    expect(events(output.musicXml, "4")).toEqual(events(baseXml, "3"));
    expect(rawMeasure(output.musicXml, "1")).toContain("<words>synthetic metadata</words>");
    expect(measure(output.musicXml, "1").getElementsByTagName("mf")).toHaveLength(1);
    expect(output.accuracyVerified).toBe(false);
    expect(output.trainingEligible).toBe(false);
    expect(output.requiresReview).toBe(true);
    expect(output.history).toHaveLength(4);
  });

  it("restores a fermata without changing the note event", () => {
    const baseXml = scoreXml([measureXml("1", `${attributes()}${note("C", 4, "<notations><articulations><staccato/></articulations></notations>")}`)]);
    const input = inputFor(baseXml, [{ kind: "replaceArticulation", measure: "1", noteIndex: 0, expected: "staccato", replacement: "fermata" }]);

    const output = applyAssistedNotationRepair(input);

    expect(events(output.musicXml, "1")).toEqual(events(baseXml, "1"));
    expect(notes(output.musicXml, "1")[0].getElementsByTagName("fermata")[0]?.getAttribute("type")).toBe("upright");
    expect(notes(output.musicXml, "1")[0].getElementsByTagName("staccato")).toHaveLength(0);
    expect(output.requiresReview).toBe(true);
  });

  it("enforces source, baseline and event precondition hashes", () => {
    const baseXml = scoreXml([measureXml("1", `${attributes()}${note("C")}`)]);
    const operation: AssistedRepairOperation = {
      kind: "setPitch", measure: "1", noteIndex: 0,
      expected: { kind: "note", duration: 4, pitch: { step: "C", octave: 4 } }, pitch: { step: "D", octave: 4 },
    };
    const input = inputFor(baseXml, [operation]);

    expect(() => applyAssistedNotationRepair({ ...input, sourceBytes: Buffer.from("different synthetic source") })).toThrow(/Hash/);
    expect(() => applyAssistedNotationRepair({ ...input, baseXml: `${baseXml} ` })).toThrow(/Hash/);
    expect(() => applyAssistedNotationRepair({ ...input, plan: { ...input.plan, operations: [
      { ...operation, expected: { kind: "note", duration: 4, pitch: { step: "E", octave: 4 } } },
    ] } })).toThrow(/precondição/);
  });

  it("rejects polyphony, ambiguous measures, DTD subsets and unapproved donor content", () => {
    const baseXml = scoreXml([measureXml("1", `${attributes()}${note("C")}`)]);
    const setPitch: AssistedRepairOperation = {
      kind: "setPitch", measure: "1", noteIndex: 0,
      expected: { kind: "note", duration: 4, pitch: { step: "C", octave: 4 } }, pitch: { step: "D", octave: 4 },
    };
    const polyphonic = baseXml.replace("</measure>", "<backup><duration>4</duration></backup><barline location=\"right\"/></measure>");
    expect(() => applyAssistedNotationRepair(inputFor(polyphonic, [setPitch]))).toThrow(/multivoz/);

    const duplicateMeasure = baseXml.replace("</part>", `${measureXml("1", note("C"))}</part>`);
    expect(() => applyAssistedNotationRepair(inputFor(duplicateMeasure, [setPitch], 2))).toThrow(/ambíguo/);

    const dtd = baseXml.replace("<score-partwise", "<!DOCTYPE score-partwise [<!ENTITY local 'unsafe'>]><score-partwise");
    expect(() => applyAssistedNotationRepair(inputFor(dtd, [setPitch]))).toThrow(/Entidades/);

    const unauthorized: AssistedRepairOperation = {
      kind: "insertEvent", measure: "1", atIndex: 1, expectedEventCount: 1,
      eventXml: `<note><rest/><duration>4</duration><voice>1</voice><type>quarter</type><direction/></note>`,
    };
    expect(() => applyAssistedNotationRepair(inputFor(baseXml, [unauthorized]))).toThrow(/não autorizado/);
  });

  it("binds a synthetic repair plan and provenance to the exact source and baseline bytes", () => {
    const baseXml = scoreXml([measureXml("1", `${attributes()}${note("C")}`)]);
    const input = inputFor(baseXml, [{
      kind: "setPitch", measure: "1", noteIndex: 0,
      expected: { kind: "note", duration: 4, pitch: { step: "C", octave: 4 } }, pitch: { step: "D", octave: 4 },
    }]);

    expect(input.plan.sourceSha256).toBe(sha256(input.sourceBytes));
    expect(input.plan.baseXmlSha256).toBe(sha256(input.baseXml));
    const output = applyAssistedNotationRepair(input);
    expect(output.provenance.sourceSha256).toBe(input.plan.sourceSha256);
    expect(output.provenance.baseXmlSha256).toBe(input.plan.baseXmlSha256);
    expect(output.provenance.outputXmlSha256).toBe(sha256(output.musicXml));
  });

  it("does not reinterpret a later key change as an initial signature", () => {
    const baseXml = scoreXml([
      measureXml("1", `${attributes(4, 4, 4, 0)}${note("C")}`),
      measureXml("2", `${attributes(4, 4, 4, 1)}${note("D")}`),
    ]);
    const input = inputFor(baseXml, [{ kind: "setInitialKey", measure: "2", expectedFifths: 1, fifths: 2 }]);

    expect(() => applyAssistedNotationRepair(input)).toThrow(/primeiro compasso/);
  });

  it("rejects unknown operations and oversized XML fragments", () => {
    const baseXml = scoreXml([measureXml("1", `${attributes()}${note("C")}`)]);
    const unknown = { kind: "inferFromMeter", measure: "1" } as unknown as AssistedRepairOperation;
    expect(() => applyAssistedNotationRepair(inputFor(baseXml, [unknown]))).toThrow(/não reconhecida/);

    const oversized: AssistedRepairOperation = {
      kind: "insertEvent", measure: "1", atIndex: 1, expectedEventCount: 1,
      eventXml: `<note>${" ".repeat(129 * 1024)}<rest/><duration>4</duration></note>`,
    };
    expect(() => applyAssistedNotationRepair(inputFor(baseXml, [oversized]))).toThrow(/limite de tamanho/);
  });

  it("inserts a 3/4 measure using the active divisions", () => {
    const baseXml = scoreXml([
      measureXml("1", `${attributes(4, 3, 4)}${note("C", 4)}${note("D", 4)}${note("E", 4)}`),
      measureXml("2", `${attributes(8, 3, 4)}${note("F", 8, "", "eighth")}${note("G", 8, "", "eighth")}${note("A", 8, "", "eighth")}`),
    ]);
    const donor = measureXml("2", `${note("C", 8, "", "eighth")}${note("D", 8, "", "eighth")}${note("E", 8, "", "eighth")}`);
    const input = inputFor(baseXml, [{ kind: "insertMeasure", beforeMeasure: "2", newMeasure: "2", expectedPreviousMeasure: "1",
      expectedDivisions: 8, expectedDurationTicks: 24, measureXml: donor }]);

    const output = applyAssistedNotationRepair(input);

    expect(measures(output.musicXml).map((item) => item.getAttribute("number"))).toEqual(["1", "2", "3"]);
    expect(events(output.musicXml, "2")).toEqual(["C4:8", "D4:8", "E4:8"]);
    expect(() => applyAssistedNotationRepair({ ...input, plan: { ...input.plan, operations: [
      { ...input.plan.operations[0], expectedDivisions: 4 } as AssistedRepairOperation,
    ] } })).toThrow(/Divisões/);
  });
});
