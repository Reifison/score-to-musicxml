export type IapPurchaseErrorKind = "cancelled" | "deferred";

const cancelledCodes = new Set(["user-cancelled", "user-canceled"]);
const deferredCodes = new Set(["deferred-payment"]);
const maxErrorCauseDepth = 8;

function normalizeIapErrorCode(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const normalized = code.trim().replace(/_/g, "-").toLowerCase();
  return normalized.startsWith("e-") ? normalized.slice(2) : normalized;
}

function isKnownCancellationMessage(message: unknown): boolean {
  return typeof message === "string" && /\buser cancell?ed the purchase flow\b/i.test(message);
}

/** Recognizes only expo-iap's cancellation/deferred codes and its known cancellation message. */
export function classifyIapPurchaseError(error: unknown): IapPurchaseErrorKind | null {
  const pending: Array<{ value: unknown; depth: number }> = [{ value: error, depth: 0 }];
  const seen = new Set<object>();

  while (pending.length > 0) {
    const current = pending.pop()!;
    const value = current.value;
    if (isKnownCancellationMessage(value)) return "cancelled";
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);

    const shapedError = value as { code?: unknown; message?: unknown; cause?: unknown; originalError?: unknown };
    const code = normalizeIapErrorCode(shapedError.code);
    if (code && cancelledCodes.has(code)) return "cancelled";
    if (code && deferredCodes.has(code)) return "deferred";
    if (isKnownCancellationMessage(shapedError.message)) return "cancelled";

    if (current.depth < maxErrorCauseDepth) {
      if (shapedError.cause !== undefined) pending.push({ value: shapedError.cause, depth: current.depth + 1 });
      if (shapedError.originalError !== undefined) pending.push({ value: shapedError.originalError, depth: current.depth + 1 });
    }
  }

  return null;
}
