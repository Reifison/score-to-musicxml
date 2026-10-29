import fs from "node:fs";
import path from "node:path";
import {
  APIError,
  APIException,
  AppStoreServerAPIClient,
  Environment,
  NotificationTypeV2,
  SignedDataVerifier,
  Type,
  VerificationException,
  VerificationStatus,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload
} from "@apple/app-store-server-library";
import { env, paths } from "../config/env.js";
import { AppError } from "../errors/AppError.js";

export type ApplePurchaseEnvironment = "production" | "sandbox";

export type ApplePurchaseValidationInput = {
  originalTransactionId: string;
  productId: string;
  purchaseToken?: string;
  transactionId?: string;
  expectedAppAccountToken?: string;
};

export type ApplePurchaseValidationResult = {
  originalTransactionId: string;
  transactionId?: string;
  environment: ApplePurchaseEnvironment;
  purchasedAt?: Date;
};

export type AppleNotificationValidationResult = {
  notificationType?: string;
  notificationUUID?: string;
  signedDate?: Date;
  originalTransactionId?: string;
  transactionId?: string;
  productId?: string;
  environment: ApplePurchaseEnvironment;
  appAccountToken?: string;
  revocationDate?: Date;
};

type AppleVerifier = Pick<SignedDataVerifier, "verifyAndDecodeTransaction" | "verifyAndDecodeNotification">;
type AppleServerApiClient = Pick<AppStoreServerAPIClient, "getTransactionInfo">;

export type ApplePurchaseValidationDependencies = {
  verifierFactory?: (environment: ApplePurchaseEnvironment) => AppleVerifier;
  serverApiClientFactory?: (environment: ApplePurchaseEnvironment) => AppleServerApiClient;
};

type SignedTransactionSource = {
  signedTransactionInfo: string;
  environment?: ApplePurchaseEnvironment;
};

const APPLE_TRANSACTION_NOT_FOUND_CODES = new Set<number>([
  APIError.ORIGINAL_TRANSACTION_ID_NOT_FOUND,
  APIError.TRANSACTION_ID_NOT_FOUND
]);

export class ApplePurchaseValidationService {
  constructor(private readonly dependencies: ApplePurchaseValidationDependencies = {}) {}

  isConfigured(): boolean {
    const productionVerifierRequired = env.APPLE_IAP_ENVIRONMENT !== "sandbox";
    return Boolean(
      env.APPLE_BUNDLE_ID
      && this.canVerifyJwsOnly()
      && (!productionVerifierRequired || this.hasValidAppAppleId())
    );
  }

  async validate(input: ApplePurchaseValidationInput): Promise<ApplePurchaseValidationResult> {
    this.assertConfigured();

    let source: SignedTransactionSource | undefined;
    if (input.purchaseToken) {
      source = { signedTransactionInfo: input.purchaseToken };
    } else {
      if (!this.canCallServerApi()) {
        throw new AppError(501, "A validação da Apple precisa da transação assinada ou da API Server da Apple configurada.", "APPLE_SERVER_API_NOT_CONFIGURED");
      }
      source = await this.fetchSignedTransaction(input);
    }

    if (!source?.signedTransactionInfo) {
      throw new AppError(400, "Transação Apple ausente.", "APPLE_TRANSACTION_MISSING");
    }

    const environments = source.environment ? [source.environment] : this.validationEnvironments();
    const { decoded, environment } = await this.verifySignedTransaction(source.signedTransactionInfo, environments);
    this.assertTransactionMatches(decoded, input);

    return {
      originalTransactionId: decoded.originalTransactionId!,
      transactionId: decoded.transactionId,
      environment,
      purchasedAt: this.dateFromAppleTimestamp(decoded.purchaseDate, "APPLE_PURCHASE_DATE_INVALID")
    };
  }

