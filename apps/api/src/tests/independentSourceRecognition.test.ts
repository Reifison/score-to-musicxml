import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const { runCommandMock, assertConversionActiveMock } = vi.hoisted(() => ({
  runCommandMock: vi.fn(),
  assertConversionActiveMock: vi.fn()
}));

vi.mock("../services/SubprocessRunner.js", () => ({
  runCommand: runCommandMock,
  assertConversionActive: assertConversionActiveMock
}));

import { readIndependentSourceNotation } from "../services/IndependentSourceRecognition.js";

type ReaderRequest = {
  version: number;
  page: number;
  imagePath: string;
  imageSHA256: string;
  includeMusicXml: boolean;
};

type ReaderResponse = Record<string, unknown>;

type TestFixture = {
  directory: string;
  imagePath: string;
  workDir: string;
  readerExecutable: string;
};

const rawMusicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Solo</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <note><pitch><step>F</step><octave>5</octave></pitch><duration>4</duration>
      <notations><fermata type="upright"/></notations>
    </note>
  </measure></part>
</score-partwise>`;
const readerIdentity = { name: "HOMR", version: "0.7.0", model: "segnet-308/transformer-396-cpu" };
const temporaryDirectories: string[] = [];
let responseFactory: (request: ReaderRequest) => ReaderResponse;
let beforeCommandReturns: (() => Promise<void>) | undefined;
let capturedRequests: ReaderRequest[];

const sha256 = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");

function validResponse(request: ReaderRequest, musicXml = rawMusicXml): ReaderResponse {
  return {
    version: 1,
    page: request.page,
    inputImageSHA256: request.imageSHA256,
    reader: readerIdentity,
    coverageComplete: true,
    diagnostics: [],
    measures: [{ partIndex: 0, measureIndex: 0, events: [{ kind: "note", step: "F", octave: 5 }] }],
    musicXml
  };
}

async function fixture(): Promise<TestFixture> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "independent-source-recognition-"));
  temporaryDirectories.push(directory);
  const imagePath = path.join(directory, "source.png");
  await sharp({ create: { width: 24, height: 18, channels: 3, background: "white" } }).png().toFile(imagePath);
  return { directory, imagePath, workDir: path.join(directory, "work"), readerExecutable: path.join(directory, "mock-reader") };
}

async function recognize(sample: TestFixture, overrides: Partial<Parameters<typeof readIndependentSourceNotation>[0]> = {}) {
  return readIndependentSourceNotation({
    imagePath: sample.imagePath,
    page: 1,
    workDir: sample.workDir,
    readerExecutable: sample.readerExecutable,
    timeoutMs: 1_234,
    ...overrides
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedRequests = [];
  beforeCommandReturns = undefined;
  responseFactory = (request) => validResponse(request);
  assertConversionActiveMock.mockImplementation(() => undefined);
  runCommandMock.mockImplementation(async (_command: string, args: string[]) => {
    const request = JSON.parse(await fs.readFile(args[0], "utf8")) as ReaderRequest;
    capturedRequests.push(request);
    await beforeCommandReturns?.();
    return { stdout: JSON.stringify(responseFactory(request)), stderr: "" };
  });
});

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
  vi.clearAllMocks();
});

describe("readIndependentSourceNotation", () => {
  it("sends only the original image request and preserves raw source MusicXML", async () => {
    const sample = await fixture();

    const result = await recognize(sample);

    expect(result).toMatchObject({
      id: "homr-source-page-1",
      xml: rawMusicXml,
      sourceImageSha256: sha256(await fs.readFile(sample.imagePath)),
      xmlSha256: sha256(rawMusicXml),
      reader: readerIdentity
    });
    expect(result?.xml).toContain("<fermata type=\"upright\"/>");
    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0]).toEqual({
      version: 1,
      page: 1,
      imagePath: sample.imagePath,
      imageSHA256: sha256(await fs.readFile(sample.imagePath)),
      includeMusicXml: true
    });
    expect(Object.keys(capturedRequests[0]).sort()).toEqual([
      "imagePath", "imageSHA256", "includeMusicXml", "page", "version"
    ]);
    expect(capturedRequests[0]).not.toHaveProperty("candidateXML");
    expect(capturedRequests[0]).not.toHaveProperty("expectedMeasureCount");
    expect(runCommandMock).toHaveBeenCalledWith(sample.readerExecutable,
      [path.join(sample.workDir, "independent-source", "request.json")],
      { timeout: 1_234, maxBuffer: 12 * 1024 * 1024 });
    expect(await fs.readFile(path.join(sample.workDir, "independent-source", "source.musicxml"), "utf8")).toBe(rawMusicXml);
    const provenance = JSON.parse(await fs.readFile(path.join(sample.workDir, "independent-source", "provenance.json"), "utf8"));
    expect(provenance).toMatchObject({
      sourceImageSha256: sha256(await fs.readFile(sample.imagePath)),
      xmlSha256: sha256(rawMusicXml),
      sourceFirst: true,
      accuracyVerified: false,
      trainingEligible: false
    });
  });

  it.each([
    ["image hash", (response: ReaderResponse) => { response.inputImageSHA256 = "f".repeat(64); }, rawMusicXml],
    ["page", (response: ReaderResponse) => { response.page = 2; }, rawMusicXml],
    ["protocol version", (response: ReaderResponse) => { response.version = 2; }, rawMusicXml],
    ["reader model", (response: ReaderResponse) => { response.reader = { ...readerIdentity, model: "different-model" }; }, rawMusicXml],
    ["incomplete coverage", (response: ReaderResponse) => { response.coverageComplete = false; response.measures = []; }, rawMusicXml],
    ["MusicXML measure count", () => undefined,
      rawMusicXml.replace("</measure></part>", "</measure><measure number=\"2\"><note><rest/><duration>4</duration></note></measure></part>")],
    ["entity declarations", () => undefined,
      rawMusicXml.replace("<score-partwise", "<!DOCTYPE score-partwise [<!ENTITY pitch \"F\">]>\n<score-partwise")]
  ] as const)("rejects a response with invalid %s", async (_label, alter, xml) => {
    const sample = await fixture();
    responseFactory = (request) => {
      const response = validResponse(request, xml);
      alter(response);
      return response;
    };

    await expect(recognize(sample)).resolves.toBeNull();
    await expect(fs.access(path.join(sample.workDir, "independent-source", "source.musicxml"))).rejects.toThrow();
  });

  it("rejects a source image that changes while the reader is running", async () => {
    const sample = await fixture();
    const changedImage = await sharp({ create: { width: 24, height: 18, channels: 3, background: "black" } }).png().toBuffer();
    beforeCommandReturns = async () => { await fs.writeFile(sample.imagePath, changedImage); };

    await expect(recognize(sample)).resolves.toBeNull();
    expect(capturedRequests).toHaveLength(1);
    await expect(fs.access(path.join(sample.workDir, "independent-source", "source.musicxml"))).rejects.toThrow();
  });

  it("skips a symlinked source image", async () => {
    const sample = await fixture();
    const linkedImagePath = path.join(sample.directory, "source-link.png");
    await fs.symlink(sample.imagePath, linkedImagePath);

    await expect(recognize(sample, { imagePath: linkedImagePath })).resolves.toBeNull();
    expect(runCommandMock).not.toHaveBeenCalled();
  });

  it("skips a source image larger than the local size limit", async () => {
    const sample = await fixture();
    const largeImagePath = path.join(sample.directory, "large.png");
    const handle = await fs.open(largeImagePath, "w");
    try { await handle.truncate(32 * 1024 * 1024 + 1); } finally { await handle.close(); }

    await expect(recognize(sample, { imagePath: largeImagePath })).resolves.toBeNull();
    expect(runCommandMock).not.toHaveBeenCalled();
  });

  it("propagates cancellation when the subprocess stops", async () => {
    const sample = await fixture();
    const cancellation = new Error("conversion cancelled");
    let cancelled = false;
    assertConversionActiveMock.mockImplementation(() => {
      if (cancelled) throw cancellation;
    });
    runCommandMock.mockImplementation(async () => {
      cancelled = true;
      throw new Error("reader subprocess stopped");
    });

    await expect(recognize(sample)).rejects.toBe(cancellation);
    expect(assertConversionActiveMock).toHaveBeenCalledTimes(2);
  });
});
