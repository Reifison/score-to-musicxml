import { z } from "zod";
import { env } from "../config/env.js";
import type { EntitlementSummary, User } from "../domain.js";
import { AppError } from "../errors/AppError.js";
import type { AuditRepository, CreateScoreInput, EntitlementRepository } from "../repositories/contracts.js";
import { ApplePurchaseValidationService } from "./ApplePurchaseValidationService.js";
import { GooglePlayValidationService } from "./GooglePlayValidationService.js";

const applePurchaseSchema = z.object({
  productId: z.string().min(1),
  originalTransactionId: z.string().min(6),
  purchaseToken: z.string().min(20).optional(),
  transactionId: z.string().min(1).optional(),
  purchasedAt: z.coerce.date().optional(),
  restored: z.boolean().optional()
});

const adminGrantSchema = z.object({
  reason: z.string().trim().min(1).max(300).optional()
});

const googlePurchaseSchema = z.object({ productId: z.string().min(1), purchaseToken: z.string().min(20), restored: z.boolean().optional() });

export class EntitlementService {
  constructor(
    private entitlements: EntitlementRepository,
    private audits: AuditRepository,
    private appleValidator = new ApplePurchaseValidationService(),
    private googleValidator = new GooglePlayValidationService()
  ) {}

  async getFor(user: User): Promise<EntitlementSummary> {
    return this.entitlements.getSummary(user.id, env.FREE_SCAN_LIMIT);
  }

  async assertCanUpload(user: User): Promise<void> {
    const summary = await this.getFor(user);
    if (summary.plan === "free" && (summary.freeScansRemaining ?? 0) <= 0) {
      throw new AppError(402, "Limite gratuito atingido. Desbloqueie a versão paga para continuar.", "FREE_SCAN_LIMIT_REACHED");
    }
  }

  async createScoreForUpload(input: CreateScoreInput, ipAddress?: string) {
    const result = await this.entitlements.createScoreForUpload(input, env.FREE_SCAN_LIMIT);
    if (result.debitedFreeScan) {
      await this.audits.create({
        actorId: input.userId,
        action: "free_scan_used",
        entity: "score",
        entityId: result.score.id,
        ipAddress,
        metadata: { freeScanLimit: env.FREE_SCAN_LIMIT }
      });
    }
    return result.score;
  }

  async grantAdminAccess(userId: string, admin: User, body: unknown, ipAddress?: string): Promise<EntitlementSummary> {
    const input = adminGrantSchema.parse(body);
    const summary = await this.entitlements.grantAdminAccess({
      userId,
      grantedById: admin.id,
      reason: input.reason ?? "Acesso liberado manualmente pelo admin."
    }, env.FREE_SCAN_LIMIT);
    await this.audits.create({
      actorId: admin.id,
      action: "entitlement_changed",
      entity: "user",
      entityId: userId,
      ipAddress,
      metadata: { source: summary.source, reason: input.reason ?? "admin_grant" }
    });
    return summary;
  }

  async revokeAdminAccess(userId: string, admin: User, ipAddress?: string): Promise<EntitlementSummary> {
    const summary = await this.entitlements.revokeAdminAccess(userId, env.FREE_SCAN_LIMIT);
    await this.audits.create({
      actorId: admin.id,
      action: "entitlement_changed",
      entity: "user",
      entityId: userId,
      ipAddress,
      metadata: { source: summary.source, reason: "admin_grant_revoked" }
    });
    return summary;
  }

  async registerApplePurchase(user: User, body: unknown, ipAddress?: string): Promise<EntitlementSummary> {
    const input = applePurchaseSchema.parse(body);
    if (input.productId !== env.APPLE_PREMIUM_PRODUCT_ID) {
      await this.audits.create({ actorId: user.id, action: "purchase_failed", ipAddress, metadata: { reason: "invalid_product", productId: input.productId } });
      throw new AppError(400, "Produto de compra inválido.", "INVALID_PURCHASE_PRODUCT");
    }

    let purchase: { originalTransactionId: string; purchasedAt?: Date } = {
      originalTransactionId: input.originalTransactionId,
      purchasedAt: input.purchasedAt ?? new Date()
    };

    if (env.NODE_ENV === "production" && !this.appleValidator.isConfigured()) {
      await this.audits.create({ actorId: user.id, action: "purchase_failed", ipAddress, metadata: { reason: "apple_validation_not_configured" } });
      throw new AppError(501, "Validação server-side da Apple ainda não está configurada.", "APPLE_VALIDATION_NOT_CONFIGURED");
    }

    if (env.NODE_ENV === "production" || this.appleValidator.isConfigured()) {
      try {
        purchase = await this.appleValidator.validate(input);
      } catch (error) {
        await this.audits.create({ actorId: user.id, action: "purchase_failed", ipAddress, metadata: { reason: "apple_validation_failed", productId: input.productId } });
        throw error;
      }
    }

    const summary = await this.entitlements.recordApplePurchase({
      userId: user.id,
      productId: input.productId,
      originalTransactionId: purchase.originalTransactionId,
      purchasedAt: purchase.purchasedAt ?? input.purchasedAt ?? new Date(),
      restored: input.restored
    }, env.FREE_SCAN_LIMIT);

    await this.audits.create({
      actorId: user.id,
      action: input.restored ? "purchase_restored" : "purchase_completed",
      entity: "entitlement",
      entityId: user.id,
      ipAddress,
      metadata: { productId: input.productId }
    });
    await this.audits.create({
      actorId: user.id,
      action: "entitlement_changed",
      entity: "user",
      entityId: user.id,
      ipAddress,
      metadata: { plan: summary.plan }
    });
    return summary;
  }

