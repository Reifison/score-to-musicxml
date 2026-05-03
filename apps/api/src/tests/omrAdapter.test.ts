import { describe, expect, it } from "vitest";
import { AudiverisOmrAdapter } from "../services/OmrAdapter.js";

const score = (p1Measures: string[], p2Measures: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1">
      <part-name>Guitar 1</part-name>
    </score-part>
    <score-part id="P2">
      <part-name>Guitar 2</part-name>
    </score-part>
  </part-list>
  <part id="P1">
${p1Measures.join("\n")}
  </part>
  <part id="P2">
${p2Measures.join("\n")}
  </part>
</score-partwise>`;

const partBody = (musicXml: string, partId: string) => {
  const match = musicXml.match(new RegExp(`<part id="${partId}">([\\s\\S]*?)</part>`));
  return match?.[1] ?? "";
};

describe("AudiverisOmrAdapter", () => {
  it("preserva todos os instrumentos ao juntar MusicXMLs de paginas diferentes", () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      mergePageMusicXml(pageXml: string[]): string;
    };

    const page1 = score(
      [
        '<measure number="10" width="100"><note><pitch><step>C</step><octave>5</octave></pitch></note></measure>',
        '<measure number="11" width="101"><note><pitch><step>D</step><octave>5</octave></pitch></note></measure>'
      ],
      [
        '<measure number="10" width="100"><note><pitch><step>E</step><octave>4</octave></pitch></note></measure>',
        '<measure number="11" width="101"><note><pitch><step>F</step><octave>4</octave></pitch></note></measure>'
      ]
    );
    const page2 = score(
      [
        '<measure number="1" width="200"><note><pitch><step>G</step><octave>5</octave></pitch></note></measure>',
        '<measure number="2" width="201"><note><pitch><step>A</step><octave>5</octave></pitch></note></measure>'
      ],
      [
        '<measure number="1" width="200"><note><pitch><step>B</step><octave>4</octave></pitch></note></measure>',
        '<measure number="2" width="201"><note><pitch><step>C</step><octave>4</octave></pitch></note></measure>'
      ]
    );

    const merged = adapter.mergePageMusicXml([page1, page2]);

    expect([...merged.matchAll(/<part id="P\d">/g)]).toHaveLength(2);
    expect([...partBody(merged, "P1").matchAll(/<measure\b/g)]).toHaveLength(4);
    expect([...partBody(merged, "P2").matchAll(/<measure\b/g)]).toHaveLength(4);
    expect(partBody(merged, "P1")).toContain("<step>A</step>");
    expect(partBody(merged, "P2")).toContain("<step>C</step>");
    expect(partBody(merged, "P2").match(/<measure number="\d+"/g)).toEqual([
      '<measure number="1"',
      '<measure number="2"',
      '<measure number="3"',
      '<measure number="4"'
    ]);
  });
});
