import { Router } from "express";
import { googleRtdnRateLimit } from "../middleware/rateLimits.js";

export const googleRoutes = Router();

googleRoutes.post("/rtdn", googleRtdnRateLimit, async (req, res) => {
  const authorization = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const result = await req.services.entitlements.handleGoogleNotification(req.body, authorization, req.ip);
  res.json(result);
});
