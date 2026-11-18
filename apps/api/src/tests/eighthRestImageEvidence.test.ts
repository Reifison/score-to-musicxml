import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { readEighthRestImageEvidence } from "../services/EighthRestImageEvidence.js";

function crc32(buffer: Buffer): number { let crc = 0xffffffff; for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function zip(name: string, content: string): Buffer {
  const n = Buffer.from(name), c = Buffer.from(content), sum = crc32(c);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(sum, 14); local.writeUInt32LE(c.length, 18); local.writeUInt32LE(c.length, 22); local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(sum, 16); central.writeUInt32LE(c.length, 20); central.writeUInt32LE(c.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(0, 42);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + n.length, 12); end.writeUInt32LE(local.length + n.length + c.length, 16);
  return Buffer.concat([local, n, c, central, n, end]);
}
function fixtureXml(): string {
  const stacks = [0, 1, 2, 3].map((i) => `<stack id="${i}" left="${20 + i * 160}" right="${180 + i * 160}"/>`).join("");
  const lines = [60, 80, 100, 120, 140].map((y) => `<line><point x="20" y="${y}"/><point x="660" y="${y}"/></line>`).join("");
  const measures = [0, 1, 2, 3].map((i) => `<measure id="${i}"><head-chords>${100 + i}</head-chords>${i !== 2 ? `<rest-chords>${200 + i}</rest-chords>` : ""}</measure>`).join("");
  const heads = [0, 1, 2, 3].map((i) => `<head-chord id="${100 + i}"><bounds x="${110 + i * 160}" y="90" w="20" h="35"/></head-chord>`).join("");
  const rests = [0, 1, 3].map((i) => { const x = 60 + i * 160, y = i === 3 ? 5 : 80; return `<rest-chord id="${200 + i}"><bounds x="${x}" y="${y}" w="20" h="40"/></rest-chord><rest id="${300 + i}" shape="EIGHTH_REST" grade="0.9"><bounds x="${x}" y="${y}" w="20" h="40"/></rest>`; }).join("");
  return `<sheet><picture width="700" height="240"/><scale><interline main="20"/></scale><page measure-count="4"><system>${stacks}<part><staff><lines>${lines}</lines></staff>${measures}</part><sig><inters>${heads}${rests}</inters></sig></system></page></sheet>`;
}
function pageXml(): string {
  const measures = [0, 1, 2, 3].map((i) => `<measure number="${i + 1}">${i === 0 ? "<attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>" : ""}${Array.from({ length: i === 2 ? 7 : 8 }, () => "<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>").join("")}</measure>`).join("");
  return `<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
}
async function fixture(dir: string, options: { targetGlyph?: boolean; offstaffGlyph?: boolean; collision?: boolean } = {}) {
  const archivePath = path.join(dir, "native.omr"), imagePath = path.join(dir, "source.png");
  const glyph = (x: number, y: number) => `<path d="M${x + 11} ${y + 1} L${x + 11} ${y + 36} Q${x + 10} ${y + 39} ${x + 6} ${y + 39} M${x + 3} ${y + 5} Q${x + 17} ${y + 1} ${x + 14} ${y + 14} Q${x + 11} ${y + 22} ${x + 5} ${y + 15}" stroke="black" stroke-width="4" fill="none"/>`;
  const svg = `<svg width="700" height="240" xmlns="http://www.w3.org/2000/svg"><rect width="700" height="240" fill="white"/>${[60, 80, 100, 120, 140].map((y) => `<path d="M20 ${y} H660" stroke="black" stroke-width="2"/>`).join("")}${[0, 1, ...(options.targetGlyph === false ? [] : [2])].map((i) => glyph(60 + i * 160, 80)).join("")}${options.offstaffGlyph ? glyph(540, 5) : ""}${[0, 1, 2, 3].map((i) => `<ellipse cx="${120 + i * 160}" cy="105" rx="9" ry="6" fill="black"/>`).join("")}<text x="540" y="25" font-size="25">17</text></svg>`;
  await Promise.all([fs.writeFile(archivePath, zip("sheet#1/sheet#1.xml", options.collision ? fixtureXml().replace('<head-chord id="103"><bounds x="590" y="90" w="20" h="35"/></head-chord>', '<head-chord id="103"><bounds x="540" y="5" w="20" h="40"/></head-chord>') : fixtureXml())), sharp(Buffer.from(svg)).flatten({ background: "white" }).png().toFile(imagePath)]);
  return { archivePath, imagePath, originalImagePath: imagePath, pageXml: pageXml() };
}

describe("EighthRestImageEvidence", () => {
  it("requires two native templates and a unique source glyph; reports an off-staff false native rest", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "eighth-rest-evidence-"));
    try {
      const input = await fixture(dir), evidence = await readEighthRestImageEvidence(input);
      expect(evidence.leadingRests.map((item) => item.measureIndex)).toEqual([2]);
      expect(evidence.leadingRests[0].score).toBeGreaterThan(.82);
      expect(evidence.leadingRests[0].margin).toBeGreaterThan(.065);
      expect(evidence.leadingRests[0].templateCount).toBe(2);
      expect(evidence.contradictedNativeRests.map((item) => [item.measureIndex, item.nativeRestOrdinal])).toEqual([[3, 0]]);
      expect(evidence.contradictedNativeRests[0].staffOffsetInterlines).toBeGreaterThan(2);
      expect(await readEighthRestImageEvidence({ ...input, originalImagePath: path.join(dir, "missing.png") })).toEqual({ leadingRests: [], contradictedNativeRests: [] });
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });

  it("does not turn a missing glyph, genuine off-staff glyph, or note collision into proof", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "eighth-rest-controls-"));
    try {
      const missing = await fixture(dir, { targetGlyph: false });
      expect((await readEighthRestImageEvidence(missing)).leadingRests).toEqual([]);
      const genuine = await fixture(dir, { offstaffGlyph: true });
      expect((await readEighthRestImageEvidence(genuine)).contradictedNativeRests).toEqual([]);
      const collision = await fixture(dir, { collision: true });
      expect((await readEighthRestImageEvidence(collision)).contradictedNativeRests).toEqual([]);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
  it("rejects changed source bytes, ambiguous topology, and XML entities", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "eighth-rest-guard-"));
    try {
      const input = await fixture(dir), copy = path.join(dir, "copy.png");
      await fs.copyFile(input.imagePath, copy);
      expect((await readEighthRestImageEvidence({ ...input, originalImagePath: copy })).leadingRests).toHaveLength(1);
      await sharp(copy).negate().toFile(path.join(dir, "changed.png"));
      expect(await readEighthRestImageEvidence({ ...input, originalImagePath: path.join(dir, "changed.png") })).toEqual({ leadingRests: [], contradictedNativeRests: [] });
      expect(await readEighthRestImageEvidence({ ...input, pageXml: input.pageXml.replace("<part id=\"P1\">", "<part id=\"P1\"><measure number=\"0\"/>") })).toEqual({ leadingRests: [], contradictedNativeRests: [] });
      expect(await readEighthRestImageEvidence({ ...input, pageXml: `<!DOCTYPE score-partwise [<!ENTITY x "bad">]>${input.pageXml}` })).toEqual({ leadingRests: [], contradictedNativeRests: [] });
      await fs.writeFile(input.archivePath, zip("sheet#1/sheet#1.xml", fixtureXml().replace("<rest-chords>201</rest-chords>", "")));
      expect(await readEighthRestImageEvidence(input)).toEqual({ leadingRests: [], contradictedNativeRests: [] });
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
});
