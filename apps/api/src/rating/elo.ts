export type Score = 1 | 0 | 0.5; // win / loss / draw

export interface EloInput {
  rating: number;
  gamesPlayed: number;
}

function kFactor(input: EloInput): number {
  if (input.gamesPlayed < 30) return 40; // provisional
  if (input.rating >= 2400) return 16;
  return 32;
}

function expected(self: number, opp: number): number {
  return 1 / (1 + Math.pow(10, (opp - self) / 400));
}

export interface EloUpdate {
  whiteAfter: number;
  blackAfter: number;
  whiteDelta: number;
  blackDelta: number;
}

export function applyElo(
  white: EloInput,
  black: EloInput,
  result: 'WHITE_WON' | 'BLACK_WON' | 'DRAW',
): EloUpdate {
  const whiteScore: Score = result === 'WHITE_WON' ? 1 : result === 'DRAW' ? 0.5 : 0;
  const blackScore: Score = (1 - whiteScore) as Score;

  const eW = expected(white.rating, black.rating);
  const eB = expected(black.rating, white.rating);

  const dW = Math.round(kFactor(white) * (whiteScore - eW));
  const dB = Math.round(kFactor(black) * (blackScore - eB));

  return {
    whiteAfter: white.rating + dW,
    blackAfter: black.rating + dB,
    whiteDelta: dW,
    blackDelta: dB,
  };
}
