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

export function createMidiDownloadRateLimit(options: { limit?: number; skip?: () => boolean } = {}) {
  return rateLimit({
    windowMs: 5 * 60 * 1000,
    // MIDI generation is CPU-bound; keep regular file downloads less restrictive.
    limit: options.limit ?? 30,
    skip: options.skip ?? skipInTests,
    // scoreRoutes authenticates before this middleware, so limits follow the
    // account and cannot be bypassed by rotating IPv6 addresses.
    keyGenerator: (req) => req.user?.id ?? "unauthenticated",
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Muitas exportações MIDI em pouco tempo. Aguarde e tente novamente.",
      code: "MIDI_RATE_LIMITED"
    },
    handler: (req, res, _next, rateLimitOptions) => {
      req.services?.midiObservability.recordFailure("download", 0, "MIDI_RATE_LIMITED");
      res.status(rateLimitOptions.statusCode).send(rateLimitOptions.message);
    }
  });
}

export const midiDownloadRateLimit = createMidiDownloadRateLimit();
