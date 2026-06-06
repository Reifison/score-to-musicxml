ALTER TABLE "Score" ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Score_userId_isFavorite_idx" ON "Score"("userId", "isFavorite");
