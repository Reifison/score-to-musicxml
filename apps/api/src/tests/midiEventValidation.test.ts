import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- Verovio publishes JavaScript ESM entrypoints without declarations
import { VerovioToolkit } from "verovio/esm";
// @ts-expect-error -- Verovio publishes JavaScript ESM entrypoints without declarations
import createVerovioModule from "verovio/wasm";
import {
  inspectMidiSourceEvents,
  MidiEventMismatchError,
  validateAndRepairSkippedTieDestinations
} from "../utils/midiEventValidation.js";
import { identifyMusicXmlNotesForMidi } from "../utils/musicXmlMidiIdentity.js";

const normalTieMidi = Buffer.from(
  "4d546864000000060000000100784d54726b0000000d00903c408170803c0000ff2f00",
  "hex"
);

let verovioModule: Promise<unknown> | undefined;

async function renderAndValidate(musicXml: string) {
  verovioModule ??= createVerovioModule();
  const toolkit = new VerovioToolkit(await verovioModule);
  try {
    toolkit.setOptions({ breaks: "none", inputFrom: "xml" });
    const identifiedXml = identifyMusicXmlNotesForMidi(musicXml);
    expect(Boolean(toolkit.loadData(identifiedXml))).toBe(true);
    const midi = Buffer.from(toolkit.renderToMIDI().replaceAll(/\s/g, ""), "base64");
    return validateAndRepairSkippedTieDestinations(
      midi,
      identifiedXml,
      toolkit.getMEI(),
      toolkit.renderToTimemap({ includeMeasures: true, includeRests: true }),
      toolkit.renderToExpansionMap()
    );
  } finally {
    toolkit.destroy();
  }
}

