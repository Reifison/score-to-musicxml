import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APIError,
  APIException,
  Environment,
  NotificationTypeV2,
  Type,
  VerificationException,
  VerificationStatus,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload
} from "@apple/app-store-server-library";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";
import {
  ApplePurchaseValidationService,
  type ApplePurchaseEnvironment,
  type ApplePurchaseValidationInput
} from "../services/ApplePurchaseValidationService.js";

const originalAppleConfig = {
  APPLE_BUNDLE_ID: env.APPLE_BUNDLE_ID,
  APPLE_PREMIUM_PRODUCT_ID: env.APPLE_PREMIUM_PRODUCT_ID,
  APPLE_APP_APPLE_ID: env.APPLE_APP_APPLE_ID,
  APPLE_IAP_ENVIRONMENT: env.APPLE_IAP_ENVIRONMENT,
  APPLE_IAP_KEY_ID: env.APPLE_IAP_KEY_ID,
  APPLE_IAP_ISSUER_ID: env.APPLE_IAP_ISSUER_ID,
  APPLE_IAP_PRIVATE_KEY: env.APPLE_IAP_PRIVATE_KEY,
  APPLE_IAP_PRIVATE_KEY_PATH: env.APPLE_IAP_PRIVATE_KEY_PATH,
  APPLE_ROOT_CERT_PATHS: env.APPLE_ROOT_CERT_PATHS
};

const signedTransaction = "eyJhbGciOiJFUzI1NiJ9.eyJwcm9kdWN0SWQiOiJwcmVtaXVtX3VubG9jayJ9.signature";

afterEach(() => {
  Object.assign(env, originalAppleConfig);
  vi.restoreAllMocks();
});

function configureApple(environment: "sandbox" | "production" | "auto" = "auto") {
  env.APPLE_BUNDLE_ID = "com.example.score";
  env.APPLE_PREMIUM_PRODUCT_ID = "premium_unlock";
  env.APPLE_APP_APPLE_ID = environment === "sandbox" ? undefined : 6778062424;
  env.APPLE_IAP_ENVIRONMENT = environment;
  env.APPLE_IAP_KEY_ID = undefined;
  env.APPLE_IAP_ISSUER_ID = undefined;
  env.APPLE_IAP_PRIVATE_KEY = undefined;
  env.APPLE_IAP_PRIVATE_KEY_PATH = undefined;
  // The test verifier factory bypasses certificate loading while exercising the environment selection.
  env.APPLE_ROOT_CERT_PATHS = "/test/apple-root.der";
}

function transaction(environment: ApplePurchaseEnvironment, overrides: Partial<JWSTransactionDecodedPayload> = {}): JWSTransactionDecodedPayload {
  return {
    bundleId: env.APPLE_BUNDLE_ID,
    productId: env.APPLE_PREMIUM_PRODUCT_ID,
    originalTransactionId: "original-transaction-1",
    transactionId: "transaction-1",
    appAccountToken: "account-token-1",
    purchaseDate: 1_797_000_000_000,
    type: Type.NON_CONSUMABLE,
    environment: environment === "production" ? Environment.PRODUCTION : Environment.SANDBOX,
    ...overrides
  };
}

function purchaseInput(overrides: Partial<ApplePurchaseValidationInput> = {}): ApplePurchaseValidationInput {
  return {
    productId: env.APPLE_PREMIUM_PRODUCT_ID,
    originalTransactionId: "original-transaction-1",
    transactionId: "transaction-1",
    purchaseToken: signedTransaction,
    expectedAppAccountToken: "account-token-1",
    ...overrides
  };
}

function verifierFactoryForTransaction(
  decodedFor: (environment: ApplePurchaseEnvironment) => JWSTransactionDecodedPayload | Promise<JWSTransactionDecodedPayload>,
  attempts: ApplePurchaseEnvironment[] = []
) {
  return (environment: ApplePurchaseEnvironment) => {
    attempts.push(environment);
    return {
      verifyAndDecodeTransaction: async () => decodedFor(environment),
      verifyAndDecodeNotification: async () => ({}) as ResponseBodyV2DecodedPayload
    };
  };
}

