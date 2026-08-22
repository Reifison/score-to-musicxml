import { createRoot } from "react-dom/client";
import { App } from "./pages/App.js";
import "./styles/global.css";
import { NativePlayerPage } from "./webview/NativePlayerPage.js";
import { isPlayerWebViewPath } from "./webview/playerBridgeContract.js";

createRoot(document.getElementById("root")!).render(
  isPlayerWebViewPath(window.location.pathname) ? <NativePlayerPage /> : <App />
);
