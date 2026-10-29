import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { createServices } from "../container.js";
import { createInMemoryRepositories } from "../repositories/inMemoryRepositories.js";
import { FileStorageService } from "../services/FileStorageService.js";
import { ScoreService } from "../services/ScoreService.js";

const xml = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>1</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note></measure></part></score-partwise>`;
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

function bufferParser(response: NodeJS.ReadableStream, callback: (error: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  response.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  response.on("end", () => callback(null, Buffer.concat(chunks)));
}

async function makeRouteFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "first-page-preview-route-test-"));
  roots.push(root);
  const repos = createInMemoryRepositories();
  const services = createServices(repos, { inlineQueue: true, waitForInlineQueue: true });
  services.storage = new FileStorageService(path.join(root, "uploads"), path.join(root, "exports"));
  services.scores = new ScoreService(repos.scores, repos.audits, services.storage, services.midiExport, services.queue, false);
  await services.storage.saveUpload("source.pdf", Buffer.from("%PDF-1.4\n%%EOF"));
  const passwordHash = await services.auth.hashPassword("Password123!");
  const owner = await repos.users.create({ name: "Owner", email: "owner-preview@example.com", passwordHash, role: "user" });
  const stranger = await repos.users.create({ name: "Stranger", email: "stranger-preview@example.com", passwordHash, role: "user" });
  const score = await repos.scores.create({ userId: owner.id, originalFilename: "Estudo.pdf", storedFilename: "source.pdf",
    fileType: "pdf", mimeType: "application/pdf", fileSize: 14, uploadStatus: "uploaded", conversionStatus: "queued",
    scoreType: "melody", scoreTypeSelected: true });
  const attempt = (await repos.scores.listAttempts(score.id))[0];
  const token = await repos.scores.claimAttempt(attempt.id);
  if (!token) throw new Error("Unable to claim test conversion attempt.");
  await repos.scores.updateConversionProgress(score.id, attempt.id, token, {
    attemptId: attempt.id, stage: "recognizing", totalPages: 2, currentPage: 2, completedPages: [1], failedPages: [],
    excludedPages: [], reusedPages: [], updatedAt: new Date().toISOString()
  });
  const preview = await services.storage.saveFirstPagePreview("source.pdf", attempt.id, 2, xml, ["Test page warning"]);
  if (!await repos.scores.publishConversionPreview(score.id, attempt.id, token, preview)) throw new Error("Unable to publish test preview.");
  const ownerToken = (await services.auth.login(owner.email, "Password123!")).token;
  const strangerToken = (await services.auth.login(stranger.email, "Password123!")).token;
  return { root, app: createApp(services), repos, services, score, attempt, token, preview, ownerToken, strangerToken };
}

const endpoint = (scoreId: string, revision: string): string => `/api/scores/${scoreId}/first-page-preview?revision=${revision}`;

describe("GET first-page preview route", () => {
  it("serves provisional MusicXML with private no-store headers", async () => {
    const ctx = await makeRouteFixture();
    const response = await request(ctx.app).get(endpoint(ctx.score.id, ctx.preview.revision))
      .set("Authorization", `Bearer ${ctx.ownerToken}`).buffer(true).parse(bufferParser).expect(200);

    expect(response.headers["cache-control"]).toBe("private, no-store, max-age=0");
    expect(response.headers.pragma).toBe("no-cache");
    expect(response.headers.expires).toBe("0");
    expect(response.headers["content-type"]).toContain("application/vnd.recordare.musicxml+xml");
    expect(response.headers["x-score-result-status"]).toBe("provisional");
    expect(response.headers["x-score-preview-page"]).toBe("1");
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect(response.body).toEqual(Buffer.from(xml));
  });

  it("validates the revision and rejects a stale revision", async () => {
    const ctx = await makeRouteFixture();
    const missing = await request(ctx.app).get(`/api/scores/${ctx.score.id}/first-page-preview`)
      .set("Authorization", `Bearer ${ctx.ownerToken}`).expect(400);
    expect(missing.body).toMatchObject({ code: "VALIDATION_ERROR" });
    const malformed = await request(ctx.app).get(endpoint(ctx.score.id, "not-a-revision"))
      .set("Authorization", `Bearer ${ctx.ownerToken}`).expect(400);
    expect(malformed.body).toMatchObject({ code: "VALIDATION_ERROR" });
    const stale = await request(ctx.app).get(endpoint(ctx.score.id, "0".repeat(64)))
      .set("Authorization", `Bearer ${ctx.ownerToken}`).expect(409);
    expect(stale.body).toMatchObject({ code: "FIRST_PAGE_PREVIEW_CHANGED" });
  });

  it("requires authentication, enforces score ownership, and denies a finalized preview URL", async () => {
    const ctx = await makeRouteFixture();
    await request(ctx.app).get(endpoint(ctx.score.id, ctx.preview.revision)).expect(401);
    const forbidden = await request(ctx.app).get(endpoint(ctx.score.id, ctx.preview.revision))
      .set("Authorization", `Bearer ${ctx.strangerToken}`).expect(403);
    expect(forbidden.body).toMatchObject({ code: "FORBIDDEN" });

    const finalCoverage = { totalPages: 2, processedPages: [1, 2], missingPages: [], pages: [
      { page: 1, status: "processed" as const, parts: [{ id: "P1", name: "Melody", staffCount: 1, staves: [1] }] },
      { page: 2, status: "processed" as const, parts: [{ id: "P1", name: "Melody", staffCount: 1, staves: [1] }] }
    ] };
    const finalFilename = "final.musicxml";
    await ctx.repos.scores.publishResult(ctx.score.id, ctx.attempt.id, ctx.token, {
      resultStatus: "complete", coverage: finalCoverage, musicxmlFilename: finalFilename, warnings: [], reviewRevision: hash(xml)
    });
    const finalized = await request(ctx.app).get(endpoint(ctx.score.id, ctx.preview.revision))
      .set("Authorization", `Bearer ${ctx.ownerToken}`).expect(409);
    expect(finalized.body).toMatchObject({ code: "FIRST_PAGE_PREVIEW_UNAVAILABLE" });
  });
});
