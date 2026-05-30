/**
 * Glicko-lite single-game update. Loosely follows Glicko-1 with simplified
 * constants. Both ratings + rating-deviations (RD) move toward equilibrium.
 *
 * @param r0  current rating
 * @param rd0 current rating-deviation
 * @param ropp opponent rating
 * @param rdopp opponent rating-deviation
 * @param score 1 = won, 0 = lost, 0.5 = drew (puzzles only use 1 or 0)
 */
export function glickoUpdate(
  r0: number, rd0: number,
  ropp: number, rdopp: number,
  score: 1 | 0 | 0.5,
): { rating: number; ratingDev: number } {
  const q = Math.log(10) / 400;
  const g = (rd: number) => 1 / Math.sqrt(1 + (3 * q * q * rd * rd) / (Math.PI * Math.PI));
  const E = 1 / (1 + Math.pow(10, (-g(rdopp) * (r0 - ropp)) / 400));
  const d2 = 1 / (q * q * g(rdopp) * g(rdopp) * E * (1 - E));
  const newRd = Math.sqrt(1 / (1 / (rd0 * rd0) + 1 / d2));
  const newR = r0 + (q / (1 / (rd0 * rd0) + 1 / d2)) * g(rdopp) * (score - E);
  return {
    rating: Math.round(newR),
    ratingDev: Math.max(30, Math.round(newRd)),
  };
}
