import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TemporaryFileCleanupService } from "../services/TemporaryFileCleanupService.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("TemporaryFileCleanupService", () => {
  it("remove somente temporários antigos pertencentes ao app", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "temp-cleanup-test-"));
    roots.push(root);
    const oldOmr = path.join(root, "score-omr-old");
    const oldPreview = path.join(root, "score-preview-old");
    const freshScan = path.join(root, "score-upload-scan-fresh");
    const unrelated = path.join(root, "other-app-old");
    await Promise.all([oldOmr, oldPreview, freshScan, unrelated].map((dir) => fs.mkdir(dir)));

    const now = Date.UTC(2026, 6, 28, 12);
    const old = new Date(now - 25 * 60 * 60 * 1000);
    const fresh = new Date(now - 30 * 60 * 1000);
    await Promise.all([
      fs.utimes(oldOmr, old, old),
      fs.utimes(oldPreview, old, old),
      fs.utimes(unrelated, old, old),
      fs.utimes(freshScan, fresh, fresh)
    ]);

    const deleted = await new TemporaryFileCleanupService(root, 24).cleanupStaleDirectories(now);

    expect(deleted).toBe(2);
    await expect(fs.stat(oldOmr)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(oldPreview)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(freshScan)).resolves.toBeDefined();
    await expect(fs.stat(unrelated)).resolves.toBeDefined();
  });
});
