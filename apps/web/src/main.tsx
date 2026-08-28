import { createRoot } from "react-dom/client";
import { App } from "./pages/App.js";
import { PrivacyPolicyPage } from "./pages/PrivacyPolicyPage.js";
import { SupportPage } from "./pages/SupportPage.js";
import "./styles/global.css";
import { NativePlayerPage } from "./webview/NativePlayerPage.js";
import { isBundledPlayerWebViewLocation, isPlayerWebViewPath } from "./webview/playerBridgeContract.js";

createRoot(document.getElementById("root")!).render(
  window.location.pathname === "/privacidade"
    ? <PrivacyPolicyPage />
    : window.location.pathname === "/suporte" || window.location.pathname === "/excluir-conta"
    ? <SupportPage />
    : isPlayerWebViewPath(window.location.pathname) || isBundledPlayerWebViewLocation(window.location)
    ? <NativePlayerPage />
    : <App />
);
