import { describe, expect, it } from "vitest";
import { googlePurchaseRequest } from "./purchases";

describe("Google Play purchase request", () => {
  it("targets the Google entitlement endpoint and preserves verification data", () => {
    const request = googlePurchaseRequest({
      productId: "premium_unlock",
      purchaseToken: "google-purchase-token",
      packageName: "com.scoretomusicxml.app",
      restored: true
    });

    expect(request.path).toBe("/api/me/entitlement/google");
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body)).toMatchObject({
      productId: "premium_unlock",
      purchaseToken: "google-purchase-token",
      packageName: "com.scoretomusicxml.app",
      restored: true
    });
  });
});
