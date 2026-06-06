import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";
import { MusicXmlExportService } from "./MusicXmlExportService.js";

const execFileAsync = promisify(execFile);
const maxAudiverisDimension = 4400;
const pdfRenderTimeoutMs = 180_000;
const missingOcrLanguagesPattern = /No installed OCR languages/i;
const pageRecognitionFailurePattern = /Error in reaching step PAGE|Error processing stub/i;
const pdfPageRangeFailurePattern = /page range|first page|last page|beyond last page|Syntax Error/i;
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

type PreparedPage = {
  attempts: PreparedAttempt[];
};

type PreparedAttempt = {
  paths: string[];
  description: string;
  combineSegments?: boolean;
};

type CropBand = {
  top: number;
  height: number;
};

export type OmrResult = {
  musicXml: string;
  confidence: number;
  warnings: string[];
};

export type OmrConversionOptions = {
  preprocessingProfile?: string | null;
};

export interface OmrAdapter {
  convert(inputPath: string, originalFilename: string, outputDir: string, options?: OmrConversionOptions): Promise<OmrResult>;
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
  async convert(inputPath: string, originalFilename: string, outputDir: string, options: OmrConversionOptions = {}): Promise<OmrResult> {
    await this.resolveAudiverisBin();
    await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });
    const preprocessing = await this.prepareInputForOmr(inputPath, outputDir, options);
    const pageResults: OmrResult[] = [];
    const pageFailures: string[] = [];

    for (const [index, page] of preprocessing.pages.entries()) {
      const pageOutputDir = path.join(outputDir, `page-${String(index + 1).padStart(3, "0")}`);
      await fs.mkdir(pageOutputDir, { recursive: true, mode: 0o700 });
      try {
        pageResults.push(await this.convertPreparedPage(page, originalFilename, pageOutputDir));
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

  private async prepareInputForOmr(inputPath: string, outputDir: string, options: OmrConversionOptions): Promise<{ pages: PreparedPage[]; warnings: string[] }> {
    try {
      return await this.preprocessInput(inputPath, outputDir, options);
    } catch (error) {
      throw new AppError(422, this.summarizePreprocessFailure(error), "OMR_PREPROCESS_FAILED");
    }
  }

  private async convertPreparedPage(page: PreparedPage, originalFilename: string, pageOutputDir: string): Promise<OmrResult> {
    const failures: string[] = [];
    const successes: OmrResult[] = [];

    for (const [index, attempt] of page.attempts.entries()) {
      const attemptOutputDir = path.join(pageOutputDir, `attempt-${String(index + 1).padStart(2, "0")}`);
      await fs.mkdir(attemptOutputDir, { recursive: true, mode: 0o700 });
      try {
        const result = attempt.combineSegments
          ? await this.convertSegmentedPage(attempt, originalFilename, attemptOutputDir)
          : await this.convertPage(attempt.paths[0], originalFilename, attemptOutputDir);
        successes.push(index === 0
          ? result
          : {
              ...result,
              confidence: Math.min(result.confidence, attempt.combineSegments ? 0.68 : 0.65),
              warnings: [
                `A leitura usou uma preparação alternativa da página: ${attempt.description}.`,
                ...result.warnings
              ]
            });
      } catch (error) {
        failures.push(this.summarizePageFailure(error));
      }
    }

    if (successes.length) {
      return successes.sort((a, b) => this.measureCount(b.musicXml) - this.measureCount(a.musicXml))[0];
    }

    throw new AppError(
      422,
      [
        `Tentamos ${page.attempts.length} preparacao(oes) da imagem antes do OMR, mas nenhuma foi reconhecida.`,
        failures.at(-1)
      ].filter(Boolean).join("\n"),
      "AUDIVERIS_FAILED"
    );
  }

  private async convertSegmentedPage(attempt: PreparedAttempt, originalFilename: string, attemptOutputDir: string): Promise<OmrResult> {
    const segmentResults: OmrResult[] = [];
    const segmentFailures: string[] = [];

    for (const [index, segmentPath] of attempt.paths.entries()) {
      const segmentOutputDir = path.join(attemptOutputDir, `segment-${String(index + 1).padStart(2, "0")}`);
      await fs.mkdir(segmentOutputDir, { recursive: true, mode: 0o700 });
      try {
        segmentResults.push(await this.convertPage(segmentPath, originalFilename, segmentOutputDir));
      } catch (error) {
        segmentFailures.push(`Sistema ${index + 1}: ${this.summarizePageFailure(error)}`);
      }
    }

    if (!segmentResults.length) {
      throw new AppError(422, segmentFailures.at(-1) ?? "Nenhum recorte de sistema foi reconhecido.", "AUDIVERIS_SEGMENTS_FAILED");
    }

    return {
      musicXml: this.mergePageMusicXml(segmentResults.map((result) => result.musicXml)),
      confidence: Math.min(0.68, ...segmentResults.map((result) => result.confidence)),
      warnings: [
        `Página dividida em ${attempt.paths.length} recortes horizontais para recuperar sistemas que o OMR ignorou na página inteira.`,
        ...segmentResults.flatMap((result) => result.warnings),
        ...segmentFailures.map((failure) => `${failure}. O recorte foi ignorado no MusicXML parcial.`)
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
        const musicXml = this.cleanAudiverisText(await fs.readFile(exportedAfterError, "utf8"), originalFilename);
        this.assertUsefulMusicXml(musicXml, originalFilename);
        return {
          musicXml,
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
    const musicXml = this.cleanAudiverisText(await fs.readFile(exported, "utf8"), originalFilename);
    this.assertUsefulMusicXml(musicXml, originalFilename);
    return {
      musicXml,
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
        timeout: env.OMR_AUDIVERIS_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024
      });
    } catch (error) {
      if (this.isMissingExecutableError(error)) {
        throw this.audiverisNotFoundError(audiverisBin);
      }
      throw error;
    }
  }

  private async preprocessInput(inputPath: string, outputDir: string, options: OmrConversionOptions = {}): Promise<{ pages: PreparedPage[]; warnings: string[] }> {
    const extension = path.extname(inputPath).toLowerCase();
    const warnings: string[] = [];

    if (extension === ".pdf") {
      const pdftoppm = await this.findCommand(["/usr/local/bin/pdftoppm", "/opt/homebrew/bin/pdftoppm", "pdftoppm"]);
      const outputPrefix = path.join(outputDir, "audiveris-input");
      if (pdftoppm) {
        await this.renderPdfPages(pdftoppm, inputPath, outputPrefix);
        const paths = await this.findRenderedPages(outputDir);
        warnings.push(`PDF dividido em ${paths.length} pagina(s) e renderizado em resolucao controlada antes do OMR.`);
        return { pages: await Promise.all(paths.map((pagePath, index) => this.prepareRenderedPdfPage(pagePath, outputDir, index + 1))), warnings };
      }
    }

    if (options.preprocessingProfile === "document_scanner") {
      const pagePath = await this.prepareDocumentScannerImage(inputPath, outputDir);
      warnings.push("Imagem recebida do scanner nativo de documentos; aplicado apenas grayscale e redimensionamento de segurança antes do OMR.");
      return { pages: [{ attempts: [{ paths: [pagePath], description: "scanner nativo padronizado" }] }], warnings };
    }

    const magick = await this.findCommand(["/usr/local/bin/magick", "/opt/homebrew/bin/magick", "magick", "/usr/local/bin/convert", "/opt/homebrew/bin/convert", "convert"]);
    if (magick) {
      const paths: string[] = [];
      const failures: string[] = [];
      for (const variant of this.imagePreprocessVariants(inputPath, outputDir)) {
        try {
          await execFileAsync(magick, variant.args, {
            timeout: 120_000,
            maxBuffer: 5 * 1024 * 1024
          });
          paths.push(variant.outputPath);
        } catch (error) {
          failures.push(`${variant.name}: ${this.summarizePreprocessFailure(error)}`);
        }
      }
      if (!paths.length) {
        throw new AppError(422, failures.join("\n") || "Não foi possível preparar a imagem para leitura OMR.", "IMAGE_PREPROCESS_FAILED");
      }
      warnings.push(`Imagem preparada em ${paths.length} versao(oes) antes do OMR: orientacao, contraste, nitidez e tamanho ajustados para leitura pelo Audiveris.`);
      return { pages: [{ attempts: paths.map((pagePath) => ({ paths: [pagePath], description: path.basename(pagePath) })) }], warnings };
    }

    return { pages: [{ attempts: [{ paths: [inputPath], description: path.basename(inputPath) }] }], warnings };
  }

  private async prepareDocumentScannerImage(inputPath: string, outputDir: string): Promise<string> {
    const outputPath = path.join(outputDir, "audiveris-input-document-scanner.png");
    await sharp(inputPath, { failOn: "truncated", limitInputPixels: 50_000_000 })
      .rotate()
      .resize(maxAudiverisDimension, maxAudiverisDimension, { fit: "inside", withoutEnlargement: true })
      .grayscale()
      .png()
      .toFile(outputPath);
    return outputPath;
  }

  private async prepareRenderedPdfPage(pagePath: string, outputDir: string, pageNumber: number): Promise<PreparedPage> {
    const attempts: PreparedAttempt[] = [{ paths: [pagePath], description: "página inteira renderizada" }];
    const preparedDir = path.join(outputDir, `prepared-page-${String(pageNumber).padStart(3, "0")}`);
    await fs.mkdir(preparedDir, { recursive: true, mode: 0o700 });

    try {
      const cleanedPath = path.join(preparedDir, "cleaned.png");
      await sharp(pagePath)
        .grayscale()
        .normalize()
        .sharpen()
        .trim({ background: "#ffffff", threshold: 16 })
        .extend({ top: 80, bottom: 80, left: 80, right: 80, background: "#ffffff" })
        .png()
        .toFile(cleanedPath);
      attempts.push({ paths: [cleanedPath], description: "página limpa em tons de cinza" });

      const systemPaths = await this.createSystemCrops(cleanedPath, preparedDir);
      if (systemPaths.length > 1) {
        attempts.push({
          paths: systemPaths,
          description: `${systemPaths.length} recortes por sistema`,
          combineSegments: true
        });
      }
    } catch {
      // The original rendered page is still a valid Audiveris input.
    }

    return { attempts };
  }

  private async createSystemCrops(inputPath: string, outputDir: string): Promise<string[]> {
    const metadata = await sharp(inputPath).metadata();
    if (!metadata.width || !metadata.height) return [];

    const bands = await this.detectSystemBands(inputPath, metadata.width, metadata.height);
    const cropWidth = Math.max(1, Math.round(metadata.width * 0.94));
    const left = Math.max(0, Math.round((metadata.width - cropWidth) / 2));
    const paths: string[] = [];

    for (const [index, band] of bands.entries()) {
      const outputPath = path.join(outputDir, `system-${String(index + 1).padStart(2, "0")}.png`);
      await sharp(inputPath)
        .extract({ left, top: band.top, width: cropWidth, height: band.height })
        .extend({ top: 60, bottom: 60, left: 60, right: 60, background: "#ffffff" })
        .png()
        .toFile(outputPath);
      paths.push(outputPath);
    }

    return paths;
  }

  private async detectSystemBands(inputPath: string, width: number, height: number): Promise<CropBand[]> {
    const raw = await sharp(inputPath).grayscale().raw().toBuffer();
    const activeRows: number[] = [];
    const rowThreshold = Math.max(20, Math.round(width * 0.06));

    for (let y = 0; y < height; y += 1) {
      let darkPixels = 0;
      const offset = y * width;
      for (let x = 0; x < width; x += 1) {
        if (raw[offset + x] < 185) darkPixels += 1;
      }
      if (darkPixels >= rowThreshold) activeRows.push(y);
    }

    const clusters = this.groupRows(activeRows, Math.max(2, Math.round(height * 0.012)));
    const systemClusters = this.groupBands(
      clusters.filter((band) => band.height >= Math.max(2, Math.round(height * 0.004))),
      Math.max(12, Math.round(height * 0.07))
    );
    const padding = Math.round(height * 0.035);
    const detected = systemClusters
      .map((band) => this.padBand(band, padding, height))
      .filter((band) => band.height >= Math.max(20, Math.round(height * 0.04)));

    return detected.length > 1 ? detected : this.fallbackSystemBands(height);
  }

  private groupRows(rows: number[], maxGap: number): CropBand[] {
    if (!rows.length) return [];
    const bands: CropBand[] = [];
    let start = rows[0];
    let previous = rows[0];

    for (const row of rows.slice(1)) {
      if (row - previous > maxGap) {
        bands.push({ top: start, height: previous - start + 1 });
        start = row;
      }
      previous = row;
    }

    bands.push({ top: start, height: previous - start + 1 });
    return bands;
  }

  private groupBands(bands: CropBand[], maxGap: number): CropBand[] {
    if (!bands.length) return [];
    const grouped: CropBand[] = [];
    let current = bands[0];

    for (const band of bands.slice(1)) {
      const currentBottom = current.top + current.height;
      if (band.top - currentBottom <= maxGap) {
        const bottom = Math.max(currentBottom, band.top + band.height);
        current = { top: current.top, height: bottom - current.top };
      } else {
        grouped.push(current);
        current = band;
      }
    }

    grouped.push(current);
    return grouped;
  }

  private padBand(band: CropBand, padding: number, imageHeight: number): CropBand {
    const top = Math.max(0, band.top - padding);
    const bottom = Math.min(imageHeight, band.top + band.height + padding);
    return { top, height: Math.max(1, bottom - top) };
  }

  private fallbackSystemBands(height: number): CropBand[] {
    const systemCount = 6;
    const topMargin = Math.round(height * 0.14);
    const bottomMargin = Math.round(height * 0.04);
    const musicHeight = Math.max(1, height - topMargin - bottomMargin);
    const bandHeight = Math.ceil(musicHeight / systemCount);
    const overlap = Math.round(bandHeight * 0.22);

    return Array.from({ length: systemCount }, (_value, index) => {
      const top = Math.max(0, topMargin + index * bandHeight - overlap);
      const bottom = Math.min(height, topMargin + (index + 1) * bandHeight + overlap);
      return { top, height: Math.max(1, bottom - top) };
    });
  }

  private async renderPdfPages(pdftoppm: string, inputPath: string, outputPrefix: string): Promise<void> {
    const pageCount = await this.findPdfPageCount(inputPath);

    if (!pageCount) {
      await execFileAsync(pdftoppm, ["-png", "-scale-to", String(maxAudiverisDimension), inputPath, outputPrefix], {
        timeout: pdfRenderTimeoutMs,
        maxBuffer: 5 * 1024 * 1024
      });
      return;
    }

    for (let page = 1; page <= pageCount; page += 1) {
      await execFileAsync(pdftoppm, [
        "-png",
        "-f",
        String(page),
        "-l",
        String(page),
        "-scale-to",
        String(maxAudiverisDimension),
        inputPath,
        outputPrefix
      ], {
        timeout: pdfRenderTimeoutMs,
        maxBuffer: 5 * 1024 * 1024
      });
    }
  }

  private async findPdfPageCount(inputPath: string): Promise<number | null> {
    const pdfinfo = await this.findCommand(["/usr/local/bin/pdfinfo", "/opt/homebrew/bin/pdfinfo", "pdfinfo"]);
    if (!pdfinfo) return null;

    try {
      const { stdout } = await execFileAsync(pdfinfo, [inputPath], {
        timeout: 10_000,
        maxBuffer: 1024 * 1024
      });
      const match = stdout.match(/^Pages:\s+(\d+)\s*$/im);
      if (!match) return null;
      const pages = Number(match[1]);
      return Number.isInteger(pages) && pages > 0 ? pages : null;
    } catch {
      return null;
    }
  }

  private imagePreprocessVariants(inputPath: string, outputDir: string): Array<{ name: string; outputPath: string; args: string[] }> {
    const baseArgs = [
      inputPath,
      "-auto-orient",
      "-resize",
      `${maxAudiverisDimension}x${maxAudiverisDimension}>`,
      "-background",
      "white",
      "-alpha",
      "remove",
      "-alpha",
      "off",
      "-colorspace",
      "Gray"
    ];

    return [
      {
        name: "contraste-suave",
        outputPath: path.join(outputDir, "audiveris-input-soft.png"),
        args: [
          ...baseArgs,
          "-deskew",
          "40%",
          "-contrast-stretch",
          "2%x2%",
          "-sharpen",
          "0x1",
          path.join(outputDir, "audiveris-input-soft.png")
        ]
      },
      {
        name: "documento",
        outputPath: path.join(outputDir, "audiveris-input-document.png"),
        args: [
          ...baseArgs,
          "-deskew",
          "40%",
          "-normalize",
          "-adaptive-sharpen",
          "0x1.1",
          "-contrast-stretch",
          "4%x4%",
          path.join(outputDir, "audiveris-input-document.png")
        ]
      },
      {
        name: "alto-contraste",
        outputPath: path.join(outputDir, "audiveris-input-high-contrast.png"),
        args: [
          ...baseArgs,
          "-deskew",
          "40%",
          "-lat",
          "35x35-8%",
          "-morphology",
          "Close",
          "Octagon:1",
          path.join(outputDir, "audiveris-input-high-contrast.png")
        ]
      }
    ];
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

  private measureCount(musicXml: string): number {
    return (musicXml.match(/<measure\b/g) ?? []).length;
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

  private assertUsefulMusicXml(musicXml: string, originalFilename: string): void {
    if (!/\.(jpe?g|png|webp)$/i.test(originalFilename)) return;

    const measureCount = (musicXml.match(/<measure\b/g) ?? []).length;
    const noteCount = (musicXml.match(/<note\b/g) ?? []).length;
    const partCount = (musicXml.match(/<score-part\b/g) ?? []).length;

    if (measureCount >= 4 && noteCount >= 8 && partCount >= 1) return;

    throw new AppError(
      422,
      [
        "O Audiveris gerou um MusicXML pequeno demais para esta foto, então o resultado foi rejeitado para evitar uma conversão enganosa.",
        `Detectado no resultado: ${measureCount} compasso(s), ${noteCount} nota(s) e ${partCount} instrumento(s).`,
        "Tente reenviar como PDF de scanner ou tire a foto em modo documento, com a folha reta, ocupando quase toda a imagem e sem sombras."
      ].join("\n"),
      "OMR_LOW_QUALITY_OUTPUT"
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
    if (missingOcrLanguagesPattern.test(output)) {
      return [
        "O Audiveris não conseguiu iniciar o OCR porque não há nenhum idioma OCR instalado no ambiente onde o worker está rodando.",
        "Instale pelo menos um idioma OCR/Tesseract, como English/eng ou Portuguese/por, reinicie a API e o worker e envie a partitura novamente.",
        "Se estiver usando o Audiveris no macOS, abra o Audiveris e instale em Tools > Languages/OCR languages. Se estiver usando Docker/Linux, instale os pacotes de idioma do Tesseract no container."
      ].join("\n");
    }

    if (pageRecognitionFailurePattern.test(output)) {
      return [
        "Não foi possível reconhecer a página da partitura. Isso costuma acontecer quando a imagem está inclinada, com sombra, desfocada, cortada ou com margem grande demais.",
        "Tire uma nova foto em modo documento/scan, com a folha plana, bem iluminada, sem sombras e ocupando quase toda a imagem, e envie novamente."
      ].join("\n");
    }

    const compact = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith("INFO "))
      .slice(-20)
      .join("\n");

    return compact.slice(0, 3000) || "Audiveris falhou sem mensagem detalhada.";
  }

  private summarizePreprocessFailure(error: unknown): string {
    const output = this.errorOutput(error);
    if (pdfPageRangeFailurePattern.test(output)) {
      return [
        "Não foi possível ler todas as páginas do PDF antes do OMR.",
        "Abra o arquivo em um leitor de PDF e exporte/salve uma nova cópia antes de enviar novamente. Isso costuma resolver PDFs com índice de páginas corrompido ou estrutura interna incompatível."
      ].join("\n");
    }

    const compact = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith("Command failed:"))
      .slice(-12)
      .join("\n");

    return [
      "Não foi possível preparar o PDF para leitura OMR.",
      "Tente exportar/salvar uma nova cópia do PDF ou dividir a partitura em arquivos menores e enviar novamente.",
      compact
    ].filter(Boolean).join("\n");
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
