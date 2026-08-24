import { describe, expect, it } from "vitest";
import { InMemoryScoreRepository } from "../repositories/inMemoryRepositories.js";

const input = {
  userId: "user-1",
  originalFilename: "ensaio.pdf",
  storedFilename: "stored-1.pdf",
  fileType: "pdf",
  mimeType: "application/pdf",
  fileSize: 10,
  uploadStatus: "converted" as const,
  conversionStatus: "converted" as const
};

describe("score trash repository", () => {
  it("omite partituras enviadas para a lixeira da lista normal e permite restaurar", async () => {
    const scores = new InMemoryScoreRepository();
    const score = await scores.create(input);
    const deletedAt = new Date("2026-08-24T12:00:00.000Z");
    const purgeAt = new Date("2026-08-31T12:00:00.000Z");

    await scores.softDelete(score.id, { deletedAt, purgeAt });

    expect(await scores.list({ userId: input.userId })).toHaveLength(0);
    expect(await scores.listTrash({ userId: input.userId })).toEqual([
      expect.objectContaining({ id: score.id, deletedAt, purgeAt })
    ]);

    await scores.restore(score.id);
    expect(await scores.list({ userId: input.userId })).toHaveLength(1);
    expect(await scores.listTrash({ userId: input.userId })).toHaveLength(0);
  });

  it("identifica somente itens cujo prazo de 7 dias expirou", async () => {
    const scores = new InMemoryScoreRepository();
    const expired = await scores.create({ ...input, storedFilename: "expired.pdf" });
    const active = await scores.create({ ...input, storedFilename: "active.pdf" });
    await scores.softDelete(expired.id, {
      deletedAt: new Date("2026-08-17T12:00:00.000Z"),
      purgeAt: new Date("2026-08-24T12:00:00.000Z")
    });
    await scores.softDelete(active.id, {
      deletedAt: new Date("2026-08-20T12:00:00.000Z"),
      purgeAt: new Date("2026-08-27T12:00:00.000Z")
    });

    expect(await scores.listExpiredTrash(new Date("2026-08-24T12:00:00.000Z"))).toEqual([
      expect.objectContaining({ id: expired.id })
    ]);
  });
});
