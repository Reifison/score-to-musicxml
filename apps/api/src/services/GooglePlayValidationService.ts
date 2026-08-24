import { createSign, createVerify } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";

export type GooglePurchaseInput = { productId: string; purchaseToken: string };
export type GooglePurchase = { productId: string; purchaseToken: string; purchasedAt: Date };

export class GooglePlayValidationService {
  isConfigured(): boolean {
    return Boolean(env.GOOGLE_PLAY_VALIDATION_ENABLED && env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY);
  }

  async validate(input: GooglePurchaseInput): Promise<GooglePurchase> {
    if (!this.isConfigured()) throw new AppError(501, "Validação server-side do Google Play não está configurada.", "GOOGLE_VALIDATION_NOT_CONFIGURED");
    const accessToken = await this.accessToken();
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(env.GOOGLE_PLAY_PACKAGE_NAME)}/purchases/products/${encodeURIComponent(input.productId)}/tokens/${encodeURIComponent(input.purchaseToken)}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new AppError(400, "Compra Google Play inválida.", "GOOGLE_PURCHASE_INVALID");
    const body = await response.json() as { purchaseState?: number; productId?: string; purchaseTimeMillis?: string; acknowledgementState?: number };
    if (body.productId !== input.productId || body.purchaseState !== 0) throw new AppError(402, "Compra Google Play não está ativa.", "GOOGLE_PURCHASE_NOT_ACTIVE");
    return { productId: input.productId, purchaseToken: input.purchaseToken, purchasedAt: body.purchaseTimeMillis ? new Date(Number(body.purchaseTimeMillis)) : new Date() };
  }

  async verifyPushToken(token: string): Promise<boolean> {
    if (!env.GOOGLE_PLAY_RTDN_AUDIENCE || !env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL) return false;
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return false;
      const decode = (value: string) => JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
      const header = decode(parts[0]);
      const payload = decode(parts[1]);
      const validIssuer = payload.iss === "https://accounts.google.com" || payload.iss === "accounts.google.com";
      if (
        header.alg !== "RS256" ||
        typeof header.kid !== "string" ||
        !validIssuer ||
        payload.aud !== env.GOOGLE_PLAY_RTDN_AUDIENCE ||
        payload.email !== env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL ||
        payload.email_verified !== true
      ) return false;
      if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return false;
      const response = await fetch(env.GOOGLE_PLAY_RTDN_JWKS_URL);
      if (!response.ok) return false;
      const keys = await response.json() as { keys?: Array<{ kid?: string; n: string; e: string; alg?: string }> };
      const key = keys.keys?.find((candidate) => candidate.kid === header.kid && candidate.alg === "RS256");
      if (!key) return false;
      const publicKey = { key: { kty: "RSA", n: key.n, e: key.e }, format: "jwk" } as const;
      const verifier = createVerify("RSA-SHA256");
      verifier.update(`${parts[0]}.${parts[1]}`);
      return verifier.verify(publicKey, Buffer.from(parts[2], "base64url"));
    } catch {
      return false;
    }
  }

  private async accessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const header = encode({ alg: "RS256", typ: "JWT" });
    const claim = encode({ iss: env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${claim}`);
    const signature = signer.sign(env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, "\n"), "base64url");
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claim}.${signature}` }) });
    if (!response.ok) throw new AppError(502, "Não foi possível autenticar no Google Play Developer API.", "GOOGLE_AUTH_FAILED");
    const body = await response.json() as { access_token?: string };
    if (!body.access_token) throw new AppError(502, "Token do Google Play ausente.", "GOOGLE_AUTH_FAILED");
    return body.access_token;
  }
}
