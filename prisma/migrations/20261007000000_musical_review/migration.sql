CREATE TYPE "ReviewStatus" AS ENUM ('unverified', 'needs_review', 'approved');
ALTER TYPE "AuditAction" ADD VALUE 'score_reviewed';
ALTER TABLE "Score"
  ADD COLUMN "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'unverified',
  ADD COLUMN "reviewRevision" TEXT,
  ADD COLUMN "validation" JSONB,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" TEXT;
