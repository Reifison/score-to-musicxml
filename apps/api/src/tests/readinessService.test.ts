import { describe, expect, it } from "vitest";
import { checkReadiness } from "../services/ReadinessService.js";

describe("readiness", () => {
  it("só declara pronto com banco, Redis e worker disponíveis", async () => {
    const ready = await checkReadiness({ database: async () => true, redis: async () => true, worker: async () => true });
    expect(ready).toEqual({ ok: true, checks: { database: true, redis: true, worker: true } });
    for (const unavailable of ["database", "redis", "worker"] as const) {
      const checks = { database: async () => true, redis: async () => true, worker: async () => true };
      checks[unavailable] = async () => { throw new Error("unavailable"); };
      expect((await checkReadiness(checks)).ok).toBe(false);
    }
  });

  it("fecha a resposta mesmo quando uma dependência não responde", async () => {
    const start = Date.now();
    const result = await checkReadiness({ database: async () => true, redis: () => new Promise(() => undefined), worker: async () => true }, 50);
    expect(result).toEqual({ ok: false, checks: { database: true, redis: false, worker: true } });
    expect(Date.now() - start).toBeLessThan(500);
  });
});
