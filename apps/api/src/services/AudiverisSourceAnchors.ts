import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";
import sharp from "sharp";
import { runCommand } from "./SubprocessRunner.js";

export type AudiverisSourceAnchor = {
  partIndex: number;
  measureIndex: number;
  rectangle: { left: number; top: number; width: number; height: number };
};

const maximumArchiveBytes = 128 * 1024 * 1024;
const maximumXmlBytes = 8 * 1024 * 1024;
const maximumPixels = 50_000_000;
const unzipTimeoutMs = 10_000;
const unzipBufferBytes = 8 * 1024 * 1024;
const referencedMeasureElements = new Set([
  "head-chords", "rest-chords", "clefs", "keys", "times", "staff-barlines"
]);
const spatialRelationKinds = new Set([
  "containment", "chord-stem", "head-stem", "chord-articulation", "chord-ornament",
  "chord-dynamics", "chord-pause", "chord-pedal", "alter-head", "augmentation", "beam-stem"
]);

const childElements = (parent: Node, name?: string): Element[] => Array.from(parent.childNodes).filter((node): node is Element =>
  node.nodeType === 1 && (!name || localName(node as Element) === name));

function localName(element: Element): string {
  return element.localName || element.nodeName;
}

function descendants(parent: Element, name?: string): Element[] {
  return Array.from(parent.getElementsByTagName("*")).filter((element) => !name || name === "*" || localName(element) === name);
}

function parseXml(xml: string, expectedRoot: string): Document | null {
  if (!xml || Buffer.byteLength(xml, "utf8") > maximumXmlBytes || /<!ENTITY\b/i.test(xml)) return null;
  const doctype = xml.match(/<!DOCTYPE\b[\s\S]*?>/i);
  if (doctype?.[0].includes("[")) return null;
  const parseableXml = doctype ? xml.replace(doctype[0], "") : xml;
  const errors: string[] = [];
  try {
    const document = new DOMParser({ errorHandler: {
      warning: (message) => errors.push(String(message)),
      error: (message) => errors.push(String(message)),
      fatalError: (message) => errors.push(String(message))
    } }).parseFromString(parseableXml, "application/xml");
    if (errors.length || !document.documentElement || localName(document.documentElement) !== expectedRoot) return null;
    return document;
  } catch {
    return null;
  }
}

