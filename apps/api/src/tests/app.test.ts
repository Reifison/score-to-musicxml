import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { createServices } from "../container.js";
import { createInMemoryRepositories } from "../repositories/inMemoryRepositories.js";
import { FileStorageService } from "../services/FileStorageService.js";
import { MidiExportService } from "../services/MidiExportService.js";
import { MidiObservabilityService, type MidiMetric } from "../services/MidiObservabilityService.js";
import { MusicXmlExportService } from "../services/MusicXmlExportService.js";
import type { OmrAdapter } from "../services/OmrAdapter.js";

const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");

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
  const midiMetrics: MidiMetric[] = [];
  services.midiObservability = new MidiObservabilityService((metric) => midiMetrics.push(metric));
  services.midiExport = new MidiExportService(undefined, services.midiObservability);
  const dir = await import("node:fs/promises").then((fs) => fs.mkdtemp(path.join(os.tmpdir(), "score-api-test-")));
  services.storage = new FileStorageService(path.join(dir, "uploads"), path.join(dir, "exports"));
  services.conversion = new (await import("../services/ScoreConversionService.js")).ScoreConversionService(repos.scores, repos.audits, services.storage, new TestOmrAdapter());
  services.scores = new (await import("../services/ScoreService.js")).ScoreService(repos.scores, repos.audits, services.storage, services.midiExport);
  const queue = new (await import("../queues/ScoreConversionQueue.js")).InlineConversionQueue(services.conversion, true);
  services.uploads = new (await import("../services/ScoreUploadService.js")).ScoreUploadService(repos.audits, services.storage, queue, services.entitlements, services.fileSecurity);
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
  return { app, repos, services, admin, user, midiMetrics };
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

  it("emite token mobile sob demanda e aceita Authorization Bearer", async () => {
    const response = await request(ctx.app)
      .post("/api/auth/login")
      .set("x-mobile-client", "score-to-musicxml-mobile")
      .send({ email: "user@example.com", password: "Password123!" })
      .expect(200);
    expect(response.body.token).toEqual(expect.any(String));
    await request(ctx.app).get("/api/auth/me").set("Authorization", `Bearer ${response.body.token}`).expect(200);
    await request(ctx.app).post("/api/auth/logout").set("Authorization", `Bearer ${response.body.token}`).expect(204);
    await request(ctx.app).get("/api/auth/me").set("Authorization", `Bearer ${response.body.token}`).expect(401);
  });

  it("registra compra Google Play e impede reutilizar o token em outra conta", async () => {
    const cookie = await login(ctx.app, "user@example.com");
    const token = "google-purchase-token-unique-12345";
    const purchase = await request(ctx.app)
      .post("/api/me/entitlement/google")
      .set("Cookie", cookie)
      .send({ productId: "premium_unlock", purchaseToken: token })
      .expect(200);
    expect(purchase.body.entitlement).toMatchObject({ plan: "paid", source: "google_play", googleProductId: "premium_unlock" });

    const other = await ctx.repos.users.create({
      name: "Other",
      email: "other-purchase@example.com",
      passwordHash: await ctx.services.auth.hashPassword("Password123!"),
      role: "user",
      isActive: true
    });
    expect(other.id).toBeTruthy();
    const otherCookie = await login(ctx.app, "other-purchase@example.com");
    await request(ctx.app)
      .post("/api/me/entitlement/google")
      .set("Cookie", otherCookie)
      .send({ productId: "premium_unlock", purchaseToken: token })
      .expect(409);
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

  it("bloqueia PDF com conteúdo ativo antes de persistir upload", async () => {
    const cookie = await login(ctx.app, "user@example.com");
    const activePdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /OpenAction 2 0 R >>\nendobj\n%%EOF");
    await request(ctx.app).post("/api/scores").set("Cookie", cookie).attach("file", activePdf, "ativo.pdf").expect(400);
    const scores = await ctx.repos.scores.list({ userId: ctx.user.id });
    expect(scores).toHaveLength(0);
  });

  it("aceita imagem PNG válida", async () => {
    const cookie = await login(ctx.app, "user@example.com");
    const response = await request(ctx.app).post("/api/scores").set("Cookie", cookie).attach("file", png, "foto.png").expect(201);
    expect(response.body.score.mimeType).toBe("image/png");
  });

  it("permite renomear partitura preservando a extensão", async () => {
    const cookie = await login(ctx.app, "user@example.com");
    const created = await request(ctx.app).post("/api/scores").set("Cookie", cookie).attach("file", pdf, "partitura_antiga.pdf").expect(201);
    const renamed = await request(ctx.app)
      .patch(`/api/scores/${created.body.score.id}`)
      .set("Cookie", cookie)
      .send({ originalFilename: "Minha Partitura" })
      .expect(200);
    expect(renamed.body.score.originalFilename).toBe("Minha Partitura.pdf");
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
    await request(ctx.app).get(`/api/scores/${created.body.score.id}/midi`).set("Cookie", otherCookie).expect(403);
    await request(ctx.app).get(`/api/scores/${created.body.score.id}/preview`).set("Cookie", otherCookie).expect(403);
    await request(ctx.app).get(`/api/scores/${created.body.score.id}/download`).set("Cookie", adminCookie).expect(200);
    await request(ctx.app).get(`/api/scores/${created.body.score.id}/midi`).set("Cookie", adminCookie).expect(200);
  });

  it("aplica limite gratuito de 2 conversões e libera após compra registrada", async () => {
    const cookie = await login(ctx.app, "user@example.com");

    const initialEntitlement = await request(ctx.app).get("/api/me/entitlement").set("Cookie", cookie).expect(200);
    expect(initialEntitlement.body.entitlement).toMatchObject({ plan: "free", freeScanLimit: 2, freeScansUsed: 0, freeScansRemaining: 2 });

    for (const name of ["um.pdf", "dois.pdf"]) {
      await request(ctx.app).post("/api/scores").set("Cookie", cookie).attach("file", pdf, name).expect(201);
    }

    const exhausted = await request(ctx.app).get("/api/me/entitlement").set("Cookie", cookie).expect(200);
    expect(exhausted.body.entitlement).toMatchObject({ plan: "free", freeScansUsed: 2, freeScansRemaining: 0 });
    await request(ctx.app).post("/api/scores").set("Cookie", cookie).attach("file", pdf, "tres.pdf").expect(402);

    const purchase = await request(ctx.app)
      .post("/api/me/entitlement/apple")
      .set("Cookie", cookie)
      .send({ productId: "premium_unlock", originalTransactionId: "test-original-transaction", purchasedAt: "2026-05-09T12:00:00.000Z" })
      .expect(200);
    expect(purchase.body.entitlement).toMatchObject({ plan: "paid", freeScansUsed: 2, freeScansRemaining: null });

    await request(ctx.app).post("/api/scores").set("Cookie", cookie).attach("file", pdf, "tres.pdf").expect(201);
  });

  it("admin concede e remove acesso completo para usuário de teste", async () => {
    const userCookie = await login(ctx.app, "user@example.com");
    const adminCookie = await login(ctx.app, "admin@example.com");

    for (const name of ["um.pdf", "dois.pdf"]) {
      await request(ctx.app).post("/api/scores").set("Cookie", userCookie).attach("file", pdf, name).expect(201);
    }
    await request(ctx.app).post("/api/scores").set("Cookie", userCookie).attach("file", pdf, "bloqueado.pdf").expect(402);

    const grant = await request(ctx.app)
      .post(`/api/admin/users/${ctx.user.id}/entitlement/grant`)
      .set("Cookie", adminCookie)
      .send({ reason: "Teste beta iOS" })
      .expect(200);
    expect(grant.body.entitlement).toMatchObject({
      plan: "paid",
      source: "admin_grant",
      freeScansUsed: 2,
      freeScansRemaining: null,
      grantedById: ctx.admin.id,
      grantReason: "Teste beta iOS"
    });

    await request(ctx.app).post("/api/scores").set("Cookie", userCookie).attach("file", pdf, "liberado.pdf").expect(201);

    const revoked = await request(ctx.app)
      .delete(`/api/admin/users/${ctx.user.id}/entitlement/grant`)
      .set("Cookie", adminCookie)
      .expect(200);
    expect(revoked.body.entitlement).toMatchObject({
      plan: "free",
      source: "free",
      freeScansUsed: 2,
      freeScansRemaining: 0
    });
    await request(ctx.app).post("/api/scores").set("Cookie", userCookie).attach("file", pdf, "bloqueado-de-novo.pdf").expect(402);
  });

  it("não remove acesso concedido por admin ao processar revogação Apple", async () => {
    await ctx.repos.entitlements.grantAdminAccess({ userId: ctx.user.id, grantedById: ctx.admin.id, reason: "Teste" }, 3);
    const revoked = await ctx.repos.entitlements.revokeApplePurchase("test-original-transaction", 3);
    expect(revoked).toBeNull();
    const summary = await ctx.repos.entitlements.getSummary(ctx.user.id, 3);
    expect(summary).toMatchObject({ plan: "paid", source: "admin_grant" });
  });

  it("conversão muda status, registra falha e usa nome base original no download", async () => {
    const cookie = await login(ctx.app, "user@example.com");
    const created = await request(ctx.app).post("/api/scores").set("Cookie", cookie).attach("file", pdf, "minha_partitura.pdf").expect(201);
    const detail = await request(ctx.app).get(`/api/scores/${created.body.score.id}`).set("Cookie", cookie).expect(200);
    expect(detail.body.score.conversionStatus).toBe("converted");
    expect(detail.body.score.musicxmlFilename).toMatch(/\.musicxml$/);
    const download = await request(ctx.app).get(`/api/scores/${created.body.score.id}/download`).set("Cookie", cookie).expect(200);
    expect(download.headers["content-disposition"]).toContain("minha_partitura.musicxml");
    expect(download.text).toContain("<score-partwise");
    expect(download.headers["cache-control"]).toBe("private, no-store, max-age=0");
    expect(download.headers.pragma).toBe("no-cache");
    expect(download.headers.expires).toBe("0");
    const midi = await request(ctx.app).get(`/api/scores/${created.body.score.id}/midi`).set("Cookie", cookie).expect(200);
    expect(midi.headers["content-type"]).toMatch(/^audio\/midi/);
    expect(midi.headers["content-disposition"]).toContain("minha_partitura.mid");
    expect(Buffer.isBuffer(midi.body)).toBe(true);
    expect(midi.body.subarray(0, 4).toString("ascii")).toBe("MThd");
    expect(midi.headers["cache-control"]).toBe("private, no-store, max-age=0");
    expect(midi.headers.pragma).toBe("no-cache");
    expect(midi.headers.expires).toBe("0");
    expect(ctx.midiMetrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: "midi_export", phase: "generation", status: "success", sizeBytes: midi.body.byteLength }),
      expect.objectContaining({ metric: "midi_export", phase: "download", status: "success", sizeBytes: midi.body.byteLength })
    ]));

    await ctx.repos.scores.update(created.body.score.id, { conversionStatus: "failed", errorMessage: "Falha OMR" });
    const failed = await request(ctx.app).get(`/api/scores/${created.body.score.id}`).set("Cookie", cookie).expect(200);
    expect(failed.body.score.errorMessage).toBe("Falha OMR");
    await request(ctx.app).get(`/api/scores/${created.body.score.id}/midi`).set("Cookie", cookie).expect(409);
    expect(ctx.midiMetrics).toContainEqual(expect.objectContaining({
      metric: "midi_export",
      phase: "download",
      status: "failure",
      errorCode: "MIDI_NOT_READY"
    }));
  });

  it("retorna erro explícito sem auditar download quando o export convertido não existe", async () => {
    const cookie = await login(ctx.app, "user@example.com");
    const created = await request(ctx.app).post("/api/scores").set("Cookie", cookie).attach("file", pdf, "sem-export.pdf").expect(201);
    const score = await ctx.repos.scores.findById(created.body.score.id);
    expect(score?.musicxmlFilename).toMatch(/\.musicxml$/);
    await ctx.services.storage.deleteExport(score!.musicxmlFilename);

    const serverLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const download = await request(ctx.app)
        .get(`/api/scores/${created.body.score.id}/download`)
        .set("Cookie", cookie)
        .expect(410);

      expect(download.body).toEqual({
        error: "O arquivo MusicXML desta partitura não está disponível. Converta o arquivo novamente.",
        code: "MUSICXML_EXPORT_UNAVAILABLE"
      });
      expect(serverLog).toHaveBeenCalledWith(
        "MusicXML export unavailable for download",
        expect.objectContaining({ scoreId: created.body.score.id, error: expect.objectContaining({ code: "ENOENT" }) })
      );
    } finally {
      serverLog.mockRestore();
    }

    const audits = await ctx.repos.audits.list();
    expect(audits).not.toContainEqual(expect.objectContaining({ action: "score_downloaded", entityId: created.body.score.id }));
  });

  it("nunca segue link simbólico no download do MusicXML", async () => {
    const cookie = await login(ctx.app, "user@example.com");
    const created = await request(ctx.app).post("/api/scores").set("Cookie", cookie).attach("file", pdf, "export-link.pdf").expect(201);
    const score = await ctx.repos.scores.findById(created.body.score.id);
    expect(score?.musicxmlFilename).toMatch(/\.musicxml$/);
    await ctx.services.storage.deleteExport(score!.musicxmlFilename);
    await fs.symlink(
      ctx.services.storage.resolveUploadPath(score!.storedFilename),
      ctx.services.storage.resolveExportPath(score!.musicxmlFilename)
    );

    const serverLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await request(ctx.app).get(`/api/scores/${created.body.score.id}/download`).set("Cookie", cookie).expect(410);
    } finally {
      serverLog.mockRestore();
    }
  });
});