describe("ApplePurchaseValidationService environment routing", () => {
  it("verifies sandbox notifications before production appAppleId checks in auto mode", async () => {
    configureApple("auto");
    const attempts: ApplePurchaseEnvironment[] = [];
    const service = new ApplePurchaseValidationService({
      verifierFactory: (environment) => {
        attempts.push(environment);
        return {
          verifyAndDecodeTransaction: async () => transaction(environment),
          verifyAndDecodeNotification: async () => {
            if (environment === "production") {
              // The installed Apple verifier performs the production appAppleId
              // check before comparing environments.
              throw new VerificationException(VerificationStatus.INVALID_APP_IDENTIFIER);
            }
            return {
              notificationType: NotificationTypeV2.TEST,
              notificationUUID: "sandbox-test-notification",
              signedDate: 1_797_000_000_000,
              data: { environment: Environment.SANDBOX, bundleId: env.APPLE_BUNDLE_ID }
            } as ResponseBodyV2DecodedPayload;
          }
        };
      }
    });

    await expect(service.validateNotification("signed-sandbox-notification"))
      .resolves.toMatchObject({ environment: "sandbox", notificationUUID: "sandbox-test-notification" });
    expect(attempts).toEqual(["sandbox"]);
  });

  it("falls through the sandbox environment check to verify production notifications", async () => {
    configureApple("auto");
    const attempts: ApplePurchaseEnvironment[] = [];
    const service = new ApplePurchaseValidationService({
      verifierFactory: (environment) => {
        attempts.push(environment);
        return {
          verifyAndDecodeTransaction: async () => transaction(environment),
          verifyAndDecodeNotification: async () => {
            if (environment === "sandbox") {
              throw new VerificationException(VerificationStatus.INVALID_ENVIRONMENT);
            }
            return {
              notificationType: NotificationTypeV2.TEST,
              notificationUUID: "production-test-notification",
              signedDate: 1_797_000_000_000,
              data: { environment: Environment.PRODUCTION, bundleId: env.APPLE_BUNDLE_ID, appAppleId: env.APPLE_APP_APPLE_ID }
            } as ResponseBodyV2DecodedPayload;
          }
        };
      }
    });

    await expect(service.validateNotification("signed-production-notification"))
      .resolves.toMatchObject({ environment: "production", notificationUUID: "production-test-notification" });
    expect(attempts).toEqual(["sandbox", "production"]);
  });

  it("tries the official production and sandbox verifiers and reports the verified sandbox environment", async () => {
    configureApple("auto");
    const attempts: ApplePurchaseEnvironment[] = [];
    const service = new ApplePurchaseValidationService({
      verifierFactory: verifierFactoryForTransaction((environment) => {
        if (environment === "production") throw new VerificationException(VerificationStatus.INVALID_ENVIRONMENT);
        return transaction("sandbox");
      }, attempts)
    });

    const result = await service.validate(purchaseInput());

    expect(attempts).toEqual(["production", "sandbox"]);
    expect(result).toMatchObject({
      originalTransactionId: "original-transaction-1",
      transactionId: "transaction-1",
      environment: "sandbox"
    });
    expect(result.purchasedAt).toBeInstanceOf(Date);
  });

  it("uses the production verifier when it verifies a production transaction", async () => {
    configureApple("auto");
    const attempts: ApplePurchaseEnvironment[] = [];
    const service = new ApplePurchaseValidationService({
      verifierFactory: verifierFactoryForTransaction((environment) => transaction(environment), attempts)
    });

    await expect(service.validate(purchaseInput())).resolves.toMatchObject({ environment: "production" });
    expect(attempts).toEqual(["production"]);
  });

  it("does not try another environment after a signature or certificate verification failure", async () => {
    configureApple("auto");
    const attempts: ApplePurchaseEnvironment[] = [];
    const service = new ApplePurchaseValidationService({
      verifierFactory: verifierFactoryForTransaction(() => {
        throw new VerificationException(VerificationStatus.VERIFICATION_FAILURE);
      }, attempts)
    });

    await expect(service.validate(purchaseInput())).rejects.toMatchObject({ code: "APPLE_SIGNED_DATA_INVALID" });
    expect(attempts).toEqual(["production"]);
  });

  it("keeps the default sandbox-only route and requires a positive App Apple ID for production or auto", async () => {
    configureApple("sandbox");
    const attempts: ApplePurchaseEnvironment[] = [];
    const sandboxService = new ApplePurchaseValidationService({
      verifierFactory: verifierFactoryForTransaction((environment) => transaction(environment), attempts)
    });
    await expect(sandboxService.validate(purchaseInput())).resolves.toMatchObject({ environment: "sandbox" });
    expect(attempts).toEqual(["sandbox"]);

    configureApple("production");
    env.APPLE_APP_APPLE_ID = undefined;
    const productionService = new ApplePurchaseValidationService();
    expect(productionService.isConfigured()).toBe(false);
    await expect(productionService.validate(purchaseInput())).rejects.toMatchObject({ code: "APPLE_APP_ID_NOT_CONFIGURED" });
  });
});

