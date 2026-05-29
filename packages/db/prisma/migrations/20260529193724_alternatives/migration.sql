-- CreateEnum
CREATE TYPE "AlternativeStatus" AS ENUM ('PENDING', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "Alternative" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "ply" INTEGER NOT NULL,
    "alternativeUci" TEXT NOT NULL,
    "alternativeSan" TEXT NOT NULL,
    "fenBefore" TEXT NOT NULL,
    "playedSan" TEXT NOT NULL,
    "playedEvalCp" INTEGER,
    "playedEvalMate" INTEGER,
    "altEvalCp" INTEGER,
    "altEvalMate" INTEGER,
    "cpDelta" INTEGER,
    "status" "AlternativeStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Alternative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alternative_status_createdAt_idx" ON "Alternative"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Alternative_matchId_ply_idx" ON "Alternative"("matchId", "ply");

-- CreateIndex
CREATE UNIQUE INDEX "Alternative_matchId_ply_alternativeUci_key" ON "Alternative"("matchId", "ply", "alternativeUci");

-- AddForeignKey
ALTER TABLE "Alternative" ADD CONSTRAINT "Alternative_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
