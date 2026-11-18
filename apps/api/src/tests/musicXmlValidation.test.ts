import { describe, expect, it } from "vitest";
import { audiverisVersionOf, inspectMusicXmlValidation } from "../services/MusicXmlValidation.js";

const attributes = '<attributes><divisions>12</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>';
const note = (duration = 24) => `<note><pitch><step>C</step><octave>4</octave></pitch><duration>${duration}</duration></note>`;
const measure = (number: number, content: string, flags = "") => `<measure number="${number}" ${flags}>${number === 1 ? attributes : ""}${content}${note()}</measure>`;
const score = (measures: string) => `<score-partwise><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;

describe("MusicXML internal validation", () => {
  it("diagnostica acidente incoerente sem inferir alteração da armadura nem reescrever a fonte", () => {
    const build = (alter: string, accidental: string, fifths: number) => score(`<measure number="1">${attributes.replace("<time>", `<key><fifths>${fifths}</fifths></key><time>`)}${note().replace("<octave>", `${alter}<octave>`).replace("</note>", `<accidental>${accidental}</accidental></note>`)}</measure>`);
    for (const [alter, accidental, fifths] of [["1", "sharp", 6], ["-1", "flat", -4], ["0", "natural", 3], ["2", "double-sharp", 0], ["-2", "flat-flat", 0]] as const) {
      expect(inspectMusicXmlValidation(build(`<alter>${alter}</alter>`, accidental, fifths)).issues).toEqual([]);
    }
    const conflict = build("<alter>1</alter>", "natural", 0);
    expect(inspectMusicXmlValidation(conflict).issues.map((issue) => issue.code)).toEqual(["ACCIDENTAL_PITCH_CONFLICT"]);
    expect(inspectMusicXmlValidation(build("", "sharp", 2)).issues.map((issue) => issue.code)).toEqual(["ACCIDENTAL_PITCH_CONFLICT"]);
    expect(inspectMusicXmlValidation(build("<alter>0.5</alter>", "quarter-sharp", 0)).issues).toEqual([]);
    expect(conflict).toContain("<alter>1</alter>");
  });

  it("reports unresolved endings and forward repeats without rejecting a backward repeat from the beginning", () => {
    const backwardOnly = score(measure(1, '<barline location="right"><repeat direction="backward"/></barline>'));
    expect(inspectMusicXmlValidation(backwardOnly)).toMatchObject({ checkedMeasures: 1, skippedMeasures: 0, issues: [], requiresReview: false });

    const unclosed = score(measure(1, '<barline location="left"><ending number="2" type="start"/><repeat direction="forward"/></barline>'));
    expect(inspectMusicXmlValidation(unclosed).issues.map((issue) => issue.code)).toEqual(["ENDING_UNCLOSED", "REPEAT_FORWARD_UNCLOSED"]);
  });

  it("accepts first/second endings with explicit closure and a repeat from the second section", () => {
    const xml = score(
      measure(1, '<barline location="left"><repeat direction="forward"/></barline>') +
      measure(2, '<barline location="left"><ending number="1" type="start"/></barline><barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline>') +
      measure(3, '<barline location="left"><ending number="2" type="start"/></barline><barline location="right"><ending number="2" type="discontinue"/></barline>')
    );
    expect(inspectMusicXmlValidation(xml)).toMatchObject({ checkedMeasures: 3, issues: [], requiresReview: false });
  });

  it("checks a D.S. target and an explicitly written al Fine without inventing a Fine requirement for plain D.S.", () => {
    const segno = '<direction><direction-type><segno/></direction-type><sound segno="S1"/></direction>';
    const ds = '<direction><direction-type><words>D.S. al Fine</words></direction-type><sound dalsegno="S1"/></direction>';
    const fine = '<direction><direction-type><words>Fine</words></direction-type><sound fine="yes"/></direction>';
    const missing = inspectMusicXmlValidation(score(measure(1, "") + measure(2, ds)));
    expect(missing.issues.map((issue) => issue.code)).toEqual(["DAL_SEGNO_TARGET_MISSING", "DAL_SEGNO_FINE_MISSING"]);
    expect(inspectMusicXmlValidation(score(measure(1, segno + fine) + measure(2, ds))).issues).toEqual([]);
    expect(inspectMusicXmlValidation(score(measure(1, segno) + measure(2, '<direction><sound dalsegno="S1"/></direction>'))).issues).toEqual([]);
    expect(inspectMusicXmlValidation(score(measure(1, segno + fine.replace('fine="yes"', 'fine="no"')) + measure(2, ds))).issues.map((issue) => issue.code)).toContain("DAL_SEGNO_FINE_MISSING");
  });

  it("treats an explicit pickup as an allowed skip but flags other unchecked measures", () => {
    const pickup = `<measure number="0" implicit="yes">${attributes}<note><pitch><step>D</step><octave>4</octave></pitch><duration>6</duration></note></measure>`;
    const complete = inspectMusicXmlValidation(score(pickup + measure(1, "")));
    expect(complete).toMatchObject({ checkedMeasures: 1, skippedMeasures: 1, requiresReview: false });
    expect(complete.limitations[0]).toContain("alturas");

    const unchecked = inspectMusicXmlValidation(score(pickup + '<measure number="1"><note><rest/></note></measure>'));
    expect(unchecked.issues.map((issue) => issue.code)).toContain("RHYTHM_UNCHECKED");
    expect(unchecked.requiresReview).toBe(true);
  });

  it("checks page fragments without inventing missing navigation marks on adjacent pages", () => {
    const open = score(measure(1, '<barline location="left"><ending number="1" type="start"/><repeat direction="forward"/></barline>'));
    const close = score(measure(1, '<barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline>'));
    expect(inspectMusicXmlValidation(open, { scope: "page" }).issues).toEqual([]);
    expect(inspectMusicXmlValidation(close, { scope: "page" }).issues).toEqual([]);
    expect(inspectMusicXmlValidation(open).issues.map((issue) => issue.code)).toContain("ENDING_UNCLOSED");
    expect(inspectMusicXmlValidation(close).issues.map((issue) => issue.code)).toContain("ENDING_CLOSE_WITHOUT_START");
  });

  it("requires review for XML without measures and reports engine version only from an actual declaration", () => {
    expect(inspectMusicXmlValidation(score("")).issues.map((issue) => issue.code)).toContain("ZERO_MEASURES");
    expect(audiverisVersionOf(score(measure(1, "")))).toBeNull();
    const authored = score(measure(1, "")).replace("<part-list>", "<identification><creator>Audiveris 99.0</creator></identification><defaults><word-font font-family=\"Audiveris 88.0\"/></defaults><part-list>");
    expect(audiverisVersionOf(authored)).toBeNull();
    const declared = authored.replace("<part-list>", "<identification><encoding><software>Audiveris 5.10.2</software></encoding></identification><part-list>");
    expect(audiverisVersionOf(declared)).toBe("5.10.2");
  });
});