describe("Apple transaction claims", () => {
  const invalidClaims: Array<[string, Partial<JWSTransactionDecodedPayload>, string]> = [
    ["bundle ID", { bundleId: "com.example.other" }, "APPLE_BUNDLE_MISMATCH"],
    ["product ID", { productId: "other_product" }, "APPLE_PRODUCT_MISMATCH"],
    ["transaction ID", { transactionId: "another-transaction" }, "APPLE_TRANSACTION_ID_MISMATCH"],
    ["account token", { appAccountToken: "another-account" }, "APPLE_ACCOUNT_MISMATCH"],
    ["non-consumable type", { type: Type.CONSUMABLE }, "APPLE_PRODUCT_TYPE_MISMATCH"],
    ["original transaction ID", { originalTransactionId: "another-original" }, "APPLE_ORIGINAL_TRANSACTION_MISMATCH"],
    ["revocation date", { revocationDate: 1_797_000_000_000 }, "APPLE_PURCHASE_REVOKED"]
  ];

  it.each(invalidClaims)("rejects an Apple transaction with a mismatched %s", async (_label, overrides, code) => {
    configureApple("sandbox");
    const service = new ApplePurchaseValidationService({
      verifierFactory: verifierFactoryForTransaction(() => transaction("sandbox", overrides))
    });

    await expect(service.validate(purchaseInput())).rejects.toMatchObject({ code });
  });

  it("rejects a verified transaction when its original transaction ID is missing", async () => {
    configureApple("sandbox");
    const service = new ApplePurchaseValidationService({
      verifierFactory: verifierFactoryForTransaction(() => transaction("sandbox", { originalTransactionId: undefined }))
    });

    await expect(service.validate(purchaseInput())).rejects.toMatchObject({ code: "APPLE_ORIGINAL_TRANSACTION_MISMATCH" });
  });

  it("rejects local or Xcode transactions even when an injected verifier returns them", async () => {
    configureApple("sandbox");
    const service = new ApplePurchaseValidationService({
      verifierFactory: verifierFactoryForTransaction(() => transaction("sandbox", { environment: Environment.XCODE }))
    });

    await expect(service.validate(purchaseInput())).rejects.toMatchObject({ code: "APPLE_ENVIRONMENT_MISMATCH" });
  });
});

