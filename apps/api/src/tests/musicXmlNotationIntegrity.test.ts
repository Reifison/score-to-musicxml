import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { inspectMusicXmlNotationIntegrity } from "../services/MusicXmlNotationIntegrity.js";

const parser = new DOMParser();

const score = (partBody: string, partName = "Violão") => `<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>${partName}</part-name></score-part></part-list>
  <part id="P1">${partBody}</part>
</score-partwise>`;

const measure = (body: string, number = "1") => `<measure number="${number}">${body}</measure>`;

const attributes = (divisions = 4, extra = "") =>
  `<attributes><divisions>${divisions}</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>${extra}</attributes>`;

type NoteOptions = {
  step?: string;
  octave?: number;
  alter?: number;
  duration?: number;
  type?: string;
  voice?: string;
  staff?: number;
  prefix?: string;
  soundTie?: "start" | "stop";
  notationTie?: "start" | "stop";
  extra?: string;
};

const note = ({
  step = "C",
  octave = 4,
  alter,
  duration,
  type = "quarter",
  voice = "1",
  staff = 1,
  prefix = "",
  soundTie,
  notationTie,
  extra = ""
}: NoteOptions = {}) => {
  const pitch = `<pitch><step>${step}</step>${alter === undefined ? "" : `<alter>${alter}</alter>`}<octave>${octave}</octave></pitch>`;
  const metric = duration === undefined ? "" : `<duration>${duration}</duration>`;
  const sound = soundTie ? `<tie type="${soundTie}"/>` : "";
  const notation = notationTie ? `<notations><tied type="${notationTie}"/></notations>` : "";
  return `<note>${prefix}${pitch}${metric}<voice>${voice}</voice><staff>${staff}</staff><type>${type}</type>${sound}${notation}${extra}</note>`;
};

const parse = (xml: string) => parser.parseFromString(xml, "application/xml");

const inspect = (partBody: string, options: { scope?: "score" | "page" } = {}) => {
  const document = parse(score(partBody.includes("<measure") ? partBody : measure(partBody)));
  return { document, issues: inspectMusicXmlNotationIntegrity(document, options) };
};

const codes = (issues: ReturnType<typeof inspectMusicXmlNotationIntegrity>) => issues.map((item) => item.code);

