import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createMidiDownloadRateLimit } from "../middleware/rateLimits.js";

describe("MIDI rate limit", () => {
  it("limita separadamente a rota de geração e publica headers padrão", async () => {
    const app = express();
    app.use(createMidiDownloadRateLimit({ limit: 2, skip: () => false }));
    app.get("/midi", (_req, res) => res.sendStatus(204));

    const first = await request(app).get("/midi").expect(204);
    await request(app).get("/midi").expect(204);
    const limited = await request(app).get("/midi").expect(429);

    expect(first.headers["ratelimit-policy"]).toContain("2;w=300");
    expect(limited.body).toEqual({
      error: "Muitas exportações MIDI em pouco tempo. Aguarde e tente novamente.",
      code: "MIDI_RATE_LIMITED"
    });
  });
});
