CREATE TYPE "EntitlementSource" AS ENUM ('free', 'apple', 'legacy_grant', 'admin_grant');

ALTER TABLE "Entitlement"
  ADD COLUMN "source" "EntitlementSource" NOT NULL DEFAULT 'free',
  ADD COLUMN "grantedAt" TIMESTAMP(3),
  ADD COLUMN "grantedById" TEXT,
  ADD COLUMN "grantReason" TEXT;

UPDATE "Entitlement"
SET "source" = 'apple'
WHERE "plan" = 'paid'
  AND "appleProductId" IS NOT NULL;

INSERT INTO "Entitlement" (
  "id",
  "userId",
  "plan",
  "source",
  "freeScansUsed",
  "grantedAt",
  "grantReason",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy_' || "User"."id",
  "User"."id",
  'paid',
  'legacy_grant',
  0,
  CURRENT_TIMESTAMP,
  'Usuário existente antes da data de corte 2026-05-11',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User"
WHERE "User"."createdAt" < TIMESTAMP '2026-05-11 00:00:00'
ON CONFLICT ("userId") DO UPDATE
SET
  "plan" = 'paid',
  "source" = 'legacy_grant',
  "grantedAt" = COALESCE("Entitlement"."grantedAt", CURRENT_TIMESTAMP),
  "grantReason" = COALESCE("Entitlement"."grantReason", 'Usuário existente antes da data de corte 2026-05-11'),
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "AuditLog" (
  "id",
  "actorId",
  "action",
  "entity",
  "entityId",
  "metadata",
  "createdAt"
)
SELECT
  'legacy_grant_' || "User"."id",
  NULL,
  'entitlement_changed',
  'user',
  "User"."id",
  jsonb_build_object('reason', 'legacy_grant', 'cutoff', '2026-05-11T00:00:00.000Z'),
  CURRENT_TIMESTAMP
FROM "User"
WHERE "User"."createdAt" < TIMESTAMP '2026-05-11 00:00:00'
ON CONFLICT ("id") DO NOTHING;

CREATE INDEX "Entitlement_source_idx" ON "Entitlement"("source");
CREATE INDEX "Entitlement_grantedById_idx" ON "Entitlement"("grantedById");

ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
