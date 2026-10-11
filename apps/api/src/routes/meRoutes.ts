import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { purchaseRateLimit } from "../middleware/rateLimits.js";

export const meRoutes = Router();

meRoutes.use(requireAuth);

meRoutes.get("/entitlement", async (req, res) => {
  res.json({ entitlement: await req.services.entitlements.getFor(req.user!) });
});

meRoutes.get("/purchase-binding", async (req, res) => {
  res.json({ binding: req.services.entitlements.purchaseBindingFor(req.user!) });
});

meRoutes.post("/entitlement/apple", purchaseRateLimit, async (req, res) => {
  const entitlement = await req.services.entitlements.registerApplePurchase(req.user!, req.body, req.ip);
  res.json({ entitlement });
});

meRoutes.post("/entitlement/google", purchaseRateLimit, async (req, res) => {
  const entitlement = await req.services.entitlements.registerGooglePurchase(req.user!, req.body, req.ip);
  res.json({ entitlement });
});
