-- CreateEnum
CREATE TYPE "ChallengeColor" AS ENUM ('WHITE', 'BLACK', 'RANDOM');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('OPEN', 'ACCEPTED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Challenge" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "creatorId" UUID NOT NULL,
    "category" "TimeControlCategory" NOT NULL,
    "initialMs" INTEGER NOT NULL,
    "incrementMs" INTEGER NOT NULL,
    "colorPreference" "ChallengeColor" NOT NULL DEFAULT 'RANDOM',
    "rated" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "minRating" INTEGER,
    "maxRating" INTEGER,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'OPEN',
    "acceptedById" UUID,
    "matchId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Challenge_code_key" ON "Challenge"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Challenge_matchId_key" ON "Challenge"("matchId");

-- CreateIndex
CREATE INDEX "Challenge_status_isPublic_createdAt_idx" ON "Challenge"("status", "isPublic", "createdAt");

-- CreateIndex
CREATE INDEX "Challenge_creatorId_idx" ON "Challenge"("creatorId");

-- CreateIndex
CREATE INDEX "ChatMessage_matchId_createdAt_idx" ON "ChatMessage"("matchId", "createdAt");

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
