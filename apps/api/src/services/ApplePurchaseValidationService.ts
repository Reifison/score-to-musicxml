import fs from "node:fs";
import path from "node:path";
import { AppStoreServerAPIClient, Environment, NotificationTypeV2, SignedDataVerifier, type JWSTransactionDecodedPayload } from "@apple/app-store-server-library";
import { env, paths } from "../config/env.js";
import { AppError } from "../errors/AppError.js";

export type ApplePurchaseValidationInput = {
  originalTransactionId: string;
  productId: string;
  purchaseToken?: string;
  transactionId?: string;
  expectedAppAccountToken?: string;
};

export class ApplePurchaseValidationService {
  isConfigured(): boolean {
    return Boolean(env.APPLE_BUNDLE_ID && env.APPLE_ROOT_CERT_PATHS && (this.canVerifyJwsOnly() || this.canCallServerApi()));
  }

  async validate(input: ApplePurchaseValidationInput): Promise<{ originalTransactionId: string; purchasedAt?: Date }> {
    if (!this.isConfigured()) {
      throw new AppError(501, "Validação server-side da Apple ainda não está configurada.", "APPLE_VALIDATION_NOT_CONFIGURED");
    }

    const signedTransactionInfo = input.purchaseToken ?? await this.fetchSignedTransaction(input);
    if (!signedTransactionInfo) {
      throw new AppError(400, "Transação Apple ausente.", "APPLE_TRANSACTION_MISSING");
    }

    const decoded = await this.verifySignedTransaction(signedTransactionInfo);
    this.assertTransactionMatches(decoded, input);

    return {
      originalTransactionId: decoded.originalTransactionId ?? input.originalTransactionId,
      purchasedAt: decoded.purchaseDate ? new Date(decoded.purchaseDate) : undefined
    };
  }

  async validateNotification(signedPayload: string): Promise<{ notificationType?: string; originalTransactionId?: string; productId?: string }> {
    if (!this.isConfigured()) {
      throw new AppError(501, "Validação server-side da Apple ainda não está configurada.", "APPLE_VALIDATION_NOT_CONFIGURED");
    }
    const verifier = this.verifier();
    const decodedNotification = await verifier.verifyAndDecodeNotification(signedPayload);
    const signedTransactionInfo = decodedNotification.data?.signedTransactionInfo;
    const transaction = signedTransactionInfo ? await verifier.verifyAndDecodeTransaction(signedTransactionInfo) : undefined;

    if (transaction?.bundleId && transaction.bundleId !== env.APPLE_BUNDLE_ID) {
      throw new AppError(400, "Bundle ID da notificação Apple inválido.", "APPLE_BUNDLE_MISMATCH");
    }
    if (transaction?.productId && transaction.productId !== env.APPLE_PREMIUM_PRODUCT_ID) {
      throw new AppError(400, "Produto da notificação Apple inválido.", "APPLE_PRODUCT_MISMATCH");
    }

    return {
      notificationType: decodedNotification.notificationType,
      originalTransactionId: transaction?.originalTransactionId,
      productId: transaction?.productId
    };
  }

  isRevocationNotification(notificationType?: string): boolean {
    return notificationType === NotificationTypeV2.REFUND || notificationType === NotificationTypeV2.REVOKE;
  }

  private async fetchSignedTransaction(input: ApplePurchaseValidationInput): Promise<string | undefined> {
    if (!this.canCallServerApi()) return undefined;
    const transactionId = input.transactionId ?? input.originalTransactionId;
    const client = new AppStoreServerAPIClient(
      this.privateKey(),
      env.APPLE_IAP_KEY_ID!,
      env.APPLE_IAP_ISSUER_ID!,
      env.APPLE_BUNDLE_ID,
      this.environment()
    );
    const response = await client.getTransactionInfo(transactionId);
    return response.signedTransactionInfo;
  }

  private async verifySignedTransaction(signedTransactionInfo: string): Promise<JWSTransactionDecodedPayload> {
    const verifier = this.verifier();
    return verifier.verifyAndDecodeTransaction(signedTransactionInfo);
  }

  private verifier(): SignedDataVerifier {
    return new SignedDataVerifier(
      this.rootCertificates(),
      true,
      this.environment(),
      env.APPLE_BUNDLE_ID,
      env.APPLE_IAP_ENVIRONMENT === "production" ? env.APPLE_APP_APPLE_ID : undefined
    );
  }

  private assertTransactionMatches(decoded: JWSTransactionDecodedPayload, input: ApplePurchaseValidationInput) {
    if (decoded.bundleId !== env.APPLE_BUNDLE_ID) {
      throw new AppError(400, "Bundle ID da transação Apple inválido.", "APPLE_BUNDLE_MISMATCH");
    }
    if (decoded.productId !== input.productId || decoded.productId !== env.APPLE_PREMIUM_PRODUCT_ID) {
      throw new AppError(400, "Produto da transação Apple inválido.", "APPLE_PRODUCT_MISMATCH");
    }
    if (decoded.revocationDate) {
      throw new AppError(402, "Compra Apple revogada ou reembolsada.", "APPLE_PURCHASE_REVOKED");
    }
    if (decoded.originalTransactionId && decoded.originalTransactionId !== input.originalTransactionId) {
      throw new AppError(400, "Transação original Apple não confere.", "APPLE_ORIGINAL_TRANSACTION_MISMATCH");
    }
    if (input.expectedAppAccountToken && decoded.appAccountToken !== input.expectedAppAccountToken) {
      throw new AppError(400, "A compra Apple está vinculada a outra conta.", "APPLE_ACCOUNT_MISMATCH");
    }
  }

  private canVerifyJwsOnly(): boolean {
    return Boolean(env.APPLE_ROOT_CERT_PATHS);
  }

  private canCallServerApi(): boolean {
    return Boolean(env.APPLE_IAP_KEY_ID && env.APPLE_IAP_ISSUER_ID && (env.APPLE_IAP_PRIVATE_KEY || env.APPLE_IAP_PRIVATE_KEY_PATH));
  }

  private privateKey(): string {
    if (env.APPLE_IAP_PRIVATE_KEY) return env.APPLE_IAP_PRIVATE_KEY.replace(/\\n/g, "\n");
    const keyPath = this.resolvePath(env.APPLE_IAP_PRIVATE_KEY_PATH!);
    return fs.readFileSync(keyPath, "utf8");
  }

  private rootCertificates(): Buffer[] {
    return env.APPLE_ROOT_CERT_PATHS!.split(",").map((certPath) => fs.readFileSync(this.resolvePath(certPath.trim()))).filter(Boolean);
  }

  private resolvePath(filePath: string): string {
    return path.isAbsolute(filePath) ? filePath : path.resolve(paths.rootDir, filePath);
  }

  private environment(): Environment {
    return env.APPLE_IAP_ENVIRONMENT === "production" ? Environment.PRODUCTION : Environment.SANDBOX;
  }
}
