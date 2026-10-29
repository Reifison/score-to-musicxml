import { createHash } from "node:crypto";
import type { ConversionAttempt, ConversionCoverage, Score } from "../domain.js";
import { AppError } from "../errors/AppError.js";
import { FileStorageService } from "./FileStorageService.js";
import { reviewRevision } from "./MusicalReview.js";

export type ScoreVersion = {
  id: string;
  label: string;
  createdAt: string;
  kind: "conversion" | "correction";
  revision: string | null;
  isCurrent: boolean;
  status: "complete" | "partial" | "needs_review" | "approved" | "unverified";
  coverage: { totalPages: number; processedPages: number; missingPages: number[] } | null;
  available: boolean;
  attemptId?: string;
};

type Manifest = {
  createdAt?: unknown;
  revision?: unknown;
  outputSha256?: unknown;
  parentExportFilename?: unknown;
  coverage?: unknown;
};
type VersionRecord = { version: ScoreVersion; filename: string; expectedSha256: string | null };

const hashPattern = /^[a-f0-9]{64}$/;
const versionIdPattern = /^(?:attempt:[A-Za-z0-9_-]{1,128}|revision:[a-f0-9]{64})$/;

function coverageSummary(value: unknown): ScoreVersion["coverage"] {
  const coverage = value as ConversionCoverage | null | undefined;
  if (!coverage || !Number.isSafeInteger(coverage.totalPages) || !Array.isArray(coverage.processedPages)
    || !Array.isArray(coverage.missingPages)) return null;
  return { totalPages: coverage.totalPages, processedPages: coverage.processedPages.length, missingPages: coverage.missingPages };
}

function validFilename(scoreId: string, filename: unknown): filename is string {
  return typeof filename === "string" && filename.startsWith(`${scoreId}-`)
    && /^[A-Za-z0-9_-]+-[A-Za-z0-9_-]{12}\.musicxml$/.test(filename);
}

function timestamp(value: unknown, fallback: Date): string {
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return fallback.toISOString();
}

/** Builds a read-only view over immutable exports and their evidence ancestry. */
export class ScoreVersionHistoryService {
  constructor(private storage: FileStorageService) {}

  private async records(score: Score, attempts: ConversionAttempt[]): Promise<VersionRecord[]> {
    const byFilename = new Map<string, VersionRecord>();
    const attemptsByFilename = new Map(attempts.filter((item) => validFilename(score.id, item.musicxmlFilename))
      .map((item) => [item.musicxmlFilename!, item]));
    const correctionTimes = new Map((score.validation?.visualReview?.history ?? [])
      .filter((item) => validFilename(score.id, item.exportFilename))
      .map((item) => [item.exportFilename!, item.at]));
    const discovered = new Set<string>();
    const inspect = async (filename: string): Promise<Manifest | null> => {
      try { return await this.storage.readConversionEvidence(filename) as Manifest; }
      catch { return null; }
    };

    // Start with persisted attempts, then follow the current export's parent links.
    // The chain survives a retry even when the score's current visualReview.history is replaced.
    const queue = [score.musicxmlFilename, ...attempts.map((item) => item.musicxmlFilename),
      ...(score.validation?.visualReview?.history ?? []).flatMap((item) => [item.exportFilename, item.previousExportFilename])];
    for (let index = 0; index < queue.length && discovered.size < 10000; index++) {
      const filename = queue[index];
      if (!validFilename(score.id, filename) || discovered.has(filename)) continue;
      discovered.add(filename);
      const manifest = await inspect(filename);
      if (manifest && validFilename(score.id, manifest.parentExportFilename)) queue.push(manifest.parentExportFilename);
      const attempt = attemptsByFilename.get(filename);
      const isCurrent = filename === score.musicxmlFilename;
      const revision = typeof manifest?.revision === "string" && hashPattern.test(manifest.revision) ? manifest.revision
        : isCurrent && score.reviewRevision && hashPattern.test(score.reviewRevision) ? score.reviewRevision
          : score.validation?.visualReview?.history.find((item) => item.exportFilename === filename)?.revision ?? null;
      if (!attempt && (!revision || !hashPattern.test(revision))) continue;
      const status = isCurrent && score.reviewStatus === "approved" ? "approved"
        : attempt?.status === "complete" || attempt?.status === "partial" ? attempt.status
          : "needs_review";
      const createdAt = attempt ? timestamp(attempt.finishedAt?.toISOString(), attempt.createdAt)
        : timestamp(manifest?.createdAt ?? correctionTimes.get(filename), score.updatedAt);
      const version: ScoreVersion = {
        id: attempt ? `attempt:${attempt.id}` : `revision:${revision}`,
        label: attempt ? attempt.kind === "initial" ? "Conversão inicial" : attempt.kind === "automatic" ? "Nova tentativa automática" : "Nova conversão"
          : "Correção visual",
        createdAt,
        kind: attempt ? "conversion" : "correction",
        revision,
        isCurrent,
        status,
        coverage: coverageSummary(attempt?.coverage ?? manifest?.coverage ?? (isCurrent ? score.coverage : null)),
        // An export without a recorded revision cannot be checked for immutability.
        available: Boolean(revision) && await this.storage.isExportAvailable(filename),
        ...(attempt ? { attemptId: attempt.id } : {})
      };
      byFilename.set(filename, { version, filename,
        expectedSha256: typeof manifest?.outputSha256 === "string" && hashPattern.test(manifest.outputSha256) ? manifest.outputSha256 : null });
    }
    return [...byFilename.values()].sort((a, b) => b.version.createdAt.localeCompare(a.version.createdAt) || b.version.id.localeCompare(a.version.id));
  }

  async list(score: Score, attempts: ConversionAttempt[]): Promise<ScoreVersion[]> {
    return (await this.records(score, attempts)).map((item) => item.version);
  }

  async musicXml(score: Score, attempts: ConversionAttempt[], versionId: string): Promise<Buffer> {
    if (!versionIdPattern.test(versionId)) throw new AppError(404, "Versão não encontrada.", "SCORE_VERSION_NOT_FOUND");
    const record = (await this.records(score, attempts)).find((item) => item.version.id === versionId);
    if (!record) throw new AppError(404, "Versão não encontrada.", "SCORE_VERSION_NOT_FOUND");
    if (!record.version.available) throw new AppError(410, "O arquivo desta versão não está disponível.", "SCORE_VERSION_UNAVAILABLE");
    let musicXml: Buffer;
    try { musicXml = await this.storage.readExportForDownload(record.filename); }
    catch { throw new AppError(410, "O arquivo desta versão não está disponível.", "SCORE_VERSION_UNAVAILABLE"); }
    const sha = createHash("sha256").update(musicXml).digest("hex");
    if ((record.expectedSha256 && sha !== record.expectedSha256)
      || (record.version.revision && reviewRevision(record.filename, musicXml.toString("utf8")) !== record.version.revision)) {
      throw new AppError(410, "O conteúdo desta versão mudou e não pode ser enviado.", "SCORE_VERSION_CHANGED");
    }
    return musicXml;
  }
}
