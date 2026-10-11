import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { analyzeSourceImageLayout, compareSourceStaffLayout, type SourceStaffLayout } from "../services/SourceImageLayout.js";

function layout(count: number, status: SourceStaffLayout["status"] = "observed"): SourceStaffLayout {
  return {
    method: "horizontal_staff_bands_v1",
    status,
    width: 1200,
    height: 1600,
    staffBands: Array.from({ length: count }, (_value, index) => ({ top: 0.02 + index * 0.1, bottom: 0.05 + index * 0.1 })),
    limitations: []
  };
}

function scorePart(id: string, measures: number, staves: number, options: { systemMarkers?: boolean; markersInSecondPartOnly?: boolean } = {}): string {
  const measureXml = Array.from({ length: measures }, (_value, index) => {
    const marker = options.systemMarkers && !options.markersInSecondPartOnly && index > 0
      ? `<print ${index % 2 ? 'new-system="yes"' : 'new-page="yes"'}/>`
      : "";
    const firstStaff = '<note><rest/><duration>1</duration><staff>1</staff></note>';
    const secondStaff = staves === 2 ? '<backup><duration>1</duration></backup><note><rest/><duration>1</duration><staff>2</staff></note>' : "";
    return `<measure number="${index + 1}">${marker}${index === 0 ? `<attributes><staves>${staves}</staves></attributes>` : ""}${firstStaff}${secondStaff}</measure>`;
  }).join("");
  return `<part id="${id}">${measureXml}</part>`;
}

function musicXml(parts: string[]): string {
  const declarations = parts.map((_part, index) => `<score-part id="P${index + 1}"><part-name>Part ${index + 1}</part-name></score-part>`).join("");
  return `<score-partwise><part-list>${declarations}</part-list>${parts.join("")}</score-partwise>`;
}

async function writeImage(filePath: string, bands: number): Promise<void> {
  const width = 1000;
  const height = 1500;
  const bandLines = Array.from({ length: bands }, (_value, bandIndex) => Array.from({ length: 5 }, (_line, lineIndex) => {
    const y = 30 + bandIndex * 230 + lineIndex * 10;
    return `<rect x="100" y="${y}" width="800" height="2" fill="black"/>`;
  }).join("")).join("");
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/>${bandLines}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(filePath);
}

async function writeShortLines(filePath: string, lineCount: number): Promise<void> {
  const lines = Array.from({ length: lineCount }, (_value, index) => `<rect x="100" y="${100 + index * 12}" width="180" height="2" fill="black"/>`).join("");
  const svg = `<svg width="1000" height="700" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/>${lines}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(filePath);
}

async function writeShadowBand(filePath: string): Promise<void> {
  const svg = '<svg width="1000" height="700" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><rect x="0" y="180" width="1000" height="180" fill="#555"/></svg>';
  await sharp(Buffer.from(svg)).png().toFile(filePath);
}

describe("SourceImageLayout", () => {
  it("coleta faixas não sobrepostas em uma análise de imagem e mantém limites normalizados", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "source-layout-bands-"));
    const imagePath = path.join(dir, "six-systems.png");
    try {
      await writeImage(imagePath, 6);
      const result = await analyzeSourceImageLayout(imagePath);
      expect(result.layout).toMatchObject({ method: "horizontal_staff_bands_v1", status: "observed", staffBands: expect.any(Array) });
      expect(result.layout.staffBands).toHaveLength(6);
      expect(result.layout.staffBands.every((band) => band.top >= 0 && band.bottom <= 1 && band.top < band.bottom)).toBe(true);
      expect(result.layout.staffBands.every((band, index, bands) => index === 0 || bands[index - 1].bottom < band.top)).toBe(true);
      expect(result.layout.limitations?.join(" ")).toContain("Tabelas, grades e linhas de tablatura");
      expect(result.darkPixelRatio).toBeGreaterThan(0);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("deixa linhas curtas como desconhecidas em vez de classificá-las como página não musical", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "source-layout-short-lines-"));
    const imagePath = path.join(dir, "eight-short-lines.png");
    try {
      await writeShortLines(imagePath, 8);
      const result = await analyzeSourceImageLayout(imagePath);
      expect(result.layout.status).toBe("unknown");
      expect(result.layout.staffBands).toEqual([]);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("não converte uma faixa larga de sombra em várias pautas falsas", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "source-layout-shadow-band-"));
    const imagePath = path.join(dir, "shadow.png");
    try {
      await writeShadowBand(imagePath);
      const result = await analyzeSourceImageLayout(imagePath);
      expect(result.layout.status).toBe("unknown");
      expect(result.layout.staffBands).toEqual([]);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("sinaliza somente quando faixas observadas excedem sistemas codificados explicitamente", () => {
    const fiveSystems = musicXml([scorePart("P1", 5, 1, { systemMarkers: true })]);
    const issue = compareSourceStaffLayout(fiveSystems, layout(6), 3, "melody");
    expect(issue).toHaveLength(1);
    expect(issue[0]).toMatchObject({ code: "SOURCE_STAFF_COVERAGE_SUSPECTED", severity: "warning" });
    expect(issue[0].message).toContain("Página 3");
    expect(issue[0].message).toContain("6 faixas");
    expect(issue[0].message).toContain("5 pautas");
    expect(compareSourceStaffLayout(fiveSystems, layout(5), 3, "melody")).toEqual([]);
  });

  it("compares piano and duo layouts as two staff slots per printed system", () => {
    const pianoTwoSystems = musicXml([scorePart("P1", 2, 2, { systemMarkers: true })]);
    const duoTwoSystems = musicXml([
      scorePart("P1", 2, 1, { systemMarkers: true }),
      scorePart("P2", 2, 1)
    ]);
    expect(compareSourceStaffLayout(pianoTwoSystems, layout(4), 1, "piano")).toEqual([]);
    expect(compareSourceStaffLayout(duoTwoSystems, layout(4), 1, "guitar_duo")).toEqual([]);
    expect(compareSourceStaffLayout(duoTwoSystems, layout(5), 1, "guitar_duo")).toHaveLength(1);
    expect(compareSourceStaffLayout(musicXml([scorePart("P1", 2, 1, { systemMarkers: true })]), layout(5), 1, "guitar_duo")).toEqual([]);
  });

  it("desabilita comparação quando faltam quebras explícitas ou o layout candidato é ambíguo", () => {
    const noPrintMarkers = musicXml([scorePart("P1", 7, 1)]);
    const breakOnlyInSecondPart = musicXml([
      scorePart("P1", 2, 1),
      scorePart("P2", 2, 1, { systemMarkers: true, markersInSecondPartOnly: true })
    ]);
    expect(compareSourceStaffLayout(noPrintMarkers, layout(32), 1, "melody")).toEqual([]);
    expect(compareSourceStaffLayout(breakOnlyInSecondPart, layout(8), 1, "guitar_duo")).toEqual([]);
    expect(compareSourceStaffLayout("<bad>", layout(8), 1, "melody")).toEqual([]);
    expect(compareSourceStaffLayout(noPrintMarkers, layout(32, "unknown"), 1, "melody")).toEqual([]);
  });
});
