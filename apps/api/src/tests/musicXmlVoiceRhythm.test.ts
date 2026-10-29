import { describe, expect, it } from "vitest";
import { inspectMusicXmlVoiceRhythm } from "../services/MusicXmlVoiceRhythm.js";
import { inspectMusicXmlValidation } from "../services/MusicXmlValidation.js";

const attributes = '<attributes><divisions>12</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>';
const note = (duration: number, type: string, voice: string, extra = "") => `<note>${extra}<pitch><step>C</step><octave>4</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><type>${type}</type></note>`;
const rest = (duration: number, type: string, voice: string) => `<note><rest/><duration>${duration}</duration><voice>${voice}</voice><type>${type}</type></note>`;
const backup = (duration: number) => `<backup><duration>${duration}</duration></backup>`;
const score = (body: string) => `<score-partwise><part-list><score-part id="P1"><part-name>Violão</part-name></score-part></part-list><part id="P1"><measure number="16">${attributes}${body}</measure></part></score-partwise>`;

describe("advisory MusicXML voice rhythm inspection", () => {
  it("flags a late voice ending at 21/24 while the other voice fills the bar", () => {
    const first = note(12, "quarter", "1") + note(3, "16th", "1") + note(3, "16th", "1") + note(3, "16th", "1");
    const second = note(3, "16th", "2") + note(6, "eighth", "2") + note(3, "16th", "2") + note(12, "quarter", "2");
    const report = inspectMusicXmlValidation(score(first + backup(21) + second));
    expect(report.issues.map((issue) => issue.code)).toEqual(["VOICE_EARLY_END"]);
    expect(report.requiresReview).toBe(true);
    expect(report.voiceChecks).toMatchObject([
      { voice: "1", start: 0, end: 1.75, durationsTotal: 1.75, implicitGaps: [{ start: 1.75, end: 2 }] },
      { voice: "2", start: 0, end: 2, durationsTotal: 2, implicitGaps: [] }
    ]);
    expect(report.voiceCheckedMeasures).toBe(1);
  });

  it("records a short legitimate voice but does not warn when its only onset is before mid-bar", () => {
    const xml = score(note(12, "quarter", "1") + backup(12) + note(24, "half", "2"));
    const report = inspectMusicXmlValidation(xml);
    expect(report.issues).toEqual([]);
    expect(report.voiceChecks[0]).toMatchObject({ voice: "1", end: 1, implicitGaps: [{ start: 1, end: 2 }] });
  });

  it("does not treat explicit rests or forwards as missing time", () => {
    const lead = note(12, "quarter", "1") + note(3, "16th", "1") + note(3, "16th", "1") + note(3, "16th", "1");
    const resting = score(lead + rest(3, "16th", "1") + backup(24) + note(24, "half", "2"));
    expect(inspectMusicXmlValidation(resting).issues).toEqual([]);
    const forwarded = score(lead + '<forward><duration>3</duration><voice>1</voice></forward>' + backup(24) + note(24, "half", "2"));
    expect(inspectMusicXmlValidation(forwarded).issues).toEqual([]);
    expect(inspectMusicXmlValidation(forwarded).voiceChecks[0].implicitGaps).toEqual([]);
  });

  it("compares written type, dots and tuplets with encoded duration without altering either", () => {
    const triplet = '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';
    const dotted = '<dot/>';
    const valid = score(note(4, "eighth", "1", triplet) + note(9, "eighth", "1", dotted) + note(11, "quarter", "1"));
    expect(inspectMusicXmlVoiceRhythm(valid).issues.map((issue) => issue.code)).toEqual(["WRITTEN_DURATION_MISMATCH"]);
    const mismatch = inspectMusicXmlVoiceRhythm(score(note(3, "eighth", "1") + rest(21, "quarter", "1")));
    expect(mismatch.issues.filter((issue) => issue.code === "WRITTEN_DURATION_MISMATCH")).toHaveLength(2);
  });

  it("keeps separate voice timelines by staff and suppresses early-end guesses across piano staves", () => {
    const first = note(12, "quarter", "1") + note(3, "16th", "1") + note(3, "16th", "1") + note(3, "16th", "1");
    const secondStaff = '<note><pitch><step>C</step><octave>3</octave></pitch><duration>24</duration><voice>2</voice><staff>2</staff><type>half</type></note>';
    const report = inspectMusicXmlVoiceRhythm(score(first + backup(21) + secondStaff));
    expect(report.issues.some((issue) => issue.code === "VOICE_EARLY_END")).toBe(false);
    expect(report.voiceChecks.map((check) => check.staff)).toEqual([1, 2]);
  });
});
