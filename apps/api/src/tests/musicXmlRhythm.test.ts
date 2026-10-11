import { describe, expect, it } from "vitest";
import { inspectMusicXmlRhythm } from "../services/MusicXmlRhythm.js";

const note = (duration: number, extra = "") => `<note>${extra}<pitch><step>C</step><octave>4</octave></pitch><duration>${duration}</duration><voice>1</voice></note>`;
const attributes = (divisions = 12, time = "<beats>2</beats><beat-type>4</beat-type>") => `<attributes><divisions>${divisions}</divisions><time>${time}</time></attributes>`;
const measure = (number: string, content: string, flags = "") => `<measure number="${number}" ${flags}>${content}</measure>`;
const score = (measures: string) => `<score-partwise><part-list><score-part id="P1"><part-name>Violão</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;

describe("MusicXML rhythm inspection", () => {
  it("detecta compasso encurtado por falso grupo de tercina sem contar acordes duas vezes", () => {
    const xml = score(measure("15", attributes() + note(3) + [2, 2, 2].map((duration) => note(duration, "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>")).join("") + note(6) + note(6, "<chord/>") + note(6)));
    const report = inspectMusicXmlRhythm(xml);
    expect(report.checkedMeasures).toBe(1);
    expect(report.issues).toEqual([{ partId: "P1", partName: "Violão", measure: "15", kind: "short", expectedQuarterBeats: 2, actualQuarterBeats: 1.75 }]);
    expect(report.warnings[0]).toContain("compasso 15 (Violão) ocupa 1,75 de 2");
  });

  it("detecta duração excessiva", () => {
    expect(inspectMusicXmlRhythm(score(measure("21", attributes() + note(48)))).issues[0]).toMatchObject({ measure: "21", kind: "long", actualQuarterBeats: 4 });
  });

  it("preserva vozes parciais e pautas simultâneas com backup/forward", () => {
    const xml = score(measure("1", attributes() + note(24, "<staff>1</staff>") + "<backup><duration>24</duration></backup>" + note(12, "<staff>2</staff>") + "<forward><duration>12</duration><voice>2</voice><staff>2</staff></forward>"));
    expect(inspectMusicXmlRhythm(xml)).toMatchObject({ checkedMeasures: 1, issues: [], warnings: [] });
  });

  it("não acrescenta duração às notas de graça nem escala novamente tercinas legítimas", () => {
    const grace = "<note><grace/><pitch><step>D</step><octave>4</octave></pitch><type>16th</type></note>";
    const tuplet = "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>";
    expect(inspectMusicXmlRhythm(score(measure("1", attributes() + grace + note(8, tuplet).repeat(3)))).issues).toEqual([]);
  });

  it("herda e atualiza divisions e métrica sem supor 4/4", () => {
    const xml = score(measure("1", attributes(4) + note(8)) + measure("2", "<attributes><divisions>8</divisions></attributes>" + note(16)) + measure("3", attributes(8, "<beats>3</beats><beat-type>4</beat-type>") + note(24)));
    expect(inspectMusicXmlRhythm(xml)).toMatchObject({ checkedMeasures: 3, skippedMeasures: 0, issues: [] });
  });

  it("aceita metros aditivos e compostos", () => {
    for (const [meter, duration] of [["<beats>3+2</beats><beat-type>8</beat-type>", 30], ["<beats>2</beats><beat-type>4</beat-type><beats>3</beats><beat-type>8</beat-type>", 42]] as const) {
      expect(inspectMusicXmlRhythm(score(measure("1", attributes(12, meter) + note(duration)))).issues).toEqual([]);
    }
  });

  it("respeita anacruses, fragmentos implícitos, compasso livre e multimetricidade", () => {
    const xml = score(measure("0", attributes() + note(3), 'implicit="yes"') + measure("1", note(3), 'non-controlling="yes"') + measure("2", attributes(12, "<senza-misura/>") + note(3)));
    expect(inspectMusicXmlRhythm(xml)).toMatchObject({ checkedMeasures: 0, skippedMeasures: 3, issues: [] });
  });

  it("pula mudanças de métrica dentro do compasso e fórmulas divergentes entre pautas", () => {
    const xml = score(measure("1", attributes() + note(12) + "<attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>" + note(12)) + measure("2", "<attributes><time number=\"1\"><beats>2</beats><beat-type>4</beat-type></time><time number=\"2\"><beats>3</beats><beat-type>4</beat-type></time></attributes>" + note(24)));
    expect(inspectMusicXmlRhythm(xml)).toMatchObject({ checkedMeasures: 0, skippedMeasures: 2, issues: [] });
  });

  it("detecta backup que atravessa o início do compasso", () => {
    const xml = score(measure("1", attributes() + note(12) + "<backup><duration>24</duration></backup>" + note(24)));
    expect(inspectMusicXmlRhythm(xml).issues[0]?.kind).toBe("invalid-position");
  });

  it("não afirma validação sem duration/divisions/metre ou em XML inválido", () => {
    expect(inspectMusicXmlRhythm(score(measure("1", note(24))))).toMatchObject({ checkedMeasures: 0, skippedMeasures: 1 });
    expect(inspectMusicXmlRhythm(score(measure("1", attributes() + note(0))))).toMatchObject({ checkedMeasures: 0, skippedMeasures: 1 });
    expect(inspectMusicXmlRhythm("<invalid/>").warnings[0]).toContain("Não foi possível verificar");
    expect(inspectMusicXmlRhythm("").warnings[0]).toContain("Não foi possível verificar");
    expect(inspectMusicXmlRhythm("<score-partwise><part>").warnings[0]).toContain("Não foi possível verificar");
    expect(inspectMusicXmlRhythm(score(measure("1", '<attributes><divisions>12</divisions><time number="1"><beats>2</beats><beat-type>4</beat-type></time></attributes>' + note(12))))).toMatchObject({ checkedMeasures: 0, skippedMeasures: 1 });
  });

  it("mantém estado independente por parte e tolerância para divisões fracionárias", () => {
    const xml = `<score-partwise><part id="P1">${measure("1", attributes(3) + note(1).repeat(6))}</part><part id="P2">${measure("1", note(6))}</part></score-partwise>`;
    expect(inspectMusicXmlRhythm(xml)).toMatchObject({ checkedMeasures: 1, skippedMeasures: 1, issues: [] });
  });
});
