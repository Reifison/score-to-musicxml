import { createServices } from "./container.js";
import { env } from "./config/env.js";

const services = createServices(undefined, { inlineQueue: true });

let admin = await services.repositories.users.findByEmail(env.ADMIN_EMAIL);
if (!admin) {
  admin = await services.repositories.users.create({
    name: "Admin",
    email: env.ADMIN_EMAIL,
    passwordHash: await services.auth.hashPassword(env.ADMIN_PASSWORD),
    role: "admin",
    isActive: true
  });
  console.log(`Admin criado: ${env.ADMIN_EMAIL}`);
} else {
  if (admin.role !== "admin" || !admin.isActive) {
    admin = await services.repositories.users.update(admin.id, { role: "admin", isActive: true });
    console.log(`Admin atualizado: ${env.ADMIN_EMAIL}`);
  } else {
    console.log(`Admin já existe: ${env.ADMIN_EMAIL}`);
  }
}

const reviewerConfigured = Boolean(env.PLAY_REVIEWER_EMAIL || env.PLAY_REVIEWER_PASSWORD);
if (reviewerConfigured && (!env.PLAY_REVIEWER_EMAIL || !env.PLAY_REVIEWER_PASSWORD)) {
  throw new Error("PLAY_REVIEWER_EMAIL e PLAY_REVIEWER_PASSWORD devem ser configurados juntos.");
}

if (env.PLAY_REVIEWER_EMAIL && env.PLAY_REVIEWER_PASSWORD) {
  const passwordHash = await services.auth.hashPassword(env.PLAY_REVIEWER_PASSWORD);
  const existingReviewer = await services.repositories.users.findByEmail(env.PLAY_REVIEWER_EMAIL);
  const reviewer = existingReviewer
    ? await services.repositories.users.update(existingReviewer.id, {
        name: "Google Play Review",
        passwordHash,
        role: "user",
        isActive: true
      })
    : await services.repositories.users.create({
        name: "Google Play Review",
        email: env.PLAY_REVIEWER_EMAIL,
        passwordHash,
        role: "user",
        isActive: true
      });

  await services.entitlements.grantAdminAccess(
    reviewer.id,
    admin,
    { reason: "Conta de teste para revisão do Google Play." }
  );
  console.log(`Conta de revisão Google Play ativa: ${reviewer.email}`);
}

process.exit(0);
