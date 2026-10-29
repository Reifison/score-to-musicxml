import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import type { PageClassification, PageContentRole } from "../domain.js";
import { AppError } from "../errors/AppError.js";
import { analyzeSourceImageLayout, type SourceStaffLayout } from "./SourceImageLayout.js";

export type VerifiedPageDecision = {
  page: number;
  role: "musical" | "nonmusical";
  support?: "unsupported";
  sourceSHA256: string;
  originalImageSHA256: string;
  reviewer: string;
  reason: string;
};

export type PageContentAssessment = {
  role: PageContentRole;
  classification: PageClassification & { sourceLayout?: SourceStaffLayout };
  supportStatus?: "unsupported";
};

export async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

export function validatePageDecisions(decisions: VerifiedPageDecision[] | undefined, totalPages: number): void {
  if (!decisions) return;
  const seen = new Set<number>();
  for (const item of decisions) {
    if (!Number.isInteger(item.page) || item.page < 1 || item.page > totalPages || seen.has(item.page)
      || !["musical", "nonmusical"].includes(item.role)
      || (item.support !== undefined && (item.support !== "unsupported" || item.role !== "musical"))
      || !/^[a-f0-9]{64}$/.test(item.sourceSHA256)
      || !/^[a-f0-9]{64}$/.test(item.originalImageSHA256)
      || typeof item.reviewer !== "string" || !item.reviewer.trim()
      || typeof item.reason !== "string" || !item.reason.trim()) {
      throw new AppError(422, "Decisão de página incompleta ou inválida.", "PAGE_DECISION_INVALID");
    }
    seen.add(item.page);
  }
}

export async function classifyPageContent(
  sourcePath: string,
  originalImagePath: string,
  decision?: VerifiedPageDecision,
  sourceSHA256?: string
): Promise<PageContentAssessment> {
  let analysis: Awaited<ReturnType<typeof analyzeSourceImageLayout>> | null = null;
  try { analysis = await analyzeSourceImageLayout(originalImagePath); } catch { /* The image stays uncertain unless a musical decision is verified. */ }
  const sourceLayout = analysis?.layout ?? {
    method: "horizontal_staff_bands_v1" as const,
    status: "unknown" as const,
    width: 0,
    height: 0,
    staffBands: [],
    evidence: ["source_image_analysis_unavailable"],
    limitations: [
      "As faixas são observações geométricas de cinco linhas horizontais longas; a evidência inclinada não fornece coordenadas originais nem confirma conteúdo musical.",
      "A detecção não agrupa pautas em sistemas nem infere compassos, partes ou barras.",
      "Pautas curvas, fracas, cortadas ou inclinadas podem não ser detectadas.",
      "Tabelas, grades e linhas de tablatura podem produzir geometria semelhante."
    ]
  };
  const hasStaff = sourceLayout.status === "observed";
  const hasSkewStaff = Boolean(sourceLayout.positiveSkewEvidence && sourceLayout.positiveSkewEvidence.staffLineCount >= 5);
  if (decision) {
    let actualSourceSHA256: string;
    let actualImageSHA256: string;
    try {
      actualSourceSHA256 = sourceSHA256 ?? await sha256File(sourcePath);
      actualImageSHA256 = await sha256File(originalImagePath);
    } catch {
      throw new AppError(422, "Não foi possível verificar os arquivos da decisão de página.", "PAGE_DECISION_SOURCE_UNAVAILABLE");
    }
    if (decision.sourceSHA256 !== actualSourceSHA256 || decision.originalImageSHA256 !== actualImageSHA256) {
      throw new AppError(422, "A decisão de página não corresponde ao arquivo e à imagem originais.", "PAGE_DECISION_HASH_MISMATCH");
    }
    if (decision.role === "nonmusical" && !analysis) {
      throw new AppError(422, "A imagem original não pôde ser inspecionada para excluir a página.", "PAGE_DECISION_IMAGE_UNAVAILABLE");
    }
    if (decision.role === "nonmusical" && (hasStaff || hasSkewStaff)) {
      throw new AppError(422, "A página contém evidência de pauta; revise antes de excluí-la.", "PAGE_DECISION_CONFLICT");
    }
    return { role: decision.role, ...(decision.support ? { supportStatus: decision.support } : {}), classification: {
      method: "verified_manual_v1", evidence: ["source_and_original_image_hashes_match"], decision: decision.role,
      reviewer: decision.reviewer, reason: decision.reason,
      sourceSHA256: actualSourceSHA256, originalImageSHA256: actualImageSHA256, sourceLayout
    } };
  }
  if (analysis) {
    if (hasStaff || hasSkewStaff) {
      const evidence = hasStaff
        ? ["five_horizontal_staff_lines"]
        : [`five_skewed_staff_lines:${sourceLayout.positiveSkewEvidence!.angleDegrees}deg`];
      return { role: "musical", classification: { method: "staff_evidence_v1", evidence, sourceLayout } };
    }
    return { role: "uncertain", classification: { method: "staff_evidence_v1", evidence: [
      "no_strong_staff_evidence;not_proof_of_nonmusical",
      analysis.darkPixelRatio < 0.002 ? "possible_blank" : "possible_text_or_cover"
    ], sourceLayout } };
  }
  return { role: "uncertain", classification: { method: "unavailable", evidence: ["original_image_analysis_unavailable"], sourceLayout } };
}