  async handleAppleNotification(body: unknown, ipAddress?: string): Promise<{ handled: boolean; notificationType?: string }> {
    const { signedPayload } = z.object({ signedPayload: z.string().min(20) }).parse(body);
    const notification = await this.appleValidator.validateNotification(signedPayload);
    if (!this.appleValidator.isRevocationNotification(notification.notificationType)) {
      return { handled: false, notificationType: notification.notificationType };
    }
    if (!notification.originalTransactionId) {
      throw new AppError(400, "Notificação Apple sem transação original.", "APPLE_NOTIFICATION_TRANSACTION_MISSING");
    }

    const revoked = await this.entitlements.revokeApplePurchase(notification.originalTransactionId, env.FREE_SCAN_LIMIT);
    if (!revoked) {
      return { handled: false, notificationType: notification.notificationType };
    }

    await this.audits.create({
      actorId: revoked.userId,
      action: "purchase_revoked",
      entity: "entitlement",
      entityId: revoked.userId,
      ipAddress,
      metadata: { notificationType: notification.notificationType, productId: notification.productId }
    });
    await this.audits.create({
      actorId: revoked.userId,
      action: "entitlement_changed",
      entity: "user",
      entityId: revoked.userId,
      ipAddress,
      metadata: { plan: revoked.entitlement.plan, reason: "apple_revocation" }
    });

    return { handled: true, notificationType: notification.notificationType };
  }

  async registerGooglePurchase(user: User, body: unknown, ipAddress?: string): Promise<EntitlementSummary> {
    const input = googlePurchaseSchema.parse(body);
    if (input.productId !== env.GOOGLE_PLAY_PRODUCT_ID) throw new AppError(400, "Produto de compra inválido.", "INVALID_PURCHASE_PRODUCT");
    let purchase = { productId: input.productId, purchaseToken: input.purchaseToken, purchasedAt: new Date() };
    if (env.NODE_ENV === "production" && !this.googleValidator.isConfigured()) throw new AppError(501, "Validação server-side do Google Play ainda não está configurada.", "GOOGLE_VALIDATION_NOT_CONFIGURED");
    if (env.NODE_ENV === "production" || this.googleValidator.isConfigured()) purchase = await this.googleValidator.validate(input);
    const currentOwnerId = await this.entitlements.findUserByGooglePurchaseToken(purchase.purchaseToken);
    if (currentOwnerId && currentOwnerId !== user.id) {
      throw new AppError(409, "Esta compra Google Play já está vinculada a outra conta.", "GOOGLE_PURCHASE_ALREADY_CLAIMED");
    }
    const summary = await this.entitlements.recordGooglePurchase({ userId: user.id, productId: purchase.productId, purchaseToken: purchase.purchaseToken, purchasedAt: purchase.purchasedAt }, env.FREE_SCAN_LIMIT);
    await this.audits.create({ actorId: user.id, action: input.restored ? "purchase_restored" : "purchase_completed", entity: "entitlement", entityId: user.id, ipAddress, metadata: { productId: input.productId, source: "google_play" } });
    return summary;
  }

  async handleGoogleNotification(body: unknown, authorization?: string, ipAddress?: string): Promise<{ handled: boolean; eventType?: string }> {
    if (!authorization || !(await this.googleValidator.verifyPushToken(authorization))) throw new AppError(401, "Token do push Google Play inválido.", "GOOGLE_RTDN_UNAUTHORIZED");
    const input = z.object({ message: z.object({ messageId: z.string().min(1), data: z.string().min(1) }) }).parse(body);
    const decoded = JSON.parse(Buffer.from(input.message.data, "base64").toString("utf8")) as {
      packageName?: string;
      oneTimeProductNotification?: { notificationType?: number; purchaseToken?: string; sku?: string };
      voidedPurchaseNotification?: { purchaseToken?: string; productType?: number; refundType?: number };
    };
    if (decoded.packageName !== env.GOOGLE_PLAY_PACKAGE_NAME) throw new AppError(400, "Pacote da notificação Google Play inválido.", "GOOGLE_RTDN_PACKAGE_MISMATCH");

    const voided = decoded.voidedPurchaseNotification;
    const oneTime = decoded.oneTimeProductNotification;
    const purchaseToken = voided?.purchaseToken ?? oneTime?.purchaseToken;
    const eventType = voided
      ? `voided:${voided.productType ?? "unknown"}:${voided.refundType ?? "unknown"}`
      : oneTime
        ? `one_time:${oneTime.notificationType ?? "unknown"}`
        : undefined;
    if (!purchaseToken || !eventType) return { handled: false };
    if (!(await this.entitlements.claimGoogleNotification({ messageId: input.message.messageId, eventType, purchaseToken }))) return { handled: false, eventType };

    // A cancellation only applies to a pending transaction, which has never
    // granted entitlement. A voided one-time product is the refund/revocation
    // signal that removes access for this permanent unlock.
    if (!voided || voided.productType !== 2 || voided.refundType !== 1) return { handled: true, eventType };
    const revoked = await this.entitlements.revokeGooglePurchase(purchaseToken, env.FREE_SCAN_LIMIT);
    if (!revoked) return { handled: false, eventType };
    await this.audits.create({ actorId: revoked.userId, action: "purchase_revoked", entity: "entitlement", entityId: revoked.userId, ipAddress, metadata: { source: "google_play", eventType } });
    return { handled: true, eventType };
  }
}
