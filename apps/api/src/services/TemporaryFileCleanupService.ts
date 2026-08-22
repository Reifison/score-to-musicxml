import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "../config/env.js";

const APP_TEMP_PREFIXES = [
  "score-omr-",
  "score-preview-",
  "score-upload-scan-"
] as const;

export class TemporaryFileCleanupService {
  constructor(
    private readonly tempRoot = os.tmpdir(),
    private readonly retentionHours = env.TEMP_FILE_RETENTION_HOURS
  ) {}

  async cleanupStaleDirectories(now = Date.now()): Promise<number> {
    const cutoff = now - this.retentionHours * 60 * 60 * 1000;
    let entries;
    try {
      entries = await fs.readdir(this.tempRoot, { withFileTypes: true });
    } catch {
      return 0;
    }

    let deleted = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() || !APP_TEMP_PREFIXES.some((prefix) => entry.name.startsWith(prefix))) continue;

      const candidate = path.resolve(this.tempRoot, entry.name);
      const root = path.resolve(this.tempRoot);
      if (!candidate.startsWith(`${root}${path.sep}`)) continue;

      try {
        const stats = await fs.lstat(candidate);
        if (stats.isSymbolicLink() || stats.mtimeMs >= cutoff) continue;
        await fs.rm(candidate, { recursive: true, force: true });
        deleted += 1;
      } catch {
        // A concurrent job may have removed the directory after readdir().
      }
    }
    return deleted;
  }
}
