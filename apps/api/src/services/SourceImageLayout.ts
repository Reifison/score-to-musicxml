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
  /** Positive geometry evidence only; its coordinates are deliberately not mapped to the source raster. */
  positiveSkewEvidence?: {
    angleDegrees: number;
    staffLineCount: number;
    staffBandCount: number;
    minimumDarkRatio: number;
    minimumContinuityRatio: number;
  };
  limitations?: string[];
};

export type SourceImageLayoutAnalysis = {
  layout: SourceStaffLayout;
  darkPixelRatio: number;
};

// Keep fine printed staff lines from disappearing during the initial downsample.
const analysisWidth = 2400;
const skewAnalysisWidth = 900;
const skewAnalysisHeight = 1800;
const skewMinimumAngleDegrees = 0.5;
const skewMaximumAngleDegrees = 3;
const skewAngleStepDegrees = 0.25;
const skewLineCoverageThreshold = 0.55;
const limitations = [
  "As faixas são observações geométricas de cinco linhas horizontais longas; não confirmam conteúdo musical.",
  "A detecção não agrupa pautas em sistemas nem infere compassos, partes ou barras.",
  "Pautas curvas, fracas ou cortadas podem não ser detectadas; a evidência inclinada não fornece coordenadas originais.",
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

type SkewCandidateEvidence = NonNullable<SourceStaffLayout["positiveSkewEvidence"]>;

function makeSkewAngles(): number[] {
  const angles: number[] = [];
  for (let magnitude = skewMinimumAngleDegrees; magnitude <= skewMaximumAngleDegrees + 1e-6; magnitude += skewAngleStepDegrees) {
    angles.push(-magnitude, magnitude);
  }
  return angles;
}

function lineContinuity(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  transformedCenter: number,
  slope: number
): { darkRatio: number; longestRunRatio: number } {
  const centerX = (width - 1) / 2;
  let darkSamples = 0;
  let longestRun = 0;
  let run = 0;
  let gap = 0;
  for (let x = 0; x < width; x++) {
    const expectedY = Math.round(transformedCenter + slope * (x - centerX));
    let dark = false;
    for (let offset = -1; offset <= 1; offset++) {
      const y = expectedY + offset;
      if (y >= 0 && y < height && data[(y * width + x) * channels] < 170) {
        dark = true;
        break;
      }
    }
    if (dark) {
      darkSamples++;
      run += gap + 1;
      gap = 0;
      longestRun = Math.max(longestRun, run);
    } else if (run > 0 && gap < 2) {
      gap++;
    } else {
      run = 0;
      gap = 0;
    }
  }
  return { darkRatio: darkSamples / width, longestRunRatio: longestRun / width };
}

/**
 * Finds only very small, long, five-line skew geometry. The returned evidence
 * intentionally carries no raster bounds: a sheared projection cannot be
 * translated into the original image's staff bands without a separate mapping.
 */
function detectPositiveSkewEvidence(data: Buffer, width: number, height: number, channels: number): SkewCandidateEvidence | undefined {
  let best: SkewCandidateEvidence | undefined;
  const centerX = (width - 1) / 2;
  const darkPixels = new Uint32Array(width * height);
  let darkPixelCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels] < 170) darkPixels[darkPixelCount++] = (y << 10) | x;
    }
  }

  for (const angleDegrees of makeSkewAngles()) {
    const slope = Math.tan(angleDegrees * Math.PI / 180);
    const halfSpan = Math.ceil(Math.abs(slope) * centerX) + 2;
    const histogram = new Uint32Array(height + 2 * halfSpan);
    const offsetByX = new Float32Array(width);
    for (let x = 0; x < width; x++) offsetByX[x] = slope * (x - centerX);
    for (let pixelIndex = 0; pixelIndex < darkPixelCount; pixelIndex++) {
      const pixel = darkPixels[pixelIndex];
      // The capped skew raster is at most 900px wide, so ten bits hold x.
      const x = pixel & 0x3ff;
      const y = pixel >>> 10;
      const row = Math.round(y - offsetByX[x]) + halfSpan;
      if (row >= 0 && row < histogram.length) histogram[row]++;
    }

    const qualifyingRows: number[] = [];
    const minimumProjectedPixels = width * skewLineCoverageThreshold;
    for (let row = 0; row < histogram.length; row++) {
      // The projection and the direct continuity check both tolerate one
      // vertical pixel, which covers raster antialiasing without weakening the
      // required long-run coverage.
      const localProjection = histogram[row - 1] + histogram[row] + histogram[row + 1];
      if (localProjection >= minimumProjectedPixels) qualifyingRows.push(row - halfSpan);
    }
    const centers = lineCentersFromRowRuns(qualifyingRows);
    let acceptedBandCount = 0;
    let minimumDarkRatio = 1;
    let minimumContinuityRatio = 1;
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
      const lineEvidence = lines.map((line) => lineContinuity(data, width, height, channels, line, slope));
      if (lineEvidence.some((line) => line.darkRatio < skewLineCoverageThreshold || line.longestRunRatio < skewLineCoverageThreshold)) {
        index++;
        continue;
      }
      acceptedBandCount++;
      minimumDarkRatio = Math.min(minimumDarkRatio, ...lineEvidence.map((line) => line.darkRatio));
      minimumContinuityRatio = Math.min(minimumContinuityRatio, ...lineEvidence.map((line) => line.longestRunRatio));
      index += 5;
    }
    if (acceptedBandCount === 0) continue;

    const candidate: SkewCandidateEvidence = {
      angleDegrees,
      staffLineCount: acceptedBandCount * 5,
      staffBandCount: acceptedBandCount,
      minimumDarkRatio: Number(minimumDarkRatio.toFixed(3)),
      minimumContinuityRatio: Number(minimumContinuityRatio.toFixed(3))
    };
    if (!best || candidate.staffBandCount > best.staffBandCount
      || (candidate.staffBandCount === best.staffBandCount && candidate.minimumContinuityRatio > best.minimumContinuityRatio)) best = candidate;
  }
  return best;
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
  if (staffBands.length === 0) {
    // A separate, tightly capped raster keeps the fallback bounded even for
    // unusually tall source pages. It runs only after the horizontal test fails.
    const skewRaster = await sharp(imagePath, { failOn: "truncated", limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: skewAnalysisWidth, height: skewAnalysisHeight, fit: "inside", withoutEnlargement: true })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const positiveSkewEvidence = detectPositiveSkewEvidence(skewRaster.data, skewRaster.info.width, skewRaster.info.height, skewRaster.info.channels);
    if (positiveSkewEvidence) {
      return {
        layout: {
          ...makeLayout(width, height, [], ["no_complete_horizontal_staff_like_band_detected", "five_skewed_staff_lines_with_long_continuity"]),
          positiveSkewEvidence
        },
        darkPixelRatio: totalDark / (width * height)
      };
    }
  }
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
