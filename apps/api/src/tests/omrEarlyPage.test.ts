import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScoreType } from "../domain.js";
import {
  AudiverisOmrAdapter,
  type OmrReadyPage,
  type OmrResult,
  type PreparedInputInspection
} from "../services/OmrAdapter.js";

type PageConfig = {
  contentRole?: "musical" | "nonmusical" | "uncertain";
  supportStatus?: "unsupported";
  failRecognition?: boolean;
};

type Fixture = {
  root: string;
  sourcePath: string;
  checkpointDirectory: string;
  runtimePath: string;
  adapter: AudiverisOmrAdapter;
  recognitionCalls: number[];
};

type AdapterInternals = {
  resolveAudiverisBin(): Promise<string>;
  convertPreparedPage(
    page: PreparedInputInspection["pages"][number],
    originalFilename: string,
    pageOutputDir: string,
    pageNumber: number,
    scoreType: ScoreType
  ): Promise<OmrResult>;
};

const sha256 = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");

function pageMusicXml(pageNumber: number): string {
  const step = pageNumber === 1 ? "C" : pageNumber === 2 ? "D" : "E";
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
  </measure></part>
</score-partwise>`;
}

async function makeFixture(pageConfigs: PageConfig[]): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "omr-early-page-"));
  const sourcePath = path.join(root, "source-score.pdf");
  const checkpointDirectory = path.join(root, "durable-checkpoints");
  const runtimeDirectory = path.join(root, "runtime");
  const runtimePath = path.join(runtimeDirectory, "fake-audiveris");
  await fs.writeFile(sourcePath, "synthetic score source", { mode: 0o600 });
  await fs.mkdir(runtimeDirectory, { recursive: true, mode: 0o700 });
  await fs.writeFile(runtimePath, "synthetic executable", { mode: 0o700 });
  await fs.chmod(runtimePath, 0o700);

  const adapter = new AudiverisOmrAdapter();
  const recognitionCalls: number[] = [];
  vi.spyOn(adapter, "inspectPages").mockImplementation(async (inputPath, outputDir) => {
    const sourceSHA256 = sha256(await fs.readFile(inputPath));
    const pages: PreparedInputInspection["pages"] = [];
    for (const [index, config] of pageConfigs.entries()) {
      const pageNumber = index + 1;
      const imagePath = path.join(outputDir, `prepared-page-${String(pageNumber).padStart(3, "0")}.png`);
      const imageBytes = `synthetic image bytes for page ${pageNumber}`;
      await fs.writeFile(imagePath, imageBytes, { mode: 0o600 });
      const contentRole = config.contentRole ?? "musical";
      pages.push({
        page: pageNumber,
        attempts: [{ paths: [imagePath], description: "synthetic prepared page" }],
        originalPath: imagePath,
        originalImagePath: imagePath,
        originalImageSHA256: sha256(imageBytes),
        contentRole,
        supportStatus: config.supportStatus,
        classification: contentRole === "nonmusical" ? {
          method: "verified_manual_v1",
          evidence: ["synthetic reviewed page"],
          decision: "nonmusical",
          reviewer: "test",
          reason: "synthetic non-musical page"
        } : {
          method: "staff_evidence_v1",
          evidence: ["synthetic musical page"]
        }
      });
    }
    return { sourcePath: inputPath, outputDir, sourceSHA256, warnings: [], pages };
  });

  const internals = adapter as unknown as AdapterInternals;
  internals.resolveAudiverisBin = async () => runtimePath;
  internals.convertPreparedPage = async (_page, _filename, _pageOutputDir, pageNumber) => {
    recognitionCalls.push(pageNumber);
    if (pageConfigs[pageNumber - 1]?.failRecognition) throw new Error(`synthetic failure on page ${pageNumber}`);
    return { musicXml: pageMusicXml(pageNumber), warnings: [`page ${pageNumber} recognized`] };
  };
  return { root, sourcePath, checkpointDirectory, runtimePath, adapter, recognitionCalls };
}

async function convert(fixture: Fixture, workDir: string, options: Parameters<AudiverisOmrAdapter["convert"]>[3] = {}): Promise<OmrResult> {
  await fs.mkdir(workDir, { recursive: true, mode: 0o700 });
  return fixture.adapter.convert(fixture.sourcePath, "synthetic-score.pdf", workDir, options);
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => vi.restoreAllMocks());

describe("Audiveris early page callback", () => {
  it("waits for each callback before advancing or returning the completed conversion", async () => {
    const fixture = await makeFixture([{}, {}]);
    const firstPageEntered = deferred();
    const allowFirstPage = deferred();
    const secondPageEntered = deferred();
    const allowSecondPage = deferred();
    const events: OmrReadyPage[] = [];
    let settled = false;
    try {
      const conversion = convert(fixture, path.join(fixture.root, "work"), {
        onPageReady: async (event) => {
          events.push(event);
          if (event.page === 1) {
            firstPageEntered.resolve();
            await allowFirstPage.promise;
          } else {
            secondPageEntered.resolve();
            await allowSecondPage.promise;
          }
        }
      });
      void conversion.then(() => { settled = true; }, () => { settled = true; });

      await firstPageEntered.promise;
      expect(fixture.recognitionCalls).toEqual([1]);
      expect(settled).toBe(false);
      expect(events[0]).toMatchObject({ page: 1, totalPages: 2, result: { musicXml: pageMusicXml(1) } });

      allowFirstPage.resolve();
      await secondPageEntered.promise;
      expect(fixture.recognitionCalls).toEqual([1, 2]);
      expect(settled).toBe(false);
      expect(events[1]).toMatchObject({ page: 2, totalPages: 2, result: { musicXml: pageMusicXml(2) } });

      allowSecondPage.resolve();
      const result = await conversion;
      expect(result.coverage?.processedPages).toEqual([1, 2]);
      expect(settled).toBe(true);
    } finally {
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("emits the same page event for a restored checkpoint", async () => {
    const fixture = await makeFixture([{}, {}]);
    const freshEvents: OmrReadyPage[] = [];
    const restoredEvents: OmrReadyPage[] = [];
    try {
      const fresh = await convert(fixture, path.join(fixture.root, "attempt-1"), {
        checkpointDirectory: fixture.checkpointDirectory,
        onPageReady: async (event) => { freshEvents.push(event); }
      });
      expect(freshEvents.map((event) => event.page)).toEqual([1, 2]);

      const resumed = await convert(fixture, path.join(fixture.root, "attempt-2"), {
        checkpointDirectory: fixture.checkpointDirectory,
        onPageReady: async (event) => { restoredEvents.push(event); }
      });

      expect(fixture.recognitionCalls).toEqual([1, 2]);
      expect(restoredEvents).toEqual(freshEvents);
      expect(restoredEvents.map((event) => [event.page, event.totalPages])).toEqual([[1, 2], [2, 2]]);
      expect(resumed.musicXml).toBe(fresh.musicXml);
      expect(resumed.coverage?.processedPages).toEqual([1, 2]);
    } finally {
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("does not emit for failed, unsupported, or manually excluded pages", async () => {
    const fixture = await makeFixture([
      { failRecognition: true },
      { supportStatus: "unsupported" },
      { contentRole: "nonmusical" },
      {}
    ]);
    const events: OmrReadyPage[] = [];
    try {
      const result = await convert(fixture, path.join(fixture.root, "work"), {
        onPageReady: async (event) => { events.push(event); }
      });

      expect(fixture.recognitionCalls).toEqual([1, 4]);
      expect(events.map((event) => event.page)).toEqual([4]);
      expect(events[0]).toMatchObject({ page: 4, totalPages: 4, result: { musicXml: pageMusicXml(4) } });
      expect(result.coverage).toMatchObject({ processedPages: [4], missingPages: [1, 2], excludedPages: [3], unsupportedPages: [2] });
    } finally {
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("propagates callback rejection and stops before recognizing the next page", async () => {
    const fixture = await makeFixture([{}, {}]);
    const rejected = new Error("page publication rejected");
    try {
      await expect(convert(fixture, path.join(fixture.root, "work"), {
        onPageReady: async (event) => {
          if (event.page === 1) throw rejected;
        }
      })).rejects.toBe(rejected);

      expect(fixture.recognitionCalls).toEqual([1]);
    } finally {
      await fs.rm(fixture.root, { recursive: true, force: true });
    }
  });
});
