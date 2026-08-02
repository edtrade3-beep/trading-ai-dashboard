// options-intel.js — client-side (ESM) mirror of src/options-math.js's
// Phase 5 additions (expectedValue/gammaSqueezeProbability/ivCrushRisk/
// assignmentRisk/dteFromExpiry). Options platform redesign Phase 5.
//
// Why a mirror instead of importing the server module: src/options-math.js
// is CommonJS and lives under src/ (Node-only, uses `require`), while this
// runs in the browser bundle (esbuild, ESM). The alternative — a new
// server route computing these for AiTradeCard specifically — would mean
// 4+ extra real fetches (gamma/short-interest/IV-rank/earnings) added to
// every options-chain page load just to serve one card; instead
// AiTradeCard already has these real inputs as props (symGamma,
// symShortInterest, symTrend.earningsDte, a fresh IV-rank fetch) and just
// needs the same real arithmetic applied client-side. Keep this file's
// formulas byte-for-byte identical to src/options-math.js's — if one
// changes, change both.
export function dteFromExpiry(expiry) {
  const exp = new Date(`${expiry}T00:00:00Z`);
  if (Number.isNaN(exp.getTime())) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((exp.getTime() - todayUtc) / 86_400_000));
}

export function expectedValue({ pop, avgWinPct, avgLossPct } = {}) {
  const p = Number(pop), w = Number(avgWinPct), l = Number(avgLossPct);
  if (!Number.isFinite(p) || !Number.isFinite(w) || !Number.isFinite(l)) return null;
  const prob = Math.max(0, Math.min(100, p)) / 100;
  return Math.round((prob * w - (1 - prob) * Math.abs(l)) * 100) / 100;
}

export function gammaSqueezeProbability({ gammaExposure, shortFloatPct, rvol } = {}) {
  if (!gammaExposure?.available) return null;
  let score = 0;
  if (Number(gammaExposure.netGEX) < 0) score += 40;
  if (Number.isFinite(Number(shortFloatPct))) score += Math.max(0, Math.min(30, (Number(shortFloatPct) / 20) * 30));
  if (Number.isFinite(Number(rvol))) score += Math.max(0, Math.min(30, ((Number(rvol) - 1) / 2) * 30));
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function ivCrushRisk({ daysToEarnings, ivRank } = {}) {
  // daysToEarnings != null guards against Number(null/undefined) silently
  // coercing to 0 — a real "no earnings date known" position must never
  // be scored as if earnings were happening today.
  const d = daysToEarnings != null ? Number(daysToEarnings) : NaN;
  if (!Number.isFinite(d) || d < 0 || d > 10) return null;
  const proximityScore = ((10 - d) / 10) * 60;
  const ivScore = Number.isFinite(Number(ivRank)) ? (Number(ivRank) / 100) * 40 : 20;
  return Math.round(proximityScore + ivScore);
}

export function assignmentRisk({ delta, dte } = {}) {
  const d = Number(delta);
  if (!Number.isFinite(d)) return null;
  const itmScore = Math.min(100, Math.abs(d) * 100);
  const dteFactor = Number.isFinite(Number(dte)) ? Math.max(0, Math.min(1, (10 - Number(dte)) / 10)) : 0.3;
  return Math.round(itmScore * (0.6 + 0.4 * dteFactor));
}
