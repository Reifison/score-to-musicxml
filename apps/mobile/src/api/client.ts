import { File, Paths } from "expo-file-system";
import type { AuditLog, Entitlement, PublicUser, Score } from "./types";

export const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000";
const mobileHeader = "score-to-musicxml-ios";

type ApiErrorBody = {
  error?: string;
  code?: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: ApiErrorBody & Partial<T>;
  try {
    body = (text ? JSON.parse(text) : {}) as ApiErrorBody & Partial<T>;
  } catch {
    throw new ApiError("A API retornou uma resposta inesperada.", response.status, "INVALID_API_RESPONSE");
  }
  if (!response.ok) {
    throw new ApiError(body.error || "Falha na comunicacao com a API.", response.status, body.code);
  }
  return body as T;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });
  return parseResponse<T>(response);
}

export const api = {
  async health() {
    return apiRequest<{ ok: boolean }>("/health");
  },

  async login(email: string, password: string) {
    const response = await apiRequest<{ user: PublicUser; token?: string }>("/api/auth/login", {
      method: "POST",
      headers: { "x-mobile-client": mobileHeader },
      body: JSON.stringify({ email, password })
    });
    if (!response.token) {
      throw new ApiError("Esta API ainda nao esta atualizada para login no app mobile.", 500, "MOBILE_TOKEN_MISSING");
    }
    return { user: response.user, token: response.token };
  },

  async me(token: string) {
    return apiRequest<{ user: PublicUser }>("/api/auth/me", {}, token);
  },

  async logout(token: string) {
    await apiRequest<void>("/api/auth/logout", { method: "POST" }, token);
  },

  async entitlement(token: string) {
    return apiRequest<{ entitlement: Entitlement }>("/api/me/entitlement", {}, token);
  },

  async scores(token: string) {
    return apiRequest<{ scores: Score[] }>("/api/scores", {}, token);
  },

  async users(token: string) {
    return apiRequest<{ users: PublicUser[] }>("/api/users", {}, token);
  },

  async audits(token: string) {
    return apiRequest<{ audits: AuditLog[] }>("/api/admin/audits", {}, token);
  },

  async score(token: string, id: string) {
    return apiRequest<{ score: Score }>(`/api/scores/${id}`, {}, token);
  },

  async upload(token: string, file: { uri: string; name: string; type: string }) {
    const body = new FormData();
    body.append("file", file as unknown as Blob);
    return apiRequest<{ score: Score }>("/api/scores", { method: "POST", body }, token);
  },

  async updatePassword(token: string, password: string) {
    return apiRequest<{ user: PublicUser }>("/api/users/me/password", {
      method: "PATCH",
      body: JSON.stringify({ password })
    }, token);
  },

  async registerApplePurchase(
    token: string,
    purchase: { originalTransactionId: string; productId: string; purchaseToken?: string; purchasedAt?: string; restored?: boolean; transactionId?: string }
  ) {
    return apiRequest<{ entitlement: Entitlement }>("/api/me/entitlement/apple", {
      method: "POST",
      body: JSON.stringify(purchase)
    }, token);
  },

  async downloadMusicXml(token: string, score: Score) {
    const target = new File(Paths.cache, musicXmlName(score.originalFilename));
    return File.downloadFileAsync(`${API_URL}/api/scores/${score.id}/download`, target, {
      headers: { Authorization: `Bearer ${token}` },
      idempotent: true
    });
  },

  async downloadPreview(token: string, score: Score) {
    const extension = score.fileType === "image" ? imageExtension(score.mimeType) : "pdf";
    const target = new File(Paths.cache, `${score.id}-preview.${extension}`);
    return File.downloadFileAsync(`${API_URL}/api/scores/${score.id}/preview`, target, {
      headers: { Authorization: `Bearer ${token}` },
      idempotent: true
    });
  }
};

function musicXmlName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._ -]/g, "_").trim() || "score";
  return `${base}.musicxml`;
}

function imageExtension(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
}
