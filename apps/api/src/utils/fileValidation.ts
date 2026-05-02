import { AppError } from "../errors/AppError.js";
import { extensionOf, sanitizeOriginalFilename } from "./filenames.js";

export type DetectedFile = {
  extension: "pdf" | "png" | "jpg" | "jpeg" | "webp";
  mimeType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
  fileType: "pdf" | "image";
};

const allowedExtensions = new Set(["pdf", "png", "jpg", "jpeg", "webp"]);

export function detectFile(buffer: Buffer): DetectedFile | null {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("utf8") === "%PDF") {
    return { extension: "pdf", mimeType: "application/pdf", fileType: "pdf" };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: "png", mimeType: "image/png", fileType: "image" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: "jpg", mimeType: "image/jpeg", fileType: "image" };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return { extension: "webp", mimeType: "image/webp", fileType: "image" };
  }
  return null;
}

export function validateUploadedFile(filename: string, buffer: Buffer, maxBytes: number): DetectedFile & { originalFilename: string } {
  if (!buffer.length) throw new AppError(400, "Envie um arquivo válido.", "EMPTY_FILE");
  if (buffer.length > maxBytes) throw new AppError(413, "Arquivo acima do tamanho máximo permitido.", "FILE_TOO_LARGE");

  const originalFilename = sanitizeOriginalFilename(filename);
  const extension = extensionOf(originalFilename);
  if (!allowedExtensions.has(extension)) {
    throw new AppError(400, "Formato não permitido. Use PDF, PNG, JPG, JPEG ou WEBP.", "INVALID_EXTENSION");
  }

  const detected = detectFile(buffer);
  if (!detected) {
    throw new AppError(400, "O conteúdo do arquivo não corresponde a um PDF ou imagem válida.", "INVALID_MIME");
  }

  const extensionMatches = detected.extension === extension || (detected.extension === "jpg" && extension === "jpeg");
  if (!extensionMatches) {
    throw new AppError(400, "A extensão não corresponde ao tipo real do arquivo.", "MIME_EXTENSION_MISMATCH");
  }

  return { ...detected, originalFilename };
}
