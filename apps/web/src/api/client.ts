import type { Score, ScoreVersion, VisualCorrectionProposal } from "../types/domain.js";

const isLocalHost = ["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname);
const API_URL = import.meta.env.VITE_API_URL ?? (isLocalHost ? "http://localhost:4000" : window.location.origin);

type ApiErrorBody = {
  error?: string;
  details?: {
    fieldErrors?: Record<string, string[] | undefined>;
    formErrors?: string[];
  };
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
    this.name = "ApiError";
  }
}

const fieldLabels: Record<string, string> = {
  name: "Nome",
  email: "E-mail",
  password: "Senha",
  role: "Perfil",
  isActive: "Status",
  originalFilename: "Nome da partitura"
};

export type TrashScore = {
  id: string;
  originalFilename: string;
  fileType: string;
  fileSize: number;
  isFavorite: boolean;
  createdAt: string;
  deletedAt?: string | null;
  expiresAt?: string | null;
};

function apiErrorMessage(body: ApiErrorBody, fallback = "Erro inesperado.") {
  const fieldError = Object.entries(body.details?.fieldErrors ?? {}).find(([, messages]) => messages?.length);
  if (fieldError) {
    const [field, messages] = fieldError;
    return `${fieldLabels[field] ?? "Campo"}: ${messages?.[0]}`;
  }
  return body.error ?? fallback;
}

async function responseError(response: Response, fallback: string): Promise<ApiError> {
  const body = await response.json().catch(() => ({ error: fallback })) as ApiErrorBody;
  return new ApiError(apiErrorMessage(body, fallback), response.status);
}

async function request(url: string, init: RequestInit, fallback: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError("Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.", null);
  }
  if (!response.ok) {
    const error = await responseError(response, fallback);
    if (response.status === 401 && !url.includes("/api/auth/me") && !url.includes("/api/auth/login")) {
      window.dispatchEvent(new Event("score-to-musicxml:session-expired"));
    }
    throw error;
  }
  return response;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await request(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include"
  }, "Erro inesperado.");
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function downloadUrl(scoreId: string) {
  return `${API_URL}/api/scores/${scoreId}/download`;
}

export function previewUrl(scoreId: string) {
  return `${API_URL}/api/scores/${scoreId}/preview`;
}

export function midiDownloadUrl(scoreId: string) {
  return `${API_URL}/api/scores/${scoreId}/midi`;
}

export async function fetchMusicXml(scoreId: string, preview = false): Promise<string> {
  const url = `${downloadUrl(scoreId)}${preview ? "?preview=true" : ""}`;
  const response = await request(url, {
    credentials: "include"
  }, "Não foi possível carregar o MusicXML.");
  return response.text();
}

export async function fetchScoreVersions(scoreId: string, signal?: AbortSignal): Promise<ScoreVersion[]> {
  const response = await request(`${API_URL}/api/scores/${encodeURIComponent(scoreId)}/versions`, {
    credentials: "include",
    signal
  }, "Não foi possível carregar o histórico desta partitura.");
  const body = await response.json() as { versions: ScoreVersion[] };
  return body.versions;
}

export async function fetchScoreVersionMusicXml(scoreId: string, versionId: string, signal?: AbortSignal): Promise<string> {
  const path = `/api/scores/${encodeURIComponent(scoreId)}/versions/${encodeURIComponent(versionId)}/musicxml`;
  const response = await request(`${API_URL}${path}`, {
    credentials: "include",
    headers: { Accept: "application/vnd.recordare.musicxml+xml" },
    signal
  }, "Não foi possível carregar esta versão.");
  return response.text();
}

export async function fetchFirstPagePreview(scoreId: string, revision: string, signal?: AbortSignal): Promise<string> {
  const query = new URLSearchParams({ revision });
  const response = await request(
    `${API_URL}/api/scores/${encodeURIComponent(scoreId)}/first-page-preview?${query.toString()}`,
    {
      headers: { Accept: "application/vnd.recordare.musicxml+xml" },
      credentials: "include",
      signal
    },
    "Não foi possível carregar a prévia."
  );
  return response.text();
}

export async function approveScoreReview(scoreId: string, revision: string): Promise<Score> {
  const response = await api<{ score: Score }>(`/api/scores/${encodeURIComponent(scoreId)}/review`, {
    method: "POST",
    body: JSON.stringify({ revision })
  });
  return response.score;
}

export async function decideVisualReviewProposal(
  scoreId: string,
  revision: string,
  proposalId: string,
  decision: "accept" | "reject" | "undo",
  signal?: AbortSignal
): Promise<Score> {
  const response = await api<{ score: Score }>(`/api/scores/${encodeURIComponent(scoreId)}/visual-review/decision`, {
    method: "POST",
    body: JSON.stringify({ revision, proposalId, decision } satisfies {
      revision: string;
      proposalId: VisualCorrectionProposal["id"];
      decision: "accept" | "reject" | "undo";
    }),
    signal
  });
  return response.score;
}

export async function fetchSourceEvidence(scoreId: string, assetName: string, signal?: AbortSignal): Promise<Blob> {
  const path = `/api/scores/${encodeURIComponent(scoreId)}/evidence/${encodeURIComponent(assetName)}`;
  const response = await request(`${API_URL}${path}`, { credentials: "include", signal }, "Não foi possível carregar a imagem de origem.");
  return response.blob();
}

export async function fetchMidi(scoreId: string): Promise<Blob> {
  const response = await request(midiDownloadUrl(scoreId), {
    credentials: "include"
  }, "Não foi possível baixar o MIDI.");
  return response.blob();
}

/** Move a score to the seven-day trash. */
export async function deleteScore(scoreId: string): Promise<void> {
  await api(`/api/scores/${scoreId}`, { method: "DELETE" });
}

export async function listTrashScores(): Promise<TrashScore[]> {
  const response = await api<{ scores: TrashScore[] }>("/api/scores/trash");
  return response.scores;
}

export async function restoreScore(scoreId: string): Promise<TrashScore> {
  const response = await api<{ score: TrashScore }>(`/api/scores/${scoreId}/restore`, { method: "POST" });
  return response.score;
}

export async function bulkScoreAction(scoreIds: string[], action: "delete" | "favorite", isFavorite?: boolean): Promise<void> {
  await api("/api/scores/bulk", {
    method: "POST",
    body: JSON.stringify({ ids: scoreIds, action, ...(action === "favorite" ? { isFavorite: isFavorite ?? true } : {}) })
  });
}

export async function downloadMusicXml(scoreId: string, filename: string): Promise<void> {
  const response = await request(downloadUrl(scoreId), {
    credentials: "include"
  }, "Não foi possível baixar o MusicXML.");
  await saveBlob(await response.blob(), filename);
}

export async function downloadScoreVersionMusicXml(scoreId: string, versionId: string, filename: string, signal?: AbortSignal): Promise<void> {
  const musicXml = await fetchScoreVersionMusicXml(scoreId, versionId, signal);
  if (signal?.aborted) throw createAbortError();
  await saveBlob(new Blob([musicXml], { type: "application/vnd.recordare.musicxml+xml" }), filename);
}

export async function downloadMidi(scoreId: string, filename: string): Promise<void> {
  await saveBlob(await fetchMidi(scoreId), filename);
}

async function saveBlob(blob: Blob, filename: string): Promise<void> {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
}

function createAbortError() {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}
