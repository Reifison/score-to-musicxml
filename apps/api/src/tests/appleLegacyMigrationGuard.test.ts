import { afterEach, describe, expect, it, vi } from "vitest";
const query = vi.hoisted(() => vi.fn());
vi.mock("../db/prisma.js", () => ({ prisma: { $queryRaw: query } }));
import { assertLegacyAppleOrigin, checkLegacyAppleMigration } from "../scripts/appleLegacyMigrationGuard.js";
const before = process.env.APPLE_LEGACY_PURCHASES_FROM_SANDBOX;
afterEach(() => { query.mockReset(); if (before === undefined) delete process.env.APPLE_LEGACY_PURCHASES_FROM_SANDBOX; else process.env.APPLE_LEGACY_PURCHASES_FROM_SANDBOX = before; });
describe("Apple migration origin guard", () => {
  it("blocks classification of existing legacy purchases unless the sandbox-only origin was explicitly confirmed", () => {
    expect(() => assertLegacyAppleOrigin(2, false)).toThrow("Apple migration blocked");
    expect(() => assertLegacyAppleOrigin(2, true)).not.toThrow();
    expect(() => assertLegacyAppleOrigin(0, false)).not.toThrow();
  });
  it("permits a fresh database without an unnecessary acknowledgment", async () => {
    query.mockResolvedValueOnce([{ table_name: null }]); expect(await checkLegacyAppleMigration()).toEqual({ pending: false });
  });
  it("does not require the one-time acknowledgment after the environment migration already exists", async () => {
    query.mockResolvedValueOnce([{ table_name: "Entitlement" }]).mockResolvedValueOnce([{ exists: true }]);
    expect(await checkLegacyAppleMigration()).toEqual({ pending: false });
  });
  it("fails closed on unacknowledged legacy claims and makes no writes", async () => {
    delete process.env.APPLE_LEGACY_PURCHASES_FROM_SANDBOX;
    query.mockResolvedValueOnce([{ table_name: "Entitlement" }]).mockResolvedValueOnce([{ exists: false }]).mockResolvedValueOnce([{ count: 3n }]);
    await expect(checkLegacyAppleMigration()).rejects.toThrow("Apple migration blocked"); expect(query).toHaveBeenCalledTimes(3);
  });
  it("reports the number to classify after explicit operator confirmation", async () => {
    process.env.APPLE_LEGACY_PURCHASES_FROM_SANDBOX = "true";
    query.mockResolvedValueOnce([{ table_name: "Entitlement" }]).mockResolvedValueOnce([{ exists: false }]).mockResolvedValueOnce([{ count: 3n }]);
    expect(await checkLegacyAppleMigration()).toEqual({ pending: true, legacyClaims: 3 });
  });
  it("stops if the database precheck is unavailable", async () => {
    query.mockRejectedValue(new Error("QA unavailable")); await expect(checkLegacyAppleMigration()).rejects.toThrow("QA unavailable");
  });
});
