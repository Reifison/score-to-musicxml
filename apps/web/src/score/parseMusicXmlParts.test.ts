import { describe, expect, it } from "vitest";
import { MusicXmlParseError, parseMusicXmlParts } from "./parseMusicXmlParts";

const xml = (body: string) => `<score-partwise version="4.0"><part-list>${body}</part-list></score-partwise>`;

describe("parseMusicXmlParts", () => {
  it("preserva a ordem, extrai nomes/instrumentos e normaliza MIDI", () => {
    const source = `<score-partwise><part-list>
      <score-part id="P1"><part-name>Piano</part-name><score-instrument id="P1-I1"><instrument-name>Grand piano</instrument-name></score-instrument><midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>1</midi-program></midi-instrument></score-part>
      <score-part id="P2"><part-name> Flauta\n</part-name><midi-instrument><midi-channel>16</midi-channel><midi-program>128</midi-program></midi-instrument></score-part>
    </part-list><part id="P1"><measure><note><pitch><step>C</step></pitch></note><note><rest/></note></measure></part><part id="P2"><measure><note><rest/></note></measure></part></score-partwise>`;
    expect(parseMusicXmlParts(source)).toEqual([
      { partId: "P1", order: 0, label: "Piano", instrumentName: "Grand piano", midiChannel: 0, midiProgram: 0, hasPlayableNotes: true },
      { partId: "P2", order: 1, label: "Flauta", midiChannel: 15, midiProgram: 127, hasPlayableNotes: false }
    ]);
  });

  it("tolera prefixos e usa fallback seguro para nomes ausentes", () => {
    expect(parseMusicXmlParts(xml(`<score-part id="x"><instrument-name>  Oboé  </instrument-name></score-part><score-part id="y"/>`)))
      .toMatchObject([{ partId: "x", label: "Oboé", order: 0 }, { partId: "y", label: "Faixa 2", order: 1 }]);
  });

  it("rejeita vazio, XML malformado e raiz que não seja MusicXML", () => {
    for (const value of ["", "<score-partwise>", "<html><score-part/></html>"]) {
      expect(() => parseMusicXmlParts(value)).toThrow(MusicXmlParseError);
      expect(() => parseMusicXmlParts(value)).toThrow("MusicXML");
    }
  });
});
