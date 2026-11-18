import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../config/env.js";
import type { User } from "../domain.js";
import { createInMemoryRepositories } from "../repositories/inMemoryRepositories.js";
import { ApplePurchaseValidationService } from "../services/ApplePurchaseValidationService.js";
import { EntitlementService } from "../services/EntitlementService.js";
import { GooglePlayValidationService } from "../services/GooglePlayValidationService.js";

const originalBindingSecret = env.PURCHASE_ACCOUNT_BINDING_SECRET;

afterEach(() => {
  env.PURCHASE_ACCOUNT_BINDING_SECRET = originalBindingSecret;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("purchase account binding", () => {
  it("keeps production UUIDs for Apple and derives stable, distinct store IDs", () => {
    env.PURCHASE_ACCOUNT_BINDING_SECRET = "a-long-test-binding-secret-with-32-bytes";
    const repos = createInMemoryRepositories();
    const service = new EntitlementService(repos.entitlements, repos.audits);
    const uuidUser = { id: "d744f6a0-8378-45bf-958f-d0e829e6b385" } as User;
    const legacyUser = { id: "in-memory-nanoid" } as User;

    expect(service.purchaseBindingFor(uuidUser).appleAppAccountToken).toBe(uuidUser.id);
    expect(service.purchaseBindingFor(legacyUser).appleAppAccountToken).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(service.purchaseBindingFor(legacyUser)).toEqual(service.purchaseBindingFor(legacyUser));
    expect(service.purchaseBindingFor(uuidUser).googleObfuscatedAccountId).not.toBe(service.purchaseBindingFor(legacyUser).googleObfuscatedAccountId);
  });

  it("rejects an Apple transaction bound to another account", () => {
    const validator = new ApplePurchaseValidationService() as unknown as {
      assertTransactionMatches: (decoded: Record<string, unknown>, input: Record<string, unknown>) => void;
    };
    expect(() => validator.assertTransactionMatches(
      { bundleId: env.APPLE_BUNDLE_ID, productId: env.APPLE_PREMIUM_PRODUCT_ID, originalTransactionId: "original-123", appAccountToken: "someone-else" },
      { productId: env.APPLE_PREMIUM_PRODUCT_ID, originalTransactionId: "original-123", expectedAppAccountToken: "our-account" }
    )).toThrowError(expect.objectContaining({ code: "APPLE_ACCOUNT_MISMATCH" }));
  });
});

describe("Google Play validation", () => {
  it("refuses another account's purchase before acknowledgement", async () => {
    const validator = new GooglePlayValidationService();
    vi.spyOn(validator, "isConfigured").mockReturnValue(true);
    vi.spyOn(validator as never, "accessToken").mockResolvedValue("access-token");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ productId: env.GOOGLE_PLAY_PRODUCT_ID, purchaseState: 0, acknowledgementState: 0, obfuscatedExternalAccountId: "different-account" })
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(validator.validate({ productId: env.GOOGLE_PLAY_PRODUCT_ID, purchaseToken: "purchase-token", expectedAccountId: "our-account" }))
      .rejects.toMatchObject({ code: "GOOGLE_PURCHASE_NOT_ACTIVE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("acknowledges a matching, unacknowledged purchase before granting it", async () => {
    const validator = new GooglePlayValidationService();
    vi.spyOn(validator, "isConfigured").mockReturnValue(true);
    vi.spyOn(validator as never, "accessToken").mockResolvedValue("access-token");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ productId: env.GOOGLE_PLAY_PRODUCT_ID, purchaseState: 0, acknowledgementState: 0, obfuscatedExternalAccountId: "our-account" }) })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const purchase = await validator.validate({ productId: env.GOOGLE_PLAY_PRODUCT_ID, purchaseToken: "purchase-token", expectedAccountId: "our-account" });
    expect(purchase.purchaseToken).toBe("purchase-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain(":acknowledge");
  });

  it("accepts an active response when Google omits the optional productId", async () => {
    const validator = new GooglePlayValidationService();
    vi.spyOn(validator as never, "accessToken").mockResolvedValue("access-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ purchaseState: 0, acknowledgementState: 1 }) }));

    await expect(validator.inspect({ productId: env.GOOGLE_PLAY_PRODUCT_ID, purchaseToken: "purchase-token" })).resolves.toMatchObject({ active: true });
  });

  it("reconciles notifications against store status before revoking access", async () => {
    const repos = createInMemoryRepositories();
    const validator = new GooglePlayValidationService();
    vi.spyOn(validator, "verifyPushToken").mockResolvedValue(true);
    const inspect = vi.spyOn(validator, "inspect").mockResolvedValue({ productId: env.GOOGLE_PLAY_PRODUCT_ID, purchaseToken: "purchase-token", purchasedAt: new Date(), active: true });
    const service = new EntitlementService(repos.entitlements, repos.audits, new ApplePurchaseValidationService(), validator);
    await repos.entitlements.recordGooglePurchase({ userId: "buyer", productId: env.GOOGLE_PLAY_PRODUCT_ID, purchaseToken: "purchase-token", purchasedAt: new Date() }, env.FREE_SCAN_LIMIT);
    const notification = (messageId: string) => ({ message: { messageId, data: Buffer.from(JSON.stringify({
      packageName: env.GOOGLE_PLAY_PACKAGE_NAME,
      voidedPurchaseNotification: { purchaseToken: "purchase-token", productType: 2, refundType: 1 }
    })).toString("base64") } });

    expect(await service.handleGoogleNotification(notification("first"), "signed-token")).toMatchObject({ handled: true });
    expect((await repos.entitlements.getSummary("buyer", env.FREE_SCAN_LIMIT)).plan).toBe("paid");

    inspect.mockResolvedValue({ productId: env.GOOGLE_PLAY_PRODUCT_ID, purchaseToken: "purchase-token", purchasedAt: new Date(), active: false });
    expect(await service.handleGoogleNotification(notification("second"), "signed-token")).toMatchObject({ handled: true });
    expect((await repos.entitlements.getSummary("buyer", env.FREE_SCAN_LIMIT)).plan).toBe("free");
  });
});
