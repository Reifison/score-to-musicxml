import { createRoot } from "react-dom/client";
import { App } from "./pages/App.js";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(<App />);
