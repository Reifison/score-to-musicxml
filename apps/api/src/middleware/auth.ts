import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import type { User } from "../domain.js";
import { forbidden, unauthorized } from "../errors/AppError.js";
import type { AppServices } from "../container.js";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      services: AppServices;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[env.SESSION_COOKIE_NAME] ?? bearerToken(req.headers.authorization);
  const user = await req.services.auth.authenticate(token);
  if (!user) return next(unauthorized());
  req.user = user;
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== "admin") return next(forbidden());
  next();
}

export function bearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length).trim() || undefined;
}
