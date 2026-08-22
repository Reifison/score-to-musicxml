export const PLAYER_WEBVIEW_PATH = "/mobile/player";

export type PlayerWebViewConfig = {
  origin: string;
  url: string;
};

export function resolvePlayerWebViewConfig(
  configuredUrl: string | undefined,
  allowInsecureDevelopment: boolean
): PlayerWebViewConfig {
  const source = configuredUrl?.trim() || "http://localhost:5173/mobile/player";
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error("A URL do player não está configurada corretamente.");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error("A URL do player não pode conter credenciais, parâmetros ou fragmentos.");
  }
  if (url.protocol !== "https:" && !(allowInsecureDevelopment && url.protocol === "http:")) {
    throw new Error("O player do app exige uma conexão HTTPS.");
  }

  const normalizedPath = normalizePath(url.pathname);
  if (normalizedPath !== "/" && normalizedPath !== PLAYER_WEBVIEW_PATH) {
    throw new Error("A URL configurada não aponta para o player mobile.");
  }
  url.pathname = PLAYER_WEBVIEW_PATH;

  return {
    origin: url.origin,
    url: url.toString()
  };
}

export function isTrustedPlayerOrigin(candidate: string, config: PlayerWebViewConfig): boolean {
  try {
    return new URL(candidate).origin === config.origin;
  } catch {
    return false;
  }
}

export function isTrustedPlayerDocument(candidate: string, config: PlayerWebViewConfig): boolean {
  try {
    const url = new URL(candidate);
    return url.origin === config.origin
      && normalizePath(url.pathname) === PLAYER_WEBVIEW_PATH
      && !url.search
      && !url.hash
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

function normalizePath(pathname: string): string {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}
