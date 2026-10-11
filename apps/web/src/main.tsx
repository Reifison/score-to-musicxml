import { createRoot } from "react-dom/client";
import "./styles/global.css";
import { RoutePage } from "./pages/RoutePage.js";

createRoot(document.getElementById("root")!).render(<RoutePage />);
