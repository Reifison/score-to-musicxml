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
  isActive: "Status"
};

function apiErrorMessage(body: ApiErrorBody) {
  const fieldError = Object.entries(body.details?.fieldErrors ?? {}).find(([, messages]) => messages?.length);
  if (fieldError) {
    const [field, messages] = fieldError;
    return `${fieldLabels[field] ?? "Campo"}: ${messages?.[0]}`;
  }
  return body.error ?? "Erro inesperado.";
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
    const body = await response.json().catch(() => ({ error: "Erro inesperado." }));
    throw new Error(apiErrorMessage(body));
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

export async function downloadMusicXml(scoreId: string, filename: string): Promise<void> {
  const response = await fetch(downloadUrl(scoreId), {
    credentials: "include"
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Não foi possível baixar o MusicXML." }));
    throw new Error(body.error ?? "Não foi possível baixar o MusicXML.");
  }
  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
}