function numericAttribute(element: Element, name: string): number | null {
  const raw = element.getAttribute(name);
  if (raw === null || !raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function positiveIntegerAttribute(element: Element, name: string): number | null {
  const value = numericAttribute(element, name);
  return value !== null && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function rectangleFromElement(element: Element): { left: number; top: number; right: number; bottom: number } | null {
  const bounds = childElements(element, "bounds")[0];
  if (!bounds) return null;
  const left = numericAttribute(bounds, "x");
  const top = numericAttribute(bounds, "y");
  const width = numericAttribute(bounds, "w");
  const height = numericAttribute(bounds, "h");
  if (left === null || top === null || width === null || height === null || width <= 0 || height <= 0) return null;
  return { left, top, right: left + width, bottom: top + height };
}

async function sha256File(filePath: string): Promise<string> {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) digest.update(chunk as Buffer);
  return digest.digest("hex");
}

function musicXmlIsSinglePartAndStaff(xml: string): { measures: Element[] } | null {
  const document = parseXml(xml, "score-partwise");
  if (!document) return null;
  const root = document.documentElement;
  const declarations = childElements(childElements(root, "part-list")[0] ?? root, "score-part");
  const parts = childElements(root, "part");
  if (declarations.length !== 1 || parts.length !== 1) return null;
  const id = declarations[0].getAttribute("id");
  if (!id || parts[0].getAttribute("id") !== id) return null;

  const declaredStaffCounts = descendants(parts[0], "staves").map((node) => Number(node.textContent?.trim()));
  const staffReferences = descendants(parts[0], "staff").map((node) => Number(node.textContent?.trim()));
  if ([...declaredStaffCounts, ...staffReferences].some((value) => !Number.isSafeInteger(value) || value < 1 || value > 64)) return null;
  if (declaredStaffCounts.some((value) => value !== 1) || staffReferences.some((value) => value !== 1)) return null;

  const measures = childElements(parts[0], "measure");
  return measures.length ? { measures } : null;
}

function referencedIds(measure: Element): Set<string> {
  const ids = new Set<string>();
  for (const element of descendants(measure, "*")) {
    const name = localName(element);
    if (referencedMeasureElements.has(name)) {
      for (const id of (element.textContent ?? "").trim().split(/\s+/)) if (/^\d+$/.test(id)) ids.add(id);
    }
    if (name === "value") {
      const chord = element.getAttribute("chord");
      if (chord && /^\d+$/.test(chord)) ids.add(chord);
    }
  }
  return ids;
}

function interBounds(system: Element): { bounds: Map<string, { left: number; top: number; right: number; bottom: number }>; adjacency: Map<string, Set<string>> } | null {
  const signatures = descendants(system, "sig");
  if (signatures.length !== 1) return null;
  const interContainers = childElements(signatures[0], "inters");
  const relationContainers = childElements(signatures[0], "relations");
  if (interContainers.length !== 1 || relationContainers.length !== 1) return null;

  const bounds = new Map<string, { left: number; top: number; right: number; bottom: number }>();
  for (const element of descendants(interContainers[0], "*")) {
    const id = element.getAttribute("id");
    const rectangle = rectangleFromElement(element);
    if (!id || !rectangle) continue;
    if (bounds.has(id)) return null;
    bounds.set(id, rectangle);
  }

  const adjacency = new Map<string, Set<string>>();
  for (const relation of descendants(relationContainers[0], "relation")) {
    if (!childElements(relation).some((child) => spatialRelationKinds.has(localName(child)))) continue;
    const source = relation.getAttribute("source");
    const target = relation.getAttribute("target");
    if (!source || !target || !/^\d+$/.test(source) || !/^\d+$/.test(target)) continue;
    for (const [from, to] of [[source, target], [target, source]]) {
      const targets = adjacency.get(from) ?? new Set<string>();
      targets.add(to);
      adjacency.set(from, targets);
    }
  }
  return { bounds, adjacency };
}

function collectReferencedBounds(
  measure: Element,
  source: ReturnType<typeof interBounds>
): Array<{ left: number; top: number; right: number; bottom: number }> | null {
  if (!source) return null;
  const roots = referencedIds(measure);
  if (!roots.size) return null;
  const visited = new Set(roots);
  let frontier = [...roots];
  for (let depth = 0; depth < 2 && frontier.length; depth += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const adjacent of source.adjacency.get(id) ?? []) {
        if (visited.has(adjacent)) continue;
        visited.add(adjacent);
        next.push(adjacent);
      }
    }
    frontier = next;
  }
  const result = [...visited].flatMap((id) => {
    const rectangle = source.bounds.get(id);
    return rectangle ? [rectangle] : [];
  });
  return result.length ? result : null;
}

function staffVerticalBounds(staff: Element): { top: number; bottom: number } | null {
  const lines = childElements(childElements(staff, "lines")[0] ?? staff, "line");
  if (lines.length !== 5) return null;
  const ys = lines.flatMap((line) => childElements(line, "point").map((point) => numericAttribute(point, "y")))
    .filter((value): value is number => value !== null);
  if (ys.length < 10) return null;
  return { top: Math.min(...ys), bottom: Math.max(...ys) };
}

