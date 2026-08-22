const isLocalHost = ["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname);
const API_URL = import.meta.env.VITE_API_URL ?? (isLocalHost ? "http://localhost:4000" : window.location.origin);

type ApiErrorBody = {
  error?: string;
  details?: {
    fieldErrors?: Record<string, string[] | undefined>;
    formErrors?: string[];
  };
};

const fieldLabels: Record<string, string> = {
  name: "Nome",
  email: "E-mail",
  password: "Senha",
  role: "Perfil",
  isActive: "Status",
  originalFilename: "Nome da partitura"
};

function apiErrorMessage(body: ApiErrorBody, fallback = "Erro inesperado.") {
  const fieldError = Object.entries(body.details?.fieldErrors ?? {}).find(([, messages]) => messages?.length);
  if (fieldError) {
    const [field, messages] = fieldError;
    return `${fieldLabels[field] ?? "Campo"}: ${messages?.[0]}`;
  }
  return body.error ?? fallback;
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({ error: fallback })) as ApiErrorBody;
  return new Error(apiErrorMessage(body, fallback));
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include"
  });
  if (!response.ok) {
    throw await responseError(response, "Erro inesperado.");
  }
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

export async function fetchMusicXml(scoreId: string): Promise<string> {
  const response = await fetch(downloadUrl(scoreId), {
    credentials: "include"
  });
  if (!response.ok) {
    throw await responseError(response, "Não foi possível carregar o MusicXML.");
  }
  return response.text();
}

export async function fetchMidi(scoreId: string): Promise<Blob> {
  const response = await fetch(midiDownloadUrl(scoreId), {
    credentials: "include"
  });
  if (!response.ok) {
    throw await responseError(response, "Não foi possível baixar o MIDI.");
  }
  return response.blob();
}

export async function downloadMusicXml(scoreId: string, filename: string): Promise<void> {
  const response = await fetch(downloadUrl(scoreId), {
    credentials: "include"
  });
  if (!response.ok) {
    throw await responseError(response, "Não foi possível baixar o MusicXML.");
  }
  await saveBlob(await response.blob(), filename);
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
