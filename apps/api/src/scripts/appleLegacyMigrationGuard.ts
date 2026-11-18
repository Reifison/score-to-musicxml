import { pathToFileURL } from "node:url";
import { prisma } from "../db/prisma.js";

export function assertLegacyAppleOrigin(legacyCount: number, confirmedSandbox: boolean): void {
  if (legacyCount > 0 && !confirmedSandbox) {
    throw new Error("Apple migration blocked: verify the running old validator is sandbox-only, back up the database, then explicitly set APPLE_LEGACY_PURCHASES_FROM_SANDBOX=true for the migration. No records were changed.");
  }
}

export async function checkLegacyAppleMigration(): Promise<{ pending: boolean; legacyClaims?: number }> {
  const tables = await prisma.$queryRaw<Array<{ table_name: string | null }>>`SELECT to_regclass('public."Entitlement"')::text AS table_name`;
  if (!tables[0]?.table_name) return { pending: false };
  const columns = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Entitlement' AND column_name='appleEnvironment') AS exists`;
  if (columns[0]?.exists) return { pending: false };
  const counts = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM "Entitlement" WHERE "appleOriginalTransactionId" IS NOT NULL`;
  const legacyClaims = Number(counts[0]?.count ?? 0);
  assertLegacyAppleOrigin(legacyClaims, process.env.APPLE_LEGACY_PURCHASES_FROM_SANDBOX === "true");
  return { pending: true, legacyClaims };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkLegacyAppleMigration().then(result => console.log(JSON.stringify({ appleMigrationPreflight: "passed", ...result })))
    .catch(error => { console.error(error instanceof Error ? error.message : "Apple migration preflight failed"); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
