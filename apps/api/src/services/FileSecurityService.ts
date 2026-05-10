import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";

const execFileAsync = promisify(execFile);
const eicarPattern = /X5O!P%@AP\[4\\PZX54\(P\^\)7CC\)7}\$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!\$H\+H\*/;
const activePdfContentPattern = /\/(?:JavaScript|JS|OpenAction|AA|Launch)\b/i;

export class FileSecurityService {
  async scan(buffer: Buffer, originalFilename: string): Promise<void> {
    this.heuristicScan(buffer);
    if (env.CLAMAV_BIN) {
      await this.scanWithClamAv(buffer, originalFilename);
      return;
    }
    if (env.REQUIRE_MALWARE_SCAN) {
      throw new AppError(503, "Varredura de segurança indisponível. Tente novamente mais tarde.", "MALWARE_SCAN_UNAVAILABLE");
    }
  }

  async stripImageMetadata(buffer: Buffer, mimeType: string): Promise<Buffer> {
    if (!mimeType.startsWith("image/")) return buffer;
    try {
      return await sharp(buffer, { failOn: "truncated", limitInputPixels: 50_000_000 })
        .rotate()
        .toBuffer();
    } catch {
      throw new AppError(400, "Imagem inválida ou corrompida.", "INVALID_IMAGE");
    }
  }

  private heuristicScan(buffer: Buffer): void {
    const sample = buffer.subarray(0, Math.min(buffer.length, 1024 * 1024)).toString("latin1");
    if (eicarPattern.test(sample)) {
      throw new AppError(400, "Arquivo rejeitado pela varredura de segurança.", "MALWARE_DETECTED");
    }
    if (buffer.subarray(0, 4).toString("utf8") === "%PDF" && activePdfContentPattern.test(sample)) {
      throw new AppError(400, "PDF com conteúdo ativo não é permitido.", "ACTIVE_PDF_CONTENT_BLOCKED");
    }
  }

  private async scanWithClamAv(buffer: Buffer, originalFilename: string): Promise<void> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "score-upload-scan-"));
    const filePath = path.join(dir, path.basename(originalFilename || "upload.bin"));
    try {
      await fs.writeFile(filePath, buffer, { mode: 0o600 });
      await execFileAsync(env.CLAMAV_BIN!, ["--no-summary", "--infected", filePath], { timeout: 30_000 });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === 1) {
        throw new AppError(400, "Arquivo rejeitado pela varredura de segurança.", "MALWARE_DETECTED");
      }
      throw new AppError(503, "Varredura de segurança falhou. Tente novamente mais tarde.", "MALWARE_SCAN_FAILED");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
}
