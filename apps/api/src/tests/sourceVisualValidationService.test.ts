import { afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import type { ConversionCoverage } from "../domain.js";
import { SourceVisualValidationService } from "../services/SourceVisualValidationService.js";
import { applyVisualCorrection, parseVisualMusicXml } from "../services/VisualMusicXml.js";
import * as nativeAnchors from "../services/AudiverisSourceAnchors.js";
import { carinhosoM7RhythmDrift } from "./fixtures/visual/selected-homologation-2026-10-07-carinhoso-m7-rhythm-drift.js";

const xml = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Solo</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note><note><rest/><duration>4</duration><voice>1</voice><type>quarter</type></note></measure></part></score-partwise>`;
const coverage: ConversionCoverage = { totalPages: 1, processedPages: [1], missingPages: [], pages: [{ page: 1, status: "processed", parts: [{ id: "P1", name: "Solo", staffCount: 1, staves: [1] }] }] };
const temps: string[] = [];
afterEach(async () => { await Promise.all(temps.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))); });
afterEach(() => vi.restoreAllMocks());

async function fixture(readerBody?: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "source-visual-test-"));
  temps.push(dir);
  const sourcePath = path.join(dir, "source.pdf");
  const originalImagePath = path.join(dir, "page.png");
  await fs.writeFile(sourcePath, Buffer.from("source-pdf-bytes"));
  const image = await sharp({ create: { width: 100, height: 60, channels: 3, background: "white" } })
    .composite([{ input: { create: { width: 20, height: 20, channels: 3, background: "black" } }, left: 10, top: 10 }])
    .png().toBuffer();
  await fs.writeFile(originalImagePath, image);
  let readerExecutable: string | undefined;
  if (readerBody) {
    readerExecutable = path.join(dir, "reader.cjs");
    await fs.writeFile(readerExecutable, `#!/usr/bin/env node\n${readerBody.replace("REQUEST_LOG", path.join(dir, "request-log.json"))}\n`, { mode: 0o700 });
    await fs.chmod(readerExecutable, 0o700);
  }
  return { dir, sourcePath, originalImagePath, readerExecutable,
    input: { sourcePath, workDir: dir, musicXml: xml, coverage, candidates: [{ page: 1, selected: true, xml, originalImagePath }] } };
}

const sourceEvents = (pitch = "C", duration = 1) => [
  { onset: 0, duration, voice: "1", staff: 1, kind: "note", step: pitch, octave: 4, type: "quarter", dots: 0 },
  { onset: 1, duration: 1, voice: "1", staff: 1, kind: "rest", type: "quarter", dots: 0 }
];
const musicXmlFor = (notes: string, divisions = 4) => `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Solo</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>${divisions}</divisions></attributes>${notes}</measure></part></score-partwise>`;
const reader = (events: unknown, extras = "") => `const fs=require('fs'); const request=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if(JSON.stringify(request).includes('score-partwise')||JSON.stringify(request).includes('expectedMeasure')||Object.keys(request).sort().join(',')!=='imagePath,imageSHA256,page,version')process.exit(11);
fs.writeFileSync(${JSON.stringify("REQUEST_LOG")},JSON.stringify(request));
const response={version:1,page:request.page,inputImageSHA256:request.imageSHA256,coverageComplete:true,measures:[{partIndex:0,measureIndex:0,rectangle:{left:.1,top:.1,width:.5,height:.5},readable:true,events:${JSON.stringify(events)}}]};
${extras}
process.stdout.write(JSON.stringify(response));`;

