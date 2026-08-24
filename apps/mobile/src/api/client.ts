import { Directory, File, Paths } from "expo-file-system";
import { resolveApiUrl } from "./config";
import { createMidiDownloadPlan, runMidiDownload } from "../files/midiExport";
import { validatePlayerMusicXml, validatePlayerMusicXmlSize } from "../player/bridge";
import { createPlayerMusicXmlDownloadPlan } from "../player/musicXmlDownload";
import { googlePurchaseRequest, type GooglePurchaseRegistration } from "./purchases";
import type { AuditLog, Entitlement, PublicUser, Score } from "./types";

export const API_URL = resolveApiUrl(
  process.env.EXPO_PUBLIC_API_URL,
  __DEV__ || process.env.EXPO_PUBLIC_ALLOW_HTTP_API === "1"
);
// The bearer-token response is needed by every native mobile target. Keep this
// value platform-neutral so Android does not accidentally receive the web
// session-cookie response.
export const mobileClientHeader = "score-to-musicxml-mobile";

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
      headers: { "x-mobile-client": mobileClientHeader },
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

  async renameScore(token: string, id: string, originalFilename: string) {
    return apiRequest<{ score: Score }>(`/api/scores/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ originalFilename })
    }, token);
  },

  async setScoreFavorite(token: string, id: string, isFavorite: boolean) {
    return apiRequest<{ score: Score }>(`/api/scores/${id}/favorite`, {
      method: "PATCH",
      body: JSON.stringify({ isFavorite })
    }, token);
  },

  /** Move a score to the seven-day trash instead of deleting its file immediately. */
  async deleteScore(token: string, id: string) {
    return apiRequest<void>(`/api/scores/${id}`, { method: "DELETE" }, token);
  },

  async bulkScores(token: string, ids: string[], action: "delete" | "favorite", isFavorite?: boolean) {
    return apiRequest<{ deletedCount?: number; updatedCount?: number; purgeAt?: string }>("/api/scores/bulk", {
      method: "POST",
      body: JSON.stringify({ ids, action, ...(action === "favorite" ? { isFavorite: Boolean(isFavorite) } : {}) })
    }, token);
  },

  /** List scores currently in the user's trash. */
  async trashScores(token: string) {
    return apiRequest<{ scores: Score[] }>("/api/scores/trash", {}, token);
  },

  /** Restore a score from the seven-day trash. */
  async restoreScore(token: string, id: string) {
    return apiRequest<{ score: Score }>(`/api/scores/${id}/restore`, { method: "POST" }, token);
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

  async registerGooglePurchase(
    token: string,
    purchase: GooglePurchaseRegistration
  ) {
    const request = googlePurchaseRequest(purchase);
    return apiRequest<{ entitlement: Entitlement }>(request.path, request, token);
  },

  async downloadMusicXml(token: string, score: Score) {
    const target = new File(Paths.cache, musicXmlName(score.originalFilename));
    return File.downloadFileAsync(`${API_URL}/api/scores/${score.id}/download`, target, {
      headers: { Authorization: `Bearer ${token}` },
      idempotent: true
    });
  },

  async loadMusicXmlForPlayer(token: string, score: Score) {
    const plan = createPlayerMusicXmlDownloadPlan(API_URL, token, score);
    const directory = new Directory(Paths.cache, ...plan.directorySegments);
    directory.create({ idempotent: true, intermediates: true });
    const target = new File(directory, plan.filename);
    const downloaded = await File.downloadFileAsync(plan.url, target, {
      headers: plan.headers,
      idempotent: plan.idempotent
    });

    try {
      if (downloaded.size !== null) validatePlayerMusicXmlSize(downloaded.size);
      const musicXml = await downloaded.text();
      validatePlayerMusicXml(musicXml, downloaded.size);
      return musicXml;
    } finally {
      try {
        if (downloaded.exists) downloaded.delete();
      } catch {
        // A próxima leitura sobrescreve o cache isolado; a limpeza é best-effort.
      }
    }
  },

  async downloadMidi(token: string, score: Score) {
    const plan = createMidiDownloadPlan(API_URL, token, score);
    const directoryFor = (segments: readonly string[]) => new Directory(Paths.cache, ...segments);
    return runMidiDownload(plan, {
      ensureDirectory(segments) {
        directoryFor(segments).create({ idempotent: true, intermediates: true });
      },
      download(downloadPlan) {
        const target = new File(directoryFor(downloadPlan.directorySegments), downloadPlan.filename);
        return File.downloadFileAsync(downloadPlan.url, target, {
          headers: downloadPlan.headers,
          idempotent: downloadPlan.idempotent
        });
      },
      removeStale(segments, currentUri) {
        removeStaleMidiFiles(directoryFor(segments), currentUri);
      },
      removeLegacy(filename, currentUri) {
        const legacyTarget = new File(Paths.cache, filename);
        if (legacyTarget.exists && legacyTarget.uri !== currentUri) legacyTarget.delete();
      }
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

function removeStaleMidiFiles(directory: Directory, currentUri: string): void {
  try {
    for (const entry of directory.list()) {
      if (entry instanceof File && entry.uri !== currentUri && entry.name.toLowerCase().endsWith(".mid")) {
        entry.delete();
      }
    }
  } catch {
    // Cache cleanup must not invalidate a MIDI that was downloaded successfully.
  }
}

function imageExtension(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
}
