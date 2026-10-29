import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { ConversionPreview } from "../domain.js";
import { AppError } from "../errors/AppError.js";
import { env } from "../config/env.js";

const maxPreviewBytes = 8 * 1024 * 1024;
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Short-lived notation, separate from the immutable final export history. */
export class FirstPagePreviewStorage {
  constructor(private readonly uploadPath: string) {}

  async save(attemptId: string, totalPages: number, musicXml: string, warnings: string[]): Promise<ConversionPreview> {
    const bytes = Buffer.from(musicXml, "utf8");
    if (!bytes.length || bytes.length > maxPreviewBytes) throw new AppError(422, "A prévia excede o tamanho disponível.", "FIRST_PAGE_PREVIEW_TOO_LARGE");
    const revision = createHash("sha256").update(randomBytes(32)).update(bytes).digest("hex");
    const directory = await this.directory(true);
    await this.cleanupExpired(directory);
    const filename = this.filename(directory, revision);
    const handle = await fs.open(filename, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } catch (error) {
      await fs.rm(filename, { force: true }).catch(() => undefined);
      throw error;
    } finally { await handle.close(); }
    return { attemptId, revision, page: 1, totalPages, createdAt: new Date().toISOString(),
      xmlSHA256: digest(bytes), warnings: warnings.slice(0, 20).map((warning) => warning.slice(0, 2000)) };
  }

  async read(preview: ConversionPreview): Promise<Buffer> {
    const filename = this.filename(await this.directory(false), preview.revision);
    const handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const details = await handle.stat();
      if (!details.isFile() || details.size < 1 || details.size > maxPreviewBytes) throw new Error("Invalid preview file.");
      const bytes = await handle.readFile();
      if (bytes.length > maxPreviewBytes || digest(bytes) !== preview.xmlSHA256) throw new Error("Preview integrity changed.");
      return bytes;
    } finally { await handle.close(); }
  }

  async delete(preview: ConversionPreview): Promise<void> {
    const directory = await this.directory(false);
    await fs.rm(this.filename(directory, preview.revision), { force: true });
  }

  private filename(directory: string, revision: string): string {
    if (!/^[a-f0-9]{64}$/.test(revision)) throw new Error("Invalid preview revision.");
    return path.join(directory, `${revision}.musicxml`);
  }

  private async cleanupExpired(directory: string): Promise<void> {
    // A killed worker cannot run finally. Reclaim only our own immutable
    // preview files after the entire conversion budget plus recovery grace;
    // an active publication is always younger than this interval.
    const before = Date.now() - Math.max(60 * 60 * 1000, env.OMR_CONVERSION_TIMEOUT_MS + 60_000);
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !/^[a-f0-9]{64}\.musicxml$/.test(entry.name)) continue;
      const filename = path.join(directory, entry.name);
      try {
        const details = await fs.lstat(filename);
        if (details.isFile() && !details.isSymbolicLink() && details.mtimeMs < before) await fs.rm(filename, { force: true });
      } catch { /* Concurrent finalization can already have removed this revision. */ }
    }
  }

  private async directory(create: boolean): Promise<string> {
    const original = await fs.lstat(this.uploadPath);
    if (!original.isFile() || original.isSymbolicLink()) throw new Error("Preview original is unavailable.");
    const base = await fs.realpath(path.dirname(this.uploadPath));
    const directory = path.join(base, `${path.basename(this.uploadPath)}.previews`);
    if (create) await fs.mkdir(directory, { recursive: false, mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    const details = await fs.lstat(directory);
    if (!details.isDirectory() || details.isSymbolicLink() || await fs.realpath(directory) !== directory) throw new Error("Unsafe preview directory.");
    return directory;
  }
}