  async validateNotification(signedPayload: string): Promise<AppleNotificationValidationResult> {
    this.assertConfigured();

    let verifiedNotification: ResponseBodyV2DecodedPayload | undefined;
    let environment: ApplePurchaseEnvironment | undefined;
    let verifier: AppleVerifier | undefined;
    let lastEnvironmentError: unknown;

    // The Apple library checks appAppleId before environment for production
    // notifications. In auto mode, verify sandbox first so a valid sandbox
    // notification without a production appAppleId can be classified safely.
    for (const candidate of this.notificationValidationEnvironments()) {
      const candidateVerifier = this.verifier(candidate);
      try {
        verifiedNotification = await candidateVerifier.verifyAndDecodeNotification(signedPayload);
      } catch (error) {
        if (this.isEnvironmentMismatch(error)) {
          lastEnvironmentError = error;
          continue;
        }
        throw this.toVerificationAppError(error);
      }

      verifier = candidateVerifier;
      try {
        environment = this.notificationEnvironment(verifiedNotification);
      } catch (error) {
        throw error instanceof AppError ? error : this.toVerificationAppError(error);
      }
      if (environment !== candidate) {
        throw new AppError(400, "Ambiente da notificação Apple não confere com o ambiente verificado.", "APPLE_ENVIRONMENT_MISMATCH");
      }
      break;
    }

    if (!verifiedNotification || !environment || !verifier) {
      if (lastEnvironmentError) {
        throw new AppError(400, "Ambiente da notificação Apple não aceito.", "APPLE_ENVIRONMENT_MISMATCH");
      }
      throw new AppError(400, "Notificação Apple inválida.", "APPLE_SIGNED_DATA_INVALID");
    }

    const signedTransactionInfo = verifiedNotification.data?.signedTransactionInfo;
    const transaction = signedTransactionInfo
      ? await this.verifyNotificationTransaction(verifier, signedTransactionInfo, environment)
      : undefined;

    if (transaction) this.assertNotificationTransactionMatches(transaction);

    return {
      notificationType: verifiedNotification.notificationType,
      notificationUUID: verifiedNotification.notificationUUID,
      signedDate: this.dateFromAppleTimestamp(verifiedNotification.signedDate, "APPLE_NOTIFICATION_DATE_INVALID"),
      originalTransactionId: transaction?.originalTransactionId,
      transactionId: transaction?.transactionId,
      productId: transaction?.productId,
      environment,
      appAccountToken: transaction?.appAccountToken,
      revocationDate: this.dateFromAppleTimestamp(transaction?.revocationDate, "APPLE_REVOCATION_DATE_INVALID")
    };
  }

  isRevocationNotification(notificationType?: string): boolean {
    return notificationType === NotificationTypeV2.REFUND || notificationType === NotificationTypeV2.REVOKE;
  }

  isReinstatementNotification(notificationType?: string): boolean {
    return notificationType === NotificationTypeV2.REFUND_REVERSED;
  }

  private assertConfigured(): void {
    if (!env.APPLE_BUNDLE_ID || !this.canVerifyJwsOnly()) {
      throw new AppError(501, "Validação server-side da Apple ainda não está configurada com Bundle ID e certificados raiz.", "APPLE_VALIDATION_NOT_CONFIGURED");
    }
    if (env.APPLE_IAP_ENVIRONMENT !== "sandbox" && !this.hasValidAppAppleId()) {
      throw new AppError(501, "A verificação Apple em produção exige um APPLE_APP_APPLE_ID positivo.", "APPLE_APP_ID_NOT_CONFIGURED");
    }
  }

  private validationEnvironments(): ApplePurchaseEnvironment[] {
    if (env.APPLE_IAP_ENVIRONMENT === "auto") return ["production", "sandbox"];
    return [env.APPLE_IAP_ENVIRONMENT];
  }

  private notificationValidationEnvironments(): ApplePurchaseEnvironment[] {
    if (env.APPLE_IAP_ENVIRONMENT === "auto") return ["sandbox", "production"];
    return this.validationEnvironments();
  }

  private async fetchSignedTransaction(input: ApplePurchaseValidationInput): Promise<SignedTransactionSource | undefined> {
    if (!this.canCallServerApi()) return undefined;
    const transactionId = input.transactionId ?? input.originalTransactionId;
    let lastNotFound: unknown;

    for (const environment of this.validationEnvironments()) {
      let response;
      try {
        response = await this.serverApiClient(environment).getTransactionInfo(transactionId);
      } catch (error) {
        if (this.isAppleTransactionNotFound(error)) {
          lastNotFound = error;
          continue;
        }
        if (error instanceof AppError) throw error;
        throw new AppError(502, "Não foi possível consultar a transação na API da Apple.", "APPLE_SERVER_API_FAILED");
      }

      if (!response.signedTransactionInfo) {
        throw new AppError(502, "A API da Apple não retornou uma transação assinada.", "APPLE_SERVER_RESPONSE_INVALID");
      }
      return { signedTransactionInfo: response.signedTransactionInfo, environment };
    }

    if (lastNotFound) {
      throw new AppError(404, "A Apple não encontrou essa transação nos ambientes configurados.", "APPLE_TRANSACTION_NOT_FOUND");
    }
    return undefined;
  }

