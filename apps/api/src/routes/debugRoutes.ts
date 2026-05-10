import { Router } from "express";
import { createHash } from "node:crypto";
import { env } from "../config/env.js";

export const debugRoutes = Router();

debugRoutes.get("/auth", async (req, res) => {
  if (env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const users = await req.services.repositories.users.list();
  res.json({
    api: {
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      databaseUrlHash: env.DATABASE_URL ? hashValue(env.DATABASE_URL) : null,
      databaseUrlHost: env.DATABASE_URL ? safeDatabaseHost(env.DATABASE_URL) : null,
    },
    request: {
      host: req.get("host"),
      ip: req.ip,
      origin: req.get("origin") ?? null,
      userAgent: req.get("user-agent") ?? null,
      mobileClient: req.get("x-mobile-client") ?? null,
    },
    users: users.map((user) => ({
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })),
  });
});

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function safeDatabaseHost(value: string): string | null {
  try {
    const url = new URL(value);
    return `${url.hostname}:${url.port || defaultPort(url.protocol)}`;
  } catch {
    return null;
  }
}

function defaultPort(protocol: string): string {
  return protocol === "postgresql:" || protocol === "postgres:" ? "5432" : "";
}
