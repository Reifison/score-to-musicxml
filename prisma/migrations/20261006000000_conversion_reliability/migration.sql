CREATE TYPE "ScoreType" AS ENUM ('melody', 'piano', 'guitar_solo', 'guitar_duo');
CREATE TYPE "ConversionResultStatus" AS ENUM ('complete', 'partial');
CREATE TYPE "ConversionAttemptKind" AS ENUM ('initial', 'automatic', 'manual');
CREATE TYPE "ConversionAttemptStatus" AS ENUM ('queued', 'processing', 'complete', 'partial', 'failed');

ALTER TABLE "Score"
  ADD COLUMN "scoreType" "ScoreType" NOT NULL DEFAULT 'melody',
  ADD COLUMN "scoreTypeSelected" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "resultStatus" "ConversionResultStatus",
  ADD COLUMN "coverage" JSONB,
  ADD COLUMN "lastErrorCode" TEXT;

CREATE TABLE "ConversionAttempt" (
  "id" TEXT NOT NULL,
  "scoreId" TEXT NOT NULL,
  "kind" "ConversionAttemptKind" NOT NULL,
  "status" "ConversionAttemptStatus" NOT NULL DEFAULT 'queued',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "coverage" JSONB,
  "musicxmlFilename" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "ConversionAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConversionAttempt_scoreId_fkey" FOREIGN KEY ("scoreId") REFERENCES "Score"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ConversionAttempt_scoreId_createdAt_idx" ON "ConversionAttempt"("scoreId", "createdAt");
CREATE UNIQUE INDEX "ConversionAttempt_scoreId_kind_key" ON "ConversionAttempt"("scoreId", "kind");
CREATE INDEX "ConversionAttempt_status_createdAt_idx" ON "ConversionAttempt"("status", "createdAt");

INSERT INTO "ConversionAttempt" ("id", "scoreId", "kind", "status", "createdAt")
SELECT 'legacy-' || "id", "id", 'initial', 'queued', CURRENT_TIMESTAMP
FROM "Score"
WHERE "conversionStatus" IN ('uploaded', 'queued', 'processing') AND "deletedAt" IS NULL;

UPDATE "Score" SET "conversionStatus" = 'queued'
WHERE "conversionStatus" IN ('uploaded', 'processing') AND "deletedAt" IS NULL;
