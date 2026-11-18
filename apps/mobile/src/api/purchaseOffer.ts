export type StoreOfferProduct = {
  id: string;
  displayPrice?: string | null;
};

export type ProductCatalogState = "idle" | "loading" | "loaded" | "failed";
export type PurchaseOfferState = "disconnected" | "loading" | "failed" | "unavailable" | "pending" | "ready";

export function evaluatePurchaseOffer(input: {
  connected: boolean;
  catalogState: ProductCatalogState;
  product?: StoreOfferProduct;
  productId: string;
  purchasePending: boolean;
}): { state: PurchaseOfferState; displayPrice?: string; canPurchase: boolean } {
  if (!input.connected) return { state: "disconnected", canPurchase: false };
  if (input.catalogState === "idle" || input.catalogState === "loading") return { state: "loading", canPurchase: false };
  if (input.catalogState === "failed") return { state: "failed", canPurchase: false };

  const displayPrice = input.product?.id === input.productId ? input.product.displayPrice?.trim() : undefined;
  if (!displayPrice) return { state: "unavailable", canPurchase: false };
  if (input.purchasePending) return { state: "pending", displayPrice, canPurchase: false };
  return { state: "ready", displayPrice, canPurchase: true };
}
