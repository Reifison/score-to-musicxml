import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

const skipInTests = () => env.NODE_ENV === "test";

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  skip: skipInTests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente.", code: "RATE_LIMITED" }
});

export const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skip: skipInTests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitos envios em pouco tempo. Aguarde e tente novamente.", code: "UPLOAD_RATE_LIMITED" }
});

export const downloadRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 120,
  skip: skipInTests,
  standardHeaders: true,
  legacyHeaders: false
});
