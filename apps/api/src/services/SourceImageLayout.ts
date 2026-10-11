import { DOMParser } from "@xmldom/xmldom";
import sharp from "sharp";
import type { ScoreType } from "../domain.js";
import type { MusicXmlValidationIssue } from "./MusicXmlValidation.js";

export type SourceStaffLayout = {
  method: "horizontal_staff_bands_v1";
  status: "observed" | "unknown";
  /** Dimensions of the auto-oriented analysis raster. */
  width: number;
  height: number;
  /** Normalized vertical bounds, from 0 to 1. They are not grouped into systems. */
  staffBands: Array<{ top: number; bottom: number }>;
  sourceImageSHA256?: string;
  evidence?: string[];
  limitations?: string[];
};

export type SourceImageLayoutAnalysis = {
  layout: SourceStaffLayout;
  darkPixelRatio: number;
};

const analysisWidth = 1200;
const limitations = [
  "As faixas são observações geométricas de cinco linhas horizontais longas; não confirmam conteúdo musical.",
  "A detecção não agrupa pautas em sistemas nem infere compassos, partes ou barras.",
  "Pautas curvas, fracas, cortadas ou inclinadas podem não ser detectadas.",
  "Tabelas, grades e linhas de tablatura podem produzir geometria semelhante."
];

function makeLayout(width: number, height: number, staffBands: Array<{ top: number; bottom: number }>, evidence: string[]): SourceStaffLayout {
  return {
    method: "horizontal_staff_bands_v1",
    status: staffBands.length ? "observed" : "unknown",
    width,
    height,
    staffBands,
    evidence,
    limitations: [...limitations]
  };
}

function lineCentersFromRowRuns(rows: number[]): number[] {
  const runs: Array<{ top: number; bottom: number }> = [];
  for (const row of rows) {
    const current = runs.at(-1);
    if (current && row - current.bottom <= 2) current.bottom = row;
    else runs.push({ top: row, bottom: row });
  }
  // Thick shadows and solid blocks satisfy the row threshold over many pixels;
  // they are not plausible individual staff lines and must not create many centers.
  const maxStaffLineThickness = 4;
  return runs
    .filter((run) => run.bottom - run.top + 1 <= maxStaffLineThickness)
    .map((run) => (run.top + run.bottom) / 2);
}

function groupStaffBands(centers: number[], height: number): Array<{ top: number; bottom: number }> {
  const bands: Array<{ top: number; bottom: number }> = [];
  for (let index = 0; index <= centers.length - 5;) {
    const lines = centers.slice(index, index + 5);
    const gaps = Array.from({ length: 4 }, (_value, gapIndex) => lines[gapIndex + 1] - lines[gapIndex]);
    const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const evenlySpaced = average >= 3 && average <= 50
      && gaps.every((gap) => Math.abs(gap - average) <= Math.max(2, average * 0.2));
    if (!evenlySpaced) {
      index++;
      continue;
    }

    const clamp = (value: number) => Math.max(0, Math.min(1, value / height));
    bands.push({ top: clamp(lines[0]), bottom: clamp(lines[4]) });
    // A staff band consumes five line centers, so adjacent detections cannot overlap.
    index += 5;
  }
  return bands;
}

/**
 * Finds only positive staff-like geometry in one raster scan. A missing band is
 * inconclusive: this detector cannot safely classify a page as nonmusical.
 */
export async function analyzeSourceImageLayout(imagePath: string): Promise<SourceImageLayoutAnalysis> {
  const { data, info } = await sharp(imagePath, { failOn: "truncated", limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: analysisWidth, withoutEnlargement: true })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (width < 100 || height < 100) {
    return { layout: makeLayout(width, height, [], ["analysis_raster_too_small"]), darkPixelRatio: 0 };
  }

  const qualifyingRows: number[] = [];
  let totalDark = 0;
  for (let y = 0; y < height; y++) {
    let dark = 0;
    let run = 0;
    let longestRun = 0;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels] < 170) {
        dark++;
        run++;
        if (run > longestRun) longestRun = run;
      } else run = 0;
    }
    totalDark += dark;
    if (dark / width >= 0.32 && longestRun / width >= 0.25) qualifyingRows.push(y);
  }

  const lineCenters = lineCentersFromRowRuns(qualifyingRows);
  const staffBands = groupStaffBands(lineCenters, height);
  return {
    layout: makeLayout(width, height, staffBands, staffBands.length
      ? ["five_long_near_equally_spaced_horizontal_lines"]
      : ["no_complete_staff_like_band_detected"]),
    darkPixelRatio: totalDark / (width * height)
  };
}

