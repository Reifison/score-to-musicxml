import { describe, expect, it } from "vitest";
import { classifyIapPurchaseError } from "./purchaseErrors";

describe("classifyIapPurchaseError", () => {
  it("recognizes the wrapped expo requestPurchase cancellation message", () => {
    expect(classifyIapPurchaseError(new Error("Calling the 'requestPurchase' function has failed → Caused by: User cancelled the purchase flow."))).toBe("cancelled");
  });

  it.each(["user-cancelled", "USER_CANCELED", "E_USER_CANCELLED"])("recognizes expo-iap/native cancellation code %s", (code) => {
    expect(classifyIapPurchaseError({ code })).toBe("cancelled");
  });

  it("recognizes an IAP cancellation code nested in a cause", () => {
    expect(classifyIapPurchaseError({ message: "requestPurchase failed", cause: { code: "user-cancelled" } })).toBe("cancelled");
  });

  it("recognizes the known cancellation message in a string cause", () => {
    expect(classifyIapPurchaseError({ message: "requestPurchase failed", cause: "User cancelled the purchase flow." })).toBe("cancelled");
  });

  it("preserves the distinct deferred-payment classification", () => {
    expect(classifyIapPurchaseError({ code: "E_DEFERRED_PAYMENT" })).toBe("deferred");
  });

  it("does not treat unrelated purchase or backend failures as cancellation", () => {
    expect(classifyIapPurchaseError({ code: "service-error", message: "Purchase cancelled by the store after a payment failure." })).toBeNull();
    expect(classifyIapPurchaseError({ code: "NETWORK_ERROR", message: "Calling requestPurchase failed" })).toBeNull();
  });

  it("stops safely when an error cause points back to itself", () => {
    const error: { code: string; message: string; cause?: unknown } = { code: "service-error", message: "Store request failed" };
    error.cause = error;
    expect(classifyIapPurchaseError(error)).toBeNull();
  });
});
