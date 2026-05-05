import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";
import { MusicXmlExportService } from "./MusicXmlExportService.js";

const execFileAsync = promisify(execFile);
const maxAudiverisDimension = 4400;
const audiverisCandidates = [
  "/Applications/Audiveris.app/Contents/MacOS/Audiveris",
  "/opt/audiveris/bin/Audiveris",
  "/usr/local/bin/Audiveris",
  "/opt/homebrew/bin/Audiveris",
  "Audiveris",
  "audiveris"
];

type MusicXmlPart = {
  id: string;
  measures: string[];
};

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
  async convert(inputPath: string, originalFilename: string, outputDir: string): Promise<OmrResult> {
    await this.resolveAudiverisBin();
    await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
    const preprocessing = await this.preprocessInput(inputPath, outputDir);
    const pageResults: OmrResult[] = [];
    const pageFailures: string[] = [];

    for (const [index, pagePath] of preprocessing.paths.entries()) {
      const pageOutputDir = path.join(outputDir, `page-${String(index + 1).padStart(3, "0")}`);
      await fs.mkdir(pageOutputDir, { recursive: true, mode: 0o700 });
      try {
        pageResults.push(await this.convertPage(pagePath, originalFilename, pageOutputDir));
      } catch (error) {
        pageFailures.push(`Pagina ${index + 1}: ${this.summarizePageFailure(error)}`);
      }
    }

    if (!pageResults.length) {
      throw new AppError(
        422,
        pageFailures.length ? pageFailures.join("\n") : "Nenhuma página foi preparada para OMR.",
        pageFailures.length ? "OMR_ALL_PAGES_FAILED" : "OMR_NO_PAGES"
      );
    }

    return {
      musicXml: this.mergePageMusicXml(pageResults.map((result) => result.musicXml)),
      confidence: Math.min(...pageResults.map((result) => result.confidence)),
      warnings: [
        ...preprocessing.warnings,
        ...pageResults.flatMap((result) => result.warnings),
        ...pageFailures.map((failure) => `${failure}. A pagina foi ignorada no MusicXML parcial.`),
        "Conversao automatica concluida. Revise o resultado para corrigir possiveis erros de OMR."
      ]
    };
  }

  private async convertPage(pagePath: string, originalFilename: string, pageOutputDir: string): Promise<OmrResult> {
    try {
      await this.runAudiveris(pagePath, pageOutputDir);
    } catch (error) {
      const output = this.errorOutput(error);
      const exportedAfterError = await this.findExportedMusicXml(pageOutputDir);
      if (exportedAfterError) {
        return {
          musicXml: this.cleanAudiverisText(await fs.readFile(exportedAfterError, "utf8"), originalFilename),
          confidence: 0.55,
          warnings: [
            "Audiveris gerou MusicXML, mas retornou avisos/erro no processo. Revise cuidadosamente no MuseScore.",
            "Textos OCR de cabecalho removidos para evitar titulos e creditos sobrepostos.",
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
      musicXml: this.cleanAudiverisText(await fs.readFile(exported, "utf8"), originalFilename),
      confidence: 0.75,
      warnings: ["Textos OCR de cabecalho removidos para evitar titulos e creditos sobrepostos."]
    };
  }

  private async runAudiveris(pagePath: string, outputDir: string): Promise<void> {
    const audiverisBin = await this.resolveAudiverisBin();
    // Critical: execFile passes arguments separately and never invokes a shell.
    try {
      await execFileAsync(audiverisBin, [
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
    } catch (error) {
      if (this.isMissingExecutableError(error)) {
        throw this.audiverisNotFoundError(audiverisBin);
      }
      throw error;
    }
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
    const firstParts = this.extractParts(first);
    if (!firstParts.length) return first;

    const pageParts = pageXml.map((xml) => new Map(this.extractParts(xml).map((part) => [part.id, part])));
    const partIds = firstParts.map((part) => part.id);
    const nextMeasureByPart = new Map(partIds.map((id) => [id, 1]));
    const mergedByPart = new Map<string, string[]>();

    for (const partId of partIds) {
      const mergedMeasures = pageParts.flatMap((parts) => {
        const part = parts.get(partId);
        if (!part) return [];
        return part.measures.map((measure) => {
          const measureNumber = nextMeasureByPart.get(partId) ?? 1;
          nextMeasureByPart.set(partId, measureNumber + 1);
          return this.renumberMeasure(measure, measureNumber);
        });
      });
      mergedByPart.set(partId, mergedMeasures);
    }

    return first.replace(/<part\s+id=(["'])([^"']+)\1[^>]*>[\s\S]*?<\/part>/g, (partXml, _quote: string, partId: string) => {
      const measures = mergedByPart.get(partId);
      if (!measures) return partXml;
      return `<part id="${partId}">\n${measures.join("\n")}\n</part>`;
    });
  }

  private extractParts(xml: string): MusicXmlPart[] {
    return [...xml.matchAll(/<part\s+id=(["'])([^"']+)\1[^>]*>([\s\S]*?)<\/part>/g)].map((match) => ({
      id: match[2],
      measures: [...match[3].matchAll(/<measure\b[^>]*>[\s\S]*?<\/measure>/g)].map((measure) => measure[0])
    }));
  }

  private renumberMeasure(measure: string, number: number): string {
    return measure.replace(/<measure\b([^>]*)>/, (_tag, attributes: string) => {
      const attributesWithoutNumber = attributes.replace(/\snumber=(["'])[^"']*\1/, "");
      return `<measure number="${number}"${attributesWithoutNumber}>`;
    });
  }

  private cleanAudiverisText(musicXml: string, originalFilename: string): string {
    const title = this.escapeXml(path.parse(originalFilename).name);
    const withoutCredits = musicXml
      .replace(/\n?\s*<credit\b[\s\S]*?<\/credit>\s*/g, "\n")
      .replace(/\n?\s*<movement-title>[\s\S]*?<\/movement-title>\s*/g, "\n");

    if (/<work>[\s\S]*?<\/work>/.test(withoutCredits)) {
      return withoutCredits.replace(/<work>[\s\S]*?<\/work>/, `<work>\n    <work-title>${title}</work-title>\n  </work>`);
    }

    return withoutCredits.replace(
      /(<score-partwise\b[^>]*>)/,
      `$1\n  <work>\n    <work-title>${title}</work-title>\n  </work>`
    );
  }

  private escapeXml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
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

  private async resolveAudiverisBin(): Promise<string> {
    if (env.AUDIVERIS_BIN) {
      await this.assertExecutable(env.AUDIVERIS_BIN);
      return env.AUDIVERIS_BIN;
    }

    const detected = await this.findCommand(audiverisCandidates);
    if (detected) return detected;

    throw new AppError(
      500,
      "Audiveris não encontrado. Configure AUDIVERIS_BIN no .env com o caminho do executável do Audiveris e reinicie a API e o worker.",
      "AUDIVERIS_NOT_FOUND"
    );
  }

  private async assertExecutable(binaryPath: string): Promise<void> {
    if (!binaryPath.includes("/")) return;
    try {
      await fs.access(binaryPath, fsConstants.X_OK);
    } catch {
      throw this.audiverisNotFoundError(binaryPath);
    }
  }

  private audiverisNotFoundError(binaryPath: string): AppError {
    const dockerHint = binaryPath.startsWith("/Applications/")
      ? " Se a API estiver rodando em Docker, esse caminho do macOS não existe dentro do container; rode a API/worker localmente ou instale uma versão Linux do Audiveris no container."
      : "";
    return new AppError(
      500,
      `Audiveris não encontrado em ${binaryPath}. Ajuste AUDIVERIS_BIN no .env para o executável correto e reinicie a API e o worker.${dockerHint}`,
      "AUDIVERIS_NOT_FOUND"
    );
  }

  private isMissingExecutableError(error: unknown): boolean {
    return typeof (error as { code?: unknown }).code === "string" && (error as { code: string }).code === "ENOENT";
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

  private summarizePageFailure(error: unknown): string {
    if (error instanceof AppError) return error.message;
    return this.summarizeAudiverisOutput(this.errorOutput(error));
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
