import fs from "node:fs/promises";
import path from "node:path";
import { applyAssistedNotationRepair, type AssistedNotationRepairPlan } from "../services/AssistedNotationRepair.js";
import { inspectMusicXmlValidation } from "../services/MusicXmlValidation.js";
import { MidiExportService } from "../services/MidiExportService.js";

const usage = "Uso: npm run repair:assisted -w apps/api -- <fonte> <base.musicxml> <plano.json> <nova-pasta-de-saida>";

async function readBounded(filename: string, limit: number): Promise<Buffer> {
  const info = await fs.lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size > limit) throw new Error("Entrada inválida ou acima do limite.");
  return fs.readFile(filename);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 4) throw new Error(usage);
  const [sourcePath, basePath, planPath, outputDir] = args.map((argument) => path.resolve(argument));
  const [sourceBytes, baseBytes, planBytes] = await Promise.all([
    readBounded(sourcePath, 10 * 1024 * 1024), readBounded(basePath, 16 * 1024 * 1024), readBounded(planPath, 1024 * 1024)
  ]);
  const result = applyAssistedNotationRepair({ sourceBytes, baseXml: baseBytes.toString("utf8"),
    plan: JSON.parse(planBytes.toString("utf8")) as AssistedNotationRepairPlan });
  const validation = inspectMusicXmlValidation(result.musicXml);
  if (validation.issues.some((issue) => issue.severity === "error")) throw new Error("A proposta falhou na validação estrutural; nenhum arquivo foi gravado.");
  const midi = new MidiExportService();
  const midiValidation = await midi.inspect(result.musicXml);
  const midiBytes = midiValidation.status === "passed" ? await midi.generate(result.musicXml) : null;
  // A new directory is mandatory. Inputs and earlier deliveries are immutable.
  await fs.mkdir(outputDir, { mode: 0o700 });
  await fs.writeFile(path.join(outputDir, "proposta.musicxml"), result.musicXml, { mode: 0o600, flag: "wx" });
  await fs.writeFile(path.join(outputDir, "revisao.json"), JSON.stringify({ ...result, musicXml: undefined,
    validation, midiValidation, deployed: false, registeredForReuse: false }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  if (midiBytes) await fs.writeFile(path.join(outputDir, "proposta.mid"), midiBytes, { mode: 0o600, flag: "wx" });
  process.stdout.write(JSON.stringify({ outputDir, changes: result.history.length,
    midi: midiValidation.status, requiresReview: true, accuracyVerified: false, deployed: false }) + "\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Não foi possível aplicar o plano assistido."}\n`);
  process.exitCode = 1;
});
