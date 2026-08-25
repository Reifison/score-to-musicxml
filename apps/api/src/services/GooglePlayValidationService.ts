import { createSign, createVerify } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";

export type GooglePurchaseInput = { productId: string; purchaseToken: string; expectedAccountId?: string };
export type GooglePurchase = { productId: string; purchaseToken: string; purchasedAt: Date };

type GooglePurchaseStatus = GooglePurchase & { active: boolean; acknowledgementState?: number };

export class GooglePlayValidationService {
  private cachedAccessToken?: { value: string; expiresAt: number };
  private cachedJwks?: { keys: Array<{ kid?: string; n: string; e: string; alg?: string }>; expiresAt: number };
  isConfigured(): boolean {
    return Boolean(env.GOOGLE_PLAY_VALIDATION_ENABLED && env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY);
  }

  async validate(input: GooglePurchaseInput): Promise<GooglePurchase> {
    if (!this.isConfigured()) throw new AppError(501, "Validação server-side do Google Play não está configurada.", "GOOGLE_VALIDATION_NOT_CONFIGURED");
    const status = await this.inspect(input);
    if (!status.active) throw new AppError(402, "Compra Google Play não está ativa.", "GOOGLE_PURCHASE_NOT_ACTIVE");
    if (status.acknowledgementState !== 1) await this.acknowledge(input);
    return status;
  }

  /** Used only to reconcile a signed RTDN. It never grants access by itself. */
  async inspect(input: GooglePurchaseInput): Promise<GooglePurchaseStatus> {
    const accessToken = await this.accessToken();
    const url = this.purchaseUrl(input);
    let response: Response;
    try {
      response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    } catch {
      throw new AppError(502, "Não foi possível consultar a compra no Google Play.", "GOOGLE_PURCHASE_LOOKUP_FAILED");
    }
    if (response.status === 404 || response.status === 410) return { productId: input.productId, purchaseToken: input.purchaseToken, purchasedAt: new Date(), active: false };
    if (!response.ok) throw new AppError(502, "Não foi possível consultar a compra no Google Play.", "GOOGLE_PURCHASE_LOOKUP_FAILED");
    const body = await response.json() as { purchaseState?: number; productId?: string; purchaseTimeMillis?: string; acknowledgementState?: number; obfuscatedExternalAccountId?: string };
    const accountMatches = !input.expectedAccountId || body.obfuscatedExternalAccountId === input.expectedAccountId;
    return { productId: input.productId, purchaseToken: input.purchaseToken, purchasedAt: body.purchaseTimeMillis ? new Date(Number(body.purchaseTimeMillis)) : new Date(), acknowledgementState: body.acknowledgementState, active: body.productId === input.productId && body.purchaseState === 0 && accountMatches };
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
      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.exp !== "number" || payload.exp <= now || typeof payload.iat !== "number" || payload.iat > now + 60 || payload.iat < now - 3900 || (typeof payload.nbf === "number" && payload.nbf > now + 60)) return false;
      const keys = await this.jwks();
      const key = keys.find((candidate) => candidate.kid === header.kid && candidate.alg === "RS256");
      if (!key) return false;
      const publicKey = { key: { kty: "RSA", n: key.n, e: key.e }, format: "jwk" } as const;
      const verifier = createVerify("RSA-SHA256");
      verifier.update(`${parts[0]}.${parts[1]}`);
      return verifier.verify(publicKey, Buffer.from(parts[2], "base64url"));
    } catch {
      return false;
    }
  }

  private purchaseUrl(input: Pick<GooglePurchaseInput, "productId" | "purchaseToken">) {
    return `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(env.GOOGLE_PLAY_PACKAGE_NAME)}/purchases/products/${encodeURIComponent(input.productId)}/tokens/${encodeURIComponent(input.purchaseToken)}`;
  }

  private async acknowledge(input: Pick<GooglePurchaseInput, "productId" | "purchaseToken">): Promise<void> {
    const accessToken = await this.accessToken();
    let response: Response;
    try {
      response = await fetch(`${this.purchaseUrl(input)}:acknowledge`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: "{}" });
    } catch {
      throw new AppError(502, "Não foi possível confirmar a compra no Google Play.", "GOOGLE_PURCHASE_ACKNOWLEDGE_FAILED");
    }
    if (!response.ok) throw new AppError(502, "Não foi possível confirmar a compra no Google Play.", "GOOGLE_PURCHASE_ACKNOWLEDGE_FAILED");
  }

  private async jwks() {
    if (this.cachedJwks && this.cachedJwks.expiresAt > Date.now()) return this.cachedJwks.keys;
    const response = await fetch(env.GOOGLE_PLAY_RTDN_JWKS_URL);
    if (!response.ok) throw new Error("JWKS unavailable");
    const body = await response.json() as { keys?: Array<{ kid?: string; n: string; e: string; alg?: string }> };
    if (!body.keys?.length) throw new Error("JWKS empty");
    this.cachedJwks = { keys: body.keys, expiresAt: Date.now() + 60 * 60 * 1000 };
    return body.keys;
  }

  private async accessToken(): Promise<string> {
    if (this.cachedAccessToken && this.cachedAccessToken.expiresAt > Date.now()) return this.cachedAccessToken.value;
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const header = encode({ alg: "RS256", typ: "JWT" });
    const claim = encode({ iss: env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${claim}`);
    const signature = signer.sign(env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, "\n"), "base64url");
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claim}.${signature}` }) });
    if (!response.ok) throw new AppError(502, "Não foi possível autenticar no Google Play Developer API.", "GOOGLE_AUTH_FAILED");
    const body = await response.json() as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new AppError(502, "Token do Google Play ausente.", "GOOGLE_AUTH_FAILED");
    this.cachedAccessToken = { value: body.access_token, expiresAt: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000 };
    return body.access_token;
  }
}
