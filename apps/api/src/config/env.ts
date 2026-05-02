import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

dotenv.config({ path: path.resolve(rootDir, ".env") });

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
  OMR_ENGINE: z.enum(["stub", "audiveris"]).default("stub"),
  AUDIVERIS_BIN: z.string().optional(),
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
