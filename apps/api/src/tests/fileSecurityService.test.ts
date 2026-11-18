import { PDFDocument, PDFHexString, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { FileSecurityService } from "../services/FileSecurityService.js";

async function pdfWithRegisteredStream(contents: string): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.addPage();
  document.context.register(document.context.flateStream(contents));
  return Buffer.from(await document.save({ useObjectStreams: false }));
}

async function pdfWithAction(actionName: "JavaScript" | "Launch"): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.addPage();
  const action = document.context.obj({
    S: PDFName.of(actionName),
    ...(actionName === "JavaScript" ? { JS: PDFHexString.fromText("app.alert('teste')") } : { F: PDFHexString.fromText("arquivo") })
  });
  document.catalog.set(PDFName.of("OpenAction"), document.context.register(action));
  return Buffer.from(await document.save({ useObjectStreams: false }));
}

describe("FileSecurityService", () => {
  it("ignora palavras reservadas dentro de um stream comprimido inofensivo", async () => {
    const service = new FileSecurityService();
    const pdf = await pdfWithRegisteredStream("dados de imagem /JS /JavaScript /OpenAction /AA /Launch");
    await expect(service.scan(pdf, "partitura.pdf")).resolves.toBeUndefined();
  });

  it("bloqueia uma ação JavaScript estrutural", async () => {
    const service = new FileSecurityService();
    await expect(service.scan(await pdfWithAction("JavaScript"), "ativo.pdf"))
      .rejects.toMatchObject({ statusCode: 400, code: "ACTIVE_PDF_CONTENT_BLOCKED" });
  });

  it("bloqueia uma ação Launch estrutural", async () => {
    const service = new FileSecurityService();
    await expect(service.scan(await pdfWithAction("Launch"), "ativo.pdf"))
      .rejects.toMatchObject({ statusCode: 400, code: "ACTIVE_PDF_CONTENT_BLOCKED" });
  });
});
