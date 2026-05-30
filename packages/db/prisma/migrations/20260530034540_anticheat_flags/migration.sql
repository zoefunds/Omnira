-- CreateEnum
CREATE TYPE "SuspicionStatus" AS ENUM ('OPEN', 'REVIEWED_BENIGN', 'REVIEWED_CHEATING');

-- CreateTable
CREATE TABLE "SuspicionFlag" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "color" VARCHAR(1) NOT NULL,
    "pliesAnalyzed" INTEGER NOT NULL,
    "avgCpLoss" DOUBLE PRECISION NOT NULL,
    "topMovePct" DOUBLE PRECISION NOT NULL,
    "ratingGapDelta" INTEGER NOT NULL,
    "themes" TEXT[],
    "severity" INTEGER NOT NULL,
    "status" "SuspicionStatus" NOT NULL DEFAULT 'OPEN',
    "reviewerNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuspicionFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SuspicionFlag_status_severity_idx" ON "SuspicionFlag"("status", "severity" DESC);

-- CreateIndex
CREATE INDEX "SuspicionFlag_userId_createdAt_idx" ON "SuspicionFlag"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SuspicionFlag_matchId_userId_key" ON "SuspicionFlag"("matchId", "userId");

-- AddForeignKey
ALTER TABLE "SuspicionFlag" ADD CONSTRAINT "SuspicionFlag_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuspicionFlag" ADD CONSTRAINT "SuspicionFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
