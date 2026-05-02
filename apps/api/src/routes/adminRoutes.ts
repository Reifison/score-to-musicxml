import { Router } from "express";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

export const adminRoutes = Router();

adminRoutes.use(requireAuth, requireAdmin);

adminRoutes.get("/audits", async (req, res) => {
  res.json({ audits: await req.services.repositories.audits.list() });
});
