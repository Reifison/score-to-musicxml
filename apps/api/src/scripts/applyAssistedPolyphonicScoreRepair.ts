import fs from "node:fs/promises";
import path from "node:path";
import { applyAssistedPolyphonicRepairPlan, createAssistedPolyphonicRepairPlan } from "../services/AssistedPolyphonicScoreRepair.js";
import { inspectMusicXmlValidation } from "../services/MusicXmlValidation.js";

const usage = "Uso: node --import tsx apps/api/src/scripts/applyAssistedPolyphonicScoreRepair.ts <fonte> <base.musicxml> <revisao-assistida.musicxml> <nova-pasta-de-saida>";

async function readBounded(filename: string, maximum: number): Promise<Buffer> {
  const info = await fs.lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > maximum) {
    throw new Error("Entrada inválida ou acima do limite.");
  }
  const bytes = await fs.readFile(filename);
  if (bytes.length !== info.size) throw new Error("A entrada mudou durante a leitura.");
  return bytes;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 4) throw new Error(usage);
  const [sourcePath, basePath, reviewedPath, outputDir] = args.map((argument) => path.resolve(argument));
  const [sourceBytes, baseBytes, reviewedBytes] = await Promise.all([
    readBounded(sourcePath, 32 * 1024 * 1024),
    readBounded(basePath, 16 * 1024 * 1024),
    readBounded(reviewedPath, 16 * 1024 * 1024)
  ]);
  const baseXml = baseBytes.toString("utf8");
  const plan = createAssistedPolyphonicRepairPlan({ sourceBytes, baseXml, reviewedXml: reviewedBytes.toString("utf8") });
  const result = applyAssistedPolyphonicRepairPlan({ sourceBytes, baseXml, plan });
  const validation = inspectMusicXmlValidation(result.musicXml, { scope: "page" });
  if (validation.issues.some((issue) => issue.severity === "error")) {
    throw new Error("A revisão falhou na validação estrutural; nenhum arquivo foi gravado.");
  }
  // This explicit command creates a fresh artifact; it is never called by OMR or the API routes.
  await fs.mkdir(outputDir, { mode: 0o700 });
  await fs.writeFile(path.join(outputDir, "plano-assistido.json"), JSON.stringify(plan, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  await fs.writeFile(path.join(outputDir, "proposta.musicxml"), result.musicXml, { mode: 0o600, flag: "wx" });
  await fs.writeFile(path.join(outputDir, "auditoria.json"), JSON.stringify({
    ...result, musicXml: undefined, validation, published: false, automaticOmrImprovement: false
  }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  process.stdout.write(JSON.stringify({ outputDir, sourceSha256: plan.sourceSha256,
    baseXmlSha256: plan.baseXmlSha256, outputXmlSha256: result.provenance.outputXmlSha256,
    operations: result.history.length, eventsBefore: result.inventory.before.events,
    eventsAfter: result.inventory.after.events, gracesAfter: result.inventory.after.graces,
    requiresReview: true, accuracyVerified: false, automaticOmrImprovement: false }) + "\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Não foi possível aplicar a revisão assistida."}\n`);
  process.exitCode = 1;
});
