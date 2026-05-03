import { createServices } from "./container.js";
import { env } from "./config/env.js";

const services = createServices(undefined, { inlineQueue: true });

const existing = await services.repositories.users.findByEmail(env.ADMIN_EMAIL);
if (!existing) {
  await services.repositories.users.create({
    name: "Admin",
    email: env.ADMIN_EMAIL,
    passwordHash: await services.auth.hashPassword(env.ADMIN_PASSWORD),
    role: "admin",
    isActive: true
  });
  console.log(`Admin criado: ${env.ADMIN_EMAIL}`);
} else {
  if (existing.role !== "admin" || !existing.isActive) {
    await services.repositories.users.update(existing.id, { role: "admin", isActive: true });
    console.log(`Admin atualizado: ${env.ADMIN_EMAIL}`);
  } else {
    console.log(`Admin já existe: ${env.ADMIN_EMAIL}`);
  }
}

process.exit(0);
