import { Router } from "express";

export const appleRoutes = Router();

appleRoutes.post("/notifications", async (req, res) => {
  const result = await req.services.entitlements.handleAppleNotification(req.body, req.ip);
  res.json(result);
});
