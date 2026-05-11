import { Router } from "express";
import { notFound } from "../errors/AppError.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

export const adminRoutes = Router();

adminRoutes.use(requireAuth, requireAdmin);

adminRoutes.get("/audits", async (req, res) => {
  res.json({ audits: await req.services.repositories.audits.list() });
});

adminRoutes.post("/retention/cleanup", async (req, res) => {
  res.json(await req.services.retention.cleanup(req.ip));
});

adminRoutes.post("/users/:id/entitlement/grant", async (req, res) => {
  const user = await req.services.repositories.users.findById(req.params.id);
  if (!user) throw notFound();
  const entitlement = await req.services.entitlements.grantAdminAccess(user.id, req.user!, req.body, req.ip);
  res.json({ entitlement });
});

adminRoutes.delete("/users/:id/entitlement/grant", async (req, res) => {
  const user = await req.services.repositories.users.findById(req.params.id);
  if (!user) throw notFound();
  const entitlement = await req.services.entitlements.revokeAdminAccess(user.id, req.user!, req.ip);
  res.json({ entitlement });
});
