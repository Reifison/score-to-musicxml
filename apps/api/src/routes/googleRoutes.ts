import { Router } from "express";

export const googleRoutes = Router();

googleRoutes.post("/rtdn", async (req, res) => {
  const authorization = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const result = await req.services.entitlements.handleGoogleNotification(req.body, authorization, req.ip);
  res.json(result);
});
