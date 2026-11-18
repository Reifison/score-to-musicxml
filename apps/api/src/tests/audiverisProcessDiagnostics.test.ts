import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AppError } from "../errors/AppError.js";
import { inspectAudiverisProcessOutput, redactedAudiverisProcessLog } from "../services/AudiverisProcessDiagnostics.js";
import { AudiverisOmrAdapter } from "../services/OmrAdapter.js";
import { inspectMusicXmlValidation } from "../services/MusicXmlValidation.js";

describe("Audiveris export diagnostics", () => {
  it("detects a partial export even when the engine announces success", () => {
    // Observed on 5.11.0: the native project had 37 measures, the export 33.
    const log = 'WARN [source] PartwiseBuilder 2229 | Error visiting Measure{#8} in {Page#1.1}\n'
      + 'java.lang.NullPointerException: because "w1.timeOffset" is null\n'
      + 'INFO [source] ScoreExporter 164 | Score source exported to /private/score.mxl';
    expect(inspectAudiverisProcessOutput(log).exportIncomplete).toBe(true);
  });

  it("rejects a failed musical-sign visitor and persists only anonymous flags", () => {
    const log = 'WARN [private-score] PartwiseBuilder | Error visiting FermataInter#540 in /private/customer/file.png\n'
      + 'INFO MeasureRhythm | No timeOffset for RestChordInter#123\nOCR: private customer heading';
    const redacted = redactedAudiverisProcessLog(log);
    expect(redacted).not.toMatch(/private|customer|file\.png|FermataInter|ChordInter|OCR/);
    expect(inspectAudiverisProcessOutput(redacted)).toEqual(inspectAudiverisProcessOutput(log));
    expect(inspectAudiverisProcessOutput(redacted).exportIncomplete).toBe(true);
  });

  it("does not mistake an unresolved rhythm or an OCR warning for a failed export", () => {
    const result = inspectAudiverisProcessOutput('INFO [source] MeasureRhythm 1044 | Measure{#3} No timeOffset for HeadChordInter#3908\n'
      + 'INFO [source] StackRhythm 224 | S1 MeasureStack#3 no correct rhythm\n'
      + 'WARN [] Languages | No installed OCR languages');
    expect(result.exportIncomplete).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ code: "OMR_RHYTHM_UNRESOLVED", severity: "warning" });
    expect(result.issues[0]).not.toHaveProperty("measure");
    expect(JSON.stringify(result.issues)).not.toContain("ChordInter");
  });

  it("never recovers a rejected partial export through the generic process-error fallback", async () => {
    const adapter = new AudiverisOmrAdapter() as unknown as {
      runAudiveris(input: string, output: string): Promise<void>;
      findExportedMusicXml(output: string): Promise<string>;
      convertPage(input: string, filename: string, output: string): Promise<unknown>;
    };
    let readExport = false;
    adapter.runAudiveris = async () => { throw new AppError(422, "Incomplete", "AUDIVERIS_EXPORT_INCOMPLETE"); };
    adapter.findExportedMusicXml = async () => { readExport = true; return "/tmp/partial.xml"; };
    await expect(adapter.convertPage("/tmp/source.png", "score.pdf", "/tmp/output"))
      .rejects.toMatchObject({ code: "AUDIVERIS_EXPORT_INCOMPLETE" });
    expect(readExport).toBe(false);
  });

  it("preserves a rejected candidate as evidence while delivering the healthy one", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "audiveris-export-guard-"));
    const xml = '<score-partwise><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>'
      + '<part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>'
      + '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>';
    const adapter = new AudiverisOmrAdapter() as unknown as {
      resolveAudiverisBin(): Promise<string>;
      preprocessInput(): Promise<unknown>;
      convertPage(input: string, filename: string, output: string): Promise<unknown>;
      convert(input: string, filename: string, output: string): Promise<{ musicXml: string;
        evidence: Array<{ selected: boolean; reason: string; xml: string }>;
        validation: { issues: Array<{ code: string }> } }>;
    };
    try {
      const raw = path.join(dir, "raw.png");
      const alternative = path.join(dir, "alternative.png");
      await Promise.all([fs.writeFile(raw, "original"), fs.writeFile(alternative, "alternative")]);
      adapter.resolveAudiverisBin = async () => "/tmp/Audiveris";
      adapter.preprocessInput = async () => ({ pages: [{ attempts: [
        { paths: [raw], description: "original" }, { paths: [alternative], description: "alternative" }
      ] }], warnings: [] });
      adapter.convertPage = async (input, _filename, output) => {
        if (input === raw) return { musicXml: xml, warnings: [], validation: { ...inspectMusicXmlValidation(xml),
          issues: inspectAudiverisProcessOutput('INFO MeasureRhythm | No timeOffset for RestChordInter#123').issues } };
        await fs.writeFile(path.join(output, "partial.xml"), xml);
        throw new AppError(422, "Incomplete", "AUDIVERIS_EXPORT_INCOMPLETE");
      };
      const result = await adapter.convert(raw, "score.png", dir);
      expect(result.musicXml).toContain("<duration>4</duration>");
      expect(result.evidence.map((item) => item.selected)).toEqual([true, false]);
      expect(result.evidence[1].reason).toContain("falha ao exportar compassos");
      expect(result.validation.issues.map((issue) => issue.code)).toContain("CANDIDATE_EXPORT_REJECTION");
      expect(result.validation.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "OMR_RHYTHM_UNRESOLVED", page: 1 })
      ]));
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
});
