ALTER TYPE "AuditAction" ADD VALUE 'score_restored';

ALTER TABLE "Score"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "purgeAt" TIMESTAMP(3);

CREATE INDEX "Score_userId_deletedAt_idx" ON "Score"("userId", "deletedAt");
CREATE INDEX "Score_purgeAt_idx" ON "Score"("purgeAt");
