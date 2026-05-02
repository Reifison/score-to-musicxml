import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";
import { MusicXmlExportService } from "./MusicXmlExportService.js";

const execFileAsync = promisify(execFile);
const maxAudiverisDimension = 3000;

export type OmrResult = {
  musicXml: string;
  confidence: number;
  warnings: string[];
};

export interface OmrAdapter {
  convert(inputPath: string, originalFilename: string, outputDir: string): Promise<OmrResult>;
}

export class StubOmrAdapter implements OmrAdapter {
  constructor(private musicXml = new MusicXmlExportService()) {}

  async convert(_inputPath: string, originalFilename: string): Promise<OmrResult> {
    throw new AppError(
      501,
      `A conversao OMR real ainda nao esta configurada para ${originalFilename}. Configure OMR_ENGINE=audiveris e AUDIVERIS_BIN para gerar notas reais.`,
      "OMR_ENGINE_NOT_CONFIGURED"
    );
  }
}

export class AudiverisOmrAdapter implements OmrAdapter {
  async convert(inputPath: string, _originalFilename: string, outputDir: string): Promise<OmrResult> {
    if (!env.AUDIVERIS_BIN) {
      throw new AppError(500, "AUDIVERIS_BIN não configurado.", "OMR_NOT_CONFIGURED");
    }
    await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
    const preprocessing = await this.preprocessInput(inputPath, outputDir);
    const pageResults: OmrResult[] = [];

    for (const [index, pagePath] of preprocessing.paths.entries()) {
      const pageOutputDir = path.join(outputDir, `page-${String(index + 1).padStart(3, "0")}`);
      await fs.mkdir(pageOutputDir, { recursive: true, mode: 0o700 });
      pageResults.push(await this.convertPage(pagePath, pageOutputDir));
    }

    if (!pageResults.length) {
      throw new AppError(422, "Nenhuma página foi preparada para OMR.", "OMR_NO_PAGES");
    }

    return {
      musicXml: this.mergePageMusicXml(pageResults.map((result) => result.musicXml)),
      confidence: Math.min(...pageResults.map((result) => result.confidence)),
      warnings: [
        ...preprocessing.warnings,
        ...pageResults.flatMap((result) => result.warnings),
        "Conversao automatica concluida. Revise o resultado para corrigir possiveis erros de OMR."
      ]
    };
  }

  private async convertPage(pagePath: string, pageOutputDir: string): Promise<OmrResult> {
    try {
      await this.runAudiveris(pagePath, pageOutputDir);
    } catch (error) {
      const output = this.errorOutput(error);
      const exportedAfterError = await this.findExportedMusicXml(pageOutputDir);
      if (exportedAfterError) {
        return {
          musicXml: await fs.readFile(exportedAfterError, "utf8"),
          confidence: 0.55,
          warnings: [
            "Audiveris gerou MusicXML, mas retornou avisos/erro no processo. Revise cuidadosamente no MuseScore.",
            this.summarizeAudiverisOutput(output)
          ]
        };
      }
      throw new AppError(422, this.summarizeAudiverisOutput(output), "AUDIVERIS_FAILED");
    }

    const exported = await this.findExportedMusicXml(pageOutputDir);
    if (!exported) {
      throw new AppError(422, "A engine OMR não gerou MusicXML.", "OMR_NO_OUTPUT");
    }
    return {
      musicXml: await fs.readFile(exported, "utf8"),
      confidence: 0.75,
      warnings: []
    };
  }

  private async runAudiveris(pagePath: string, outputDir: string): Promise<void> {
    if (!env.AUDIVERIS_BIN) {
      throw new AppError(500, "AUDIVERIS_BIN não configurado.", "OMR_NOT_CONFIGURED");
    }
    // Critical: execFile passes arguments separately and never invokes a shell.
    await execFileAsync(env.AUDIVERIS_BIN, [
      "-batch",
      "-transcribe",
      "-export",
      "-constant",
      "org.audiveris.omr.sheet.BookManager.useCompression=false",
      "-output",
      outputDir,
      "--",
      pagePath
    ], {
      timeout: 600_000,
      maxBuffer: 10 * 1024 * 1024
    });
  }