describe("SourceVisualValidationService", () => {
  it("records source measures on a count mismatch without assigning editable XML indices", async () => {
    const sample = await fixture(reader(sourceEvents("D"),
      "response.measures.push({...response.measures[0],measureIndex:1});"));
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(sample.input);
    expect(result.review.proposals).toEqual([]);
    expect(result.review.segments[0].status).toBe("unknown");
    expect(result.review.sourceMeasures).toHaveLength(2);
    expect(result.review.sourceMeasures?.map((item) => item.sourceMeasureIndex)).toEqual([0, 1]);
    expect(result.review.sourceMeasures?.every((item) => !Object.hasOwn(item, "measureIndex"))).toBe(true);
    expect(result.review.diagnostics).toContainEqual(expect.objectContaining({ code: "VISUAL_SOURCE_MEASURE_UNMAPPED", page: 1 }));
    expect(result.review.diagnostics?.filter((item) => item.code === "VISUAL_MEASURE_COUNT_MISMATCH"
      || item.code === "VISUAL_SOURCE_MEASURE_UNMAPPED").every((item) => !Object.hasOwn(item, "measure"))).toBe(true);
    expect(result.review.accuracyVerified).toBe(false);
  });

  it("compares explicit source key signatures and affected pitches without applying edits", async () => {
    const encoded = xml.replace('number="1"', 'number="0" implicit="yes"').replace("<step>C</step>", "<step>B</step>");
    const sample = await fixture(reader(sourceEvents("B"),
      "response.measures[0].keyFifths=-1;response.measures[0].events[0].alter=-1;"));
    const input = { ...sample.input, musicXml: encoded, candidates: [{ ...sample.input.candidates[0], xml: encoded }] };
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(input);
    expect(result.review.segments[0].status).toBe("suspected");
    expect(result.review.proposals).toHaveLength(1);
    expect(result.review.proposals[0]).toMatchObject({ applicable: false, differences: ["pitch"] });
    expect(result.review.diagnostics).toContainEqual(expect.objectContaining({ code: "VISUAL_KEY_SIGNATURE_MISMATCH", page: 1, measure: "0", partId: "P1" }));
    expect(result.review.diagnostics).toContainEqual(expect.objectContaining({ code: "VISUAL_KEY_AFFECTED_PITCH_MISMATCH", page: 1, measure: "0", partId: "P1" }));
  });

  it("accepts a real key change and an incomplete pickup when source and XML align", async () => {
    const first = xml.match(/<measure number="1">[\s\S]*?<\/measure>/)?.[0];
    expect(first).toBeDefined();
    const keyedFirst = first!.replace('number="1"', 'number="0" implicit="yes"')
      .replace("<divisions>4</divisions>", "<divisions>4</divisions><key><fifths>-1</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>");
    const second = first!.replace('number="1"', 'number="2"')
      .replace("<divisions>4</divisions>", "<divisions>4</divisions><key><fifths>0</fifths></key>");
    const encoded = xml.replace(first!, keyedFirst + second);
    const sample = await fixture(reader(sourceEvents(),
      "response.measures[0].keyFifths=-1;response.measures.push({...response.measures[0],measureIndex:1,keyFifths:0});"));
    const input = { ...sample.input, musicXml: encoded, candidates: [{ ...sample.input.candidates[0], xml: encoded }] };
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(input);
    expect(result.review.checkedMeasures).toBe(2);
    expect(result.review.proposals).toEqual([]);
    expect(result.review.diagnostics?.some((item) => item.code === "VISUAL_KEY_SIGNATURE_MISMATCH")).toBe(false);
  });

  it("does not apply a later XML key signature to earlier measures", async () => {
    const first = xml.match(/<measure number="1">[\s\S]*?<\/measure>/)?.[0];
    expect(first).toBeDefined();
    const second = first!.replace('number="1"', 'number="2"')
      .replace("<divisions>4</divisions>", "<divisions>4</divisions><key><fifths>-1</fifths></key>");
    const encoded = xml.replace(first!, first! + second);
    const sample = await fixture(reader(sourceEvents(),
      "response.measures[0].keyFifths=-1;response.measures.push({...response.measures[0],measureIndex:1});"));
    const input = { ...sample.input, musicXml: encoded, candidates: [{ ...sample.input.candidates[0], xml: encoded }] };
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(input);
    expect(result.review.segments.map((item) => item.status)).toEqual(["suspected", "compared"]);
    expect(result.review.diagnostics?.filter((item) => item.code === "VISUAL_KEY_SIGNATURE_MISMATCH")).toHaveLength(1);
  });

  it("keeps legacy reader responses without key evidence comparable", async () => {
    const sample = await fixture(reader(sourceEvents()));
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(sample.input);
    expect(result.review.checkedMeasures).toBe(1);
    expect(result.review.diagnostics?.some((item) => item.code === "VISUAL_KEY_SIGNATURE_MISMATCH")).toBe(false);
  });

  it("preserves a bounded reader failure reason without promoting incomplete coverage or exposing stderr", async () => {
    const sample = await fixture(reader([], "response.coverageComplete=false;response.measures=[];response.diagnostics=[{code:'HOMR_EMPTY_MEASURE',message:'Bearer secret /private/path'}];"));
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(sample.input);
    expect(result.review).toMatchObject({ status: "partial", checkedMeasures: 0, unknownMeasures: 1, proposals: [], accuracyVerified: false });
    expect(result.review.diagnostics).toContainEqual(expect.objectContaining({ code: "HOMR_EMPTY_MEASURE", page: 1 }));
    expect(JSON.stringify(result.review)).not.toMatch(/Bearer secret|\/private\/path/);
  });
  it("records every encoded measure as unknown without a configured local reader", async () => {
    const sample = await fixture();
    const result = await new SourceVisualValidationService().evaluate(sample.input);
    expect(result.review.status).toBe("unavailable");
    expect(result.review.unknownMeasures).toBe(1);
    expect(result.review.proposals).toEqual([]);
    expect(result.review.segments[0].sourceAsset).toBe("visual-page-1.png");
    expect(result.review.accuracyVerified).toBe(false);
  });

  it("accepts the uploaded image itself as the source raster", async () => {
    const sample = await fixture();
    const input = { ...sample.input, sourcePath: sample.originalImagePath,
      candidates: [{ page: 1, selected: true, xml, originalImagePath: sample.originalImagePath }] };
    const result = await new SourceVisualValidationService().evaluate(input);
    expect(result.review.status).toBe("unavailable");
    expect(result.review.segments[0].sourceAsset).toBe("visual-page-1.png");
  });

  it("compares a source-first reader response, persists a real crop and proposes a pitch correction", async () => {
    const sample = await fixture(reader(sourceEvents("D"), "response.reader={name:'Independent reader',version:'0.7.0',model:'test-cpu'};"));
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(sample.input);
    expect(result.review.status).toBe("completed");
    expect(result.review.checkedMeasures).toBe(1);
    expect(result.review.reader).toEqual({name: "Independent reader", version: "0.7.0", model: "test-cpu", sourceFirst: true});
    expect(result.review.proposals).toHaveLength(1);
    expect(result.review.proposals[0]).toMatchObject({ differences: ["pitch"], before: { step: "C" }, after: { step: "D" }, applicable: true });
    const request = JSON.parse(await fs.readFile(path.join(sample.dir, "request-log.json"), "utf8"));
    expect(Object.keys(request).sort()).toEqual(["imagePath", "imageSHA256", "page", "version"]);
    const crop = result.assets.find((asset) => asset.name === result.review.segments[0].cropAsset);
    expect(crop).toBeDefined();
    expect(await sharp(crop!.path).metadata()).toMatchObject({ width: 50, height: 30 });
    const corrected = applyVisualCorrection(xml, result.review.proposals[0], "accept");
    expect(parseVisualMusicXml(corrected)[0].events[0].step).toBe("D");
    expect(parseVisualMusicXml(corrected)[0].events[1].kind).toBe("rest");
    const restored = applyVisualCorrection(corrected, result.review.proposals[0], "undo");
    expect(parseVisualMusicXml(restored)[0].events[0].step).toBe("C");
  });

  it("compares context-only events without inventing a measure crop or rectangle", async () => {
    const sample = await fixture(reader(sourceEvents("D"),
      "response.measures[0].contextOnly=true;response.measures[0].rectangle={left:0,top:0,width:1,height:1};"));
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(sample.input);
    expect(result.review.status).toBe("completed");
    expect(result.review.proposals).toHaveLength(1);
    expect(result.review.proposals[0]).toMatchObject({ differences: ["pitch"], applicable: false,
      reason: expect.stringContaining("página inteira") });
    expect(result.review.segments[0].sourceAsset).toBe("visual-page-1.png");
    expect(result.review.segments[0].cropAsset).toBeUndefined();
    expect(result.review.segments[0].rectangle).toBeUndefined();
    expect(result.review.limitations).toContain("A leitura foi comparada com a página inteira; a posição visual exata do compasso não foi confirmada.");
    expect(result.review.diagnostics).toContainEqual(expect.objectContaining({ code: "VISUAL_CONTEXT_ONLY_PROPOSALS_MANUAL" }));
    expect(result.assets).toHaveLength(1);
  });

  it("treats an unflagged full-page rectangle as context, not a located measure crop", async () => {
    const sample = await fixture(reader(sourceEvents("D"),
      "response.measures[0].rectangle={left:0,top:0,width:1,height:1};"));
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(sample.input);
    expect(result.review.proposals[0]).toMatchObject({ differences: ["pitch"], applicable: false });
    expect(result.review.segments[0].cropAsset).toBeUndefined();
    expect(result.review.segments[0].rectangle).toBeUndefined();
    expect(result.review.diagnostics).toContainEqual(expect.objectContaining({ code: "VISUAL_FULL_PAGE_CONTEXT", page: 1 }));
  });

  it("rejects a context-only response with a misleading small rectangle", async () => {
    const sample = await fixture(reader(sourceEvents(), "response.measures[0].contextOnly=true;"));
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(sample.input);
    expect(result.review.status).toBe("partial");
    expect(result.review.unknownMeasures).toBe(1);
    expect(result.review.segments[0].cropAsset).toBeUndefined();
  });

  it("resizes large source rasters and refuses native coordinates after a size transform", async () => {
    const sample = await fixture();
    const largeImagePath = path.join(sample.dir, "large.png");
    await sharp({ create: { width: 4500, height: 300, channels: 3, background: "white" } }).png().toFile(largeImagePath);
    const archivePath = path.join(sample.dir, "native.omr");
    await fs.writeFile(archivePath, "dummy");
    const spy = vi.spyOn(nativeAnchors, "readAudiverisSourceAnchors").mockResolvedValue([
      { partIndex: 0, measureIndex: 0, rectangle: { left: 100, top: 100, width: 100, height: 100 } }
    ]);
    const input = { ...sample.input, candidates: [{ page: 1, selected: true, xml,
      originalImagePath: largeImagePath, sourceImagePath: largeImagePath, nativeArchivePath: archivePath }] };
    const result = await new SourceVisualValidationService().evaluate(input);
    const pageAsset = result.assets.find((asset) => asset.name === "visual-page-1.png");
    expect(await sharp(pageAsset!.path).metadata()).toMatchObject({ width: 4400 });
    expect(spy).not.toHaveBeenCalled();
    expect(result.review.segments[0].cropAsset).toBeUndefined();
    expect(result.review.segments[0].status).toBe("unknown");
  });

  it("uses native crop anchors only as evidence while leaving music unknown", async () => {
    const sample = await fixture();
    const archivePath = path.join(sample.dir, "native.omr");
    await fs.writeFile(archivePath, "dummy");
    const spy = vi.spyOn(nativeAnchors, "readAudiverisSourceAnchors").mockResolvedValue([
      { partIndex: 0, measureIndex: 0, rectangle: { left: 10, top: 10, width: 30, height: 25 } }
    ]);
    const input = { ...sample.input, candidates: [{ ...sample.input.candidates[0],
      sourceImagePath: sample.originalImagePath, nativeArchivePath: archivePath }] };
    const result = await new SourceVisualValidationService().evaluate(input);
    expect(spy).toHaveBeenCalledOnce();
    expect(result.review.segments[0].cropAsset).toMatch(/^visual-crop-[1-9]\d*\.png$/);
    expect(result.review.segments[0].status).toBe("unknown");
    expect(result.review.checkedMeasures).toBe(0);
    expect(result.review.proposals).toEqual([]);
  });

  it("refuses native coordinates when EXIF rotation is present even if dimensions are square", async () => {
    const sample = await fixture();
    const rotatedPath = path.join(sample.dir, "rotated.jpg");
    await sharp({ create: { width: 100, height: 100, channels: 3, background: "white" } })
      .jpeg().withMetadata({ orientation: 6 }).toFile(rotatedPath);
    expect((await sharp(rotatedPath).metadata()).orientation).toBe(6);
    const archivePath = path.join(sample.dir, "native.omr");
    await fs.writeFile(archivePath, "dummy");
    const spy = vi.spyOn(nativeAnchors, "readAudiverisSourceAnchors").mockResolvedValue([
      { partIndex: 0, measureIndex: 0, rectangle: { left: 10, top: 10, width: 30, height: 25 } }
    ]);
    const input = { ...sample.input, candidates: [{ ...sample.input.candidates[0],
      originalImagePath: rotatedPath, sourceImagePath: rotatedPath, nativeArchivePath: archivePath }] };
    const result = await new SourceVisualValidationService().evaluate(input);
    expect(spy).not.toHaveBeenCalled();
    expect(result.review.segments[0].cropAsset).toBeUndefined();
  });

  it("keeps large noisy source images unknown without persisting oversized evidence", async () => {
    const sample = await fixture();
    const noisyPath = path.join(sample.dir, "noisy.png");
    const width = 3200;
    const height = 3500;
    await sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } }).png().toFile(noisyPath);
    const input = { ...sample.input, candidates: [{ page: 1, selected: true, xml, originalImagePath: noisyPath }] };
    const result = await new SourceVisualValidationService().evaluate(input);
    expect(result.assets).toEqual([]);
    expect(result.review.unknownMeasures).toBe(1);
    expect(result.review.segments[0].sourceAsset).toBeUndefined();
    expect(await fs.readdir(path.join(sample.dir, "visual-review"))).toEqual([]);
  });

  it("keeps duplicate/onset ambiguity manual while preserving the compared measure", async () => {
    const sample = await fixture(reader([...sourceEvents(), { ...sourceEvents()[0], step: "E" }]));
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(sample.input);
    expect(result.review.status).toBe("completed");
    expect(result.review.unknownMeasures).toBe(0);
    expect(result.review.proposals).toMatchObject([{ before: null, after: { step: "E" }, applicable: false,
      differences: ["missing_encoded_event"] }]);
    expect(new Set(result.review.proposals.map((proposal) => proposal.id)).size).toBe(result.review.proposals.length);
  });

  it("reports a source grace without allowing an automatic insertion", async () => {
    const graceXml = musicXmlFor(`<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`);
    const source = [{ onset: 0, duration: 0, voice: "1", staff: 1, grace: true, kind: "note", step: "D", octave: 4 },
      { onset: 0, duration: 1, voice: "1", staff: 1, kind: "note", step: "C", octave: 4, type: "quarter", dots: 0 }];
    const sample = await fixture(reader(source));
    const input = { ...sample.input, musicXml: graceXml, candidates: [{ ...sample.input.candidates[0], xml: graceXml }] };
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(input);
    expect(result.review.status).toBe("completed");
    const missingGrace = result.review.proposals.find((proposal) => proposal.after?.duration === 0);
    expect(missingGrace).toMatchObject({ before: null, after: { duration: 0, step: "D" }, applicable: false,
      differences: ["missing_encoded_event"] });
    expect(missingGrace?.noteIndex).toBeLessThan(0);
    expect(() => applyVisualCorrection(graceXml, missingGrace!, "accept")).toThrow();
  });

  it("matches identical grace occurrences as a multiset and reports only the unmatched occurrence", async () => {
    const graceNote = (step: string) => `<note><grace/><pitch><step>${step}</step><octave>4</octave></pitch><voice>1</voice></note>`;
    const graceXml = musicXmlFor(`${graceNote("D")}${graceNote("D")}<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`);
    const source = [{ onset: 0, duration: 0, voice: "1", staff: 1, grace: true, kind: "note", step: "D", octave: 4 },
      { onset: 0, duration: 1, voice: "1", staff: 1, kind: "note", step: "C", octave: 4, type: "quarter", dots: 0 }];
    const sample = await fixture(reader(source));
    const input = { ...sample.input, musicXml: graceXml, candidates: [{ ...sample.input.candidates[0], xml: graceXml }] };
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(input);
    expect(result.review.proposals).toHaveLength(1);
    expect(result.review.proposals[0]).toMatchObject({ before: { step: "D", duration: 0 }, after: null, applicable: false,
      differences: ["extra_encoded_event"] });
  });

  it("keeps missing inner chord members manual while completing the full-measure comparison", async () => {
    const chordXml = musicXmlFor(`<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note><note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note><note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`);
    const source = [{ onset: 0, duration: 1, voice: "1", staff: 1, chord: false, kind: "note", step: "C", octave: 4, type: "quarter", dots: 0 },
      { onset: 0, duration: 1, voice: "1", staff: 1, chord: true, kind: "note", step: "E", octave: 4, type: "quarter", dots: 0 },
      { onset: 0, duration: 1, voice: "1", staff: 1, chord: true, kind: "note", step: "A", octave: 4, type: "quarter", dots: 0 },
      { onset: 1, duration: 1, voice: "1", staff: 1, kind: "note", step: "G", octave: 4, type: "quarter", dots: 0 }];
    const sample = await fixture(reader(source));
    const input = { ...sample.input, musicXml: chordXml, candidates: [{ ...sample.input.candidates[0], xml: chordXml }] };
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(input);
    expect(result.review.status).toBe("completed");
    expect(result.review.proposals).toContainEqual(expect.objectContaining({ after: expect.objectContaining({ kind: "note", step: "A", octave: 4, duration: 1, type: "quarter", dots: 0 }),
      before: null, applicable: false, differences: ["missing_encoded_event"] }));
  });

  it("matches complete polyphony independent of event order", async () => {
    const polyphonyXml = musicXmlFor(`<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note><backup><duration>4</duration></backup><note><pitch><step>E</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>quarter</type></note>`);
    const source = [{ onset: 0, duration: 1, voice: "2", staff: 1, kind: "note", step: "E", octave: 3, type: "quarter", dots: 0 },
      { onset: 0, duration: 1, voice: "1", staff: 1, kind: "note", step: "C", octave: 4, type: "quarter", dots: 0 }];
    const sample = await fixture(reader(source));
    const input = { ...sample.input, musicXml: polyphonyXml, candidates: [{ ...sample.input.candidates[0], xml: polyphonyXml }] };
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(input);
    expect(result.review.proposals).toEqual([]);
  });

  it("matches a multiset despite renumbered voices and changed chord flags", async () => {
    const polyphonyXml = musicXmlFor(`<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note><backup><duration>4</duration></backup><note><pitch><step>E</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>quarter</type></note>`);
    const source = [{ onset: 0, duration: 1, voice: "27", staff: 1, chord: true, kind: "note", step: "E", octave: 3, type: "quarter", dots: 0 },
      { onset: 0, duration: 1, voice: "19", staff: 1, chord: true, kind: "note", step: "C", octave: 4, type: "quarter", dots: 0 }];
    const sample = await fixture(reader(source));
    const input = { ...sample.input, musicXml: polyphonyXml, candidates: [{ ...sample.input.candidates[0], xml: polyphonyXml }] };
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(input);
    expect(result.review.proposals).toEqual([]);
  });

  it("preserves multiplicity for two equal pitches at one onset", async () => {
    const unisons = musicXmlFor(`<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note><backup><duration>4</duration></backup><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>2</voice><type>quarter</type></note>`);
    const source = [{ onset: 0, duration: 1, voice: "8", staff: 1, kind: "note", step: "C", octave: 4, type: "quarter", dots: 0 },
      { onset: 0, duration: 1, voice: "9", staff: 1, kind: "note", step: "C", octave: 4, type: "quarter", dots: 0 }];
    const sample = await fixture(reader(source));
    const input = { ...sample.input, musicXml: unisons, candidates: [{ ...sample.input.candidates[0], xml: unisons }] };
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(input);
    expect(result.review.proposals).toEqual([]);
  });

  it("does not manufacture differences when grace occurrences are merely permuted", async () => {
    const graceNote = (step: string) => `<note><grace/><pitch><step>${step}</step><octave>4</octave></pitch><voice>1</voice></note>`;
    const graceXml = musicXmlFor(`${graceNote("D")}${graceNote("E")}<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`);
    const source = [{ onset: 0, duration: 0, voice: "1", staff: 1, grace: true, kind: "note", step: "E", octave: 4 },
      { onset: 0, duration: 0, voice: "1", staff: 1, grace: true, kind: "note", step: "D", octave: 4 },
      { onset: 0, duration: 1, voice: "1", staff: 1, kind: "note", step: "C", octave: 4, type: "quarter", dots: 0 }];
    const sample = await fixture(reader(source));
    const input = { ...sample.input, musicXml: graceXml, candidates: [{ ...sample.input.candidates[0], xml: graceXml }] };
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(input);
    expect(result.review.proposals).toEqual([]);
  });

  it("keeps a mismatched chord pitch as a manual suggestion", async () => {
    const chordXml = musicXmlFor(`<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note><note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`);
    const source = [{ onset: 0, duration: 1, voice: "1", staff: 1, kind: "note", step: "C", octave: 4, type: "quarter", dots: 0 },
      { onset: 0, duration: 1, voice: "1", staff: 1, chord: true, kind: "note", step: "D", octave: 4, type: "quarter", dots: 0 }];
    const sample = await fixture(reader(source));
    const input = { ...sample.input, musicXml: chordXml, candidates: [{ ...sample.input.candidates[0], xml: chordXml }] };
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(input);
    expect(result.review.proposals).toMatchObject([{ differences: ["pitch"], applicable: false }]);
  });

  it("does not zip multiple same-context mismatches into arbitrary pitch patches", async () => {
    const chordXml = musicXmlFor(`<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note><note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note><note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`);
    const source = [{ onset: 0, duration: 1, voice: "1", staff: 1, kind: "note", step: "C", octave: 4, type: "quarter", dots: 0 },
      { onset: 0, duration: 1, voice: "1", staff: 1, chord: true, kind: "note", step: "F", octave: 4, type: "quarter", dots: 0 },
      { onset: 0, duration: 1, voice: "1", staff: 1, chord: true, kind: "note", step: "A", octave: 4, type: "quarter", dots: 0 }];
    const sample = await fixture(reader(source));
    const input = { ...sample.input, musicXml: chordXml, candidates: [{ ...sample.input.candidates[0], xml: chordXml }] };
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(input);
    expect(result.review.proposals.every((proposal) => !proposal.applicable)).toBe(true);
    expect(result.review.proposals.filter((proposal) => proposal.differences.includes("pitch"))).toHaveLength(0);
    expect(result.review.proposals.filter((proposal) => proposal.differences.includes("extra_encoded_event"))).toHaveLength(2);
    expect(result.review.proposals.filter((proposal) => proposal.differences.includes("missing_encoded_event"))).toHaveLength(2);
    expect(new Set(result.review.proposals.map((proposal) => proposal.id)).size).toBe(4);
  });

  it("marks a missing source event as a proposal that cannot be applied by index", async () => {
    const sample = await fixture(reader([sourceEvents()[0]]));
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(sample.input);
    expect(result.review.status).toBe("completed");
    expect(result.review.proposals).toMatchObject([{ before: { kind: "rest" }, after: null,
      applicable: false, differences: ["extra_encoded_event"] }]);
    expect(() => applyVisualCorrection(xml, result.review.proposals[0], "accept")).toThrow();
  });

  it("converts a monophonic duration to the existing divisions and undoes it", async () => {
    const sample = await fixture(reader(sourceEvents("C", 1.5)));
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(sample.input);
    expect(result.review.proposals[0]).toMatchObject({ differences: ["duration"], applicable: false,
      reason: expect.stringContaining("deslocar eventos seguintes") });
    expect(result.review.diagnostics).toContainEqual(expect.objectContaining({ code: "VISUAL_RHYTHM_EDIT_REQUIRES_MANUAL" }));
    expect(() => applyVisualCorrection(xml, { ...result.review.proposals[0], applicable: true }, "accept"))
      .toThrow("Mudança isolada de duração");
    expect(parseVisualMusicXml(xml)[0].events[0].duration).toBe(1);
  });

  it("keeps the Carinhoso measure-7 rhythm drift as manual proposals without treating the shifted note as an insertion", async () => {
    const sample = await fixture(reader(carinhosoM7RhythmDrift.sourceEvents));
    const input = { ...sample.input, musicXml: carinhosoM7RhythmDrift.xml,
      candidates: [{ ...sample.input.candidates[0], xml: carinhosoM7RhythmDrift.xml }] };
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(input);
    const durationProposal = result.review.proposals.find((proposal) => proposal.measure === "7" && proposal.differences.includes("duration"));
    expect(durationProposal).toMatchObject({ before: { step: "B", duration: 0.5 }, after: { step: "B", duration: 0.25 }, applicable: false });
    expect(result.review.proposals.filter((proposal) => proposal.measure === "7").every((proposal) => !proposal.applicable)).toBe(true);
    expect(result.review.proposals).toContainEqual(expect.objectContaining({ differences: ["extra_encoded_event"], applicable: false }));
    expect(result.review.proposals).toContainEqual(expect.objectContaining({ differences: ["missing_encoded_event"], applicable: false }));
    expect(result.review.diagnostics).toContainEqual(expect.objectContaining({ code: "VISUAL_RHYTHM_EDIT_REQUIRES_MANUAL" }));
    expect(result.review.diagnostics).toContainEqual(expect.objectContaining({ code: "VISUAL_READER_ACCURACY_UNHOMOLOGATED" }));
    expect(result.review.accuracyVerified).toBe(false);
  });

  it("keeps dotted and triplet duration proposals visible but blocks isolated rhythm edits", async () => {
    const dotted = xml.replace("<duration>4</duration><voice>1</voice><type>quarter</type></note>",
      "<duration>6</duration><voice>1</voice><type>quarter</type><dot/></note>");
    const dottedReaderEvents = [
      { onset: 0, duration: 1, voice: "1", staff: 1, kind: "note", step: "C", octave: 4, type: "quarter", dots: 0 },
      { onset: 1, duration: 1, voice: "1", staff: 1, kind: "rest", type: "quarter", dots: 0 }
    ];
    const dottedSample = await fixture(reader(dottedReaderEvents));
    const dottedInput = { ...dottedSample.input, musicXml: dotted, candidates: [{ ...dottedSample.input.candidates[0], xml: dotted }] };
    const dottedResult = await new SourceVisualValidationService({ readerExecutable: dottedSample.readerExecutable }).evaluate(dottedInput);
    expect(dottedResult.review.proposals[0]).toMatchObject({ applicable: false, differences: expect.arrayContaining(["duration", "dots"]) });
    expect(() => applyVisualCorrection(dotted, { ...dottedResult.review.proposals[0], applicable: true }, "accept"))
      .toThrow("Mudança isolada de duração");
    expect(parseVisualMusicXml(dotted)[0].rhythmNotationValid).toBe(true);

    const triplet = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Solo</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>3</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><notations><tuplet number="1" type="start"/></notations></note></measure></part></score-partwise>`;
    const tripletEvents = [{ onset: 0, duration: 0.5, voice: "1", staff: 1, kind: "note", step: "C", octave: 4, type: "eighth", dots: 0 }];
    const tripletSample = await fixture(reader(tripletEvents));
    const tripletInput = { ...tripletSample.input, musicXml: triplet, candidates: [{ ...tripletSample.input.candidates[0], xml: triplet }] };
    const tripletResult = await new SourceVisualValidationService({ readerExecutable: tripletSample.readerExecutable }).evaluate(tripletInput);
    expect(tripletResult.review.proposals[0]).toMatchObject({ applicable: false, differences: ["duration"] });
    expect(parseVisualMusicXml(triplet)[0]).toMatchObject({ simpleRhythm: false, rhythmNotationValid: true });
    expect(() => applyVisualCorrection(triplet, { ...tripletResult.review.proposals[0], applicable: true }, "accept"))
      .toThrow("Mudança isolada de duração");
  });

  it("leaves a partially readable multi-staff measure unknown instead of proposing missing staff events", async () => {
    const multistaff = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><staves>2</staves></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff><type>quarter</type></note><backup><duration>4</duration></backup><note><pitch><step>E</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><staff>2</staff><type>quarter</type></note></measure></part></score-partwise>`;
    const sample = await fixture(reader([{ onset: 0, duration: 1, voice: "1", staff: 1, kind: "note", step: "D", octave: 4 }],
      "response.measures[0].readable=false;"));
    const input = { ...sample.input, musicXml: multistaff, candidates: [{ ...sample.input.candidates[0], xml: multistaff }],
      coverage: { ...coverage, pages: [{ page: 1, status: "processed" as const, parts: [{ id: "P1", name: "Piano", staffCount: 2, staves: [1, 2] }] }] } };
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(input);
    expect(result.review.status).toBe("partial");
    expect(result.review.checkedMeasures).toBe(0);
    expect(result.review.unknownMeasures).toBe(1);
    expect(result.review.proposals).toEqual([]);
    expect(result.review.diagnostics).toContainEqual(expect.objectContaining({ code: "VISUAL_MEASURE_UNREADABLE", page: 1 }));
  });

  it("retains dotted type and notations when the reader only supplies a new pitch", async () => {
    const dotted = xml.replace("<duration>4</duration><voice>1</voice><type>quarter</type></note>",
      "<duration>6</duration><voice>1</voice><type>quarter</type><dot/><notations><slur number=\"1\" type=\"start\"/></notations></note>");
    const events = [{ onset: 0, duration: 1.5, voice: "1", staff: 1, kind: "note", step: "D", octave: 4 },
      { onset: 1.5, duration: 1, voice: "1", staff: 1, kind: "rest" }];
    const sample = await fixture(reader(events));
    const input = { ...sample.input, musicXml: dotted, candidates: [{ ...sample.input.candidates[0], xml: dotted }] };
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(input);
    expect(result.review.proposals).toHaveLength(1);
    expect(result.review.proposals[0].after).toMatchObject({ step: "D", type: "quarter", dots: 1 });
    const updated = applyVisualCorrection(dotted, result.review.proposals[0], "accept");
    expect(updated).toContain("<dot/>");
    expect(updated).toContain("<notations>");
    expect(parseVisualMusicXml(updated)[0].events[0].step).toBe("D");
    expect(parseVisualMusicXml(applyVisualCorrection(updated, result.review.proposals[0], "undo"))[0].events[0].step).toBe("C");
  });

  it("keeps pitch changes with printed accidentals as suggestions only", async () => {
    const altered = xml.replace("<step>C</step><octave>4</octave>", "<step>C</step><alter>1</alter><octave>4</octave>")
      .replace("<type>quarter</type></note>", "<type>quarter</type><accidental>sharp</accidental></note>");
    const sample = await fixture(reader(sourceEvents("D")));
    const input = { ...sample.input, musicXml: altered, candidates: [{ ...sample.input.candidates[0], xml: altered }] };
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(input);
    expect(result.review.proposals[0].applicable).toBe(false);
    expect(() => applyVisualCorrection(altered, result.review.proposals[0], "accept")).toThrow();
  });

  it("treats malformed reader output as unknown without failing the OMR result", async () => {
    const sample = await fixture("process.stdout.write('{broken');");
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(sample.input);
    expect(result.review.status).toBe("partial");
    expect(result.review.unknownMeasures).toBe(1);
  });

  it("rejects a mismatched source hash and a timed-out reader without claiming verification", async () => {
    const wrong = await fixture(reader(sourceEvents(), "response.inputImageSHA256='0'.repeat(64);"));
    const wrongResult = await new SourceVisualValidationService({ readerExecutable: wrong.readerExecutable }).evaluate(wrong.input);
    expect(wrongResult.review.status).toBe("partial");
    expect(wrongResult.review.unknownMeasures).toBe(1);
    expect(wrongResult.review.diagnostics).toContainEqual(expect.objectContaining({code: "VISUAL_READER_SOURCE_MISMATCH", page: 1}));
    const slow = await fixture("setTimeout(()=>process.stdout.write('{}'),5000);");
    const slowResult = await new SourceVisualValidationService({ readerExecutable: slow.readerExecutable, timeoutMs: 1000 }).evaluate(slow.input);
    expect(slowResult.review.status).toBe("partial");
    expect(slowResult.review.unknownMeasures).toBe(1);
    expect(slowResult.review.diagnostics).toContainEqual(expect.objectContaining({code: "VISUAL_READER_TIMEOUT", page: 1}));
  });

  it("drops a page asset if the local reader changes its bytes", async () => {
    const sample = await fixture(reader(sourceEvents(), "fs.writeFileSync(request.imagePath,'tampered');"));
    const result = await new SourceVisualValidationService({ readerExecutable: sample.readerExecutable }).evaluate(sample.input);
    expect(result.review.status).toBe("partial");
    expect(result.review.segments[0].sourceAsset).toBeUndefined();
    expect(result.assets).toEqual([]);
    expect(result.review.diagnostics).toContainEqual(expect.objectContaining({code: "VISUAL_SOURCE_CHANGED", page: 1}));
    expect(await fs.readdir(path.join(sample.dir, "visual-review"))).toEqual([]);
  });

  it("skips the entire visual read above the page limit", async () => {
    const sample = await fixture();
    const fourPages = { ...coverage, totalPages: 4 };
    const result = await new SourceVisualValidationService().evaluate({ ...sample.input, coverage: fourPages });
    expect(result.review.status).toBe("skipped");
    expect(result.review.checkedMeasures).toBe(0);
    expect(result.assets).toEqual([]);
  });

  it("rejects invalid staff, divisions, and explicit alter in the encoded score", () => {
    expect(() => parseVisualMusicXml(xml.replace("<divisions>4</divisions>", "<divisions>0</divisions>"))).toThrow();
    expect(() => parseVisualMusicXml(xml.replace("<voice>1</voice>", "<voice>1</voice><staff>0</staff>"))).toThrow();
    expect(() => parseVisualMusicXml(xml.replace("<octave>4</octave>", "<alter>n/a</alter><octave>4</octave>"))).toThrow();
  });

  it("marks inconsistent printed rhythm and MusicXML tuplet ratios unusable for rhythm edits", () => {
    const inconsistent = xml.replace("<duration>4</duration><voice>1</voice><type>quarter</type>",
      "<duration>2</duration><voice>1</voice><type>quarter</type>");
    expect(parseVisualMusicXml(inconsistent)[0].rhythmNotationValid).toBe(false);
    const invalidTuplet = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Solo</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>3</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>0</actual-notes><normal-notes>2</normal-notes></time-modification></note></measure></part></score-partwise>`;
    expect(parseVisualMusicXml(invalidTuplet)[0].rhythmNotationValid).toBe(false);
  });
});