describe("MusicXML notation integrity inspection", () => {
  it("flags metric duration on grace notes without changing the DOM", () => {
    const xml = score(measure(attributes() + note({ prefix: "<grace/>", duration: 1, type: "16th" }) + note({ prefix: "<grace/>", type: "16th" })));
    const document = parse(xml);
    const before = new XMLSerializer().serializeToString(document);

    expect(codes(inspectMusicXmlNotationIntegrity(document))).toEqual(["GRACE_METRIC_DURATION"]);
    expect(new XMLSerializer().serializeToString(document)).toBe(before);
  });

  it("accepts dotted and real tuplet notation, skips whole-measure rests, and ignores unknown symbols", () => {
    const tuplet = "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>";
    const dotted = "<dot/>";
    const body = attributes(12) +
      note({ duration: 6, type: "eighth", extra: tuplet }) +
      note({ duration: 9, type: "eighth", extra: dotted }) +
      `<note><rest measure="yes"/><duration>48</duration><voice>1</voice><staff>1</staff><type>whole</type></note>` +
      "<future-symbol><unrecognized-value/></future-symbol>";

    expect(inspect(body).issues).toEqual([]);
  });

  it("keeps legitimate chord groups anchored despite different durations and timelines", () => {
    const body = attributes(4) +
      note({ step: "C", duration: 4, voice: "1", staff: 1 }) +
      note({ step: "E", duration: 2, voice: "1", staff: 1, prefix: "<chord/>" }) +
      "<backup><duration>4</duration></backup>" +
      note({ step: "G", octave: 3, duration: 4, voice: "2", staff: 1 }) +
      "<backup><duration>4</duration></backup>" +
      note({ step: "C", octave: 3, duration: 4, voice: "1", staff: 2 }) +
      note({ step: "E", octave: 3, duration: 4, voice: "1", staff: 2, prefix: "<chord/>" });

    expect(inspect(body).issues).toEqual([]);

    const directionBetweenNotes = inspect(attributes() +
      note({ duration: 4 }) +
      `<direction><direction-type><words>dolce</words></direction-type></direction>` +
      `<layout><system-layout/></layout>` +
      note({ duration: 2, prefix: "<chord/>" }));
    expect(directionBetweenNotes.issues).toEqual([]);

    const longerMember = inspect(attributes() + note({ duration: 4 }) + note({ duration: 8, prefix: "<chord/>" }));
    expect(codes(longerMember.issues)).toEqual(["CHORD_MEMBER_DURATION_EXCEEDS_ANCHOR"]);
  });

  it("reports unanchored, cross-stream, and grace-mixed chord members", () => {
    const unanchored = inspect(attributes() + note({ prefix: "<chord/>" }));
    expect(codes(unanchored.issues)).toContain("CHORD_UNANCHORED");

    const crossVoice = inspect(attributes() + note({ voice: "1" }) + note({ voice: "2", prefix: "<chord/>" }));
    expect(codes(crossVoice.issues)).toContain("CHORD_CROSS_VOICE_STAFF");

    const legitimateCrossStaff = inspect(attributes() + note({ staff: 1 }) + note({ staff: 2, prefix: "<chord/>" }));
    expect(legitimateCrossStaff.issues).toEqual([]);

    const graceMismatch = inspect(attributes() + note({}) + note({ prefix: "<chord/><grace/>" }));
    expect(codes(graceMismatch.issues)).toContain("CHORD_GRACE_ANCHOR_MISMATCH");

    const validGraceChord = inspect(attributes() + note({ prefix: "<grace/>" }) + note({ prefix: "<chord/><grace/>" }));
    expect(validGraceChord.issues).toEqual([]);
  });

  it("requires matching sound attributes for D.C., Da Capo, D.S., and Dal Segno words", () => {
    const missingDaCapo = inspect(attributes() + `<direction><direction-type><words>D.C.</words></direction-type></direction>`);
    expect(codes(missingDaCapo.issues)).toEqual(["NAVIGATION_WORDS_UNENCODED"]);

    const encodedDaCapo = inspect(attributes() + `<direction><direction-type><words>Da Capo</words></direction-type><sound dacapo="yes"/></direction>`);
    expect(encodedDaCapo.issues).toEqual([]);

    const compactDaCapo = inspect(attributes() + `<direction><direction-type><words>DaCapo</words></direction-type></direction>`);
    expect(codes(compactDaCapo.issues)).toEqual(["NAVIGATION_WORDS_UNENCODED"]);

    const missingDalSegno = inspect(attributes() + `<direction><direction-type><words>D.S.</words></direction-type></direction>`);
    expect(codes(missingDalSegno.issues)).toEqual(["NAVIGATION_WORDS_UNENCODED"]);

    const encodedDalSegno = inspect(attributes() + `<direction><direction-type><words>Dal Segno</words></direction-type><sound dalsegno="yes"/></direction>`);
    expect(encodedDalSegno.issues).toEqual([]);

    const compactDalSegno = inspect(attributes() + `<direction><direction-type><words>DalSegno</words></direction-type></direction>`);
    expect(codes(compactDalSegno.issues)).toEqual(["NAVIGATION_WORDS_UNENCODED"]);
  });

  it("only requires Fine for an explicit D.C. al Fine and respects page scope", () => {
    const missingFine = inspect(attributes() + `<direction><direction-type><words>D.C. al Fine</words></direction-type><sound dacapo="yes"/></direction>`);
    expect(codes(missingFine.issues)).toEqual(["DA_CAPO_FINE_MISSING"]);

    const encodedFine = inspect(attributes() +
      `<direction><direction-type><words>D.C.alFine</words></direction-type><sound dacapo="yes"/></direction>` +
      `<direction><direction-type><words>Fine</words></direction-type><sound fine="yes"/></direction>`);
    expect(encodedFine.issues).toEqual([]);

    const plainDaCapo = inspect(attributes() + `<direction><direction-type><words>D.C.</words></direction-type><sound dacapo="yes"/></direction>`);
    expect(plainDaCapo.issues).toEqual([]);

    const disabledFine = inspect(attributes() +
      `<direction><direction-type><words>D.C. al Fine</words></direction-type><sound dacapo="yes"/></direction>` +
      `<direction><direction-type><words>Fine</words></direction-type><sound fine="no"/></direction>`);
    expect(codes(disabledFine.issues)).toEqual(["DA_CAPO_FINE_MISSING"]);

    const pageFragment = inspect(attributes() + `<direction><direction-type><words>D.C. al Fine</words></direction-type><sound dacapo="yes"/></direction>`, { scope: "page" });
    expect(pageFragment.issues).toEqual([]);
  });

  it("accepts matching ties across measures and keeps slurs separate", () => {
    const body = measure(attributes() + note({ duration: 4, soundTie: "start", notationTie: "start" }), "1") +
      measure(note({ duration: 4, soundTie: "stop", notationTie: "stop" }) +
        note({ duration: 4, extra: "<notations><slur type=\"stop\" number=\"1\"/></notations>" }), "2");

    expect(inspect(body).issues).toEqual([]);
  });

  it("reports tie encoding mismatches while pairing the known note sequence", () => {
    const body = measure(attributes() + note({ duration: 4, soundTie: "start", notationTie: "start" }), "1") +
      measure(note({ duration: 4, soundTie: "stop", notationTie: "start" }), "2") +
      measure(note({ duration: 4, soundTie: "stop", notationTie: "stop" }), "3");

    expect(codes(inspect(body).issues)).toEqual(["TIE_SOUND_NOTATION_MISMATCH"]);
  });

  it("reports orphan ties and a known end-pitch change only when score context is complete", () => {
    const orphanStart = inspect(measure(attributes() + note({ duration: 4, soundTie: "start", notationTie: "start" })));
    expect(codes(orphanStart.issues)).toEqual(["TIE_ORPHAN"]);

    const orphanStop = inspect(measure(attributes() + note({ duration: 4, soundTie: "stop", notationTie: "stop" })));
    expect(codes(orphanStop.issues)).toEqual(["TIE_ORPHAN"]);

    const pitchChanged = inspect(measure(attributes() + note({ step: "C", duration: 4, soundTie: "start", notationTie: "start" }), "1") +
      measure(note({ step: "D", duration: 4, soundTie: "stop", notationTie: "stop" }), "2"));
    expect(codes(pitchChanged.issues)).toEqual(["TIE_END_PITCH_MISMATCH"]);
  });

  it("allows repaged tie boundaries to begin with stop or end with start", () => {
    const startsAtPage = inspect(measure(attributes() + note({ duration: 4, soundTie: "stop", notationTie: "stop" })), { scope: "page" });
    expect(startsAtPage.issues).toEqual([]);

    const endsAtPage = inspect(measure(attributes() + note({ duration: 4, soundTie: "start", notationTie: "start" })), { scope: "page" });
    expect(endsAtPage.issues).toEqual([]);
  });
});