describe("Apple notifications", () => {
  it("returns verified environment and refund metadata for the matching nested transaction", async () => {
    configureApple("auto");
    const notificationAttempts: ApplePurchaseEnvironment[] = [];
    const service = new ApplePurchaseValidationService({
      verifierFactory: (environment) => {
        notificationAttempts.push(environment);
        return {
          verifyAndDecodeNotification: async () => {
            if (environment === "production") throw new VerificationException(VerificationStatus.INVALID_ENVIRONMENT);
            return {
              notificationType: NotificationTypeV2.REFUND,
              notificationUUID: "notification-1",
              signedDate: 1_797_000_000_000,
              data: {
                environment: Environment.SANDBOX,
                bundleId: env.APPLE_BUNDLE_ID,
                signedTransactionInfo: signedTransaction
              }
            } as ResponseBodyV2DecodedPayload;
          },
          verifyAndDecodeTransaction: async () => transaction("sandbox", { revocationDate: 1_797_000_000_000 })
        };
      }
    });

    const result = await service.validateNotification("signed-notification-payload");

    expect(notificationAttempts).toEqual(["sandbox"]);
    expect(result).toMatchObject({
      notificationType: NotificationTypeV2.REFUND,
      notificationUUID: "notification-1",
      originalTransactionId: "original-transaction-1",
      transactionId: "transaction-1",
      productId: "premium_unlock",
      environment: "sandbox",
      appAccountToken: "account-token-1"
    });
    expect(result.signedDate).toBeInstanceOf(Date);
    expect(result.revocationDate).toBeInstanceOf(Date);
    expect(service.isRevocationNotification(result.notificationType)).toBe(true);
    expect(service.isReinstatementNotification(NotificationTypeV2.REFUND_REVERSED)).toBe(true);
  });

  it("keeps a valid TEST notification without a transaction as a verified non-purchase notification", async () => {
    configureApple("sandbox");
    const service = new ApplePurchaseValidationService({
      verifierFactory: () => ({
        verifyAndDecodeNotification: async () => ({
          notificationType: NotificationTypeV2.TEST,
          notificationUUID: "test-notification-1",
          signedDate: 1_797_000_000_000,
          data: { environment: Environment.SANDBOX, bundleId: env.APPLE_BUNDLE_ID }
        }) as ResponseBodyV2DecodedPayload,
        verifyAndDecodeTransaction: async () => {
          throw new Error("TEST notification has no transaction");
        }
      })
    });

    const result = await service.validateNotification("signed-test-notification");

    expect(result).toMatchObject({
      notificationType: NotificationTypeV2.TEST,
      notificationUUID: "test-notification-1",
      environment: "sandbox"
    });
    expect(result.originalTransactionId).toBeUndefined();
  });

  it("rejects a nested transaction signed for a different environment", async () => {
    configureApple("sandbox");
    const service = new ApplePurchaseValidationService({
      verifierFactory: () => ({
        verifyAndDecodeNotification: async () => ({
          notificationType: NotificationTypeV2.REFUND,
          data: { environment: Environment.SANDBOX, bundleId: env.APPLE_BUNDLE_ID, signedTransactionInfo: signedTransaction }
        }) as ResponseBodyV2DecodedPayload,
        verifyAndDecodeTransaction: async () => transaction("production")
      })
    });

    await expect(service.validateNotification("signed-notification-payload"))
      .rejects.toMatchObject({ code: "APPLE_NOTIFICATION_ENVIRONMENT_MISMATCH" });
  });

  it("rejects a nested transaction for another product or product type", async () => {
    configureApple("sandbox");
    const service = new ApplePurchaseValidationService({
      verifierFactory: () => ({
        verifyAndDecodeNotification: async () => ({
          notificationType: NotificationTypeV2.REFUND,
          data: { environment: Environment.SANDBOX, bundleId: env.APPLE_BUNDLE_ID, signedTransactionInfo: signedTransaction }
        }) as ResponseBodyV2DecodedPayload,
        verifyAndDecodeTransaction: async () => transaction("sandbox", { productId: "other_product" })
      })
    });

    await expect(service.validateNotification("signed-notification-payload"))
      .rejects.toMatchObject({ code: "APPLE_PRODUCT_MISMATCH" });
  });
});

