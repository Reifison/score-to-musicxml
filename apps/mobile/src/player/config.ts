export const PLAYER_WEBVIEW_PATH = "/mobile/player";

export type PlayerWebViewConfig = {
  kind: "bundled" | "remote";
  origin: string;
  url: string;
  bundledRoot?: string;
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
    kind: "remote",
    origin: url.origin,
    url: url.toString()
  };
}

/**
 * The release build ships the visual player as an app resource. Keeping it in
 * the signed bundle makes score viewing independent from a development Mac,
 * local Wi-Fi, and availability of the web deployment.
 */
export function resolveBundledPlayerWebViewConfig(bundleDirectory: string | null): PlayerWebViewConfig {
  if (!bundleDirectory) {
    throw new Error("Os arquivos locais do player não estão disponíveis neste app.");
  }

  const bundledRoot = `${bundleDirectory.replace(/\/+$/, "")}/player/`;
  return {
    bundledRoot,
    kind: "bundled",
    origin: "file://",
    url: `${bundledRoot}index.html`
  };
}

export function isTrustedPlayerOrigin(candidate: string, config: PlayerWebViewConfig): boolean {
  if (config.kind === "bundled") return isBundledPlayerResource(candidate, config);
  try {
    return new URL(candidate).origin === config.origin;
  } catch {
    return false;
  }
}

export function isTrustedPlayerDocument(candidate: string, config: PlayerWebViewConfig): boolean {
  if (config.kind === "bundled") {
    try {
      const url = new URL(candidate);
      return isBundledPlayerResource(candidate, config)
        && url.pathname.endsWith("/player/index.html")
        && !url.search
        && !url.hash;
    } catch {
      return false;
    }
  }
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

function isBundledPlayerResource(candidate: string, config: PlayerWebViewConfig): boolean {
  if (!config.bundledRoot) return false;
  try {
    const resource = new URL(candidate);
    const root = new URL(config.bundledRoot);
    return resource.protocol === "file:"
      && resource.pathname.startsWith(root.pathname)
      && !resource.username
      && !resource.password;
  } catch {
    return false;
  }
}

function normalizePath(pathname: string): string {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}
