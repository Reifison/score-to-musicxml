import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const { readAnchorsMock, readIndependentMock, readRestEvidenceMock, reconcileMock, assertConversionActiveMock } = vi.hoisted(() => ({
  readAnchorsMock: vi.fn(),
  readIndependentMock: vi.fn(),
  readRestEvidenceMock: vi.fn(),
  reconcileMock: vi.fn(),
  assertConversionActiveMock: vi.fn()
}));

vi.mock("../services/AudiverisSourceAnchors.js", () => ({ readAudiverisSourceAnchors: readAnchorsMock }));
vi.mock("../services/IndependentSourceRecognition.js", () => ({ readIndependentSourceNotation: readIndependentMock }));
vi.mock("../services/EighthRestImageEvidence.js", () => ({ readEighthRestImageEvidence: readRestEvidenceMock }));
vi.mock("../services/AutomaticCandidateReconciliation.js", () => ({ reconcileAutomaticMusicXmlCandidates: reconcileMock }));
vi.mock("../services/SubprocessRunner.js", () => ({
  assertConversionActive: assertConversionActiveMock,
  runCommand: vi.fn()
}));

import { env } from "../config/env.js";
import { AudiverisOmrAdapter, type CandidateEvidence } from "../services/OmrAdapter.js";
import type { SourceImageTransform } from "../services/SourceImageTransform.js";

const sourceMusicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Solo</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
  </measure></part>
