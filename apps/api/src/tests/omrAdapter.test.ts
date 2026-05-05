import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";
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
  it("retorna mensagem clara quando o executavel configurado nao existe", async () => {
    const originalBin = env.AUDIVERIS_BIN;
    env.AUDIVERIS_BIN = "/tmp/audiveris-inexistente/Audiveris";
    const adapter = new AudiverisOmrAdapter() as unknown as {
      resolveAudiverisBin(): Promise<string>;
    };

    try {
      await expect(adapter.resolveAudiverisBin()).rejects.toMatchObject({
        code: "AUDIVERIS_NOT_FOUND",
        message: expect.stringContaining("Audiveris não encontrado em /tmp/audiveris-inexistente/Audiveris")
      });
    } finally {
      env.AUDIVERIS_BIN = originalBin;
    }
  });

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

  it("mantem MusicXML parcial quando apenas algumas paginas falham", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string): Promise<{
        musicXml: string;
        confidence: number;
        warnings: string[];
      }>;
      preprocessInput(inputPath: string, outputDir: string): Promise<{ paths: string[]; warnings: string[] }>;
      convertPage(pagePath: string, originalFilename: string, pageOutputDir: string): Promise<{ musicXml: string; confidence: number; warnings: string[] }>;
    };

    const page1 = score(
      ['<measure number="1"><note><pitch><step>C</step><octave>5</octave></pitch></note></measure>'],
      ['<measure number="1"><note><pitch><step>E</step><octave>4</octave></pitch></note></measure>']
    );

    adapter.preprocessInput = async () => ({
      paths: ["/tmp/page-1.png", "/tmp/page-2.png"],
      warnings: ["PDF dividido em 2 pagina(s)."]
    });
    adapter.convertPage = async (pagePath) => {
      if (pagePath.endsWith("page-2.png")) {
        throw new AppError(422, "Error in reaching step PAGE", "AUDIVERIS_FAILED");
      }
      return { musicXml: page1, confidence: 0.75, warnings: [] };
    };

    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-partial-"));
    const result = await adapter.convert("/tmp/input.pdf", "input.pdf", outputDir);

    expect(result.musicXml).toContain("<score-partwise");
    expect(result.musicXml).toContain("<step>C</step>");
    expect(result.confidence).toBe(0.75);
    expect(result.warnings.join("\n")).toContain("Pagina 2: Error in reaching step PAGE");
    expect(result.warnings.join("\n")).toContain("MusicXML parcial");
  });

  it("remove creditos OCR sobrepostos e usa o nome do arquivo como titulo", () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      cleanAudiverisText(musicXml: string, originalFilename: string): string;
    };
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <movement-title>Sons deCarinthies Page 03</movement-title>
  <work>
    <work-title>Texto OCR errado</work-title>
  </work>
  <credit page="1">
    <credit-words default-x="10" default-y="100">Titulo embolado</credit-words>
  </credit>
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1"/>
  </part>
</score-partwise>`;

    const cleaned = adapter.cleanAudiverisText(musicXml, "Estudo & Peça.pdf");

    expect(cleaned).not.toContain("<credit");
    expect(cleaned).not.toContain("<movement-title>");
    expect(cleaned).not.toContain("Titulo embolado");
    expect(cleaned).toContain("<work-title>Estudo &amp; Peça</work-title>");
    expect(cleaned).toContain('<part id="P1">');
  });
});
