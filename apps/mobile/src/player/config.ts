import { getLanguage, t, type Language } from "../i18n";

export const PLAYER_WEBVIEW_PATH = "/mobile/player";

export type PlayerWebViewConfig = {
  origin: string;
  url: string;
};

export function resolvePlayerWebViewConfig(
  configuredUrl: string | undefined,
  allowInsecureDevelopment: boolean,
  language: Language = getLanguage()
): PlayerWebViewConfig {
  const source = configuredUrl?.trim() || "http://localhost:5173/mobile/player";
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error(localized(language,
      "A URL do player não está configurada corretamente.",
      "The player URL is not configured correctly."
    ));
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error(localized(language,
      "A URL do player não pode conter credenciais, parâmetros ou fragmentos.",
      "The player URL cannot contain credentials, query parameters, or fragments."
    ));
  }
  if (url.protocol !== "https:" && !(allowInsecureDevelopment && url.protocol === "http:")) {
    throw new Error(localized(language,
      "O player do app exige uma conexão HTTPS.",
      "The app player requires an HTTPS connection."
    ));
  }

  const normalizedPath = normalizePath(url.pathname);
  if (normalizedPath !== "/" && normalizedPath !== PLAYER_WEBVIEW_PATH) {
    throw new Error(localized(language,
      "A URL configurada não aponta para o player mobile.",
      "The configured URL does not point to the mobile player."
    ));
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

function localized(language: Language, portuguese: string, english: string): string {
  if (language === getLanguage()) return t(portuguese, english);
  return language === "en" ? english : portuguese;
}
