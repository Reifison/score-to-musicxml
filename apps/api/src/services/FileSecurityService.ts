import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFStream, type PDFObject } from "pdf-lib";
import sharp from "sharp";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";

const execFileAsync = promisify(execFile);
const eicarPattern = /X5O!P%@AP\[4\\PZX54\(P\^\)7CC\)7}\$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!\$H\+H\*/;
const executableActionNames = new Set(["JavaScript", "Launch", "SubmitForm", "ImportData", "GoToR", "GoToE"]);
const activePdfKeys = new Set(["JS", "JavaScript", "EmbeddedFiles", "RichMediaContent", "XFA"]);
const activeAnnotationSubtypes = new Set(["RichMedia", "Movie", "Sound", "3D"]);

function hasActivePdfContent(document: PDFDocument): boolean {
  const visited = new Set<PDFObject>();
  const inspect = (object: PDFObject | undefined): boolean => {
    if (!object || visited.has(object)) return false;
    visited.add(object);

    if (object instanceof PDFStream) return inspect(object.dict);
    if (object instanceof PDFArray) return object.asArray().some(inspect);
    if (!(object instanceof PDFDict)) return false;

    for (const [key, value] of object.entries()) {
      const keyName = key.decodeText();
      if (activePdfKeys.has(keyName)) return true;
      if (value instanceof PDFName) {
        const valueName = value.decodeText();
        if (keyName === "S" && executableActionNames.has(valueName)) return true;
        if ((keyName === "Subtype" || keyName === "Type") && activeAnnotationSubtypes.has(valueName)) return true;
      }
      if (inspect(value)) return true;
    }
    return false;
  };

  return document.context.enumerateIndirectObjects().some(([, object]) => inspect(object));
}

export class FileSecurityService {
  async scan(buffer: Buffer, originalFilename: string): Promise<void> {
    await this.heuristicScan(buffer);
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

  private async heuristicScan(buffer: Buffer): Promise<void> {
    const sample = buffer.subarray(0, Math.min(buffer.length, 1024 * 1024)).toString("latin1");
    if (eicarPattern.test(sample)) {
      throw new AppError(400, "Arquivo rejeitado pela varredura de segurança.", "MALWARE_DETECTED");
    }
    if (buffer.subarray(0, 4).toString("utf8") === "%PDF") {
      let document: PDFDocument;
      try {
        document = await PDFDocument.load(buffer, {
          ignoreEncryption: false,
          throwOnInvalidObject: true,
          updateMetadata: false
        });
      } catch {
        throw new AppError(400, "PDF inválido, corrompido ou protegido por senha.", "INVALID_PDF");
      }
      if (hasActivePdfContent(document)) {
        throw new AppError(400, "PDF com conteúdo ativo não é permitido.", "ACTIVE_PDF_CONTENT_BLOCKED");
      }
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
