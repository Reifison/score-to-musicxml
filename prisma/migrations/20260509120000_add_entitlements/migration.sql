CREATE TYPE "EntitlementPlan" AS ENUM ('free', 'paid');

ALTER TYPE "AuditAction" ADD VALUE 'purchase_started';
ALTER TYPE "AuditAction" ADD VALUE 'purchase_completed';
ALTER TYPE "AuditAction" ADD VALUE 'purchase_failed';
ALTER TYPE "AuditAction" ADD VALUE 'purchase_restored';
ALTER TYPE "AuditAction" ADD VALUE 'entitlement_changed';
ALTER TYPE "AuditAction" ADD VALUE 'free_scan_used';

CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "EntitlementPlan" NOT NULL DEFAULT 'free',
    "freeScansUsed" INTEGER NOT NULL DEFAULT 0,
    "appleOriginalTransactionId" TEXT,
    "appleProductId" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScanUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scoreId" TEXT,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Entitlement_userId_key" ON "Entitlement"("userId");
CREATE UNIQUE INDEX "Entitlement_appleOriginalTransactionId_key" ON "Entitlement"("appleOriginalTransactionId");
CREATE INDEX "Entitlement_plan_idx" ON "Entitlement"("plan");
CREATE UNIQUE INDEX "ScanUsage_scoreId_key" ON "ScanUsage"("scoreId");
CREATE INDEX "ScanUsage_userId_idx" ON "ScanUsage"("userId");
CREATE INDEX "ScanUsage_createdAt_idx" ON "ScanUsage"("createdAt");

ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScanUsage" ADD CONSTRAINT "ScanUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScanUsage" ADD CONSTRAINT "ScanUsage_scoreId_fkey" FOREIGN KEY ("scoreId") REFERENCES "Score"("id") ON DELETE SET NULL ON UPDATE CASCADE;
