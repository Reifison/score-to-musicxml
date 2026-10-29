import { App } from "./App.js";
import { PublicInfoPage, type PublicInfoPageKind } from "./PublicInfoPage.js";
import { NativePlayerPage } from "../webview/NativePlayerPage.js";
import { isPlayerWebViewPath } from "../webview/playerBridgeContract.js";

export function RoutePage({ pathname = window.location.pathname }: { pathname?: string }) {
  if (isPlayerWebViewPath(pathname)) return <NativePlayerPage />;

  const route = normalizePath(pathname);
  const publicPage: PublicInfoPageKind | null = route === "/suporte"
    ? "support"
    : route === "/privacidade"
      ? "privacy"
      : null;

  return publicPage ? <PublicInfoPage page={publicPage} /> : <App />;
}

function normalizePath(pathname: string) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return normalized || "/";
}
