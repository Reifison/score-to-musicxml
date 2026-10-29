import { describe, expect, it } from "vitest";
import { evaluatePurchaseOffer } from "./purchaseOffer";

const product = { id: "premium_unlock", displayPrice: "R$ 32,90" };

describe("store-backed purchase offer", () => {
  it("uses only the connected store product's localized price", () => {
    expect(evaluatePurchaseOffer({
      connected: true,
      catalogState: "loaded",
      product,
      productId: "premium_unlock",
      purchasePending: false
    })).toEqual({ state: "ready", displayPrice: "R$ 32,90", canPurchase: true });
  });

  it("keeps purchasing disabled when the store is disconnected or the product lookup is pending", () => {
    expect(evaluatePurchaseOffer({ connected: false, catalogState: "loaded", product, productId: product.id, purchasePending: false }).canPurchase).toBe(false);
    expect(evaluatePurchaseOffer({ connected: true, catalogState: "loading", product, productId: product.id, purchasePending: false })).toEqual({ state: "loading", canPurchase: false });
  });

  it("requires the exact product and a nonempty store-provided price", () => {
    for (const candidate of [undefined, { id: "another-product", displayPrice: "R$ 1,00" }, { id: product.id, displayPrice: "   " }]) {
      expect(evaluatePurchaseOffer({ connected: true, catalogState: "loaded", product: candidate, productId: product.id, purchasePending: false })).toEqual({ state: "unavailable", canPurchase: false });
    }
  });

  it("does not allow another purchase while one is pending", () => {
    expect(evaluatePurchaseOffer({ connected: true, catalogState: "loaded", product, productId: product.id, purchasePending: true })).toEqual({ state: "pending", displayPrice: "R$ 32,90", canPurchase: false });
  });

  it("keeps purchases disabled after a store lookup error until retried", () => {
    expect(evaluatePurchaseOffer({ connected: true, catalogState: "failed", product, productId: product.id, purchasePending: false })).toEqual({ state: "failed", canPurchase: false });
  });
});
