import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { DOMParser } from "@xmldom/xmldom";
import sharp from "sharp";
import { assertConversionActive, runCommand } from "./SubprocessRunner.js";

/** Evidence coordinates are in the byte-identical, original page raster. No transform is inferred. */
export type RestEvidenceRectangle = { left: number; top: number; width: number; height: number };
export type LeadingEighthRestEvidence = {
  kind: "leading-eighth-rest"; measureIndex: number; sourceImageSha256: string;
  rectangle: RestEvidenceRectangle; score: number; templateCount: number; margin: number;
};
export type ContradictedNativeEighthRestEvidence = {
  kind: "contradicted-native-eighth-rest"; measureIndex: number; sourceImageSha256: string;
  rectangle: RestEvidenceRectangle; nativeRestOrdinal: number; score: number;
  staffOffsetInterlines: number; templateCount: number;
};
export type EighthRestImageEvidence = {
  leadingRests: LeadingEighthRestEvidence[];
  contradictedNativeRests: ContradictedNativeEighthRestEvidence[];
};
type Rect = RestEvidenceRectangle;
type NativeRest = { rectangle: Rect; grade: number; ordinal: number };
type NativeMeasure = { index: number; left: number; right: number; firstHead: Rect | null; heads: Rect[]; mid: number; interline: number; rests: NativeRest[] };
type Template = { measureIndex: number; rectangle: Rect; onsetDx: number; midDy: number };
type Raster = { data: Buffer; width: number; height: number; staffRows: Map<string, boolean> };
const empty = (): EighthRestImageEvidence => ({ leadingRests: [], contradictedNativeRests: [] });
const maxXmlBytes = 8 * 1024 * 1024;
const maxPixels = 50_000_000;
const maxPixelComparisons = 200_000_000;
type Budget = { remaining: number };
const children = (node: Node, name: string): Element[] => Array.from(node.childNodes).filter((item): item is Element => item.nodeType === 1 && (item as Element).nodeName === name);
const one = (node: Node, name: string): Element | null => { const matches = children(node, name); return matches.length === 1 ? matches[0] : null; };
const num = (element: Element, attribute: string): number | null => { const raw = element.getAttribute(attribute); const value = raw === null || !raw.trim() ? NaN : Number(raw); return Number.isFinite(value) ? value : null; };
const childNumber = (element: Element, name: string): number | null => { const child = one(element, name); const value = child ? Number(child.textContent?.trim()) : NaN; return Number.isFinite(value) ? value : null; };
const int = (value: number | null): value is number => value !== null && Number.isSafeInteger(value);
const safeRect = (element: Element, width: number, height: number): Rect | null => {
  const bounds = one(element, "bounds"); if (!bounds) return null;
  const x = num(bounds, "x"), y = num(bounds, "y"), w = num(bounds, "w"), h = num(bounds, "h");
  if (!int(x) || !int(y) || !int(w) || !int(h) || w < 1 || h < 1 || x < 0 || y < 0 || x + w > width || y + h > height) return null;
  return { left: x, top: y, width: w, height: h };
};
function parse(xml: string, root: string): Document | null {
  if (Buffer.byteLength(xml, "utf8") > maxXmlBytes || /<!ENTITY\b/i.test(xml)) return null;
  const doctype = xml.match(/<!DOCTYPE\b[\s\S]*?>/i);
  if (doctype?.[0].includes("[")) return null;
  const safeXml = doctype ? xml.replace(doctype[0], "") : xml;
  const errors: string[] = [];
  try {
    const doc = new DOMParser({ errorHandler: { warning: (message) => errors.push(String(message)), error: (message) => errors.push(String(message)), fatalError: (message) => errors.push(String(message)) } }).parseFromString(safeXml, "application/xml");
    return errors.length || doc.documentElement?.nodeName !== root ? null : doc;
  } catch { return null; }
}
async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer); return hash.digest("hex");
}
function xmlDeficits(xml: string): boolean[] | null {
  const doc = parse(xml, "score-partwise"); if (!doc) return null;
  const root = doc.documentElement, list = one(root, "part-list"), parts = children(root, "part");
  if (!list || children(list, "score-part").length !== 1 || parts.length !== 1 || parts[0].getAttribute("id") !== children(list, "score-part")[0].getAttribute("id")) return null;
  const measures = children(parts[0], "measure"); if (!measures.length || measures.length > 200) return null;
  let divisions = 0, beats = 0, beatType = 0;
  const deficits: boolean[] = [];
  for (const measure of measures) {
    if (measure.getElementsByTagName("backup").length || measure.getElementsByTagName("forward").length || measure.getElementsByTagName("chord").length || Array.from(measure.getElementsByTagName("voice")).some((node) => node.textContent?.trim() !== "1") || Array.from(measure.getElementsByTagName("staff")).some((node) => node.textContent?.trim() !== "1")) return null;
    for (const attributes of children(measure, "attributes")) {
      if (children(attributes, "staves").some((item) => item.textContent?.trim() !== "1")) return null;
      const newDivisions = childNumber(attributes, "divisions");
      if (newDivisions !== null) { if (!int(newDivisions) || newDivisions < 1 || newDivisions > 4096) return null; divisions = newDivisions; }
      const time = children(attributes, "time");
      if (time.length > 1) return null;
      if (time.length) { const b = childNumber(time[0], "beats"), t = childNumber(time[0], "beat-type"); if (!int(b) || !int(t) || b < 1 || b > 64 || t < 1 || t > 128) return null; beats = b; beatType = t; }
    }
    if (!divisions || !beats || !beatType) return null;
    let duration = 0;
    for (const note of children(measure, "note")) { const ticks = childNumber(note, "duration"); if (!int(ticks) || ticks < 1 || ticks > 100_000) return null; duration += ticks; }
    const expected = divisions * beats * 4 / beatType;
    // A missing eighth rest must account for exactly half a quarter-note. Pickups and other deficits are ignored.
    deficits.push(Number.isInteger(expected) && Math.abs(expected - duration - divisions / 2) < 1e-9);
  }
  return deficits;
}
function refs(measure: Element, name: string): string[] {
  const node = one(measure, name); return node?.textContent?.trim().split(/\s+/).filter(Boolean) ?? [];
}
function nativeMeasures(xml: string, width: number, height: number): NativeMeasure[] | null {
  const doc = parse(xml, "sheet"); if (!doc) return null;
  const root = doc.documentElement, picture = one(root, "picture"), scale = one(root, "scale"), page = one(root, "page");
  if (!picture || !scale || !page || num(picture, "width") !== width || num(picture, "height") !== height) return null;
  const interlineNode = one(scale, "interline"), interline = interlineNode && num(interlineNode, "main");
  if (interline === null || interline === undefined || interline < 8 || interline > 40) return null;
  const count = num(page, "measure-count"); if (!int(count) || count < 1 || count > 200) return null;
  const result: NativeMeasure[] = [];
  for (const system of children(page, "system")) {
    const stacks = children(system, "stack"), part = one(system, "part"), sig = one(system, "sig");
    if (!part || !sig || !stacks.length || one(part, "staff") === null) return null;
    const staff = one(part, "staff")!, lines = one(staff, "lines"), measures = children(part, "measure"), inters = one(sig, "inters");
    if (!lines || children(lines, "line").length !== 5 || !inters || measures.length !== stacks.length) return null;
    const ys = children(lines, "line").flatMap((line) => children(line, "point").map((point) => num(point, "y")));
    if (ys.length < 10 || ys.some((y) => y === null)) return null;
    const middleLine = children(lines, "line")[2];
    const middlePoints = children(middleLine, "point").map((point) => ({ x: num(point, "x"), y: num(point, "y") }));
    if (middlePoints.length < 2 || middlePoints.some((point) => point.x === null || point.y === null)
      || middlePoints.some((point, index) => index > 0 && point.x! <= middlePoints[index - 1].x!)) return null;
    const staffMidAt = (x: number): number => {
      let right = middlePoints.findIndex((point) => point.x! >= x);
      if (right < 1) right = right < 0 ? middlePoints.length - 1 : 1;
      const a = middlePoints[right - 1], b = middlePoints[right];
      return b.x === a.x ? a.y! : a.y! + (b.y! - a.y!) * (x - a.x!) / (b.x! - a.x!);
    };
    const byId = new Map<string, Element>();
    for (const element of Array.from(inters.getElementsByTagName("*"))) { const id = element.getAttribute("id"); if (id) { if (byId.has(id)) return null; byId.set(id, element); } }
    const restNodes = Array.from(inters.getElementsByTagName("rest")).filter((node) => node.getAttribute("shape") === "EIGHTH_REST");
    for (let i = 0; i < measures.length; i++) {
      const measure = measures[i], stack = stacks[i], left = num(stack, "left"), right = num(stack, "right");
      if (measure.getAttribute("id") !== stack.getAttribute("id") || left === null || right === null || left < 0 || right > width || right <= left) return null;
      const heads = refs(measure, "head-chords").map((id) => byId.get(id)).map((node) => node && safeRect(node, width, height));
      if (heads.some((rect) => !rect)) return null;
      const validHeads = heads as Rect[];
      const firstHead = validHeads.length ? validHeads.reduce((best, item) => item.left < best.left ? item : best, validHeads[0]) : null;
      if (firstHead && (firstHead.left < left || firstHead.left >= right)) return null;
      const restBounds = refs(measure, "rest-chords").map((id) => byId.get(id)).map((node) => node && safeRect(node, width, height));
      if (restBounds.some((rect) => !rect)) return null;
      const rests: NativeRest[] = [];
      for (const [ordinal, rect] of restBounds.entries()) {
        const matching = restNodes.flatMap((native) => {
          const nativeRect = safeRect(native, width, height), grade = num(native, "grade");
          return nativeRect && rect && nativeRect.left === rect.left && nativeRect.top === rect.top
            && nativeRect.width === rect.width && nativeRect.height === rect.height && grade !== null
            ? [{ rectangle: nativeRect, grade, ordinal }] : [];
        });
        if (matching.length > 1) return null;
        rests.push(...matching);
      }
      result.push({ index: result.length, left, right, firstHead, heads: validHeads, mid: staffMidAt(firstHead?.left ?? (left + right) / 2), interline, rests });
    }
  }
  return result.length === count ? result : null;
}
function dark(raster: Raster, x: number, y: number): boolean { return raster.data[y * raster.width + x] < 170; }
function staffRow(raster: Raster, x: number, y: number, width: number, budget: Budget): boolean {
  const key = `${x}:${y}:${width}`;
  const cached = raster.staffRows.get(key);
  if (cached !== undefined) return cached;
  if (raster.staffRows.size >= 100_000) throw new Error("STAFF_ROW_CACHE_EXCEEDED");
  budget.remaining -= width + 30;
  if (budget.remaining < 0) throw new Error("PIXEL_BUDGET_EXCEEDED");
  let count = 0, total = 0;
  for (let xx = x - 15; xx < x + width + 15; xx++) if (xx >= 0 && xx < raster.width) { total++; if (dark(raster, xx, y)) count++; }
  const value = total > 0 && count / total > .65;
  raster.staffRows.set(key, value);
  return value;
}
function scoreAt(raster: Raster, template: Rect, x: number, y: number, budget: Budget): number {
  // Two raster reads per compared pixel; staff-line scans are cached by row.
  budget.remaining -= 2 * template.width * template.height;
  if (budget.remaining < 0) throw new Error("PIXEL_BUDGET_EXCEEDED");
  if (x < 0 || y < 0 || x + template.width > raster.width || y + template.height > raster.height) return 0;
  let a = 0, b = 0, common = 0;
  for (let dy = 0; dy < template.height; dy++) {
    if (staffRow(raster, template.left, template.top + dy, template.width, budget) || staffRow(raster, x, y + dy, template.width, budget)) continue;
    for (let dx = 0; dx < template.width; dx++) { const p = dark(raster, template.left + dx, template.top + dy), q = dark(raster, x + dx, y + dy); if (p) a++; if (q) b++; if (p && q) common++; }
  }
  return a + b > 0 ? 2 * common / (a + b) : 0;
}
function templatesFrom(measures: NativeMeasure[]): Template[] {
  const templates: Template[] = [];
  for (const measure of measures) for (const rest of measure.rests) {
    const rect = rest.rectangle;
    if (!measure.firstHead) continue;
    if (rest.grade < .7 || rect.left >= measure.firstHead.left - measure.interline / 2 || Math.abs(rect.top - measure.mid) > 1.5 * measure.interline || rect.width < .6 * measure.interline || rect.width > 1.4 * measure.interline || rect.height < 1.5 * measure.interline || rect.height > 3 * measure.interline) continue;
    templates.push({ measureIndex: measure.index, rectangle: rect, onsetDx: measure.firstHead.left - rect.left, midDy: rect.top - measure.mid });
  }
  return templates.slice(0, 8);
}
function leadingMatches(raster: Raster, measure: NativeMeasure, templates: Template[], budget: Budget): Array<{ score: number; rectangle: Rect; templateIndex: number }> {
  const hits: Array<{ score: number; rectangle: Rect; templateIndex: number }> = [];
  // Search only the expected left-of-onset glyph window; strict pixel budget avoids page-wide scanning.
  for (const [templateIndex, template] of templates.entries()) {
    if (template.measureIndex === measure.index || !measure.firstHead) continue;
    const rect = template.rectangle, cx = Math.round(measure.firstHead.left - template.onsetDx), cy = Math.round(measure.mid + template.midDy);
    const rx = Math.min(16, Math.ceil(.6 * measure.interline)), ry = Math.min(31, Math.ceil(1.2 * measure.interline));
    for (let x = cx - rx; x <= cx + rx; x++) for (let y = cy - ry; y <= cy + ry; y++) {
      if (x < measure.left || x + rect.width >= measure.firstHead.left || x + rect.width > measure.right) continue;
      const score = scoreAt(raster, rect, x, y, budget);
      if (score >= .72) hits.push({ score, rectangle: { left: x, top: y, width: rect.width, height: rect.height }, templateIndex });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, 100);
}
function overlap(a: Rect, b: Rect): boolean { return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height; }
/**
 * Reads independent pixel evidence only for native Audiveris geometry on the exact original raster.
 * This is a conservative candidate detector, not music verification or an automatic repair authority.
 */
export async function readEighthRestImageEvidence(input: { archivePath: string; imagePath: string; originalImagePath: string; pageXml: string }): Promise<EighthRestImageEvidence> {
  try {
    const stat = await fs.lstat(input.archivePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 128 * 1024 * 1024) return empty();
    const [imageHash, originalHash, archiveHash, metadata] = await Promise.all([
      sha256File(input.imagePath), sha256File(input.originalImagePath), sha256File(input.archivePath),
      sharp(input.imagePath, { failOn: "truncated", limitInputPixels: maxPixels }).metadata()
    ]);
    if (imageHash !== originalHash || !metadata.width || !metadata.height || metadata.width * metadata.height > maxPixels || metadata.hasAlpha || (metadata.orientation && metadata.orientation !== 1)) return empty();
    const deficits = xmlDeficits(input.pageXml); if (!deficits) return empty();
    const list = await runCommand("unzip", ["-Z1", input.archivePath], { timeout: 10_000, maxBuffer: maxXmlBytes });
    const sheets = list.stdout.split(/\r?\n/).filter((entry) => /^sheet#([1-9]\d*)\/sheet#\1\.xml$/.test(entry));
    if (sheets.length !== 1) return empty();
    const extracted = await runCommand("unzip", ["-p", input.archivePath, sheets[0]], { timeout: 10_000, maxBuffer: maxXmlBytes });
    const measures = nativeMeasures(extracted.stdout, metadata.width, metadata.height);
    if (!measures || measures.length !== deficits.length || deficits.filter(Boolean).length > 16) return empty();
    const templates = templatesFrom(measures);
    if (templates.length < 2) return empty();
    const { data, info } = await sharp(input.imagePath, { failOn: "truncated", limitInputPixels: maxPixels }).grayscale().raw().toBuffer({ resolveWithObject: true });
    if (info.channels !== 1 || info.width !== metadata.width || info.height !== metadata.height) return empty();
    const raster: Raster = { data, width: info.width, height: info.height, staffRows: new Map() };
    const budget: Budget = { remaining: maxPixelComparisons };
    const leadingRests: LeadingEighthRestEvidence[] = [];
    const contradictedNativeRests: ContradictedNativeEighthRestEvidence[] = [];
    for (const measure of measures) {
      assertConversionActive();
      const firstHead = measure.firstHead;
      if (firstHead && deficits[measure.index] && !measure.rests.some((rest) => rest.rectangle.left < firstHead.left - measure.interline / 2)) {
        const hits = leadingMatches(raster, measure, templates, budget), best = hits[0];
        const other = best && hits.find((hit) => Math.abs(hit.rectangle.left - best.rectangle.left) > 8 || Math.abs(hit.rectangle.top - best.rectangle.top) > 8);
        const margin = best ? best.score - (other?.score ?? 0) : 0;
        const support = best && new Set(hits.filter((hit) => hit.score >= .78 && Math.abs(hit.rectangle.left - best.rectangle.left) <= 5 && Math.abs(hit.rectangle.top - best.rectangle.top) <= 5).map((hit) => hit.templateIndex)).size;
        if (best && support && support >= 2 && best.score >= .82 && margin >= .065) leadingRests.push({ kind: "leading-eighth-rest", measureIndex: measure.index, sourceImageSha256: originalHash, rectangle: best.rectangle, score: best.score, templateCount: templates.length, margin });
      }
      for (const rest of measure.rests) {
        const rect = rest.rectangle, offset = Math.abs(rect.top - measure.mid) / measure.interline;
        if (offset <= 2 || rect.left < measure.left || rect.left + rect.width > measure.right || measure.heads.some((head) => overlap(rect, head))) continue;
        let best = 0;
        for (const template of templates) if (template.measureIndex !== measure.index) {
          for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) best = Math.max(best, scoreAt(raster, template.rectangle, rect.left + dx, rect.top + dy, budget));
        }
        if (best < .75) contradictedNativeRests.push({ kind: "contradicted-native-eighth-rest", measureIndex: measure.index, sourceImageSha256: originalHash, rectangle: rect, nativeRestOrdinal: rest.ordinal, score: best, staffOffsetInterlines: offset, templateCount: templates.length });
      }
    }
    const [finalImageHash, finalOriginalHash, finalArchiveHash] = await Promise.all([sha256File(input.imagePath), sha256File(input.originalImagePath), sha256File(input.archivePath)]);
    if (finalImageHash !== imageHash || finalOriginalHash !== originalHash || finalArchiveHash !== archiveHash) return empty();
    return { leadingRests, contradictedNativeRests };
  } catch { assertConversionActive(); return empty(); }
}
export async function readLeadingEighthRestEvidence(input: Parameters<typeof readEighthRestImageEvidence>[0]): Promise<LeadingEighthRestEvidence[]> {
  return (await readEighthRestImageEvidence(input)).leadingRests;
}