function score(attributes: string, notes: string, instrument = "Instrumento"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>${instrument}</part-name></score-part></part-list>
      <part id="P1"><measure number="1">
        <attributes><divisions>4</divisions>${attributes}<time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
        ${notes}
      </measure></part>
    </score-partwise>`;
}

function note(step: string, octave: number, duration: number, extra = ""): string {
  return `<note>${extra}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>1</voice><type>quarter</type></note>`;
}

function singleNoteMidi(pitch: number): Buffer {
  const midi = Buffer.from(normalTieMidi);
  const attack = midi.indexOf(Buffer.from([0x90, 0x3c, 0x40]));
  const release = midi.indexOf(Buffer.from([0x80, 0x3c, 0x00]));
  midi[attack + 1] = pitch;
  midi[release + 1] = pitch;
  return midi;
}

function simultaneousMidi(pitches: number[]): Buffer {
  const body = Buffer.from([
    ...pitches.flatMap((pitch) => [0x00, 0x90, pitch, 0x40]),
    ...pitches.flatMap((pitch, index) => [index === 0 ? 0x78 : 0x00, 0x80, pitch, 0x00]),
    0x00, 0xff, 0x2f, 0x00
  ]);
  const header = Buffer.from("4d54686400000006000000010078", "hex");
  const track = Buffer.alloc(8);
  track.write("MTrk", 0, "ascii");
  track.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, track, body]);
}

describe("validateAndRepairSkippedTieDestinations", () => {
  it("aceita uma ligadura normal quando há outro evento antes do destino no mesmo compasso", () => {
    const musicXml = `
      <score-partwise>
        <part>
          <measure><note><pitch><step>C</step><octave>4</octave></pitch></note></measure>
          <measure><note><pitch><step>C</step><octave>4</octave></pitch></note></measure>
        </part>
      </score-partwise>`;
    const mei = `
      <mei><music><body>
        <measure xml:id="m1"><staff><layer><note xml:id="start" dur="4" pname="c" oct="4"/></layer></staff></measure>
        <measure xml:id="m2"><staff><layer><note xml:id="destination" dur="4" pname="c" oct="4"/></layer></staff></measure>
        <tie startid="#start" endid="#destination"/>
      </body></music></mei>`;
    const timemap = [
      { measureOn: "m1", qstamp: 0, on: ["start"] },
      { measureOn: "m2", qstamp: 1 },
      { measureOn: "m2", qstamp: 2, off: ["start"], on: ["destination"] }
    ];
    const expansionMap = {
      m1: ["m1"],
      m2: ["m2"],
      start: ["start"],
      destination: ["destination"]
    };

    const result = validateAndRepairSkippedTieDestinations(normalTieMidi, musicXml, mei, timemap, expansionMap);

    expect(result).toMatchObject({ verified: false, checkedNotes: 0, checkedDurations: 0, issues: [] });
    expect(result.sourceEventCoverage).toMatchObject({ status: "unverified", checkedPitches: 0 });
    expect(result.midi).toEqual(normalTieMidi);
  });

  it("confere acordes, graça, uníssono entre vozes e transposição de guitarra", async () => {
    const musicXml = score(
      `<key><fifths>1</fifths></key><transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>`,
      `<note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>
       <note><chord/><pitch><step>G</step><alter>1</alter><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><accidental>sharp</accidental></note>
       <note><grace slash="yes"/><pitch><step>D</step><octave>5</octave></pitch><voice>1</voice><type>eighth</type></note>
       <note><pitch><step>F</step><alter>1</alter><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>
       <note><pitch><step>E</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>half</type></note>
       <backup><duration>16</duration></backup>
       <note><pitch><step>E</step><octave>5</octave></pitch><duration>16</duration><voice>2</voice><type>whole</type></note>`,
      "Violão"
    );

    const result = await renderAndValidate(musicXml);

    expect(result.sourceEventCoverage).toMatchObject({
      status: "verified",
      totalSourcePitchedNotes: 6,
      mappedSourcePitchedNotes: 6,
      checkedPitches: 6,
      checkedOnsets: 6,
      checkedGraceEvents: 1,
      skippedReasons: []
    });
    expect(result.verified).toBe(true);
  });

  it.each([
    {
      name: "clarinete em Si bemol em Mi bemol maior",
      instrument: "Clarinete em Si bemol",
      attributes: `<key><fifths>-3</fifths></key><transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose>`,
      notes: `<note><pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><accidental>flat</accidental></note>`
    },
    {
      name: "violino em Ré maior com transposição explícita zero",
      instrument: "Violino",
      attributes: `<key><fifths>2</fifths></key><transpose><diatonic>0</diatonic><chromatic>0</chromatic></transpose>`,
      notes: note("F", 5, 4, `<accidental>sharp</accidental>`).replace("<step>F</step>", "<step>F</step><alter>1</alter>")
    }
  ])("confere $name sem pressupor a tonalidade ou o instrumento", async ({ attributes, notes, instrument }) => {
    const result = await renderAndValidate(score(attributes, notes, instrument));
    expect(result.sourceEventCoverage).toMatchObject({ status: "verified", checkedPitches: 1, skippedReasons: [] });
  });

  it("confere duas partes com transposições diferentes quando os IDs fonte são preservados", async () => {
    const musicXml = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list>
        <score-part id="P1"><part-name>Flauta</part-name></score-part>
        <score-part id="P2"><part-name>Trompa em Fá</part-name></score-part>
      </part-list>
      <part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>1</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${note("C", 5, 4)}</measure></part>
      <part id="P2"><measure number="1"><attributes><divisions>4</divisions><transpose><diatonic>-4</diatonic><chromatic>-7</chromatic></transpose><time><beats>1</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${note("G", 4, 4)}</measure></part>
    </score-partwise>`;

    const result = await renderAndValidate(musicXml);
    expect(result.sourceEventCoverage).toMatchObject({
      status: "verified",
      totalSourcePitchedNotes: 2,
      mappedSourcePitchedNotes: 2,
      checkedPitches: 2,
      skippedReasons: []
    });
  });

  it("confere acorde de piano entre pautas na mesma voz por IDs preservados", async () => {
    const musicXml = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
      <part id="P1"><measure number="1"><attributes><divisions>4</divisions><staves>2</staves><time><beats>1</beats><beat-type>4</beat-type></time><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
        <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>2</staff></note>
      </measure></part></score-partwise>`;

    const result = await renderAndValidate(musicXml);
    expect(result.sourceEventCoverage).toMatchObject({
      status: "verified",
      totalSourcePitchedNotes: 2,
      mappedSourcePitchedNotes: 2,
      checkedPitches: 2,
      skippedReasons: []
    });
  });

  it("respeita staff da nota MEI no fallback estrutural de acorde entre pautas", () => {
    const musicXml = `<score-partwise><part><measure><attributes><divisions>1</divisions><staves>2</staves></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>2</staff></note>
    </measure></part></score-partwise>`;
    const mei = `<mei><music><body><scoreDef><staffGrp><staffDef n="1" ppq="1"/><staffDef n="2" ppq="1"/></staffGrp></scoreDef><measure><staff n="1"><layer n="1"><chord dur.ppq="1"><note xml:id="root"/><note xml:id="member" staff="2"/></chord></layer></staff></measure></body></music></mei>`;
    const report = inspectMidiSourceEvents(simultaneousMidi([60, 64]), musicXml, mei,
      [{ qstamp: 0, on: ["root", "member"] }], { root: ["root"], member: ["member"] });

    expect(report).toMatchObject({ status: "verified", checkedPitches: 2, mappedSourcePitchedNotes: 2 });
  });

  it("usa duração própria de membro de acorde e fica parcial quando ela não é demonstrável no MEI", () => {
    const musicXml = `<score-partwise><part><measure><attributes><divisions>1</divisions></attributes>
      <note id="root"><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>
      <note id="member"><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
    </measure></part></score-partwise>`;
    const meiWithOwnDuration = `<mei><music><body><scoreDef><staffGrp><staffDef n="1" ppq="1"/></staffGrp></scoreDef><measure><staff n="1"><layer n="1"><chord dur.ppq="2"><note xml:id="root"/><note xml:id="member" dur.ppq="1"/></chord></layer></staff></measure></body></music></mei>`;
    const timemap = [{ qstamp: 0, on: ["root", "member"] }];
    const expansion = { root: ["root"], member: ["member"] };
    const verified = inspectMidiSourceEvents(simultaneousMidi([60, 64]), musicXml, meiWithOwnDuration, timemap, expansion);
    expect(verified).toMatchObject({ status: "verified", checkedPitches: 2, mappedSourcePitchedNotes: 2 });

    const withoutOwnDuration = meiWithOwnDuration.replace(` dur.ppq="1"`, "");
    const partial = inspectMidiSourceEvents(simultaneousMidi([60, 64]), musicXml, withoutOwnDuration, timemap, expansion);
    expect(partial.status).not.toBe("verified");
    expect(partial.skippedReasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "NOTE_TIMING_FINGERPRINT_MISMATCH" })
    ]));
  });

  it("mantém unverified quando o Verovio não preserva a duração menor de um membro de acorde", async () => {
    const musicXml = score("",
      `<note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>half</type></note>
       <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`);
    const result = await renderAndValidate(musicXml);

    expect(result.sourceEventCoverage.status).not.toBe("verified");
    expect(result.sourceEventCoverage.skippedReasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "NOTE_TIMING_FINGERPRINT_MISMATCH" })
    ]));
  });

  it("falha quando alter=1 exige MIDI 58 mas o renderer entrega 57", () => {
    const musicXml = `<score-partwise><part><measure><attributes><divisions>1</divisions></attributes><note><pitch><step>A</step><alter>1</alter><octave>3</octave></pitch><duration>1</duration><voice>1</voice></note></measure></part></score-partwise>`;
    const mei = `<mei><music><body><scoreDef><staffGrp><staffDef n="1" ppq="1"/></staffGrp></scoreDef><measure xml:id="m1"><staff n="1"><layer n="1"><note xml:id="n1" dur.ppq="1" pname="a" oct="3"/></layer></staff></measure></body></music></mei>`;
    const timemap = [{ measureOn: "m1", qstamp: 0, on: ["n1"] }];

    expect(() => inspectMidiSourceEvents(singleNoteMidi(57), musicXml, mei, timemap, { m1: ["m1"], n1: ["n1"] }))
      .toThrowError(MidiEventMismatchError);
  });

  it("não procura uma graça por proximidade quando timemap e MIDI divergem", () => {
    const musicXml = `<score-partwise><part><measure><attributes><divisions>1</divisions></attributes><note><grace/><pitch><step>C</step><octave>4</octave></pitch><voice>1</voice></note></measure></part></score-partwise>`;
    const mei = `<mei><music><body><scoreDef><staffGrp><staffDef n="1" ppq="1"/></staffGrp></scoreDef><measure><staff><layer><note xml:id="n1" grace="unacc" pname="c" oct="4"/></layer></staff></measure></body></music></mei>`;
    const report = inspectMidiSourceEvents(singleNoteMidi(60), musicXml, mei, [{ qstamp: 0.5, on: ["n1"] }], { n1: ["n1"] });

    expect(report).toMatchObject({ status: "unverified", checkedGraceEvents: 0, skippedPerformedEvents: 1 });
    expect(report.skippedReasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "GRACE_EVENT_UNPROVEN" })
    ]));
  });

  it("mantém associação estrutural ambígua como unverified", () => {
    const musicXml = `<score-partwise><part><measure>
      <note><pitch><step>C</step><octave>4</octave></pitch><voice>1</voice></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><voice>1</voice></note>
    </measure></part></score-partwise>`;
    const mei = `<mei><music><body><measure xml:id="m1"><staff n="1"><layer n="1"><note xml:id="n1"/></layer></staff></measure></body></music></mei>`;
    const report = inspectMidiSourceEvents(singleNoteMidi(60), musicXml, mei, [{ qstamp: 0, on: ["n1"] }], { n1: ["n1"] });

    expect(report).toMatchObject({ status: "unverified", checkedPitches: 0, mappedSourcePitchedNotes: 0 });
    expect(report.skippedReasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "NOTE_MAPPING_AMBIGUOUS" })
    ]));
  });

  it("não aprova XML malformado nem clave oitavada sem transposição explícita", () => {
    const mei = `<mei><music><body><scoreDef><staffGrp><staffDef n="1" ppq="1"/></staffGrp></scoreDef><measure><staff><layer><note xml:id="n1" dur.ppq="1"/></layer></staff></measure></body></music></mei>`;
    const malformed = inspectMidiSourceEvents(singleNoteMidi(60), `<score-partwise><part>`, mei, [], {});
    expect(malformed).toMatchObject({ status: "unverified", checkedPitches: 0 });
    expect(malformed.skippedReasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: "XML_PARSE_ERROR" })]));

    const clefEight = `<score-partwise><part><measure><attributes><divisions>1</divisions><clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure></part></score-partwise>`;
    const unresolved = inspectMidiSourceEvents(singleNoteMidi(60), clefEight, mei, [], {});
    expect(unresolved).toMatchObject({ status: "unverified", checkedPitches: 0 });
    expect(unresolved.skippedReasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CLEF_OCTAVE_SEMANTICS_UNRESOLVED" })
    ]));
  });

  const adelitaCandidates = [
    path.resolve(process.cwd(), "output/omr/adelita-reviewed-2026-10-10/IMSLP44649-PMLP95949-Tarrega_-_Adelita_revisada.musicxml"),
    path.resolve(process.cwd(), "../../output/omr/adelita-reviewed-2026-10-10/IMSLP44649-PMLP95949-Tarrega_-_Adelita_revisada.musicxml")
  ];
  const adelitaPath = adelitaCandidates.find(existsSync) ?? adelitaCandidates[0];
  it.skipIf(!existsSync(adelitaPath))("confere a Adelita revisada real, inclusive graças, acordes e repetições", async () => {
    const musicXml = await fs.readFile(adelitaPath, "utf8");
    const result = await renderAndValidate(musicXml);

    expect(result.sourceEventCoverage).toMatchObject({
      scope: "performed_pitch_and_onset",
      status: "verified",
      totalSourcePitchedNotes: 135,
      mappedSourcePitchedNotes: 135,
      expectedPerformedAttacks: 376,
      checkedPitches: 376,
      checkedOnsets: 376,
      checkedDurations: 0,
      durationStatus: "not_checked",
      skippedSourceNotes: 0,
      skippedPerformedEvents: 0
    });
    expect(result.sourceEventCoverage.checkedGraceEvents).toBeGreaterThanOrEqual(12);
  });

  it.skipIf(!existsSync(adelitaPath))("preserva o A sustenido da Adelita mesmo sem o acidente de cortesia", async () => {
    const musicXml = await fs.readFile(adelitaPath, "utf8");
    const withoutCourtesy = musicXml.replace(/\s*<accidental parentheses="yes">sharp<\/accidental>/, "");
    expect(withoutCourtesy).not.toBe(musicXml);

    const result = await renderAndValidate(withoutCourtesy);
    expect(result.sourceEventCoverage).toMatchObject({ status: "verified", checkedPitches: 376 });
    // The authoritative XML still has no courtesy glyph; the renderer receives a guarded copy.
    expect(withoutCourtesy).not.toContain('<accidental parentheses="yes">sharp</accidental>');
  });
});
