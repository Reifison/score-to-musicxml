import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { env } from "../config/env.js";
import { createServices } from "../container.js";
import { createInMemoryRepositories } from "../repositories/inMemoryRepositories.js";
import { FileStorageService } from "../services/FileStorageService.js";
import { MidiExportService } from "../services/MidiExportService.js";
import { MidiObservabilityService, type MidiMetric } from "../services/MidiObservabilityService.js";
import { MusicXmlExportService } from "../services/MusicXmlExportService.js";
import type { OmrAdapter } from "../services/OmrAdapter.js";
import { QueueReconciler } from "../services/QueueReconciler.js";
import { parseVisualMusicXml } from "../services/VisualMusicXml.js";

const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");

function bufferParser(response: NodeJS.ReadableStream, callback: (error: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  response.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  response.on("end", () => callback(null, Buffer.concat(chunks)));
}

class TestOmrAdapter implements OmrAdapter {
  private exportService = new MusicXmlExportService();

  async convert(_inputPath: string, originalFilename: string) {
    return {
      musicXml: this.exportService.minimalValidScore(originalFilename, "Teste automatizado.")
        .replace("<rest/>", "<pitch><step>C</step><octave>4</octave></pitch>"),
      coverage: { totalPages: 1, processedPages: [1], missingPages: [], pages: [{ page: 1, status: "processed" as const, parts: [{ id: "P1", name: "Melody", staffCount: 1, staves: [1] }] }] },
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
  const queue = new (await import("../queues/ScoreConversionQueue.js")).InlineConversionQueue(services.conversion, true);
  services.conversion.setQueue(queue);
  services.queue = queue;
  services.reconciler = new QueueReconciler(repos.scores, queue);
  services.scores = new (await import("../services/ScoreService.js")).ScoreService(repos.scores, repos.audits, services.storage, services.midiExport, queue);
  services.uploads = new (await import("../services/ScoreUploadService.js")).ScoreUploadService(repos.audits, services.storage, queue, services.entitlements, services.fileSecurity, repos.scores);
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
  const response = await request(app).post("/api/auth/login").send({ email, password }).expect(200);
  return response.headers["set-cookie"] as unknown as string[];
}

describe("API", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;

  beforeEach(async () => {
    ctx = await makeTestApp();
  });

  it("distingue liveness de readiness sem banco no ambiente de teste", async () => {
    await request(ctx.app).get("/health").expect(200, { ok: true });
    const ready = await request(ctx.app).get("/ready").expect(503);
    expect(ready.body).toEqual({ ok: false, checks: { database: false, redis: true, worker: true } });
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
    const response = await request(ctx.app).post("/api/scores").set("Cookie", cookie).field("scoreType", "melody").attach("file", pdf, "minha_partitura.pdf").expect(201);
    expect(response.body.score.originalFilename).toBe("minha_partitura.pdf");
    expect(response.body.score.scoreTypeSelected).toBe(true);
    expect(response.body.score.storedFilename).not.toBe("minha_partitura.pdf");
    expect(response.body.score.conversionStatus).toBe("queued");
  });

  it("bloqueia PDF com conteúdo ativo antes de persistir upload", async () => {
    const cookie = await login(ctx.app, "user@example.com");
    const activePdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /OpenAction 2 0 R >>\nendobj\n2 0 obj\n<< /S /JavaScript /JS (app.alert\\(1\\)) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
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

  it("preserva alertas musicais na lista, detalhes e respostas de renomear e favoritar", async () => {
    const cookie = await login(ctx.app, "user@example.com");
    const created = await request(ctx.app).post("/api/scores").set("Cookie", cookie).field("scoreType", "melody")
      .attach("file", pdf, "partitura.pdf").expect(201);
    const id = created.body.score.id;
    const score = (await ctx.repos.scores.findById(id))!;
    await ctx.repos.scores.update(id, { reviewStatus: "approved", validation: {
      ...score.validation!, issues: [{ code: "RHYTHM_SHORT", severity: "warning", measure: "4", message: "3.5/4" }]
    } });
    const listed = await request(ctx.app).get("/api/scores").set("Cookie", cookie).expect(200);
    const detail = await request(ctx.app).get(`/api/scores/${id}`).set("Cookie", cookie).expect(200);
    const favorite = await request(ctx.app).patch(`/api/scores/${id}/favorite`).set("Cookie", cookie)
      .send({ isFavorite: true }).expect(200);
    const renamed = await request(ctx.app).patch(`/api/scores/${id}`).set("Cookie", cookie)
      .send({ originalFilename: "Renomeada" }).expect(200);
    for (const output of [listed.body.scores[0], detail.body.score, favorite.body.score, renamed.body.score]) {
      expect(output.resultStatus).toBe("complete");
      expect(output.recognitionQuality).toMatchObject({ status: "needs_review", accuracyVerified: false });
      expect(output.recognitionQuality.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "RHYTHM_SHORT", measure: "4" })
      ]));
    }
  });

  it("impede acesso e download de partitura de outro usuário", async () => {
    const userCookie = await login(ctx.app, "user@example.com");
    const adminCookie = await login(ctx.app, "admin@example.com");
    const created = await request(ctx.app).post("/api/scores").set("Cookie", userCookie).field("scoreType", "melody").attach("file", pdf, "dono.pdf").expect(201);
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
    await request(ctx.app).get(`/api/scores/${created.body.score.id}/download?preview=true`).set("Cookie", otherCookie).expect(403);
    await request(ctx.app).get(`/api/scores/${created.body.score.id}/evidence`).set("Cookie", otherCookie).expect(403);
    const detail = await request(ctx.app).get(`/api/scores/${created.body.score.id}`).set("Cookie", userCookie).expect(200);
    await request(ctx.app).post(`/api/scores/${created.body.score.id}/review`).set("Cookie", otherCookie).send({ revision: detail.body.score.reviewRevision }).expect(403);
    await request(ctx.app).post(`/api/scores/${created.body.score.id}/review`).set("Cookie", userCookie).send({ revision: detail.body.score.reviewRevision }).expect(200);
    await request(ctx.app).get(`/api/scores/${created.body.score.id}/download`).set("Cookie", adminCookie).expect(200);
    await request(ctx.app).get(`/api/scores/${created.body.score.id}/midi`).set("Cookie", adminCookie).expect(200);
  });

  it("protege decisões visuais por sessão, proprietário e revisão-base e devolve a nova versão", async () => {
    // Exercise the retained explicit decision API on a historical pending revision.
    ctx.services.scores = new (await import("../services/ScoreService.js")).ScoreService(
      ctx.repos.scores, ctx.repos.audits, ctx.services.storage, ctx.services.midiExport, ctx.services.queue, false);
    const cookie = await login(ctx.app, "user@example.com");
    const created = await request(ctx.app).post("/api/scores").set("Cookie", cookie).field("scoreType", "melody").attach("file", png, "review.png").expect(201);
    const score = (await ctx.repos.scores.findById(created.body.score.id))!;
    const visualReview = score.validation!.visualReview!;
    visualReview.proposals = [{ id: "ambiguous", status: "pending", segmentId: "visual-p0-m0", page: 1, partId: "P1",
      partIndex: 0, measureIndex: 0, measure: "1", noteIndex: 0, before: null, after: null, applicable: false,
      reason: "Conferência manual necessária", differences: ["missing_event"] }];
    await ctx.repos.scores.update(score.id, { reviewStatus: "needs_review", reviewedAt: null, reviewedById: null,
      validation: { ...score.validation!, visualReview } });
    const url = `/api/scores/${score.id}/visual-review/decision`;
    const body = { revision: score.reviewRevision, proposalId: "ambiguous", decision: "reject" };
    await request(ctx.app).post(url).send(body).expect(401);
    await request(ctx.app).post(url).set("Cookie", cookie).send({ ...body, filePath: "/private/path" }).expect(400);
    await ctx.repos.users.create({ name: "Other", email: "visual-other@example.com", passwordHash: await ctx.services.auth.hashPassword("Password123!"), role: "user", isActive: true });
    const otherCookie = await login(ctx.app, "visual-other@example.com");
    await request(ctx.app).post(url).set("Cookie", otherCookie).send(body).expect(403);
    const blocked = await request(ctx.app).post(`/api/scores/${score.id}/review`).set("Cookie", cookie).send({ revision: score.reviewRevision }).expect(409);
    expect(blocked.body.code).toBe("VISUAL_PROPOSALS_PENDING");
    const next = await request(ctx.app).post(url).set("Cookie", cookie).send(body).expect(200);
    expect(next.body.score.reviewRevision).not.toBe(score.reviewRevision);
    expect(next.body.score.validation.visualReview.proposals[0].status).toBe("rejected");
    expect(next.body.score.validation.visualReview.trainingEligible).toBe(false);
    await request(ctx.app).post(url).set("Cookie", cookie).send(body).expect(409);
    const correctionId = `revision:${next.body.score.reviewRevision}`;
    const correctedXml = (await request(ctx.app).get(`/api/scores/${score.id}/versions/${correctionId}/musicxml`)
      .set("Cookie", cookie).buffer(true).parse(bufferParser).expect(200)).body as Buffer;
    expect((await request(ctx.app).get(`/api/scores/${score.id}/versions`).set("Cookie", cookie).expect(200)).body.versions)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: correctionId, kind: "correction", isCurrent: true })]));
    await request(ctx.app).post(`/api/scores/${score.id}/retry`).set("Cookie", cookie).send({}).expect(202);
    const afterRetry = (await request(ctx.app).get(`/api/scores/${score.id}/versions`).set("Cookie", cookie).expect(200)).body.versions;
    expect(afterRetry).toHaveLength(3);
    expect(afterRetry.find((version: { id: string }) => version.id === correctionId))
      .toMatchObject({ isCurrent: false, kind: "correction", available: true });
    const previousCorrection = (await request(ctx.app).get(`/api/scores/${score.id}/versions/${correctionId}/musicxml`)
      .set("Cookie", cookie).buffer(true).parse(bufferParser).expect(200)).body as Buffer;
    expect(previousCorrection).toEqual(correctedXml);
  });

  it("limits source-page images to valid pages after checking ownership", async () => {
    const cookie = await login(ctx.app, "user@example.com");
    const created = await request(ctx.app).post("/api/scores").set("Cookie", cookie).field("scoreType", "melody").attach("file", png, "original.png").expect(201);
    const sourceUrl = `/api/scores/${created.body.score.id}/preview-image`;
    const preview = await request(ctx.app).get(`${sourceUrl}?page=1`).set("Cookie", cookie).expect(200);
    expect(preview.headers["content-type"]).toContain("image/png");
    expect(preview.headers["cache-control"]).toContain("no-store");
    for (const page of ["0", "2", "1.5", "bad", "9007199254740992"]) {
      const invalid = await request(ctx.app).get(`${sourceUrl}?page=${page}`).set("Cookie", cookie).expect(400);
      expect(invalid.body.code).toBe("INVALID_PREVIEW_PAGE");
    }
    await request(ctx.app).get(`${sourceUrl}?page=1`).expect(401);
    await ctx.repos.users.create({ name: "Other", email: "source-other@example.com", passwordHash: await ctx.services.auth.hashPassword("Password123!"), role: "user", isActive: true });
    const otherCookie = await login(ctx.app, "source-other@example.com");
    await request(ctx.app).get(`${sourceUrl}?page=1`).set("Cookie", otherCookie).expect(403);
  });

  it("permite iframe do PDF somente na origem web configurada após autorização", async () => {
    const cookie = await login(ctx.app, "user@example.com");
    const created = await request(ctx.app).post("/api/scores").set("Cookie", cookie).field("scoreType", "melody").attach("file", pdf, "iframe.pdf").expect(201);
    const previewPath = `/api/scores/${created.body.score.id}/preview`;
    const preview = await request(ctx.app).get(previewPath).set("Cookie", cookie).expect(200);
    const expected = `frame-ancestors 'self' ${new URL(env.WEB_ORIGIN).origin}`;
    expect(preview.headers["content-security-policy"]).toContain(expected);
    expect(preview.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(preview.headers["content-security-policy"]).not.toContain("frame-ancestors *");
    expect(preview.headers["x-frame-options"]).toBeUndefined();
    expect(preview.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    const detail = await request(ctx.app).get(`/api/scores/${created.body.score.id}`).set("Cookie", cookie).expect(200);
    expect(detail.headers["content-security-policy"]).toContain("frame-ancestors 'self'");
    expect(detail.headers["content-security-policy"]).not.toContain(expected);
    expect(detail.headers["x-frame-options"]).toBe("SAMEORIGIN");
    const denied = await request(ctx.app).get(previewPath).expect(401);
    expect(denied.headers["x-frame-options"]).toBe("SAMEORIGIN");
    const other = await ctx.repos.users.create({ name: "Other", email: "preview-other@example.com", passwordHash: await ctx.services.auth.hashPassword("Password123!"), role: "user", isActive: true });
    expect(other.id).toBeTruthy();
    const otherCookie = await login(ctx.app, "preview-other@example.com");
    const forbidden = await request(ctx.app).get(previewPath).set("Cookie", otherCookie).expect(403);
    expect(forbidden.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });

  it("aplica limite gratuito de 3 scans e libera após compra registrada", async () => {
    const cookie = await login(ctx.app, "user@example.com");

    const initialEntitlement = await request(ctx.app).get("/api/me/entitlement").set("Cookie", cookie).expect(200);
    expect(initialEntitlement.body.entitlement).toMatchObject({ plan: "free", freeScanLimit: 3, freeScansUsed: 0, freeScansRemaining: 3 });

    for (const name of ["um.pdf", "dois.pdf", "tres.pdf"]) {
      await request(ctx.app).post("/api/scores").set("Cookie", cookie).attach("file", pdf, name).expect(201);
    }

    const exhausted = await request(ctx.app).get("/api/me/entitlement").set("Cookie", cookie).expect(200);
    expect(exhausted.body.entitlement).toMatchObject({ plan: "free", freeScansUsed: 3, freeScansRemaining: 0 });
    await request(ctx.app).post("/api/scores").set("Cookie", cookie).attach("file", pdf, "quatro.pdf").expect(402);

    const purchase = await request(ctx.app)
      .post("/api/me/entitlement/apple")
      .set("Cookie", cookie)
      .send({ productId: "premium_unlock", originalTransactionId: "test-original-transaction", purchasedAt: "2026-05-09T12:00:00.000Z" })
      .expect(200);
    expect(purchase.body.entitlement).toMatchObject({ plan: "paid", freeScansUsed: 3, freeScansRemaining: null });

    await request(ctx.app).post("/api/scores").set("Cookie", cookie).attach("file", pdf, "quatro.pdf").expect(201);
  });

  it("admin concede e remove acesso completo para usuário de teste", async () => {
    const userCookie = await login(ctx.app, "user@example.com");
    const adminCookie = await login(ctx.app, "admin@example.com");

    for (const name of ["um.pdf", "dois.pdf", "tres.pdf"]) {
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
      freeScansUsed: 3,
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
      freeScansUsed: 3,
      freeScansRemaining: 0
    });
    await request(ctx.app).post("/api/scores").set("Cookie", userCookie).attach("file", pdf, "bloqueado-de-novo.pdf").expect(402);
  });

  it("não remove acesso concedido por admin ao processar revogação Apple", async () => {
    await ctx.repos.entitlements.grantAdminAccess({ userId: ctx.user.id, grantedById: ctx.admin.id, reason: "Teste" }, 3);
    const revoked = await ctx.repos.entitlements.revokeApplePurchase("test-original-transaction", 3, "sandbox");
    expect(revoked).toBeNull();
    const summary = await ctx.repos.entitlements.getSummary(ctx.user.id, 3);
    expect(summary).toMatchObject({ plan: "paid", source: "admin_grant" });
  });

  it("conversão muda status, registra falha e usa nome base original no download", async () => {
    const cookie = await login(ctx.app, "user@example.com");
    const created = await request(ctx.app).post("/api/scores").set("Cookie", cookie).field("scoreType", "melody").attach("file", pdf, "minha_partitura.pdf").expect(201);
    const detail = await request(ctx.app).get(`/api/scores/${created.body.score.id}`).set("Cookie", cookie).expect(200);
    expect(detail.body.score.conversionStatus).toBe("converted");
    expect(detail.body.score.musicxmlFilename).toMatch(/\.musicxml$/);
    expect(detail.body.score.resultStatus).toBe("complete");
    expect(detail.body.score.canPlay).toBe(true);
    expect(detail.body.score.reviewStatus).toBe("approved");
    expect(detail.body.score.reviewedById).toBeNull();
    expect(detail.body.score.validation.reviewAcceptance.method).toBe("automatic_delivery_v1");
    await request(ctx.app).get(`/api/scores/${created.body.score.id}/download`).set("Cookie", cookie).expect(200);
    await request(ctx.app).get(`/api/scores/${created.body.score.id}/download?preview=true`).set("Cookie", cookie).expect(200);
    const download = await request(ctx.app).get(`/api/scores/${created.body.score.id}/download`).set("Cookie", cookie).buffer(true).parse(bufferParser).expect(200);
    expect(download.headers["content-disposition"]).toContain("minha_partitura.musicxml");
    expect(Buffer.isBuffer(download.body)).toBe(true);
    expect(download.body.toString("utf8")).toContain("score-partwise");
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
    await request(ctx.app).get(`/api/scores/${created.body.score.id}/midi`).set("Cookie", cookie).expect(200);
  });

  it("returns a generic 410 when the approved MusicXML export is missing or unsafe", async () => {
    const cookie = await login(ctx.app, "user@example.com");
    const created = await request(ctx.app).post("/api/scores").set("Cookie", cookie).field("scoreType", "melody").attach("file", pdf, "indisponivel.pdf").expect(201);
    const score = (await request(ctx.app).get(`/api/scores/${created.body.score.id}`).set("Cookie", cookie).expect(200)).body.score;
    await request(ctx.app).post(`/api/scores/${created.body.score.id}/review`).set("Cookie", cookie).send({ revision: score.reviewRevision }).expect(200);

    const exportPath = ctx.services.storage.resolveExportPath(score.musicxmlFilename);
    const available = await request(ctx.app).get(`/api/scores/${created.body.score.id}/download`).set("Cookie", cookie).buffer(true).parse(bufferParser).expect(200);
    expect(available.body.toString("utf8")).toContain("score-partwise");
    await fs.rm(exportPath);

    const missingResponse = await request(ctx.app).get(`/api/scores/${created.body.score.id}/download`).set("Cookie", cookie).expect(410);
    expect(missingResponse.body.code).toBe("MUSICXML_EXPORT_UNAVAILABLE");
    expect(JSON.stringify(missingResponse.body)).not.toContain(exportPath);

    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "score-unsafe-export-"));
    const outsidePath = path.join(outsideDir, "private.musicxml");
    try {
      await fs.writeFile(outsidePath, "<private-outside-score/>");
      await fs.symlink(outsidePath, exportPath);
      const unsafeResponse = await request(ctx.app).get(`/api/scores/${created.body.score.id}/download`).set("Cookie", cookie).expect(410);
      expect(unsafeResponse.body).toEqual(missingResponse.body);
      expect(JSON.stringify(unsafeResponse.body)).not.toContain(outsidePath);
    } finally {
      await fs.rm(exportPath, { force: true });
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });

  it("lists immutable versions across retries and protects old exports", async () => {
    const cookie = await login(ctx.app, "user@example.com");
    const created = await request(ctx.app).post("/api/scores").set("Cookie", cookie)
      .field("scoreType", "melody").attach("file", pdf, "historico.pdf").expect(201);
    const scoreId = created.body.score.id as string;
    const initial = (await request(ctx.app).get(`/api/scores/${scoreId}/versions`).set("Cookie", cookie).expect(200)).body.versions;
    expect(initial).toHaveLength(1);
    expect(initial[0]).toMatchObject({ id: expect.stringMatching(/^attempt:/), kind: "conversion", isCurrent: true,
      available: true, status: "approved", coverage: { totalPages: 1, processedPages: 1, missingPages: [] } });
    const oldVersionId = initial[0].id as string;
    const oldXml = (await request(ctx.app).get(`/api/scores/${scoreId}/versions/${oldVersionId}/musicxml`)
      .set("Cookie", cookie).buffer(true).parse(bufferParser).expect(200)).body as Buffer;

    await request(ctx.app).post(`/api/scores/${scoreId}/retry`).set("Cookie", cookie).send({}).expect(202);
    const versions = (await request(ctx.app).get(`/api/scores/${scoreId}/versions`).set("Cookie", cookie).expect(200)).body.versions;
    expect(versions).toHaveLength(2);
    expect(versions.filter((version: { isCurrent: boolean }) => version.isCurrent)).toHaveLength(1);
    expect(versions.find((version: { id: string }) => version.id === oldVersionId)).toMatchObject({ available: true, isCurrent: false });
    const oldAgain = (await request(ctx.app).get(`/api/scores/${scoreId}/versions/${oldVersionId}/musicxml`)
      .set("Cookie", cookie).buffer(true).parse(bufferParser).expect(200)).body as Buffer;
    expect(oldAgain).toEqual(oldXml);

    await request(ctx.app).get(`/api/scores/${scoreId}/versions/attempt:unknown/musicxml`).set("Cookie", cookie).expect(404);
    await request(ctx.app).get(`/api/scores/${scoreId}/versions/..%2Fprivate/musicxml`).set("Cookie", cookie).expect(404);
    await request(ctx.app).get(`/api/scores/${scoreId}/versions`).expect(401);
    const other = await ctx.repos.users.create({ name: "Other", email: "other-history@example.com",
      passwordHash: await ctx.services.auth.hashPassword("Password123!"), role: "user", isActive: true });
    const otherCookie = await login(ctx.app, other.email);
    await request(ctx.app).get(`/api/scores/${scoreId}/versions`).set("Cookie", otherCookie).expect(403);
    await request(ctx.app).get(`/api/scores/${scoreId}/versions/${oldVersionId}/musicxml`).set("Cookie", otherCookie).expect(403);

    const firstAttempt = (await ctx.repos.scores.listAttempts(scoreId)).find((attempt) => attempt.id === oldVersionId.slice(8))!;
    await fs.rm(ctx.services.storage.resolveExportPath(firstAttempt.musicxmlFilename!));
    const unavailable = (await request(ctx.app).get(`/api/scores/${scoreId}/versions`).set("Cookie", cookie).expect(200)).body.versions;
    expect(unavailable.find((version: { id: string }) => version.id === oldVersionId).available).toBe(false);
    await request(ctx.app).get(`/api/scores/${scoreId}/versions/${oldVersionId}/musicxml`).set("Cookie", cookie).expect(410);
    await fs.writeFile(ctx.services.storage.resolveExportPath(firstAttempt.musicxmlFilename!), "<score-partwise/>");
    const changed = await request(ctx.app).get(`/api/scores/${scoreId}/versions/${oldVersionId}/musicxml`).set("Cookie", cookie).expect(410);
    expect(changed.body.code).toBe("SCORE_VERSION_CHANGED");

    await request(ctx.app).delete(`/api/scores/${scoreId}`).set("Cookie", cookie).expect(204);
    await request(ctx.app).get(`/api/scores/${scoreId}/versions`).set("Cookie", cookie).expect(404);
    await request(ctx.app).get(`/api/scores/${scoreId}/versions/${versions[0].id}/musicxml`).set("Cookie", cookie).expect(404);
  });

  it("permite desfazer e aceitar proposta após entrega automática sem bloquear o MusicXML", async () => {
    const cookie = await login(ctx.app, "user@example.com");
    const created = await request(ctx.app).post("/api/scores").set("Cookie", cookie)
      .field("scoreType", "melody").attach("file", pdf, "corrigir-automaticamente.pdf").expect(201);
    const scoreId = created.body.score.id as string;
    const stored = (await ctx.repos.scores.findById(scoreId))!;
    const oldXml = await ctx.services.storage.readExport(stored.musicxmlFilename!);
    const review = structuredClone(stored.validation!.visualReview!);
    review.xmlSHA256 = createHash("sha256").update(oldXml).digest("hex");
    review.proposals = [{ id: "pitch-c-to-d", status: "pending", segmentId: "visual-p0-m0", page: 1,
      partId: "P1", partIndex: 0, measureIndex: 0, measure: "1", noteIndex: 0,
      before: { kind: "note", step: "C", alter: 0, octave: 4, duration: 4, type: "whole", dots: 0 },
      after: { kind: "note", step: "D", alter: 0, octave: 4, duration: 4, type: "whole", dots: 0 },
      applicable: true, reason: "Divergência local da fonte", differences: ["pitch"] }];
    await ctx.repos.scores.update(scoreId, { reviewStatus: "needs_review", reviewedAt: null, reviewedById: null,
      validation: { ...stored.validation!, visualReview: review } });

    const delivered = (await request(ctx.app).get(`/api/scores/${scoreId}`).set("Cookie", cookie).expect(200)).body.score;
    expect(delivered).toMatchObject({ reviewStatus: "approved", canDownloadMusicXml: true,
      validation: { visualReview: { proposals: [{ status: "rejected" }] } } });
    const url = `/api/scores/${scoreId}/visual-review/decision`;
    const undone = (await request(ctx.app).post(url).set("Cookie", cookie)
      .send({ revision: delivered.reviewRevision, proposalId: "pitch-c-to-d", decision: "undo" }).expect(200)).body.score;
    expect(undone).toMatchObject({ reviewStatus: "approved", canDownloadMusicXml: true,
      validation: { visualReview: { proposals: [{ status: "pending" }] } } });
    const stillPending = (await request(ctx.app).get(`/api/scores/${scoreId}`).set("Cookie", cookie).expect(200)).body.score;
    expect(stillPending.validation.visualReview.proposals[0].status).toBe("pending");
    const acceptedResponse = await request(ctx.app).post(url).set("Cookie", cookie)
      .send({ revision: undone.reviewRevision, proposalId: "pitch-c-to-d", decision: "accept" });
    expect(acceptedResponse.status, JSON.stringify(acceptedResponse.body)).toBe(200);
    const accepted = acceptedResponse.body.score;
    expect(accepted).toMatchObject({ reviewStatus: "approved", canDownloadMusicXml: true,
      validation: { visualReview: { proposals: [{ status: "accepted" }] } } });
    const currentXml = (await request(ctx.app).get(`/api/scores/${scoreId}/download`).set("Cookie", cookie)
      .buffer(true).parse(bufferParser).expect(200)).body as Buffer;
    expect(currentXml.toString("utf8")).toContain("<step>D</step>");
    const oldVersionId = `attempt:${delivered.attempts[0].id}`;
    const oldAgain = (await request(ctx.app).get(`/api/scores/${scoreId}/versions/${oldVersionId}/musicxml`)
      .set("Cookie", cookie).buffer(true).parse(bufferParser).expect(200)).body as Buffer;
    expect(oldAgain.toString("utf8")).toBe(oldXml);
    const undoneAccepted = (await request(ctx.app).post(url).set("Cookie", cookie)
      .send({ revision: accepted.reviewRevision, proposalId: "pitch-c-to-d", decision: "undo" }).expect(200)).body.score;
    expect(undoneAccepted).toMatchObject({ reviewStatus: "approved", canDownloadMusicXml: true,
      validation: { visualReview: { proposals: [{ status: "pending" }] } } });
    const rejected = (await request(ctx.app).post(url).set("Cookie", cookie)
      .send({ revision: undoneAccepted.reviewRevision, proposalId: "pitch-c-to-d", decision: "reject" }).expect(200)).body.score;
    expect(rejected).toMatchObject({ reviewStatus: "approved", canDownloadMusicXml: true,
      validation: { visualReview: { proposals: [{ status: "rejected" }] } } });
    const restoredXml = (await request(ctx.app).get(`/api/scores/${scoreId}/download`).set("Cookie", cookie)
      .buffer(true).parse(bufferParser).expect(200)).body as Buffer;
    expect(parseVisualMusicXml(restoredXml.toString("utf8"))[0].events[0].step).toBe("C");
    await request(ctx.app).post(url).set("Cookie", cookie)
      .send({ revision: delivered.reviewRevision, proposalId: "pitch-c-to-d", decision: "undo" }).expect(409);
  });
});