describe("Apple Server API fallback", () => {
  it("tries the other fixed Apple environment only after an exact transaction-not-found response", async () => {
    configureApple("auto");
    env.APPLE_IAP_KEY_ID = "test-key-id";
    env.APPLE_IAP_ISSUER_ID = "test-issuer-id";
    env.APPLE_IAP_PRIVATE_KEY = "test-private-key";
    const apiAttempts: ApplePurchaseEnvironment[] = [];
    const verifierAttempts: ApplePurchaseEnvironment[] = [];
    const service = new ApplePurchaseValidationService({
      serverApiClientFactory: (environment) => {
        apiAttempts.push(environment);
        return {
          getTransactionInfo: async () => {
            if (environment === "production") throw new APIException(404, APIError.TRANSACTION_ID_NOT_FOUND);
            return { signedTransactionInfo: signedTransaction };
          }
        };
      },
      verifierFactory: verifierFactoryForTransaction((environment) => transaction(environment), verifierAttempts)
    });

    const result = await service.validate(purchaseInput({ purchaseToken: undefined }));

    expect(apiAttempts).toEqual(["production", "sandbox"]);
    expect(verifierAttempts).toEqual(["sandbox"]);
    expect(result.environment).toBe("sandbox");
  });

  it("does not fall back after an Apple API authorization or other non-not-found failure", async () => {
    configureApple("auto");
    env.APPLE_IAP_KEY_ID = "test-key-id";
    env.APPLE_IAP_ISSUER_ID = "test-issuer-id";
    env.APPLE_IAP_PRIVATE_KEY = "test-private-key";
    const apiAttempts: ApplePurchaseEnvironment[] = [];
    const service = new ApplePurchaseValidationService({
      serverApiClientFactory: (environment) => {
        apiAttempts.push(environment);
        return { getTransactionInfo: async () => { throw new APIException(401, APIError.INVALID_APP_IDENTIFIER); } };
      },
      verifierFactory: verifierFactoryForTransaction((environment) => transaction(environment))
    });

    await expect(service.validate(purchaseInput({ purchaseToken: undefined })))
      .rejects.toMatchObject({ code: "APPLE_SERVER_API_FAILED" });
    expect(apiAttempts).toEqual(["production"]);
  });

  it("does not treat a retryable not-found response as evidence to query another environment", async () => {
    configureApple("auto");
    env.APPLE_IAP_KEY_ID = "test-key-id";
    env.APPLE_IAP_ISSUER_ID = "test-issuer-id";
    env.APPLE_IAP_PRIVATE_KEY = "test-private-key";
    const apiAttempts: ApplePurchaseEnvironment[] = [];
    const service = new ApplePurchaseValidationService({
      serverApiClientFactory: (environment) => {
        apiAttempts.push(environment);
        return {
          getTransactionInfo: async () => {
            throw new APIException(404, APIError.ORIGINAL_TRANSACTION_ID_NOT_FOUND_RETRYABLE);
          }
        };
      },
      verifierFactory: verifierFactoryForTransaction((environment) => transaction(environment))
    });

    await expect(service.validate(purchaseInput({ purchaseToken: undefined })))
      .rejects.toMatchObject({ code: "APPLE_SERVER_API_FAILED" });
    expect(apiAttempts).toEqual(["production"]);
  });

  it("does not treat a missing transaction as a valid API response", async () => {
    configureApple("production");
    env.APPLE_IAP_KEY_ID = "test-key-id";
    env.APPLE_IAP_ISSUER_ID = "test-issuer-id";
    env.APPLE_IAP_PRIVATE_KEY = "test-private-key";
    const service = new ApplePurchaseValidationService({
      serverApiClientFactory: () => ({ getTransactionInfo: async () => ({}) }),
      verifierFactory: verifierFactoryForTransaction((environment) => transaction(environment))
    });

    await expect(service.validate(purchaseInput({ purchaseToken: undefined })))
      .rejects.toMatchObject({ code: "APPLE_SERVER_RESPONSE_INVALID" });
  });
});

it("returns configuration errors as non-sensitive AppError instances", async () => {
  configureApple("auto");
  env.APPLE_APP_APPLE_ID = undefined;
  const service = new ApplePurchaseValidationService();

  try {
    await service.validate(purchaseInput());
    throw new Error("Expected validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 501, code: "APPLE_APP_ID_NOT_CONFIGURED" });
    expect((error as Error).message).not.toContain("6778062424");
  }
});
