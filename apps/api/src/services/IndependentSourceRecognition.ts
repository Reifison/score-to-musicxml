import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { DOMParser } from "@xmldom/xmldom";
import { assertConversionActive, runCommand } from "./SubprocessRunner.js";

const maximumImageBytes = 32 * 1024 * 1024;
const maximumMusicXmlBytes = 8 * 1024 * 1024;
const digest = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex");
const responseSchema = z.object({
  version: z.literal(1), page: z.number().int().min(1).max(3), inputImageSHA256: z.string().regex(/^[a-f0-9]{64}$/),
  reader: z.object({ name: z.literal("HOMR"), version: z.literal("0.7.0"), model: z.literal("segnet-308/transformer-396-cpu") }).strict(),
  coverageComplete: z.literal(true), diagnostics: z.array(z.object({ code: z.string().max(64), message: z.string().max(256).optional() }).strict()).max(8),
  measures: z.array(z.object({ partIndex: z.literal(0), measureIndex: z.number().int().min(0).max(199),
    events: z.array(z.unknown()).min(1).max(512) }).passthrough()).min(1).max(200),
  musicXml: z.string().min(1).max(maximumMusicXmlBytes)
}).strict();

async function readSourceImage(imagePath: string): Promise<Buffer> {
  const file = await fs.open(imagePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > maximumImageBytes) throw new Error("Invalid source raster");
    const bytes = await file.readFile();
    if (bytes.length !== stat.size || bytes.length > maximumImageBytes) throw new Error("Source raster changed");
    return bytes;
  } finally { await file.close(); }
}

export type IndependentSourceNotation = {
  id: string; xml: string; sourceImageSha256: string; xmlSha256: string;
  reader: { name: "HOMR"; version: "0.7.0"; model: "segnet-308/transformer-396-cpu" };
};

/** Requests only the original raster. Candidate XML, expected notes and measure counts never cross this boundary. */
export async function readIndependentSourceNotation(input: {
  imagePath: string; page: number; workDir: string; readerExecutable: string; timeoutMs?: number;
}): Promise<IndependentSourceNotation | null> {
  if (!Number.isInteger(input.page) || input.page < 1 || input.page > 3) return null;
  try {
    assertConversionActive();
    const bytes = await readSourceImage(input.imagePath);
    const meta = await sharp(bytes, { limitInputPixels: 50_000_000 }).metadata();
    if (!meta.width || !meta.height || !["png", "jpeg"].includes(meta.format ?? "") || (meta.orientation ?? 1) !== 1) return null;
    const sourceImageSha256 = digest(bytes);
    const directory = path.join(input.workDir, "independent-source");
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const requestPath = path.join(directory, "request.json");
    await fs.writeFile(requestPath, JSON.stringify({ version: 1, page: input.page, imagePath: path.resolve(input.imagePath),
      imageSHA256: sourceImageSha256, includeMusicXml: true }), { mode: 0o600 });
    const output = await runCommand(input.readerExecutable, [requestPath], { timeout: input.timeoutMs ?? 60_000, maxBuffer: 12 * 1024 * 1024 });
    assertConversionActive();
    const response = responseSchema.safeParse(JSON.parse(output.stdout));
    if (!response.success || response.data.inputImageSHA256 !== sourceImageSha256 || response.data.page !== input.page
      || response.data.measures.some((measure, index) => measure.measureIndex !== index)
      || Buffer.byteLength(response.data.musicXml, "utf8") > maximumMusicXmlBytes
      || /<!ENTITY\b|<!DOCTYPE\b[^>]*\[/i.test(response.data.musicXml)
      || digest(await readSourceImage(input.imagePath)) !== sourceImageSha256) return null;
    const errors: string[] = [];
    const document = new DOMParser({ errorHandler: { warning: (s) => errors.push(String(s)), error: (s) => errors.push(String(s)), fatalError: (s) => errors.push(String(s)) } })
      .parseFromString(response.data.musicXml, "application/xml");
    if (errors.length || document.documentElement?.nodeName !== "score-partwise"
      || document.getElementsByTagName("part").length !== 1
      || document.getElementsByTagName("measure").length !== response.data.measures.length) return null;
    const xmlSha256 = digest(response.data.musicXml);
    await fs.writeFile(path.join(directory, "source.musicxml"), response.data.musicXml, { mode: 0o600 });
    await fs.writeFile(path.join(directory, "provenance.json"), JSON.stringify({ version: 1, page: input.page, sourceImageSha256,
      xmlSha256, reader: response.data.reader, sourceFirst: true, accuracyVerified: false, trainingEligible: false }, null, 2), { mode: 0o600 });
    return { id: `homr-source-page-${input.page}`, xml: response.data.musicXml, sourceImageSha256, xmlSha256, reader: response.data.reader };
  } catch {
    assertConversionActive();
    return null;
  }
}
