import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../config/env.js";
import { createInMemoryRepositories } from "../repositories/inMemoryRepositories.js";
import { ApplePurchaseValidationService, type AppleNotificationValidationResult } from "../services/ApplePurchaseValidationService.js";
import { EntitlementService } from "../services/EntitlementService.js";

const previous = { mode: env.APPLE_IAP_ENVIRONMENT, accounts: env.APPLE_SANDBOX_ACCOUNT_IDS, binding: env.PURCHASE_ACCOUNT_BINDING_SECRET };
afterEach(() => { env.APPLE_IAP_ENVIRONMENT = previous.mode; env.APPLE_SANDBOX_ACCOUNT_IDS = previous.accounts; env.PURCHASE_ACCOUNT_BINDING_SECRET = previous.binding; vi.restoreAllMocks(); });
beforeEach(() => { env.APPLE_IAP_ENVIRONMENT = "auto"; env.APPLE_SANDBOX_ACCOUNT_IDS = ""; env.PURCHASE_ACCOUNT_BINDING_SECRET = "a-test-only-binding-secret-at-least-32-characters"; });

async function fixture(environment: "sandbox" | "production" = "production") {
  const repos = createInMemoryRepositories();
  const user = await repos.users.create({ name: "QA", email: "qa@example.invalid", passwordHash: "qa-only", role: "user" });
  const validator = new ApplePurchaseValidationService();
  vi.spyOn(validator, "isConfigured").mockReturnValue(true);
  vi.spyOn(validator, "validate").mockResolvedValue({ environment, transactionId: "transaction-123", originalTransactionId: "original-123", purchasedAt: new Date("2026-10-17T10:00:00Z") });
  const service = new EntitlementService(repos.entitlements, repos.audits, validator);
  return { repos, user, validator, service };
}
const body = { productId: "premium_unlock", originalTransactionId: "original-123", transactionId: "transaction-123", purchaseToken: "simulated-signed-payload-for-policy-only" };
const event = (overrides: Partial<AppleNotificationValidationResult> = {}): AppleNotificationValidationResult => ({
  environment: "production", notificationType: "REFUND", originalTransactionId: "original-123", productId: "premium_unlock",
  notificationUUID: "notification-refund-1", signedDate: new Date("2026-10-17T11:00:00Z"), revocationDate: new Date("2026-10-17T11:00:00Z"), ...overrides
});

describe("Apple production entitlement policy (verified payloads simulated)", () => {
  it("accepts production for ordinary app accounts and records the verified environment", async () => {
    const f = await fixture(); expect((await f.service.registerApplePurchase(f.user, body)).plan).toBe("paid");
    expect(await f.repos.audits.list()).toContainEqual(expect.objectContaining({ action: "purchase_completed", metadata: expect.objectContaining({ environment: "production", source: "apple", transactionId: "transaction-123" }) }));
  });
  it("refuses sandbox for app accounts outside the explicit review/test allowlist", async () => {
    const f = await fixture("sandbox");
    await expect(f.service.registerApplePurchase(f.user, body)).rejects.toMatchObject({ code: "APPLE_SANDBOX_ACCOUNT_NOT_ALLOWED" });
    expect((await f.service.getFor(f.user)).plan).toBe("free");
  });
  it("continues review/test purchase and restoration for the allowed app account", async () => {
    const f = await fixture("sandbox"); env.APPLE_SANDBOX_ACCOUNT_IDS = `another-account, ${f.user.id} `;
    await f.service.registerApplePurchase(f.user, body);
    expect((await f.service.registerApplePurchase(f.user, { ...body, restored: true })).plan).toBe("paid");
    expect(await f.repos.audits.list()).toContainEqual(expect.objectContaining({ action: "purchase_restored", metadata: expect.objectContaining({ environment: "sandbox" }) }));
  });
  it("preserves the explicitly sandbox-only rollout mode until auto is activated", async () => {
    const f = await fixture("sandbox"); env.APPLE_IAP_ENVIRONMENT = "sandbox";
    expect((await f.service.registerApplePurchase(f.user, body)).plan).toBe("paid");
  });
  it("processes refund, replay protection, and refund reversal using verified notification metadata", async () => {
    const f = await fixture(); await f.service.registerApplePurchase(f.user, body);
    const verify = vi.spyOn(f.validator, "validateNotification").mockResolvedValue(event());
    expect(await f.service.handleAppleNotification({ signedPayload: "simulated-signed-notification" })).toMatchObject({ handled: true });
    expect((await f.service.getFor(f.user)).plan).toBe("free");
    await expect(f.service.registerApplePurchase(f.user, { ...body, restored: true })).rejects.toMatchObject({ code: "APPLE_PURCHASE_REVOKED" });
    expect(await f.service.handleAppleNotification({ signedPayload: "simulated-signed-notification" })).toMatchObject({ handled: false });
    verify.mockResolvedValue(event({ notificationType: "REFUND_REVERSED", notificationUUID: "notification-reversal-2", signedDate: new Date("2026-10-17T12:00:00Z"), revocationDate: undefined }));
    expect(await f.service.handleAppleNotification({ signedPayload: "simulated-signed-notification" })).toMatchObject({ handled: true });
    expect((await f.service.getFor(f.user)).plan).toBe("paid");
  });
  it("acknowledges a verified TEST notification without changing entitlements", async () => {
    const f = await fixture(); vi.spyOn(f.validator, "validateNotification").mockResolvedValue({ environment: "production", notificationType: "TEST" });
    expect(await f.service.handleAppleNotification({ signedPayload: "simulated-signed-notification" })).toEqual({ handled: false, notificationType: "TEST" });
    expect((await f.service.getFor(f.user)).plan).toBe("free");
  });
  it.each(["notificationUUID", "signedDate", "revocationDate"] as const)("refuses refund without verified %s", async (field) => {
    const f = await fixture(); await f.service.registerApplePurchase(f.user, body);
    vi.spyOn(f.validator, "validateNotification").mockResolvedValue(event({ [field]: undefined }));
    await expect(f.service.handleAppleNotification({ signedPayload: "simulated-signed-notification" })).rejects.toMatchObject({ statusCode: 400 });
    expect((await f.service.getFor(f.user)).plan).toBe("paid");
  });
});