  private async verifySignedTransaction(
    signedTransactionInfo: string,
    environments: ApplePurchaseEnvironment[]
  ): Promise<{ decoded: JWSTransactionDecodedPayload; environment: ApplePurchaseEnvironment }> {
    let lastEnvironmentError: unknown;
    for (const environment of environments) {
      let decoded: JWSTransactionDecodedPayload;
      try {
        decoded = await this.verifier(environment).verifyAndDecodeTransaction(signedTransactionInfo);
      } catch (error) {
        if (this.isEnvironmentMismatch(error)) {
          if (environments.length > 1) {
            lastEnvironmentError = error;
            continue;
          }
          throw new AppError(400, "Ambiente da transação Apple não aceito.", "APPLE_ENVIRONMENT_MISMATCH");
        }
        throw this.toVerificationAppError(error);
      }

      if (decoded.environment !== this.appleEnvironment(environment)) {
        throw new AppError(400, "Ambiente da transação Apple não confere com o ambiente verificado.", "APPLE_ENVIRONMENT_MISMATCH");
      }
      return { decoded, environment };
    }

    if (lastEnvironmentError) {
      throw new AppError(400, "Ambiente da transação Apple não aceito.", "APPLE_ENVIRONMENT_MISMATCH");
    }
    throw new AppError(400, "Transação assinada Apple inválida.", "APPLE_SIGNED_DATA_INVALID");
  }

  private async verifyNotificationTransaction(
    verifier: AppleVerifier,
    signedTransactionInfo: string,
    environment: ApplePurchaseEnvironment
  ): Promise<JWSTransactionDecodedPayload> {
    let transaction: JWSTransactionDecodedPayload;
    try {
      transaction = await verifier.verifyAndDecodeTransaction(signedTransactionInfo);
    } catch (error) {
      throw this.toVerificationAppError(error);
    }
    if (transaction.environment !== this.appleEnvironment(environment)) {
      throw new AppError(400, "A transação assinada e a notificação Apple usam ambientes diferentes.", "APPLE_NOTIFICATION_ENVIRONMENT_MISMATCH");
    }
    return transaction;
  }

  private notificationEnvironment(notification: ResponseBodyV2DecodedPayload): ApplePurchaseEnvironment {
    const appleEnvironment = notification.data?.environment
      ?? notification.summary?.environment
      ?? notification.appData?.environment
      ?? (notification.externalPurchaseToken?.externalPurchaseId?.startsWith("SANDBOX") ? Environment.SANDBOX : undefined)
      ?? (notification.externalPurchaseToken ? Environment.PRODUCTION : undefined);
    const environment = this.purchaseEnvironment(appleEnvironment);
    if (!environment) {
      throw new AppError(400, "Notificação Apple sem ambiente de transação válido.", "APPLE_NOTIFICATION_ENVIRONMENT_MISSING");
    }
    return environment;
  }

  private assertNotificationTransactionMatches(decoded: JWSTransactionDecodedPayload): void {
    if (decoded.bundleId !== env.APPLE_BUNDLE_ID) {
      throw new AppError(400, "Bundle ID da transação Apple inválido.", "APPLE_BUNDLE_MISMATCH");
    }
    if (decoded.productId !== env.APPLE_PREMIUM_PRODUCT_ID) {
      throw new AppError(400, "Produto da notificação Apple inválido.", "APPLE_PRODUCT_MISMATCH");
    }
    if (decoded.type !== Type.NON_CONSUMABLE) {
      throw new AppError(400, "Tipo da compra Apple inválido.", "APPLE_PRODUCT_TYPE_MISMATCH");
    }
  }

  private assertTransactionMatches(decoded: JWSTransactionDecodedPayload, input: ApplePurchaseValidationInput): void {
    if (decoded.bundleId !== env.APPLE_BUNDLE_ID) {
      throw new AppError(400, "Bundle ID da transação Apple inválido.", "APPLE_BUNDLE_MISMATCH");
    }
    if (decoded.productId !== input.productId || decoded.productId !== env.APPLE_PREMIUM_PRODUCT_ID) {
      throw new AppError(400, "Produto da transação Apple inválido.", "APPLE_PRODUCT_MISMATCH");
    }
    if (decoded.revocationDate) {
      throw new AppError(402, "Compra Apple revogada ou reembolsada.", "APPLE_PURCHASE_REVOKED");
    }
    if (!decoded.originalTransactionId || decoded.originalTransactionId !== input.originalTransactionId) {
      throw new AppError(400, "Transação original Apple não confere.", "APPLE_ORIGINAL_TRANSACTION_MISMATCH");
    }
    if (input.expectedAppAccountToken && decoded.appAccountToken !== input.expectedAppAccountToken) {
      throw new AppError(400, "A compra Apple está vinculada a outra conta.", "APPLE_ACCOUNT_MISMATCH");
    }
    if (input.transactionId && decoded.transactionId !== input.transactionId) {
      throw new AppError(400, "Identificador da transação Apple não confere.", "APPLE_TRANSACTION_ID_MISMATCH");
    }
    if (decoded.type !== Type.NON_CONSUMABLE) {
      throw new AppError(400, "Tipo da compra Apple inválido.", "APPLE_PRODUCT_TYPE_MISMATCH");
    }
  }

