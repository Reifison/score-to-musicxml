import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { createServices, type AppServices } from "./container.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { attachServices } from "./middleware/services.js";
import { adminRoutes } from "./routes/adminRoutes.js";
import { authRoutes } from "./routes/authRoutes.js";
import { scoreRoutes } from "./routes/scoreRoutes.js";
import { userRoutes } from "./routes/userRoutes.js";

export function createApp(services: AppServices = createServices()) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(compression());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser(env.SESSION_SECRET));
  app.use(attachServices(services));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/scores", scoreRoutes);
  app.use("/api/admin", adminRoutes);
  app.use(errorHandler);

  return app;
}
