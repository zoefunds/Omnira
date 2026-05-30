-- CreateEnum
CREATE TYPE "PuzzleAttemptResult" AS ENUM ('CORRECT', 'WRONG', 'SKIPPED');

-- CreateTable
CREATE TABLE "Puzzle" (
    "id" UUID NOT NULL,
    "fen" TEXT NOT NULL,
    "sideToMove" VARCHAR(1) NOT NULL,
    "solutionUci" TEXT NOT NULL,
    "solutionSan" TEXT NOT NULL,
    "evalCp" INTEGER,
    "evalMate" INTEGER,
    "playedUci" TEXT,
    "playedSan" TEXT,
    "cpLoss" INTEGER,
    "themes" TEXT[],
    "rating" INTEGER NOT NULL DEFAULT 1500,
    "ratingDev" INTEGER NOT NULL DEFAULT 350,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "solved" INTEGER NOT NULL DEFAULT 0,
    "sourceMatchId" UUID,
    "sourcePly" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Puzzle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PuzzleAttempt" (
    "id" UUID NOT NULL,
    "puzzleId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "result" "PuzzleAttemptResult" NOT NULL,
    "submittedUci" TEXT,
    "userRatingAfter" INTEGER NOT NULL,
    "puzzleRatingAfter" INTEGER NOT NULL,
    "thinkMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PuzzleAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PuzzleRating" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 1500,
    "ratingDev" INTEGER NOT NULL DEFAULT 350,
    "solved" INTEGER NOT NULL DEFAULT 0,
    "attempted" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PuzzleRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Puzzle_rating_idx" ON "Puzzle"("rating");

-- CreateIndex
CREATE INDEX "Puzzle_publishedAt_idx" ON "Puzzle"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Puzzle_sourceMatchId_sourcePly_key" ON "Puzzle"("sourceMatchId", "sourcePly");

-- CreateIndex
CREATE INDEX "PuzzleAttempt_userId_createdAt_idx" ON "PuzzleAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PuzzleAttempt_puzzleId_createdAt_idx" ON "PuzzleAttempt"("puzzleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PuzzleRating_userId_key" ON "PuzzleRating"("userId");

-- AddForeignKey
ALTER TABLE "Puzzle" ADD CONSTRAINT "Puzzle_sourceMatchId_fkey" FOREIGN KEY ("sourceMatchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuzzleAttempt" ADD CONSTRAINT "PuzzleAttempt_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "Puzzle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuzzleAttempt" ADD CONSTRAINT "PuzzleAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuzzleRating" ADD CONSTRAINT "PuzzleRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
