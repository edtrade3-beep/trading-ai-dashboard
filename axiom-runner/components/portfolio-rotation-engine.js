// portfolio-rotation-engine.js — Portfolio Rotation, Green Light AI gap
// item (confirmed genuinely 0%-built anywhere in this codebase per the
// gap-audit: existing "rotation" always meant sector rotation, never
// "replace a weaker open position with a stronger new opportunity").
// Pure functions only — AutoPilotEngine.jsx supplies real re-scored
// positions/candidates and performs the actual close/open calls.
//
// Honest scope, documented rather than silently narrowed: only ever
// evaluated among currently-open positions this app has REAL current
// quote/trend data for (i.e., the held symbol is still in the live
// watchlist scan AutoPilotEngine already has loaded) — a held symbol
// that's dropped out of the watchlist is never rotated on stale or
// guessed data, it's simply left to exit via its own real stop/target/
// trend-reversal path instead.
const MIN_QUALITY_IMPROVEMENT = 15; // documented threshold, not backtested/tuned

// `scoredOpenPositions` — array of { symbol, quality } for positions with
// a real current quality score. Returns the single weakest, or null.
export function findWeakestPosition(scoredOpenPositions) {
  if (!Array.isArray(scoredOpenPositions) || scoredOpenPositions.length === 0) return null;
  return scoredOpenPositions.reduce((weakest, p) =>
    Number(p.quality) < Number(weakest.quality) ? p : weakest
  );
}

// `candidate` — { symbol, quality } for the best unplaced new opportunity.
// Returns { close, open, improvement } when rotation is real and
// warranted (candidate clears the weakest open position's real quality
// by at least minImprovement), else null — never rotates on a marginal
// or unclear improvement.
export function evaluateRotation(scoredOpenPositions, candidate, { minImprovement = MIN_QUALITY_IMPROVEMENT } = {}) {
  if (!candidate || !Number.isFinite(Number(candidate.quality))) return null;
  const weakest = findWeakestPosition(scoredOpenPositions);
  if (!weakest || !Number.isFinite(Number(weakest.quality))) return null;
  const improvement = Number(candidate.quality) - Number(weakest.quality);
  if (improvement < minImprovement) return null;
  return { close: weakest, open: candidate, improvement };
}

export { MIN_QUALITY_IMPROVEMENT };
