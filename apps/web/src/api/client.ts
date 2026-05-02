const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

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
    throw new Error(body.error ?? "Erro inesperado.");
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
