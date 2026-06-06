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
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(inputPath: string, outputDir: string): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
      convertPage(pagePath: string, originalFilename: string, pageOutputDir: string): Promise<{ musicXml: string; confidence: number; warnings: string[] }>;
    };

    const page1 = score(
      ['<measure number="1"><note><pitch><step>C</step><octave>5</octave></pitch></note></measure>'],
      ['<measure number="1"><note><pitch><step>E</step><octave>4</octave></pitch></note></measure>']
    );

    adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
    adapter.preprocessInput = async () => ({
      pages: [
        { attempts: [{ paths: ["/tmp/page-1.png"], description: "pagina 1" }] },
        { attempts: [{ paths: ["/tmp/page-2.png"], description: "pagina 2" }] }
      ],
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
    expect(result.warnings.join("\n")).toContain("Pagina 2: Tentamos 1 preparacao");
    expect(result.warnings.join("\n")).toContain("Error in reaching step PAGE");
    expect(result.warnings.join("\n")).toContain("MusicXML parcial");
  });

  it("prefere a preparacao com mais compassos quando a pagina inteira sai parcial", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      convert(inputPath: string, originalFilename: string, outputDir: string): Promise<{
        musicXml: string;
        confidence: number;
        warnings: string[];
      }>;
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(inputPath: string, outputDir: string): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string; combineSegments?: boolean }> }>; warnings: string[] }>;
      convertPage(pagePath: string, originalFilename: string, pageOutputDir: string): Promise<{ musicXml: string; confidence: number; warnings: string[] }>;
    };

    const partial = score(
      [
        '<measure number="1"><note><pitch><step>C</step><octave>5</octave></pitch></note></measure>',
        '<measure number="2"><note><pitch><step>D</step><octave>5</octave></pitch></note></measure>'
      ],
      []
    );
    const segment1 = score(
      [
        '<measure number="1"><note><pitch><step>E</step><octave>5</octave></pitch></note></measure>',
        '<measure number="2"><note><pitch><step>F</step><octave>5</octave></pitch></note></measure>'
      ],
      []
    );
    const segment2 = score(
      [
        '<measure number="1"><note><pitch><step>G</step><octave>5</octave></pitch></note></measure>',
        '<measure number="2"><note><pitch><step>A</step><octave>5</octave></pitch></note></measure>',
        '<measure number="3"><note><pitch><step>B</step><octave>5</octave></pitch></note></measure>'
      ],
      []
    );

    adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
    adapter.preprocessInput = async () => ({
      pages: [{
        attempts: [
          { paths: ["/tmp/full-page.png"], description: "pagina inteira" },
          { paths: ["/tmp/system-1.png", "/tmp/system-2.png"], description: "2 recortes por sistema", combineSegments: true }
        ]
      }],
      warnings: []
    });
    adapter.convertPage = async (pagePath) => {
      if (pagePath.endsWith("full-page.png")) return { musicXml: partial, confidence: 0.75, warnings: [] };
      if (pagePath.endsWith("system-1.png")) return { musicXml: segment1, confidence: 0.75, warnings: [] };
      return { musicXml: segment2, confidence: 0.75, warnings: [] };
    };

    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-best-attempt-"));
    const result = await adapter.convert("/tmp/input.pdf", "input.pdf", outputDir);

    expect([...result.musicXml.matchAll(/<measure\b/g)]).toHaveLength(5);
    expect(result.musicXml).toContain("<step>B</step>");
    expect(result.warnings.join("\n")).toContain("preparação alternativa");
    expect(result.warnings.join("\n")).toContain("dividida em 2 recortes");
  });

  it("resume falta de idioma OCR sem expor o comando bruto do Audiveris", () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      summarizeAudiverisOutput(output: string): string;
    };

    const summary = adapter.summarizeAudiverisOutput(
      "Command failed: /opt/audiveris/bin/Audiveris -batch -transcribe -export /tmp/audiveris-input.png WARN [] Languages 142 | *** No installed OCR languages *** Input \"/tmp/audiveris-input.png\" WARN Book 2044 | Error processing stub"
    );

    expect(summary).toContain("não há nenhum idioma OCR instalado");
    expect(summary).toContain("reinicie a API e o worker");
    expect(summary).not.toContain("Command failed");
    expect(summary).not.toContain("/tmp/audiveris-input.png");
  });

  it("explica falha de reconhecimento da pagina como problema de qualidade da imagem", () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      summarizeAudiverisOutput(output: string): string;
    };

    const summary = adapter.summarizeAudiverisOutput(
      "Command failed: /opt/audiveris/bin/Audiveris -batch -transcribe WARN [audiveris-input] Book 2044 | Error processing stub WARN [audiveris-input] CLI 956 | Exception occurred java.lang.Exception: Error in reaching step PAGE"
    );

    expect(summary).toContain("Não foi possível reconhecer a página");
    expect(summary).toContain("imagem está inclinada");
    expect(summary).toContain("modo documento/scan");
    expect(summary).not.toContain("Command failed");
    expect(summary).not.toContain("java.lang.Exception");
  });

  it("resume falha de renderizacao do PDF sem expor o comando bruto", () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      summarizePreprocessFailure(error: unknown): string;
    };

    const summary = adapter.summarizePreprocessFailure(new Error(
      "Command failed: pdftoppm -png -scale-to 4400 /app/storage/uploads/arquivo.pdf /tmp/score-omr/audiveris-input\nSyntax Error: Couldn't find trailer dictionary"
    ));

    expect(summary).toContain("Não foi possível ler todas as páginas do PDF");
    expect(summary).toContain("salve uma nova cópia");
    expect(summary).not.toContain("Command failed");
    expect(summary).not.toContain("/app/storage/uploads/arquivo.pdf");
  });

  it("ordena paginas renderizadas numericamente", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      findRenderedPages(dir: string): Promise<string[]>;
    };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-pages-"));
    await fs.writeFile(path.join(dir, "audiveris-input-10.png"), "");
    await fs.writeFile(path.join(dir, "audiveris-input-2.png"), "");
    await fs.writeFile(path.join(dir, "audiveris-input-1.png"), "");

    const pages = await adapter.findRenderedPages(dir);

    expect(pages.map((page) => path.basename(page))).toEqual([
      "audiveris-input-1.png",
      "audiveris-input-2.png",
      "audiveris-input-10.png"
    ]);
  });

  it("prepara fotos de celular antes de chamar o Audiveris", () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      imagePreprocessVariants(inputPath: string, outputDir: string): Array<{ name: string; outputPath: string; args: string[] }>;
    };

    const variants = adapter.imagePreprocessVariants("/tmp/foto.jpg", "/tmp");
    const softArgs = variants.find((variant) => variant.name === "contraste-suave")?.args ?? [];
    const documentArgs = variants.find((variant) => variant.name === "documento")?.args ?? [];
    const highContrastArgs = variants.find((variant) => variant.name === "alto-contraste")?.args ?? [];

    expect(variants).toHaveLength(3);
    expect(softArgs).toEqual(expect.arrayContaining([
      "-auto-orient",
      "-deskew",
      "40%",
      "-colorspace",
      "Gray",
      "-contrast-stretch",
      "2%x2%",
      "-sharpen",
      "0x1"
    ]));
    expect(documentArgs).toEqual(expect.arrayContaining(["-normalize", "-adaptive-sharpen", "0x1.1"]));
    expect(highContrastArgs).toEqual(expect.arrayContaining(["-lat", "35x35-8%", "-morphology", "Close", "Octagon:1"]));
    expect(softArgs.at(0)).toBe("/tmp/foto.jpg");
    expect(softArgs.at(-1)).toBe("/tmp/audiveris-input-soft.png");
  });

  it("usa preparacao leve para imagens vindas do scanner nativo", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      preprocessInput(inputPath: string, outputDir: string, options: { preprocessingProfile?: string | null }): Promise<{ pages: Array<{ attempts: Array<{ paths: string[]; description: string }> }>; warnings: string[] }>;
    };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omr-document-scanner-"));
    const inputPath = path.join(dir, "scan.jpg");
    const png1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
    await fs.writeFile(inputPath, png1x1);

    const result = await adapter.preprocessInput(inputPath, dir, { preprocessingProfile: "document_scanner" });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].attempts).toHaveLength(1);
    expect(result.pages[0].attempts[0].description).toBe("scanner nativo padronizado");
    expect(path.basename(result.pages[0].attempts[0].paths[0])).toBe("audiveris-input-document-scanner.png");
    expect(result.warnings.join("\n")).toContain("scanner nativo de documentos");
  });

  it("rejeita MusicXML pequeno demais gerado a partir de foto", () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      assertUsefulMusicXml(musicXml: string, originalFilename: string): void;
    };
    const tinyMusicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch></note></measure>
  </part>
</score-partwise>`;

    expect(() => adapter.assertUsefulMusicXml(tinyMusicXml, "foto.jpg")).toThrow(/MusicXML pequeno demais/);
    expect(() => adapter.assertUsefulMusicXml(tinyMusicXml, "scan.pdf")).not.toThrow();
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