</score-partwise>`;
const outputMusicXml = sourceMusicXml.replace("<step>C</step>", "<step>D</step>");
const digest = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");

type Fixture = {
  directory: string;
  workDir: string;
  originalImagePath: string;
  preparedPaths: [string, string];
  archivePaths: [string, string, string];
  preparedHashes: [string, string];
  transforms: [SourceImageTransform, SourceImageTransform];
  sourceImageSha256: string;
};

type CandidateReconciler = {
  reconcilePageCandidates(evidence: CandidateEvidence[], selectedId: number, workDir: string, page: number): Promise<CandidateEvidence | null>;
};

const emptyValidation = {
  version: 1 as const,
  issues: [],
  checkedMeasures: 1,
  skippedMeasures: 0,
  voiceCheckedMeasures: 1,
  voiceSkippedMeasures: 0,
  voiceChecks: [],
  requiresReview: false,
  limitations: []
};

const temporaryDirectories: string[] = [];
const settings = env as unknown as Record<string, unknown>;
let previousReader: unknown;
let previousMaxPages: unknown;
let previousMaxMeasures: unknown;
let previousTimeout: unknown;

async function makeFixture(): Promise<Fixture> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "automatic-omr-integration-"));
  temporaryDirectories.push(directory);
  const workDir = path.join(directory, "page-1");
  await fs.mkdir(workDir, { recursive: true });
  const originalImagePath = path.join(directory, "original.png");
  const preparedPaths: [string, string] = [path.join(directory, "prepared-a.png"), path.join(directory, "prepared-b.png")];
  await sharp({ create: { width: 80, height: 60, channels: 3, background: "white" } }).png().toFile(originalImagePath);
  await sharp({ create: { width: 100, height: 80, channels: 3, background: "#fefefe" } }).png().toFile(preparedPaths[0]);
  await sharp({ create: { width: 120, height: 90, channels: 3, background: "#fdfdfd" } }).png().toFile(preparedPaths[1]);
  const sourceImageSha256 = digest(await fs.readFile(originalImagePath));
  const preparedHashes = await Promise.all(preparedPaths.map(async (preparedPath) => digest(await fs.readFile(preparedPath)))) as [string, string];
  const transforms: [SourceImageTransform, SourceImageTransform] = [
    { version: 1, method: "crop_padding_v1", originalImageSHA256: sourceImageSha256, preparedImageSHA256: preparedHashes[0],
      originalWidth: 80, originalHeight: 60, preparedWidth: 100, preparedHeight: 80,
      crop: { left: 0, top: 0, width: 80, height: 60 }, padding: { left: 10, top: 10, right: 10, bottom: 10 } },
    { version: 1, method: "crop_padding_v1", originalImageSHA256: sourceImageSha256, preparedImageSHA256: preparedHashes[1],
      originalWidth: 80, originalHeight: 60, preparedWidth: 120, preparedHeight: 90,
      crop: { left: 0, top: 0, width: 80, height: 60 }, padding: { left: 20, top: 15, right: 20, bottom: 15 } }
  ];
  const archivePaths: [string, string, string] = [
    path.join(directory, "native-a.omr"), path.join(directory, "native-b.omr"), path.join(directory, "old-failed-export.omr")
  ];
  await Promise.all(archivePaths.map((archivePath) => fs.writeFile(archivePath, "placeholder archive")));
  return { directory, workDir, originalImagePath, preparedPaths, archivePaths, preparedHashes, transforms, sourceImageSha256 };
}

function evidence(sample: Fixture, candidate: number, options: {
  selected?: boolean;
  reason?: string;
  preparedIndex?: 0 | 1;
  archiveIndex?: 0 | 1 | 2;
  sourceTransform?: SourceImageTransform;
} = {}): CandidateEvidence {
  const preparedIndex = options.preparedIndex ?? (candidate === 1 ? 0 : 1);
  const archiveIndex = options.archiveIndex ?? (candidate === 7 ? 2 : preparedIndex);
  return {
    page: 1,
    candidate,
    candidateIds: [candidate],
    selected: options.selected ?? false,
    exportValid: candidate !== 7,
    reason: options.reason ?? "Candidato disponível para revisão.",
    xml: sourceMusicXml,
    sourceImagePath: sample.preparedPaths[preparedIndex],
    sourceImagePaths: [{ candidate, path: sample.preparedPaths[preparedIndex], sha256: sample.preparedHashes[preparedIndex] }],
    originalImagePath: sample.originalImagePath,
    nativeArchivePath: sample.archivePaths[archiveIndex],
    ...(options.sourceTransform ? { sourceTransform: options.sourceTransform } : { sourceTransform: sample.transforms[preparedIndex] }),
    validation: emptyValidation
  };
}

function result(history: unknown[] = [{ kind: "set_initial_key", measureIndex: 0, measure: "1", detail: "corroborado" }], sourceImageSha256 = "a".repeat(64)) {
  return {
    musicXml: outputMusicXml,
    history,
    rejected: [],
    provenance: {
      baseXmlSha256: digest(sourceMusicXml),
      outputXmlSha256: digest(outputMusicXml),
      sourceImageSha256,
      independentXmlSha256: digest(sourceMusicXml)
    },
    accuracyVerified: false as const,
    trainingEligible: false as const,
    requiresReview: true as const
  };
}

function reconcile(adapter: AudiverisOmrAdapter, candidates: CandidateEvidence[], selectedId: number, workDir: string, page = 1) {
  return (adapter as unknown as CandidateReconciler).reconcilePageCandidates(candidates, selectedId, workDir, page);
}

beforeEach(() => {
  vi.clearAllMocks();
  previousReader = settings.SOURCE_VISUAL_READER_BIN;
  previousMaxPages = settings.SOURCE_VISUAL_MAX_PAGES;
  previousMaxMeasures = settings.SOURCE_VISUAL_MAX_MEASURES;
  previousTimeout = settings.SOURCE_VISUAL_TIMEOUT_MS;
  settings.SOURCE_VISUAL_READER_BIN = "/mock/source-reader";
  settings.SOURCE_VISUAL_MAX_PAGES = 3;
  settings.SOURCE_VISUAL_MAX_MEASURES = 200;
  settings.SOURCE_VISUAL_TIMEOUT_MS = 1_234;
  assertConversionActiveMock.mockImplementation(() => undefined);
  readAnchorsMock.mockResolvedValue([{ partIndex: 0, measureIndex: 0, rectangle: { left: 1, top: 2, width: 30, height: 20 } }]);
  readRestEvidenceMock.mockResolvedValue({ leadingRests: [], contradictedNativeRests: [] });
  readIndependentMock.mockImplementation(async ({ imagePath }: { imagePath: string }) => ({
    id: "homr-source-page-1", xml: sourceMusicXml, sourceImageSha256: digest(await fs.readFile(imagePath)), xmlSha256: digest(sourceMusicXml)
  }));
  reconcileMock.mockImplementation((input: { base: { sourceImageSha256: string } }) => result(undefined, input.base.sourceImageSha256));
});

afterEach(async () => {
  settings.SOURCE_VISUAL_READER_BIN = previousReader;
  settings.SOURCE_VISUAL_MAX_PAGES = previousMaxPages;
  settings.SOURCE_VISUAL_MAX_MEASURES = previousMaxMeasures;
  settings.SOURCE_VISUAL_TIMEOUT_MS = previousTimeout;
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("OmrAdapter source-first automatic reconciliation", () => {
  it("usa exatamente dois candidatos saudáveis e cria evidência derivada sem reaproveitar o arquivo nativo", async () => {
    const sample = await makeFixture();
    const adapter = new AudiverisOmrAdapter();
    const candidates = [
      evidence(sample, 1, { preparedIndex: 0, selected: false }),
      evidence(sample, 2, { preparedIndex: 1, selected: true }),
      evidence(sample, 7, { reason: "Rejeitado: exportação incompleta; não é candidata.", archiveIndex: 2 })
    ];

    const derived = await reconcile(adapter, candidates, 2, sample.workDir);

    expect(derived).toMatchObject({
      page: 1,
      candidate: 8,
      selected: true,
      xml: outputMusicXml,
      sourceImagePath: sample.originalImagePath,
      originalImagePath: sample.originalImagePath,
      reason: expect.stringContaining("leitura independente")
    });
    expect(derived).not.toHaveProperty("nativeArchivePath");
    expect(derived?.automaticReconciliation).toMatchObject({
      accuracyVerified: false,
      trainingEligible: false,
      requiresReview: true,
      provenance: { sourceImageSha256: sample.sourceImageSha256 }
    });
    expect(derived?.automaticReconciliation).not.toHaveProperty("musicXml");
    expect(readAnchorsMock).toHaveBeenCalledTimes(2);
    expect(readAnchorsMock).not.toHaveBeenCalledWith(expect.objectContaining({ archivePath: sample.archivePaths[2] }));
    expect(readAnchorsMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      archivePath: sample.archivePaths[0], sourceTransform: sample.transforms[0], originalImagePath: sample.originalImagePath
    }));
    expect(readAnchorsMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      archivePath: sample.archivePaths[1], sourceTransform: sample.transforms[1], originalImagePath: sample.originalImagePath
    }));
    expect(readIndependentMock).toHaveBeenCalledWith(expect.objectContaining({
      imagePath: sample.originalImagePath, page: 1, workDir: sample.workDir,
      readerExecutable: "/mock/source-reader", timeoutMs: 1_234
    }));
    expect(reconcileMock).toHaveBeenCalledTimes(1);
    const reconciliationInput = reconcileMock.mock.calls[0][0];
    expect(reconciliationInput.base).toMatchObject({ id: "candidate-2", sourceImageSha256: sample.sourceImageSha256 });
    expect(reconciliationInput.donors.map((donor: { id: string }) => donor.id)).toEqual(["candidate-1"]);
    expect(reconciliationInput.independent).toMatchObject({ id: "homr-source-page-1", xml: sourceMusicXml });
    const writtenReport = JSON.parse(await fs.readFile(path.join(sample.workDir, "automatic-reconciliation.json"), "utf8"));
    expect(writtenReport).not.toHaveProperty("musicXml");
    expect(writtenReport.provenance.sourceImageSha256).toBe(sample.sourceImageSha256);
  });

  it("não reconcilia quando a imagem da leitura independente não corresponde ao hash da fonte", async () => {
    const sample = await makeFixture();
    readIndependentMock.mockResolvedValue({ id: "wrong-page", xml: sourceMusicXml,
      sourceImageSha256: "b".repeat(64), xmlSha256: digest(sourceMusicXml) });

    const derived = await reconcile(new AudiverisOmrAdapter(), [
      evidence(sample, 1, { preparedIndex: 0 }), evidence(sample, 2, { preparedIndex: 1, selected: true })
    ], 2, sample.workDir);

    expect(derived).toBeNull();
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  it("descarta uma preparação cujo conteúdo mudou depois do hash registrado", async () => {
    const sample = await makeFixture();
    const candidates = [
      evidence(sample, 1, { preparedIndex: 0 }), evidence(sample, 2, { preparedIndex: 1, selected: true })
    ];
    await fs.writeFile(sample.preparedPaths[0], "changed after its provenance hash was captured");

    const derived = await reconcile(new AudiverisOmrAdapter(), candidates, 2, sample.workDir);

    expect(derived).toBeNull();
    expect(readAnchorsMock).not.toHaveBeenCalled();
    expect(readIndependentMock).not.toHaveBeenCalled();
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  it("não chama o leitor em páginas acima do limite suportado", async () => {
    const sample = await makeFixture();

    const derived = await reconcile(new AudiverisOmrAdapter(), [
      evidence(sample, 1, { preparedIndex: 0 }), evidence(sample, 2, { preparedIndex: 1, selected: true })
    ], 2, sample.workDir, 4);

    expect(derived).toBeNull();
    expect(readAnchorsMock).not.toHaveBeenCalled();
    expect(readIndependentMock).not.toHaveBeenCalled();
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  it("não tenta reconciliar com três candidatos saudáveis", async () => {
    const sample = await makeFixture();

    const derived = await reconcile(new AudiverisOmrAdapter(), [
      evidence(sample, 1, { preparedIndex: 0 }),
      evidence(sample, 2, { preparedIndex: 1, selected: true }),
      evidence(sample, 3, { preparedIndex: 0, archiveIndex: 0 })
    ], 2, sample.workDir);

    expect(derived).toBeNull();
    expect(readAnchorsMock).not.toHaveBeenCalled();
    expect(readIndependentMock).not.toHaveBeenCalled();
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  it("retorna null quando não houve alteração automática", async () => {
    const sample = await makeFixture();
    reconcileMock.mockImplementation((input: { base: { sourceImageSha256: string } }) => result([], input.base.sourceImageSha256));

    const derived = await reconcile(new AudiverisOmrAdapter(), [
      evidence(sample, 1, { preparedIndex: 0 }), evidence(sample, 2, { preparedIndex: 1, selected: true })
    ], 2, sample.workDir);

    expect(derived).toBeNull();
    expect(reconcileMock).toHaveBeenCalledTimes(1);
    await expect(fs.access(path.join(sample.workDir, "automatic-reconciliation.json"))).resolves.toBeUndefined();
  });

  it("propaga cancelamento da conversão em vez de convertê-lo em ausência de reparo", async () => {
    const sample = await makeFixture();
    assertConversionActiveMock.mockImplementation(() => { throw new Error("conversion cancelled"); });

    await expect(reconcile(new AudiverisOmrAdapter(), [
      evidence(sample, 1, { preparedIndex: 0 }), evidence(sample, 2, { preparedIndex: 1, selected: true })
    ], 2, sample.workDir)).rejects.toThrow("conversion cancelled");
    expect(readIndependentMock).not.toHaveBeenCalled();
  });
});
