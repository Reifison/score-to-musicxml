import { env } from "../config/env.js";
import { createServices } from "../container.js";
import { prisma } from "../db/prisma.js";
import { BullMqScoreConversionQueue } from "../queues/ScoreConversionQueue.js";
import { MissingMusicXmlExportRepairService } from "../services/MissingMusicXmlExportRepairService.js";

const argumentsList = process.argv.slice(2);
const requestedApply = argumentsList.includes("--apply");
const requestedDryRun = argumentsList.includes("--dry-run");
const apply = requestedApply && !requestedDryRun;
const hasUnsupportedArgument = argumentsList.some((argument) => argument !== "--apply" && argument !== "--dry-run");

if (hasUnsupportedArgument || (requestedApply && requestedDryRun)) {
  console.error("Uso: npm run repair:missing-musicxml-exports -w apps/api -- [--apply]");
  process.exitCode = 2;
} else {
  const queue = apply && env.REDIS_URL ? new BullMqScoreConversionQueue() : undefined;
  try {
    if (apply && !queue) throw new Error("Redis is required for apply mode.");
    const services = createServices(undefined, { inlineQueue: true });
    const repair = new MissingMusicXmlExportRepairService(
      services.repositories.scores,
      services.repositories.audits,
      services.storage,
      services.fileSecurity,
      env.MAX_UPLOAD_BYTES,
      queue
    );
    const summary = await repair.run({ apply });
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...summary }));
    if (!apply) console.log("Nenhuma alteração foi feita. Use --apply para enfileirar apenas os casos recuperáveis.");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : error instanceof Error ? error.name : "UNKNOWN";
    console.error("A reparação de exports MusicXML não foi concluída.", { errorCode: code });
    process.exitCode = 1;
  } finally {
    await queue?.close();
    await prisma.$disconnect();
  }
}