function makeRectangle(
  stack: Element,
  staff: Element,
  measure: Element,
  interBoundsForSystem: ReturnType<typeof interBounds>,
  imageWidth: number,
  imageHeight: number,
  interline: number
): AudiverisSourceAnchor["rectangle"] | null {
  const stackLeft = numericAttribute(stack, "left");
  const stackRight = numericAttribute(stack, "right");
  const staffBounds = staffVerticalBounds(staff);
  const contentBounds = collectReferencedBounds(measure, interBoundsForSystem);
  if (stackLeft === null || stackRight === null || stackRight <= stackLeft || !staffBounds || !contentBounds) return null;

  const leftContent = Math.min(stackLeft, ...contentBounds.map((bounds) => bounds.left));
  const rightContent = Math.max(stackRight, ...contentBounds.map((bounds) => bounds.right));
  const topContent = Math.min(staffBounds.top, ...contentBounds.map((bounds) => bounds.top));
  const bottomContent = Math.max(staffBounds.bottom, ...contentBounds.map((bounds) => bounds.bottom));
  const padding = Math.max(6, Math.min(96, interline * 1.5));
  const left = Math.max(0, Math.floor(leftContent - padding));
  const top = Math.max(0, Math.floor(topContent - padding));
  const right = Math.min(imageWidth, Math.ceil(rightContent + padding));
  const bottom = Math.min(imageHeight, Math.ceil(bottomContent + padding));
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Maps Audiveris measure rectangles to a byte-identical source raster. The result
 * anchors only measures already present in both inputs; it does not establish
 * that the recognizer found every measure in the source page.
 */
export async function readAudiverisSourceAnchors(input: {
  archivePath: string;
  imagePath: string;
  originalImagePath: string;
  pageXml: string;
}): Promise<AudiverisSourceAnchor[]> {
  try {
    const archiveInfo = await fs.lstat(input.archivePath);
    if (!archiveInfo.isFile() || archiveInfo.isSymbolicLink() || archiveInfo.size <= 0 || archiveInfo.size > maximumArchiveBytes) return [];

    const [imageHash, originalImageHash, imageMetadata] = await Promise.all([
      sha256File(input.imagePath),
      sha256File(input.originalImagePath),
      sharp(input.imagePath, { failOn: "truncated", limitInputPixels: maximumPixels }).metadata()
    ]);
    if (imageHash !== originalImageHash || !imageMetadata.width || !imageMetadata.height
      || imageMetadata.width * imageMetadata.height > maximumPixels) return [];

    const fileList = await runCommand("unzip", ["-Z1", input.archivePath], { timeout: unzipTimeoutMs, maxBuffer: unzipBufferBytes });
    const entries = fileList.stdout.split(/\r?\n/).filter(Boolean);
    const sheetXmlEntries = entries.filter((entry) => /^sheet#([1-9]\d*)\/sheet#\1\.xml$/.test(entry));
    if (sheetXmlEntries.length !== 1) return [];
    const extracted = await runCommand("unzip", ["-p", input.archivePath, sheetXmlEntries[0]], { timeout: unzipTimeoutMs, maxBuffer: unzipBufferBytes });
    if (Buffer.byteLength(extracted.stdout, "utf8") > maximumXmlBytes) return [];

    const sheetDocument = parseXml(extracted.stdout, "sheet");
    const pageParts = musicXmlIsSinglePartAndStaff(input.pageXml);
    if (!sheetDocument || !pageParts) return [];
    const sheet = sheetDocument.documentElement;
    const picture = childElements(sheet, "picture")[0];
    const imageWidth = picture && positiveIntegerAttribute(picture, "width");
    const imageHeight = picture && positiveIntegerAttribute(picture, "height");
    if (!imageWidth || !imageHeight || imageWidth !== imageMetadata.width || imageHeight !== imageMetadata.height) return [];

    const pages = childElements(sheet, "page");
    if (pages.length !== 1) return [];
    const page = pages[0];
    const declaredMeasureCount = positiveIntegerAttribute(page, "measure-count");
    const systems = childElements(page, "system");
    if (!declaredMeasureCount || !systems.length) return [];

    const scale = childElements(sheet, "scale")[0];
    const interlineElement = scale && childElements(scale, "interline")[0];
    const interline = interlineElement && numericAttribute(interlineElement, "main");
    if (interline === null || interline === undefined || interline <= 0 || interline > 300) return [];

    const anchors: AudiverisSourceAnchor[] = [];
    let measureIndex = 0;
    for (const system of systems) {
      const stacks = childElements(system, "stack");
      const parts = childElements(system, "part");
      if (parts.length !== 1) return [];
      const staves = childElements(parts[0], "staff");
      const measures = childElements(parts[0], "measure");
      if (staves.length !== 1 || measures.length !== stacks.length || !measures.length) return [];

      const nativeStaffId = staves[0].getAttribute("id");
      if (!nativeStaffId || !staffVerticalBounds(staves[0])) return [];
      const spatial = interBounds(system);
      if (!spatial) return [];

      for (const [index, [measure, stack]] of measures.map((measure, index) => [measure, stacks[index]] as const).entries()) {
        const measureId = measure.getAttribute("id");
        const stackId = stack.getAttribute("id");
        if (!measureId || !stackId || measureId !== stackId) return [];
        const rectangle = makeRectangle(stack, staves[0], measure, spatial, imageWidth, imageHeight, interline);
        if (!rectangle) return [];
        anchors.push({ partIndex: 0, measureIndex, rectangle });
        measureIndex += 1;
      }
    }

    if (measureIndex !== declaredMeasureCount || pageParts.measures.length !== measureIndex) return [];
    return anchors;
  } catch {
    return [];
  }
}
