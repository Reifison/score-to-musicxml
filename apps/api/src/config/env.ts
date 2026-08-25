import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

dotenv.config({ path: path.resolve(rootDir, ".env") });

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (/^(true|1|yes)$/i.test(value)) return true;
  if (/^(false|0|no)$/i.test(value)) return false;
  return value;
}, z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  SESSION_COOKIE_NAME: z.string().default("score_session"),
  SESSION_SECRET: z.string().min(16).default("development-session-secret-change-me"),
  STORAGE_DIR: z.string().default("./storage"),
  MAX_UPLOAD_BYTES: z.coerce.number().default(10 * 1024 * 1024),
  SCORE_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(730),
  TEMP_FILE_RETENTION_HOURS: z.coerce.number().int().positive().default(24),
  FREE_SCAN_LIMIT: z.coerce.number().int().positive().default(3),
  APPLE_PREMIUM_PRODUCT_ID: z.string().default("premium_unlock"),
  APPLE_BUNDLE_ID: z.string().default("com.scoretomusicxml.app"),
  APPLE_APP_APPLE_ID: z.coerce.number().optional(),
  APPLE_IAP_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  APPLE_IAP_KEY_ID: z.string().optional(),
  APPLE_IAP_ISSUER_ID: z.string().optional(),
  APPLE_IAP_PRIVATE_KEY: z.string().optional(),
  APPLE_IAP_PRIVATE_KEY_PATH: z.string().optional(),
  APPLE_ROOT_CERT_PATHS: z.string().optional(),
  GOOGLE_PLAY_PACKAGE_NAME: z.string().default("com.scoretomusicxml.app"),
  GOOGLE_PLAY_PRODUCT_ID: z.string().default("premium_unlock"),
  GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL: z.string().email().optional(),
  GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().optional(),
  GOOGLE_PLAY_VALIDATION_ENABLED: booleanFromEnv.default(false),
  GOOGLE_PLAY_RTDN_AUDIENCE: z.string().url().optional(),
  GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL: z.string().email().optional(),
  GOOGLE_PLAY_RTDN_JWKS_URL: z.string().url().default("https://www.googleapis.com/oauth2/v3/certs"),
  // Never expose this value to the mobile app. It produces the opaque account
  // identifier that Google Play returns during server-side purchase validation.
  PURCHASE_ACCOUNT_BINDING_SECRET: z.string().min(32).optional(),
  CLAMAV_BIN: z.string().optional(),
  REQUIRE_MALWARE_SCAN: booleanFromEnv.default(false),
  OMR_ENGINE: z.enum(["stub", "audiveris"]).default("stub"),
  AUDIVERIS_BIN: z.string().optional(),
  OMR_CONVERSION_TIMEOUT_MS: z.coerce.number().int().positive().default(900_000),
  OMR_AUDIVERIS_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
  OMR_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
  BCRYPT_ROUNDS: z.coerce.number().default(12),
  ADMIN_EMAIL: z.string().email().default("admin@example.com"),
  ADMIN_PASSWORD: z.string().min(8).default("ChangeMe123!")
});

export const env = schema.parse(process.env);

export const paths = {
  rootDir,
  storageDir: path.isAbsolute(env.STORAGE_DIR) ? env.STORAGE_DIR : path.resolve(rootDir, env.STORAGE_DIR),
  uploadsDir: path.join(path.isAbsolute(env.STORAGE_DIR) ? env.STORAGE_DIR : path.resolve(rootDir, env.STORAGE_DIR), "uploads"),
  exportsDir: path.join(path.isAbsolute(env.STORAGE_DIR) ? env.STORAGE_DIR : path.resolve(rootDir, env.STORAGE_DIR), "exports")
};
