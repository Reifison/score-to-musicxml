-- The deployed service accepted only Sandbox before this migration. Verify that
-- precondition in the release preflight before classifying its legacy claims.
ALTER TABLE "Entitlement" ADD COLUMN "appleEnvironment" TEXT;
UPDATE "Entitlement" SET "appleEnvironment" = 'sandbox'
WHERE "appleOriginalTransactionId" IS NOT NULL;
DROP INDEX "Entitlement_appleOriginalTransactionId_key";
CREATE UNIQUE INDEX "Entitlement_appleEnvironment_appleOriginalTransactionId_key"
ON "Entitlement"("appleEnvironment", "appleOriginalTransactionId");

CREATE TABLE "ApplePurchase" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "environment" TEXT NOT NULL CHECK ("environment" IN ('sandbox', 'production')),
  "originalTransactionId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "purchasedAt" TIMESTAMP(3),
  "revoked" BOOLEAN NOT NULL DEFAULT false,
  "lastNotificationId" TEXT,
  "lastNotificationSignedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApplePurchase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApplePurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ApplePurchase_environment_originalTransactionId_key"
ON "ApplePurchase"("environment", "originalTransactionId");
CREATE INDEX "ApplePurchase_userId_idx" ON "ApplePurchase"("userId");
INSERT INTO "ApplePurchase" ("id", "userId", "environment", "originalTransactionId", "productId", "purchasedAt", "updatedAt")
SELECT 'legacy-' || "id", "userId", 'sandbox', "appleOriginalTransactionId", "appleProductId", "purchasedAt", CURRENT_TIMESTAMP
FROM "Entitlement" WHERE "appleOriginalTransactionId" IS NOT NULL AND "appleProductId" IS NOT NULL;
