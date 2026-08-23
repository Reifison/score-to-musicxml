/**
 * Resolve the API endpoint embedded in the mobile bundle.
 *
 * A release build must never silently fall back to localhost: on a device,
 * localhost points to the device itself and makes the app depend on a
 * developer machine being reachable. Local HTTP remains available only when
 * development explicitly allows it.
 */
export function resolveApiUrl(
  configuredUrl: string | undefined,
  allowInsecureDevelopment: boolean
): string {
  const source = configuredUrl?.trim() || (allowInsecureDevelopment ? "http://localhost:4000" : "");
  if (!source) {
    throw new Error("A URL da API não está configurada para este build.");
  }

  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error("A URL da API não está configurada corretamente.");
  }

  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("A URL da API não pode conter credenciais, caminho, parâmetros ou fragmentos.");
  }
  if (url.protocol !== "https:" && !(allowInsecureDevelopment && url.protocol === "http:")) {
    throw new Error("O app exige uma conexão HTTPS com a API.");
  }

  return url.origin;
}
