import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compareMusicXmlCandidateAgreement } from "../services/MusicXmlCandidateAgreement.js";

const agreement = (left: string, right: string) => compareMusicXmlCandidateAgreement([
  { candidateIds: [1], xml: left },
  { candidateIds: [2], xml: right }
], 7);

const document = (partId: string, partName: string, body: string, header = "") => `<?xml version="1.0"?>
<score-partwise version="4.0"><work><work-title>${header}</work-title></work><part-list><score-part id="${partId}"><part-name>${partName}</part-name></score-part></part-list><part id="${partId}">${body}</part></score-partwise>`;
const simpleNote = (step = "C") => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`;
const oneMeasure = (attributes: string, note = simpleNote()) => `<measure number="1"><attributes><divisions>4</divisions>${attributes}</attributes>${note}</measure>`;

describe("MusicXmlCandidateAgreement", () => {
  it("ignora mudanças de layout e cabeçalho, IDs renomeados de uma parte e ordem de notas de acorde", () => {
    const left = document("P1", "Voice", '<measure number="1" width="200"><attributes><divisions>4</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note><note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note></measure>', "Partitura original");
    const right = document("renamed", "Voice", '\n  <measure number="1" width="999">\n    <attributes><divisions>8</divisions></attributes>\n    <note><pitch><step>E</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>quarter</type></note>\n    <note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>quarter</type><chord/>\n    </note>\n  </measure>\n', "Outra descrição");

    expect(agreement(left, right)).toEqual([]);

    const twoParts = (declarations: Array<[string, string]>, parts: Array<[string, string]>) => `<score-partwise><part-list>${declarations.map(([id, name]) => `<score-part id="${id}"><part-name>${name}</part-name></score-part>`).join("")}</part-list>${parts.map(([id, step]) => `<part id="${id}"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note></measure></part>`).join("")}</score-partwise>`;
    const namedPartsOriginal = twoParts([["P1", "Alto"], ["P2", "Bass"]], [["P1", "C"], ["P2", "G"]]);
    const namedPartsReordered = twoParts([["X", "Bass"], ["Y", "Alto"]], [["X", "G"], ["Y", "C"]]);
    expect(agreement(namedPartsOriginal, namedPartsReordered)).toEqual([]);
  });

  it("localiza diferenças de altura, voz, duração, posição e pauta", () => {
    const left = document("P1", "Voice", '<measure number="12"><attributes><divisions>4</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff><type>quarter</type></note><note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><voice>2</voice><staff>2</staff><type>quarter</type></note><note><grace/><pitch><step>D</step><octave>4</octave></pitch><voice>1</voice><staff>1</staff><type>eighth</type></note></measure>');
    const right = document("P1", "Voice", '<measure number="12"><attributes><divisions>8</divisions></attributes><note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff><type>quarter</type></note><note><pitch><step>F</step><octave>4</octave></pitch><duration>8</duration><voice>3</voice><staff>1</staff><type>quarter</type></note><note><grace/><pitch><step>E</step><octave>4</octave></pitch><voice>1</voice><staff>1</staff><type>eighth</type></note></measure>');

    const issues = agreement(left, right);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "CANDIDATE_EVENT_DIVERGENCE", page: 7, partId: "P1", partName: "Voice", measure: "12", candidateIds: [1, 2] });
    expect(issues[0].differences).toEqual(expect.arrayContaining(["pitch", "duration", "voice", "staff", "onset"]));
    expect(issues[0].voice).toBeUndefined();
  });

  it("distingue uma pausa de uma nota com mesmo início e duração", () => {
    const left = document("P1", "Voice", '<measure number="2"><attributes><divisions>4</divisions></attributes><note><rest/><duration>4</duration><voice>1</voice><type>quarter</type></note></measure>');
    const right = document("P1", "Voice", '<measure number="2"><attributes><divisions>4</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note></measure>');
    expect(agreement(left, right)[0].differences).toContain("note_or_rest");
  });

  it("mantém altura inválida e pauta fracionária como comparação não verificada", () => {
    const note = (step: string, octave: string, staff: string) => document("P1", "Voice", `<measure number="5"><attributes><divisions>1</divisions></attributes><note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>1</duration><staff>${staff}</staff></note></measure>`);
    for (const malformed of [note("H", "4", "1"), note("C", "4.5", "1"), note("C", "4", "1.5")]) {
      const issues = agreement(malformed, note("C", "4", "1"));
      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe("CANDIDATE_AGREEMENT_UNCHECKED");
    }
  });

  it("compara notas de graça com notas regulares sem deslocar o cursor", () => {
    const regular = document("P1", "Voice", '<measure number="4"><attributes><divisions>4</divisions></attributes><note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>16th</type></note></measure>');
    const grace = document("P1", "Voice", '<measure number="4"><attributes><divisions>4</divisions></attributes><note><grace/><pitch><step>D</step><octave>4</octave></pitch><voice>1</voice><type>16th</type></note></measure>');
    expect(agreement(regular, grace)[0].differences).toEqual(expect.arrayContaining(["grace", "duration"]));
  });

  it("compara notas não afinadas pelo contexto de pauta e preserva o caso sem contexto como não verificado", () => {
    const unpitched = (step: string) => document("P1", "Percussion", `<measure number="3"><attributes><divisions>2</divisions></attributes><note><unpitched><display-step>${step}</display-step><display-octave>4</display-octave></unpitched><duration>2</duration><voice>1</voice><staff>1</staff><type>quarter</type></note></measure>`);
    expect(agreement(unpitched("C"), unpitched("C"))).toEqual([]);
    expect(agreement(unpitched("C"), unpitched("D"))[0].differences).toContain("unpitched_pitch");

    const incomplete = (note: string) => document("P1", "Percussion", `<measure number="3">${note}</measure>`);
    const unchecked = agreement(incomplete("<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>"), incomplete("<note><rest/><duration>4</duration></note>"));
    expect(unchecked).toHaveLength(1);
    expect(unchecked[0]).toMatchObject({ code: "CANDIDATE_AGREEMENT_UNCHECKED", differences: ["duration_context"] });
  });

  it("compara sinais temporais codificados em posição, sem alegar qual leitura está correta", () => {
    const marked = (tempo: string, offset: string, dynamic: string, slur: string, tie: string, tuplet: string, beam: string, type = "eighth", dots = "") => document("P1", "Voice", `<measure number="9"><attributes><divisions>4</divisions></attributes><direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo}</per-minute></metronome><dynamics><${dynamic}/></dynamics></direction-type><offset>${offset}</offset><sound tempo="${tempo}"/></direction><note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>${type}</type>${dots}<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><beam number="1">${beam}</beam><tie type="${tie}"/><notations><slur type="${slur}" number="1"/><tied type="${tie}"/><tuplet type="${tuplet}" number="1"/></notations></note></measure>`);
    const issues = agreement(marked("80", "1", "mf", "start", "start", "start", "begin"), marked("90", "2", "f", "stop", "stop", "stop", "end", "quarter", "<dot/>"));
    expect(issues).toHaveLength(1);
    expect(issues[0].differences).toEqual(expect.arrayContaining(["tempo", "dynamics", "onset", "slur", "tie", "tuplet", "beam", "printed_type", "dots"]));
  });

  it("compara a armadura efetiva herdada e localiza uma mudança iniciada em compassos diferentes", () => {
    const measures = (keyAt: number, fifths: number) => [8, 9, 10].map((number) => `<measure number="${number}"><attributes><divisions>4</divisions>${number === keyAt ? `<key><fifths>${fifths}</fifths><mode>major</mode></key>` : ""}</attributes>${simpleNote()}</measure>`).join("");
    const left = document("P1", "Voice", measures(9, 1));
    const right = document("P1", "Voice", measures(10, 1));
    const issues = agreement(left, right);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ measure: "9", differences: ["key_signature"] });
  });

  it("trata uma armadura explícita equivalente ao contexto maior padrão como a mesma leitura", () => {
    const explicitMajor = document("P1", "Voice", oneMeasure('<key><fifths>0</fifths><mode>major</mode></key>'));
    const inheritedDefault = document("renamed", "Voice", oneMeasure(""));
    expect(agreement(explicitMajor, inheritedDefault)).toEqual([]);
  });

  it("compara a transposição efetiva herdada por pauta sem escolher qual candidato é correto", () => {
    const left = document("P1", "Voice", oneMeasure('<transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>0</octave-change></transpose>'));
    const right = document("P1", "Voice", oneMeasure('<transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>'));
    const issues = agreement(left, right);
    expect(issues).toHaveLength(1);
    expect(issues[0].differences).toContain("transpose");
  });

  it("não diverge quando a mesma transposição efetiva é declarada na parte ou explicitamente na pauta", () => {
    const partLevel = document("P1", "Voice", oneMeasure('<transpose><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>'));
    const staffLevel = document("P1", "Voice", oneMeasure('<transpose number="1"><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>'));
    expect(agreement(partLevel, staffLevel)).toEqual([]);
  });

  it("aceita transposições independentes legítimas em múltiplas pautas", () => {
    const multiStaff = (staffTwoOctave: string) => oneMeasure([
      '<transpose number="1"><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>',
      `<transpose number="2"><chromatic>0</chromatic><octave-change>${staffTwoOctave}</octave-change></transpose>`
    ].join(""));
    expect(agreement(document("P1", "Piano", multiStaff("0")), document("P1", "Piano", multiStaff("0")))).toEqual([]);

    const issues = agreement(document("P1", "Piano", multiStaff("0")), document("P1", "Piano", multiStaff("-1")));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "CANDIDATE_EVENT_DIVERGENCE", staff: 2, differences: ["transpose"] });
  });

  it("compara armaduras efetivas por pauta quando a associação é explícita", () => {
    const staffKeys = (staffTwoFifths: number) => oneMeasure([
      '<key number="1"><fifths>0</fifths><mode>major</mode></key>',
      `<key number="2"><fifths>${staffTwoFifths}</fifths><mode>major</mode></key>`
    ].join(""));
    expect(agreement(document("P1", "Piano", staffKeys(2)), document("P1", "Piano", staffKeys(2)))).toEqual([]);

    const issues = agreement(document("P1", "Piano", staffKeys(2)), document("P1", "Piano", staffKeys(3)));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "CANDIDATE_EVENT_DIVERGENCE", staff: 2, differences: ["key_signature"] });
  });

  it("marca atributos de armadura e transposição inseridos depois do conteúdo como contexto não verificado", () => {
    const midMeasure = (attribute: string) => document("P1", "Voice", `<measure number="1"><attributes><divisions>4</divisions></attributes>${simpleNote()}<attributes>${attribute}</attributes>${simpleNote("D")}</measure>`);
    const baseline = document("P1", "Voice", oneMeasure(""));
    const keyIssues = agreement(midMeasure('<key><fifths>1</fifths><mode>major</mode></key>'), baseline);
    expect(keyIssues).toHaveLength(1);
    expect(keyIssues[0]).toMatchObject({ code: "CANDIDATE_AGREEMENT_UNCHECKED", differences: ["key_position_context"] });

    const transposeIssues = agreement(midMeasure('<transpose><chromatic>1</chromatic><octave-change>0</octave-change></transpose>'), baseline);
    expect(transposeIssues).toHaveLength(1);
    expect(transposeIssues[0]).toMatchObject({ code: "CANDIDATE_AGREEMENT_UNCHECKED", differences: ["transpose_position_context"] });
  });

  it("marca como não verificada uma associação de transposição sem number de pauta", () => {
    const unsupported = document("P1", "Piano", oneMeasure('<transpose><staff>2</staff><chromatic>1</chromatic><octave-change>0</octave-change></transpose>'));
    const issues = agreement(unsupported, unsupported);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "CANDIDATE_AGREEMENT_UNCHECKED", differences: ["transpose_context"] });
  });

  it("registra repeat, Da Capo e Fine ausentes em um candidato como divergência de navegação", () => {
    const left = document("P1", "Voice", '<measure number="1"><attributes><divisions>4</divisions></attributes><barline location="left"><repeat direction="forward"/></barline><direction><direction-type><words>D.C.</words></direction-type><sound dacapo="yes"/></direction><direction><sound fine="yes"/></direction>' + simpleNote() + "</measure>");
    const right = document("P1", "Voice", oneMeasure(""));
    const issues = agreement(left, right);
    expect(issues).toHaveLength(1);
    expect(issues[0].differences).toEqual(expect.arrayContaining(["navigation", "repeat", "da_capo", "fine"]));
  });

  it("compara instrumento e programa quando a associação de partes é segura", () => {
    const instrumentDocument = (id: string, instrument: string, program: number) => `<?xml version="1.0"?><score-partwise><part-list><score-part id="${id}"><part-name>Guitar</part-name><score-instrument id="${id}-I"><instrument-name>${instrument}</instrument-name></score-instrument><midi-instrument id="${id}-I"><midi-program>${program}</midi-program></midi-instrument></score-part></part-list><part id="${id}">${oneMeasure("")}</part></score-partwise>`;
    const issues = agreement(instrumentDocument("P1", "Acoustic Guitar", 25), instrumentDocument("X9", "Piano", 1));
    expect(issues).toHaveLength(1);
    expect(issues[0].differences).toEqual(expect.arrayContaining(["instrument", "program"]));
  });

  it("ignora IDs redundantes quando instrumento e programa são semanticamente equivalentes", () => {
    const instrumentDocument = (id: string, instrumentId: string) => `<?xml version="1.0"?><score-partwise><part-list><score-part id="${id}"><part-name>Guitar</part-name><score-instrument id="${instrumentId}"><instrument-name>Acoustic Guitar</instrument-name></score-instrument><midi-instrument id="${instrumentId}"><midi-program>25</midi-program></midi-instrument></score-part></part-list><part id="${id}">${oneMeasure("")}</part></score-partwise>`;
    expect(agreement(instrumentDocument("P1", "I1"), instrumentDocument("X9", "J9"))).toEqual([]);
  });

  it("registra divergências localizadas nos excertos CSM indicados pelo manifesto e valida os hashes de referência", async () => {
    const fixtureDir = fileURLToPath(new URL("../../../../scripts/tests/fixtures/acervo-review/csm100/", import.meta.url));
    const manifest = JSON.parse(await fs.readFile(path.join(fixtureDir, "manifest.json"), "utf8")) as {
      files: Array<{ label: string; file: string; sha256: string }>;
      measures: number[];
      approvedForTraining: boolean;
    };
    const fragments = await Promise.all(manifest.files.map(async (file) => {
      const content = await fs.readFile(path.join(fixtureDir, file.file), "utf8");
      expect(createHash("sha256").update(content).digest("hex")).toBe(file.sha256);
      return { candidateIds: [file.label === "original" ? 1 : 2], xml: content };
    }));
    expect(manifest.approvedForTraining).toBe(false);

    const issues = compareMusicXmlCandidateAgreement(fragments, 4);
    expect(issues.filter((issue) => issue.code === "CANDIDATE_EVENT_DIVERGENCE").map((issue) => issue.measure)).toEqual(expect.arrayContaining(manifest.measures.map(String)));
    expect(issues.every((issue) => issue.page === 4 && issue.candidateIds.join(",") === "1,2")).toBe(true);
    expect(issues.every((issue) => issue.message.includes("confira a partitura original"))).toBe(true);
  });
});
