import path from "node:path";
import os from "node:os";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { createServices } from "../container.js";
import { createInMemoryRepositories } from "../repositories/inMemoryRepositories.js";
import { FileStorageService } from "../services/FileStorageService.js";
import { MusicXmlExportService } from "../services/MusicXmlExportService.js";
import type { OmrAdapter } from "../services/OmrAdapter.js";

const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

class TestOmrAdapter implements OmrAdapter {
  private exportService = new MusicXmlExportService();

  async convert(_inputPath: string, originalFilename: string) {
    return {
      musicXml: this.exportService.minimalValidScore(originalFilename, "Teste automatizado."),
      confidence: 0.9,
      warnings: ["Teste automatizado."]
    };
  }
}

async function makeTestApp() {
  const repos = createInMemoryRepositories();
  const services = createServices(repos, { inlineQueue: true, waitForInlineQueue: true });
  const dir = await import("node:fs/promises").then((fs) => fs.mkdtemp(path.join(os.tmpdir(), "score-api-test-")));
  services.storage = new FileStorageService(path.join(dir, "uploads"), path.join(dir, "exports"));
  services.conversion = new (await import("../services/ScoreConversionService.js")).ScoreConversionService(repos.scores, repos.audits, services.storage, new TestOmrAdapter());
  services.scores = new (await import("../services/ScoreService.js")).ScoreService(repos.scores, repos.audits, services.storage);
  const queue = new (await import("../queues/ScoreConversionQueue.js")).InlineConversionQueue(services.conversion, true);
  services.uploads = new (await import("../services/ScoreUploadService.js")).ScoreUploadService(repos.scores, repos.audits, services.storage, queue);
  const app = createApp(services);
  const admin = await repos.users.create({
    name: "Admin",
    email: "admin@example.com",
    passwordHash: await services.auth.hashPassword("Password123!"),
    role: "admin",
    isActive: true
  });
  const user = await repos.users.create({
    name: "User",
    email: "user@example.com",
    passwordHash: await services.auth.hashPassword("Password123!"),
    role: "user",
    isActive: true
  });
  return { app, repos, services, admin, user };
}

async function login(app: ReturnType<typeof createApp>, email: string, password = "Password123!") {
  const response = await request(app).post("/api/auth/login").send({ email, password });
  return response.headers["set-cookie"] as unknown as string[];
}

describe("API", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;

  beforeEach(async () => {
    ctx = await makeTestApp();
  });

  it("permite login válido e rejeita login inválido", async () => {
    await request(ctx.app).post("/api/auth/login").send({ email: "user@example.com", password: "Password123!" }).expect(200);
    await request(ctx.app).post("/api/auth/login").send({ email: "user@example.com", password: "wrong" }).expect(401);
  });

  it("bloqueia usuário comum em rota admin e permite admin", async () => {
    const userCookie = await login(ctx.app, "user@example.com");
    const adminCookie = await login(ctx.app, "admin@example.com");
    await request(ctx.app).get("/api/users").set("Cookie", userCookie).expect(403);
    await request(ctx.app).get("/api/users").set("Cookie", adminCookie).expect(200);
  });

  it("permite usuário comum alterar a própria senha", async () => {
    const userCookie = await login(ctx.app, "user@example.com");
    const response = await request(ctx.app)
      .patch("/api/users/me/password")
      .set("Cookie", userCookie)
      .send({ password: "NovaSenha123!" })
      .expect(200);

    expect(response.body.user.email).toBe("user@example.com");
    expect(response.body.user.passwordHash).toBeUndefined();
    await request(ctx.app).post("/api/auth/login").send({ email: "user@example.com", password: "Password123!" }).expect(401);
    await request(ctx.app).post("/api/auth/login").send({ email: "user@example.com", password: "NovaSenha123!" }).expect(200);
  });

  it("admin cria usuário", async () => {
    const adminCookie = await login(ctx.app, "admin@example.com");
    const response = await request(ctx.app)
      .post("/api/users")
      .set("Cookie", adminCookie)
      .send({ name: "New User", email: "new@example.com", password: "Password123!", role: "user" })
      .expect(201);
    expect(response.body.user.email).toBe("new@example.com");
  });

  it("rejeita arquivo inválido e aceita PDF válido preservando nome original", async () => {
    const cookie = await login(ctx.app, "user@example.com");
    await request(ctx.app).post("/api/scores").set("Cookie", cookie).attach("file", Buffer.from("bad"), "evil.pdf").expect(400);
    const response = await request(ctx.app).post("/api/scores").set("Cookie", cookie).attach("file", pdf, "minha_partitura.pdf").expect(201);
    expect(response.body.score.originalFilename).toBe("minha_partitura.pdf");
    expect(response.body.score.storedFilename).not.toBe("minha_partitura.pdf");
    expect(response.body.score.conversionStatus).toBe("queued");
  });

  it("aceita imagem PNG válida", async () => {
    const cookie = await login(ctx.app, "user@example.com");
    const response = await request(ctx.app).post("/api/scores").set("Cookie", cookie).attach("file", png, "foto.png").expect(201);
    expect(response.body.score.mimeType).toBe("image/png");
  });

  it("impede acesso e download de partitura de outro usuário", async () => {
    const userCookie = await login(ctx.app, "user@example.com");
    const adminCookie = await login(ctx.app, "admin@example.com");
    const created = await request(ctx.app).post("/api/scores").set("Cookie", userCookie).attach("file", pdf, "dono.pdf").expect(201);
    const other = await ctx.repos.users.create({
      name: "Other",
      email: "other@example.com",
      passwordHash: await ctx.services.auth.hashPassword("Password123!"),
      role: "user",
      isActive: true
    });
    const otherCookie = await login(ctx.app, "other@example.com");
    await request(ctx.app).get(`/api/scores/${created.body.score.id}`).set("Cookie", otherCookie).expect(403);
    await request(ctx.app).get(`/api/scores/${created.body.score.id}/download`).set("Cookie", otherCookie).expect(403);
    await request(ctx.app).get(`/api/scores/${created.body.score.id}/download`).set("Cookie", adminCookie).expect(200);
  });

  it("conversão muda status, registra falha e usa nome base original no download", async () => {
    const cookie = await login(ctx.app, "user@example.com");
    const created = await request(ctx.app).post("/api/scores").set("Cookie", cookie).attach("file", pdf, "minha_partitura.pdf").expect(201);
    const detail = await request(ctx.app).get(`/api/scores/${created.body.score.id}`).set("Cookie", cookie).expect(200);
    expect(detail.body.score.conversionStatus).toBe("converted");
    expect(detail.body.score.musicxmlFilename).toMatch(/\.musicxml$/);
    const download = await request(ctx.app).get(`/api/scores/${created.body.score.id}/download`).set("Cookie", cookie).expect(200);
    expect(download.headers["content-disposition"]).toContain("minha_partitura.musicxml");

    await ctx.repos.scores.update(created.body.score.id, { conversionStatus: "failed", errorMessage: "Falha OMR" });
    const failed = await request(ctx.app).get(`/api/scores/${created.body.score.id}`).set("Cookie", cookie).expect(200);
    expect(failed.body.score.errorMessage).toBe("Falha OMR");
  });
});
