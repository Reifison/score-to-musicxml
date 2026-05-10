import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

export const meRoutes = Router();

meRoutes.use(requireAuth);

meRoutes.get("/entitlement", async (req, res) => {
  res.json({ entitlement: await req.services.entitlements.getFor(req.user!) });
});

meRoutes.post("/entitlement/apple", async (req, res) => {
  const entitlement = await req.services.entitlements.registerApplePurchase(req.user!, req.body, req.ip);
  res.json({ entitlement });
});
