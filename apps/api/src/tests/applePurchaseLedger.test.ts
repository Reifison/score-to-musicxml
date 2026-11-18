import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createInMemoryRepositories } from "../repositories/inMemoryRepositories.js";
import type { ApplePurchaseEnvironment, ApplePurchaseNotification, Repositories } from "../repositories/contracts.js";

const qaUrl = "postgresql://qauser:qapassword@127.0.0.1:55432/score_qa";

for (const backend of ["memory", "postgres"] as const) {
  describe.skipIf(backend === "postgres" && process.env.SCORE_PRISMA_INTEGRATION !== "1")(`Apple durable purchase claims (${backend})`, () => {
    let repos: Repositories;
    let db: PrismaClient | undefined;
    const users: string[] = [];
    const prefix = `apple-qa-${randomUUID()}`;
    const user = async () => {
      const u = await repos.users.create({ name: "Apple QA", email: `${randomUUID()}@example.invalid`, passwordHash: "qa-only", role: "user" });
      users.push(u.id); return u.id;
    };
    const id = () => `${prefix}-${randomUUID()}`;
    const purchase = (userId: string, originalTransactionId: string, environment: ApplePurchaseEnvironment = "production") =>
      repos.entitlements.recordApplePurchase({ userId, productId: "premium_unlock", originalTransactionId, purchasedAt: new Date("2026-10-17T10:00:00Z"), environment }, 3);
    const notification = (originalTransactionId: string, revoked = true, environment: ApplePurchaseEnvironment = "production", milliseconds = 1000): ApplePurchaseNotification => ({
      originalTransactionId, productId: "premium_unlock", environment, revoked,
      notificationId: randomUUID(), signedAt: new Date(Date.parse("2026-10-17T11:00:00Z") + milliseconds)
    });

    beforeAll(async () => {
      if (backend === "memory") { repos = createInMemoryRepositories(); return; }
      if (process.env.DATABASE_URL !== qaUrl) throw new Error("Apple QA requires the exact isolated database on 127.0.0.1:55432/score_qa.");
      const [database, repository] = await Promise.all([import("../db/prisma.js"), import("../repositories/prismaRepositories.js")]);
      db = database.prisma;
      const identity = await db.$queryRaw<Array<{ database: string; username: string }>>`SELECT current_database() AS database, current_user AS username`;
      if (identity[0]?.database !== "score_qa" || identity[0]?.username !== "qauser") throw new Error("Unexpected QA database identity");
      repos = repository.createPrismaRepositories();
    });
    afterAll(async () => {
      if (db) {
        await db.applePurchase.deleteMany({ where: { originalTransactionId: { startsWith: prefix } } });
        await db.user.deleteMany({ where: { id: { in: users } } });
        await db.$disconnect();
      }
    });

    it("keeps sandbox and production claims with the same numeric ID independent", async () => {
      const raw = id(), sandboxUser = await user(), productionUser = await user();
      expect((await purchase(sandboxUser, raw, "sandbox")).plan).toBe("paid");
      expect((await purchase(productionUser, raw)).plan).toBe("paid");
      await repos.entitlements.applyApplePurchaseNotification(notification(raw, true, "sandbox"), 3);
      expect((await repos.entitlements.getSummary(sandboxUser, 3)).plan).toBe("free");
      expect((await repos.entitlements.getSummary(productionUser, 3)).plan).toBe("paid");
    });
    it("restores idempotently and retains ownership even after another entitlement source replaces the summary", async () => {
      const raw = id(), owner = await user(), other = await user();
      await purchase(owner, raw); await purchase(owner, raw);
      await repos.entitlements.recordGooglePurchase({ userId: owner, productId: "premium_unlock", purchaseToken: id(), purchasedAt: new Date() }, 3);
      await expect(purchase(other, raw)).rejects.toMatchObject({ code: "APPLE_PURCHASE_ALREADY_CLAIMED" });
      expect((await purchase(owner, raw)).source).toBe("apple");
    });
    it("never overwrites a production entitlement with sandbox and keeps its production refund reachable", async () => {
      const owner = await user(), prod = id(), sandbox = id();
      await purchase(owner, prod); await purchase(owner, sandbox, "sandbox");
      await repos.entitlements.applyApplePurchaseNotification(notification(sandbox, true, "sandbox"), 3);
      expect((await repos.entitlements.getSummary(owner, 3)).plan).toBe("paid");
      await repos.entitlements.applyApplePurchaseNotification(notification(prod), 3);
      expect((await repos.entitlements.getSummary(owner, 3)).plan).toBe("free");
    });
    it("retains a refund tombstone so an old otherwise valid signed receipt cannot reactivate the purchase", async () => {
      const owner = await user(), raw = id(); await purchase(owner, raw);
      await repos.entitlements.applyApplePurchaseNotification(notification(raw), 3);
      await expect(purchase(owner, raw)).rejects.toMatchObject({ code: "APPLE_PURCHASE_REVOKED" });
    });
    it("deduplicates repeated notifications and ignores older refunds after a newer refund reversal", async () => {
      const owner = await user(), raw = id(); await purchase(owner, raw);
      const refund = notification(raw);
      expect(await repos.entitlements.applyApplePurchaseNotification(refund, 3)).not.toBeNull();
      expect(await repos.entitlements.applyApplePurchaseNotification(refund, 3)).toBeNull();
      await repos.entitlements.applyApplePurchaseNotification(notification(raw, false, "production", 3000), 3);
      expect((await repos.entitlements.getSummary(owner, 3)).plan).toBe("paid");
      expect(await repos.entitlements.applyApplePurchaseNotification(notification(raw, true, "production", 2000), 3)).toBeNull();
      expect((await purchase(owner, raw)).plan).toBe("paid");
    });
    it("remembers a refund that arrives before the first client registration", async () => {
      const owner = await user(), raw = id();
      expect(await repos.entitlements.applyApplePurchaseNotification(notification(raw), 3)).toBeNull();
      await expect(purchase(owner, raw)).rejects.toMatchObject({ code: "APPLE_PURCHASE_REVOKED" });
      await repos.entitlements.applyApplePurchaseNotification(notification(raw, false, "production", 2000), 3);
      expect((await purchase(owner, raw)).plan).toBe("paid");
    });
    it("does not revoke or replace an administrative entitlement when an old Apple claim changes", async () => {
      const owner = await user(), admin = await user(), raw = id(); await purchase(owner, raw);
      await repos.entitlements.grantAdminAccess({ userId: owner, grantedById: admin }, 3);
      await repos.entitlements.applyApplePurchaseNotification(notification(raw), 3);
      await repos.entitlements.applyApplePurchaseNotification(notification(raw, false, "production", 2000), 3);
      expect((await repos.entitlements.getSummary(owner, 3)).source).toBe("admin_grant");
    });
    it("allows a production refund to preserve another active production purchase", async () => {
      const owner = await user(), first = id(), second = id();
      await purchase(owner, first); await purchase(owner, second);
      await repos.entitlements.applyApplePurchaseNotification(notification(second), 3);
      expect((await repos.entitlements.getSummary(owner, 3)).plan).toBe("paid");
      await repos.entitlements.applyApplePurchaseNotification(notification(first), 3);
      expect((await repos.entitlements.getSummary(owner, 3)).plan).toBe("free");
    });
    it("serializes competing claims so only one app account can own a purchase", async () => {
      const raw = id(), a = await user(), b = await user();
      const results = await Promise.allSettled([purchase(a, raw), purchase(b, raw)]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "APPLE_PURCHASE_ALREADY_CLAIMED" } });
    });
  });
}
