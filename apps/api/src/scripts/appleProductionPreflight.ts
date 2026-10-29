import fs from "node:fs";
import path from "node:path";
import { createHash, X509Certificate } from "node:crypto";
import { Environment, SignedDataVerifier } from "@apple/app-store-server-library";
import { env, paths } from "../config/env.js";

const checks: Record<string, boolean> = {};
const requireCheck = (name: string, condition: boolean) => { checks[name] = condition; };
requireCheck("productionAndReviewMode", env.APPLE_IAP_ENVIRONMENT === "auto");
requireCheck("appAppleId", env.APPLE_APP_APPLE_ID === 6778062424);
requireCheck("bundleId", env.APPLE_BUNDLE_ID === "com.scoretomusicxml.app");
requireCheck("productId", env.APPLE_PREMIUM_PRODUCT_ID === "premium_unlock");
const bindingSecret = env.PURCHASE_ACCOUNT_BINDING_SECRET ?? "";
requireCheck("accountBindingSecretPresent", bindingSecret.length >= 32
  && !/generate-a-long-random-secret|development|change[-_ ]?me|troque|example/i.test(bindingSecret)
  && !/^(.)\1+$/.test(bindingSecret));
const reviewAccounts = [...new Set((env.APPLE_SANDBOX_ACCOUNT_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean))];
requireCheck("reviewAccountsAllowlisted", reviewAccounts.length > 0 && reviewAccounts.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)));

const officialRoots = new Set([
  "b0b1730ecbc7ff4505142c49f1295e6eda6bcaed7e2c68c5be91b5a11001f024",
  "c2b9b042dd57830e7d117dac55ac8ae19407d38e41d88f3215bc3a890444a050",
  "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179"
]);
const roots: Buffer[] = [];
const certificates: Array<{ sha256: string; validTo: string }> = [];
try {
  for (const file of (env.APPLE_ROOT_CERT_PATHS ?? "").split(",").map(s => s.trim()).filter(Boolean)) {
    const bytes = fs.readFileSync(path.isAbsolute(file) ? file : path.resolve(paths.rootDir, file));
    const cert = new X509Certificate(bytes);
    const sha256 = createHash("sha256").update(cert.raw).digest("hex");
    if (!officialRoots.has(sha256) || !cert.ca || !cert.verify(cert.publicKey) || Date.parse(cert.validFrom) > Date.now() || Date.parse(cert.validTo) < Date.now()) throw new Error("Invalid Apple root");
    roots.push(cert.raw); certificates.push({ sha256, validTo: cert.validTo });
  }
  requireCheck("officialRootsReadableAndValid", roots.length > 0);
  requireCheck("appleRootG3Present", certificates.some(c => c.sha256 === "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179"));
} catch { requireCheck("officialRootsReadableAndValid", false); }

if (roots.length && checks.appAppleId) {
  try {
    const forged = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${Buffer.from(JSON.stringify({ bundleId: env.APPLE_BUNDLE_ID, environment: "Production", productId: env.APPLE_PREMIUM_PRODUCT_ID })).toString("base64url")}.`;
    for (const environment of [Environment.PRODUCTION, Environment.SANDBOX]) {
      const verifier = new SignedDataVerifier(roots, true, environment, env.APPLE_BUNDLE_ID, environment === Environment.PRODUCTION ? env.APPLE_APP_APPLE_ID : undefined);
      let rejected = false;
      try { await verifier.verifyAndDecodeTransaction(forged); } catch { rejected = true; }
      requireCheck(`${environment}VerifierConstructedAndRejectsUnsignedData`, rejected);
    }
  } catch { requireCheck("officialVerifiersConstructed", false); }
}

let databaseChecked = false;
// A full production preflight always checks persistence. Config-only output is
// explicitly marked and cannot be mistaken for readiness to verify live flows.
if (!process.argv.includes("--config-only")) {
  const { prisma } = await import("../db/prisma.js");
  try {
    const columns = await prisma.$queryRaw<Array<{ exists: boolean }>>`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Entitlement' AND column_name='appleEnvironment') AS exists`;
    const tables = await prisma.$queryRaw<Array<{ table_name: string | null }>>`SELECT to_regclass('public."ApplePurchase"')::text AS table_name`;
    requireCheck("environmentColumnPresent", columns[0]?.exists === true);
    requireCheck("durableAppleLedgerPresent", Boolean(tables[0]?.table_name));
    requireCheck("reviewAccountsExistAndActive", reviewAccounts.length > 0 && await prisma.user.count({ where: { id: { in: reviewAccounts }, isActive: true } }) === reviewAccounts.length);
    databaseChecked = true;
  } catch { requireCheck("databaseReadiness", false); }
  finally { await prisma.$disconnect(); }
}

const configurationReady = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), configurationReady, readyForLiveVerification: configurationReady && databaseChecked, checks, certificates,
  databaseChecked, allowlistedReviewAccountCount: reviewAccounts.length,
  realProductionPurchaseTested: false,
  notice: "Configuration and rejection checks only. No purchase, entitlement mutation, or Apple charge was performed." }, null, 2));
if (!configurationReady) process.exitCode = 1;
