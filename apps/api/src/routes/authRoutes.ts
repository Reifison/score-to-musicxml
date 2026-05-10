import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { toPublicUser } from "../domain.js";
import { bearerToken, requireAuth } from "../middleware/auth.js";
import { loginRateLimit } from "../middleware/rateLimits.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const authRoutes = Router();

authRoutes.post("/login", loginRateLimit, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await req.services.auth.login(input.email, input.password, req.ip);
  req.services.auth.setSessionCookie(res, result.token);
  const mobile = req.header("x-mobile-client") === "score-to-musicxml-ios";
  res.json({ user: result.user, ...(mobile ? { token: result.token } : {}) });
});

authRoutes.post("/logout", requireAuth, async (req, res) => {
  await req.services.auth.logout(req.cookies?.[env.SESSION_COOKIE_NAME] ?? bearerToken(req.headers.authorization), req.user?.id, req.ip);
  req.services.auth.clearSessionCookie(res);
  res.status(204).send();
});

authRoutes.get("/me", requireAuth, async (req, res) => {
  res.json({ user: toPublicUser(req.user!) });
});
