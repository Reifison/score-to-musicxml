ALTER TYPE "EntitlementSource" ADD VALUE 'google_play';

ALTER TABLE "Entitlement" ADD COLUMN "googlePurchaseToken" TEXT;
ALTER TABLE "Entitlement" ADD COLUMN "googleProductId" TEXT;
CREATE UNIQUE INDEX "Entitlement_googlePurchaseToken_key" ON "Entitlement"("googlePurchaseToken");

CREATE TABLE "GooglePlayNotification" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "purchaseToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GooglePlayNotification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GooglePlayNotification_messageId_key" ON "GooglePlayNotification"("messageId");
CREATE INDEX "GooglePlayNotification_purchaseToken_idx" ON "GooglePlayNotification"("purchaseToken");
CREATE INDEX "GooglePlayNotification_createdAt_idx" ON "GooglePlayNotification"("createdAt");