const directChildren = (parent: Node, name: string): Element[] => Array.from(parent.childNodes)
  .filter((node): node is Element => node.nodeType === 1 && ((node as Element).localName || node.nodeName) === name);

function candidateStaffNumbers(part: Element): number[] | null {
  const staffReferences = Array.from(part.getElementsByTagName("staff"))
    .map((node) => Number(node.textContent));
  const declaredStaffCounts = Array.from(part.getElementsByTagName("staves"))
    .map((node) => Number(node.textContent));
  if ([...staffReferences, ...declaredStaffCounts].some((number) => !Number.isSafeInteger(number) || number <= 0 || number > 64)) return null;
  const staves = new Set([...staffReferences, ...declaredStaffCounts.flatMap((count) => Array.from({ length: count }, (_value, index) => index + 1))]);
  return [...(staves.size ? staves : new Set([1]))].sort((a, b) => a - b);
}

function hasExpectedPartShape(parts: Element[], scoreType: ScoreType): boolean {
  if (scoreType === "guitar_duo") return parts.length === 2 && parts.every((part) => candidateStaffNumbers(part)?.join(",") === "1");
  if (parts.length !== 1) return false;
  const staves = candidateStaffNumbers(parts[0]);
  if (!staves) return false;
  if (scoreType === "piano") return staves.join(",") === "1,2";
  return staves.join(",") === "1";
}

/**
 * Produces a review warning only when positive source geometry exceeds the
 * system/staff layout explicitly encoded in the candidate's first part.
 * It never infers source bar counts or treats absent print markers as one system.
 */
export function compareSourceStaffLayout(
  xml: string,
  layout: SourceStaffLayout,
  page: number,
  scoreType: ScoreType
): MusicXmlValidationIssue[] {
  if (layout.method !== "horizontal_staff_bands_v1" || layout.status !== "observed" || layout.staffBands.length === 0) return [];

  let document: Document;
  try {
    const errors: string[] = [];
    document = new DOMParser({ errorHandler: {
      warning: () => undefined,
      error: (message) => errors.push(String(message)),
      fatalError: (message) => errors.push(String(message))
    } }).parseFromString(xml, "application/xml");
    if (errors.length || !document.documentElement || (document.documentElement.localName || document.documentElement.nodeName) !== "score-partwise") return [];
  } catch { return []; }

  const parts = directChildren(document.documentElement, "part");
  if (!parts.length || !hasExpectedPartShape(parts, scoreType)) return [];
  const firstPartMeasures = directChildren(parts[0], "measure");
  let explicitBreaks = 0;
  for (const [index, measure] of firstPartMeasures.entries()) {
    const prints = directChildren(measure, "print");
    const breakMarkers = prints.filter((print) => print.getAttribute("new-system") === "yes" || print.getAttribute("new-page") === "yes");
    // Multiple layout markers in one measure cannot be mapped to a single system boundary safely.
    if (breakMarkers.length > 1) return [];
    if (index > 0 && breakMarkers.length === 1) explicitBreaks++;
  }
  if (explicitBreaks === 0) return [];

  const encodedSystems = explicitBreaks + 1;
  const stavesPerSystem = scoreType === "piano" || scoreType === "guitar_duo" ? 2 : 1;
  const encodedStaffSlots = encodedSystems * stavesPerSystem;
  if (layout.staffBands.length <= encodedStaffSlots) return [];

  return [{
    code: "SOURCE_STAFF_COVERAGE_SUSPECTED",
    severity: "warning",
    page,
    message: `Página ${page}: a imagem preparada contém ${layout.staffBands.length} faixas horizontais compatíveis com pautas, mas o MusicXML codifica ${encodedSystems} sistemas e ${encodedStaffSlots} pautas pelo tipo selecionado. Confira a cobertura no original; a detecção geométrica pode omitir pautas e também pode corresponder a tabelas ou grades.`,
  }];
}
