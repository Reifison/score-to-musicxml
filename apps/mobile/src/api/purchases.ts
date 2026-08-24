export type GooglePurchaseRegistration = {
  productId: string;
  purchaseToken: string;
  packageName?: string;
  transactionId?: string;
  purchasedAt?: string;
  restored?: boolean;
  quantity?: number;
};

export function googlePurchaseRequest(purchase: GooglePurchaseRegistration) {
  return {
    path: "/api/me/entitlement/google",
    method: "POST" as const,
    body: JSON.stringify(purchase)
  };
}
