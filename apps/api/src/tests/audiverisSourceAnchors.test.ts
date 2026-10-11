import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { readAudiverisSourceAnchors } from "../services/AudiverisSourceAnchors.js";

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(entries: Array<{ name: string; content: string }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const content = Buffer.from(entry.content, "utf8");
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + content.length;
  }

  const centralDirectoryOffset = localOffset;
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralDirectoryOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function nativeSheet(options: { width?: number; height?: number; measureCount?: number; measureIds?: number[] } = {}): string {
  const width = options.width ?? 1000;
  const height = options.height ?? 600;
  const measureIds = options.measureIds ?? [1, 2];
  const measures = measureIds.map((id, index) => `<measure id="${id}"><head-chords>${100 + index}</head-chords><voice id="1"><slots><entry><key>1</key><value chord="${100 + index}" status="BEGIN"/></entry></slots></voice></measure>`).join("");
  const stacks = measureIds.map((id, index) => `<stack id="${id}" left="${100 + index * 200}" right="${300 + index * 200}"/>`).join("");
  const heads = measureIds.map((_id, index) => `<head-chord id="${100 + index}"><bounds x="${150 + index * 200}" y="${index ? 90 : 115}" w="20" h="${index ? 60 : 20}"/></head-chord>`).join("");
  const lines = [100, 110, 120, 130, 140].map((y) => `<line><point x="100" y="${y}"/><point x="520" y="${y}"/></line>`).join("");
  return `<sheet><picture width="${width}" height="${height}"/><scale><interline main="10"/></scale><page id="1" measure-count="${options.measureCount ?? measureIds.length}"><system id="1">${stacks}<part id="1"><staff id="1"><lines>${lines}</lines></staff>${measures}</part><sig><inters>${heads}</inters><relations/></sig></system></page></sheet>`;
}

function musicXml(measureCount = 2, staffCount = 1): string {
  const measures = Array.from({ length: measureCount }, (_value, index) => `<measure number="${index + 1}">${index === 0 ? `<attributes><divisions>1</divisions><staves>${staffCount}</staves></attributes>` : ""}<note><rest/><duration>1</duration><staff>1</staff></note></measure>`).join("");
  return `<score-partwise><part-list><score-part id="P1"><part-name>Part</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
}

async function writeImage(filePath: string, color: string): Promise<void> {
  const svg = `<svg width="1000" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="1000" height="600" fill="white"/><circle cx="5" cy="5" r="2" fill="${color}"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(filePath);
}

async function writeArchive(filePath: string, xml: string): Promise<void> {
  await fs.writeFile(filePath, storedZip([
    { name: "book.xml", content: "<book/>" },
    { name: "sheet#1/sheet#1.xml", content: xml }
  ]));
}

describe("AudiverisSourceAnchors", () => {
  it("ancora compassos existentes usando stacks e pautas no mesmo raster verificado", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "audiveris-source-anchors-"));
    const archivePath = path.join(directory, "native.omr");
    const imagePath = path.join(directory, "input.png");
    const originalImagePath = path.join(directory, "original.png");
    try {
      await writeArchive(archivePath, nativeSheet());
      await writeImage(imagePath, "black");
      await fs.copyFile(imagePath, originalImagePath);

      const pageXml = musicXml().replace("<score-partwise>", '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0.3 Partwise//EN" "https://example.invalid/partwise.dtd"><score-partwise>');
      const anchors = await readAudiverisSourceAnchors({ archivePath, imagePath, originalImagePath, pageXml });

      expect(anchors).toEqual([
        { partIndex: 0, measureIndex: 0, rectangle: { left: 85, top: 85, width: 230, height: 70 } },
        { partIndex: 0, measureIndex: 1, rectangle: { left: 285, top: 75, width: 230, height: 90 } }
      ]);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });

  it("não projeta caixas nativas em uma imagem com bytes diferentes ou dimensões incompatíveis", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "audiveris-source-anchor-identity-"));
    const archivePath = path.join(directory, "native.omr");
    const imagePath = path.join(directory, "input.png");
    const originalImagePath = path.join(directory, "original.png");
    const wrongDimensionArchive = path.join(directory, "wrong-dimensions.omr");
    try {
      await writeArchive(archivePath, nativeSheet());
      await writeImage(imagePath, "black");
      await writeImage(originalImagePath, "red");
      expect(await readAudiverisSourceAnchors({ archivePath, imagePath, originalImagePath, pageXml: musicXml() })).toEqual([]);

      await fs.copyFile(imagePath, originalImagePath);
      await writeArchive(wrongDimensionArchive, nativeSheet({ width: 999 }));
      expect(await readAudiverisSourceAnchors({ archivePath: wrongDimensionArchive, imagePath, originalImagePath, pageXml: musicXml() })).toEqual([]);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });

  it("deixa XML nativo inválido, contagem divergente e pauta múltipla sem âncoras", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "audiveris-source-anchor-invalid-"));
    const archivePath = path.join(directory, "native.omr");
    const imagePath = path.join(directory, "input.png");
    try {
      await writeImage(imagePath, "black");
      await writeArchive(archivePath, "<sheet><broken></sheet>");
      const base = { archivePath, imagePath, originalImagePath: imagePath };
      expect(await readAudiverisSourceAnchors({ ...base, pageXml: musicXml() })).toEqual([]);

      await writeArchive(archivePath, nativeSheet());
      expect(await readAudiverisSourceAnchors({ ...base, pageXml: musicXml(1) })).toEqual([]);
      expect(await readAudiverisSourceAnchors({ ...base, pageXml: musicXml(2, 2) })).toEqual([]);
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
});
