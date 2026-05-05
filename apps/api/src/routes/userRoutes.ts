import { Router } from "express";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

export const userRoutes = Router();

userRoutes.use(requireAuth);

userRoutes.patch("/me/password", async (req, res) => {
  const user = await req.services.users.updateOwnPassword(req.user!, req.body, req.ip);
  res.json({ user });
});

userRoutes.use(requireAdmin);

userRoutes.get("/", async (req, res) => {
  res.json({ users: await req.services.users.list() });
});

userRoutes.post("/", async (req, res) => {
  const user = await req.services.users.create(req.body, req.user!, req.ip);
  res.status(201).json({ user });
});

userRoutes.patch("/:id", async (req, res) => {
  const user = await req.services.users.update(req.params.id, req.body, req.user!, req.ip);
  res.json({ user });
});

userRoutes.delete("/:id", async (req, res) => {
  await req.services.users.delete(req.params.id, req.user!, req.ip);
  res.status(204).send();
});