  private verifier(environment: ApplePurchaseEnvironment): AppleVerifier {
    if (this.dependencies.verifierFactory) return this.dependencies.verifierFactory(environment);
    return new SignedDataVerifier(
      this.rootCertificates(),
      true,
      this.appleEnvironment(environment),
      env.APPLE_BUNDLE_ID,
      environment === "production" ? env.APPLE_APP_APPLE_ID : undefined
    );
  }

  private serverApiClient(environment: ApplePurchaseEnvironment): AppleServerApiClient {
    if (this.dependencies.serverApiClientFactory) return this.dependencies.serverApiClientFactory(environment);
    return new AppStoreServerAPIClient(
      this.privateKey(),
      env.APPLE_IAP_KEY_ID!,
      env.APPLE_IAP_ISSUER_ID!,
      env.APPLE_BUNDLE_ID,
      this.appleEnvironment(environment)
    );
  }

  private appleEnvironment(environment: ApplePurchaseEnvironment): Environment {
    return environment === "production" ? Environment.PRODUCTION : Environment.SANDBOX;
  }

  private purchaseEnvironment(environment?: string): ApplePurchaseEnvironment | undefined {
    if (environment === Environment.PRODUCTION || environment === "production") return "production";
    if (environment === Environment.SANDBOX || environment === "sandbox") return "sandbox";
    return undefined;
  }

  private isEnvironmentMismatch(error: unknown): boolean {
    return error instanceof VerificationException && error.status === VerificationStatus.INVALID_ENVIRONMENT;
  }

  private toVerificationAppError(error: unknown): AppError {
    if (error instanceof AppError) return error;
    if (error instanceof VerificationException && error.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE) {
      return new AppError(503, "A verificação da transação Apple está temporariamente indisponível.", "APPLE_VERIFICATION_RETRYABLE");
    }
    return new AppError(400, "Transação ou notificação assinada Apple inválida.", "APPLE_SIGNED_DATA_INVALID");
  }

  private isAppleTransactionNotFound(error: unknown): boolean {
    return error instanceof APIException
      && error.httpStatusCode === 404
      && error.apiError !== null
      && APPLE_TRANSACTION_NOT_FOUND_CODES.has(error.apiError);
  }

  private dateFromAppleTimestamp(timestamp: number | undefined, code: string): Date | undefined {
    if (timestamp === undefined) return undefined;
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) {
      throw new AppError(400, "A transação Apple contém uma data inválida.", code);
    }
    return date;
  }

  private hasValidAppAppleId(): boolean {
    return Number.isSafeInteger(env.APPLE_APP_APPLE_ID) && (env.APPLE_APP_APPLE_ID ?? 0) > 0;
  }

  private canVerifyJwsOnly(): boolean {
    return Boolean(env.APPLE_ROOT_CERT_PATHS?.split(",").some((certPath) => certPath.trim().length > 0));
  }

  private canCallServerApi(): boolean {
    return Boolean(env.APPLE_IAP_KEY_ID && env.APPLE_IAP_ISSUER_ID && (env.APPLE_IAP_PRIVATE_KEY || env.APPLE_IAP_PRIVATE_KEY_PATH));
  }

  private privateKey(): string {
    if (env.APPLE_IAP_PRIVATE_KEY) return env.APPLE_IAP_PRIVATE_KEY.replace(/\\n/g, "\n");
    const keyPath = this.resolvePath(env.APPLE_IAP_PRIVATE_KEY_PATH!);
    try {
      return fs.readFileSync(keyPath, "utf8");
    } catch {
      throw new AppError(501, "A chave privada da API Apple não está disponível no servidor.", "APPLE_SERVER_API_CREDENTIALS_NOT_CONFIGURED");
    }
  }

  private rootCertificates(): Buffer[] {
    try {
      return env.APPLE_ROOT_CERT_PATHS!
        .split(",")
        .map((certPath) => certPath.trim())
        .filter((certPath) => certPath.length > 0)
        .map((certPath) => fs.readFileSync(this.resolvePath(certPath)));
    } catch {
      throw new AppError(501, "Os certificados raiz Apple não estão disponíveis no servidor.", "APPLE_ROOT_CERTIFICATES_NOT_CONFIGURED");
    }
  }

  private resolvePath(filePath: string): string {
    return path.isAbsolute(filePath) ? filePath : path.resolve(paths.rootDir, filePath);
  }
}