  private async preprocessInput(inputPath: string, outputDir: string): Promise<{ paths: string[]; warnings: string[] }> {
    const extension = path.extname(inputPath).toLowerCase();
    const warnings: string[] = [];

    if (extension === ".pdf") {
      const pdftoppm = await this.findCommand(["/usr/local/bin/pdftoppm", "/opt/homebrew/bin/pdftoppm", "pdftoppm"]);
      const outputPrefix = path.join(outputDir, "audiveris-input");
      if (pdftoppm) {
        await execFileAsync(pdftoppm, ["-png", "-scale-to", String(maxAudiverisDimension), inputPath, outputPrefix], {
          timeout: 120_000,
          maxBuffer: 5 * 1024 * 1024
        });
        const paths = await this.findRenderedPages(outputDir);
        warnings.push(`PDF dividido em ${paths.length} pagina(s) e renderizado em resolucao controlada antes do OMR.`);
        return { paths, warnings };
      }
    }

    const magick = await this.findCommand(["/usr/local/bin/magick", "/opt/homebrew/bin/magick", "magick", "/usr/local/bin/convert", "/opt/homebrew/bin/convert", "convert"]);
    if (magick) {
      const outputPath = path.join(outputDir, "audiveris-input.png");
      const args = magick.endsWith("convert")
        ? [inputPath, "-resize", `${maxAudiverisDimension}x${maxAudiverisDimension}>`, outputPath]
        : [inputPath, "-resize", `${maxAudiverisDimension}x${maxAudiverisDimension}>`, outputPath];
      await execFileAsync(magick, args, {
        timeout: 120_000,
        maxBuffer: 5 * 1024 * 1024
      });
      warnings.push("Arquivo redimensionado antes do OMR para respeitar o limite de tamanho do Audiveris.");
      return { paths: [outputPath], warnings };
    }

    return { paths: [inputPath], warnings };
  }

  private async findRenderedPages(dir: string): Promise<string[]> {
    const files = await fs.readdir(dir);
    const pages = files
      .filter((file) => /^audiveris-input-\d+\.png$/.test(file) || file === "audiveris-input.png")
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((file) => path.join(dir, file));
    if (!pages.length) {
      throw new AppError(422, "Não foi possível renderizar páginas do PDF para OMR.", "PDF_RENDER_FAILED");
    }
    return pages;
  }

  private mergePageMusicXml(pageXml: string[]): string {
    if (pageXml.length === 1) return pageXml[0];
    const first = pageXml[0];
    const partMatch = first.match(/<part id="([^"]+)">([\s\S]*?)<\/part>/);
    if (!partMatch) return first;

    let measureNumber = 1;
    const mergedMeasures = pageXml
      .flatMap((xml) => {
        const part = xml.match(/<part id="([^"]+)">([\s\S]*?)<\/part>/);
        if (!part) return [];
        return [...part[2].matchAll(/<measure\b[^>]*>[\s\S]*?<\/measure>/g)].map((match) =>
          match[0].replace(/<measure\b[^>]*>/, () => `<measure number="${measureNumber++}">`)
        );
      })
      .join("\n");

    return first.replace(/<part id="([^"]+)">[\s\S]*?<\/part>/, `<part id="${partMatch[1]}">\n${mergedMeasures}\n</part>`);
  }

  private async findCommand(candidates: string[]): Promise<string | null> {
    for (const candidate of candidates) {
      if (candidate.includes("/")) {
        try {
          await fs.access(candidate);
          return candidate;
        } catch {
          continue;
        }
      }
      try {
        await execFileAsync("/usr/bin/which", [candidate], { timeout: 3000 });
        return candidate;
      } catch {
        continue;
      }
    }
    return null;
  }

  private async findExportedMusicXml(dir: string): Promise<string | null> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await this.findExportedMusicXml(fullPath);
        if (nested) return nested;
      }
      if (entry.isFile() && (entry.name.endsWith(".musicxml") || entry.name.endsWith(".xml"))) {
        return fullPath;
      }
    }
    return null;
  }

  private summarizeAudiverisOutput(output: string): string {
    const compact = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith("INFO "))
      .slice(-20)
      .join("\n");

    if (compact.includes("No installed OCR languages")) {
      return `${compact}\nInstale pelo menos um idioma OCR no Audiveris, por exemplo English ou Portuguese, em Tools > Languages/OCR languages.`;
    }
    return compact.slice(0, 3000) || "Audiveris falhou sem mensagem detalhada.";
  }

  private errorOutput(error: unknown): string {
    const message = error instanceof Error ? error.message : "Falha ao executar Audiveris.";
    const stderr = typeof (error as { stderr?: unknown }).stderr === "string" ? (error as { stderr: string }).stderr : "";
    const stdout = typeof (error as { stdout?: unknown }).stdout === "string" ? (error as { stdout: string }).stdout : "";
    return [message, stderr, stdout].filter(Boolean).join("\n");
  }
}

export function createOmrAdapter(): OmrAdapter {
  return env.OMR_ENGINE === "audiveris" ? new AudiverisOmrAdapter() : new StubOmrAdapter();
}
