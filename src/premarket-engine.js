// premarket-engine.js — "AM Trading — Final Trading Logic Redesign" spec,
// Phase 4 (explicit user request, 2026-08-19): §4-6, a real Premarket
// Score/state so opportunities are visible before the 9:30 open, without
// requiring the 15-min ORB to complete first (§6's explicit rule).
//
// Pure, zero I/O — same convention as daytrade-console-engine.js. Unlike
// that engine's bullish-scale (0=bearish, 100=bullish) subscores, this
// score answers a different question — "how much real evidence is there
// that this is worth watching at the open?" — so it's magnitude/attention
// based, direction-agnostic. The real direction (up or down) is carried
// separately via the real signed gapPct, shown as-is in the UI.
"use strict";

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Weights sum to 100. Gap magnitude dominates (the single most concrete
// real fact); volume and catalyst confirm it; market/sector alignment are
// smaller supporting factors, matching spec §35's "most things should
// influence confidence, not gate" philosophy applied here too.
const WEIGHTS = { gap: 35, volume: 25, catalyst: 20, market: 10, sector: 10 };

function scoreGap(gapPct) {
  if (gapPct == null || !Number.isFinite(gapPct)) return null;
  return Math.round(clamp((Math.abs(gapPct) / 5) * 100, 0, 100)); // 5%+ real gap -> max
}
function scoreVolume(rvolApprox) {
  if (rvolApprox == null || !Number.isFinite(rvolApprox)) return null;
  return Math.round(clamp(rvolApprox * 40, 0, 100)); // 1x -> 40, 2.5x+ -> 100
}
function scoreCatalyst(hasNews) {
  if (hasNews == null) return null; // honest — news lookup wasn't run for this symbol
  return hasNews ? 100 : 40; // real news present = strong evidence; absence is real too, just weaker, not bearish
}
// Real alignment with the broader tape/sector — does this symbol's real
// gap direction agree with the real SPY/sector premarket direction?
// Neither confirms nor denies the move on its own (a real stock-specific
// mover can gap against the tape and still be valid), just a modest
// supporting factor, matching its small 10% weight.
function scoreAlignment(gapPct, benchmarkChg) {
  if (gapPct == null || benchmarkChg == null || !Number.isFinite(benchmarkChg) || gapPct === 0) return null;
  if (Math.abs(benchmarkChg) < 0.05) return 50; // benchmark itself flat — no real signal either way
  const aligned = (gapPct > 0) === (benchmarkChg > 0);
  return aligned ? 70 : 30;
}

// classify: EARLY (strong real evidence, worth watching at the open),
// WATCH (real but modest evidence), WEAK (little real evidence) — spec
// §4's three states. Never a command, purely descriptive (matches §10's
// "quality levels, not automatic commands" principle applied here too).
function classifyPremarketState(score) {
  if (score == null) return null;
  if (score >= 70) return "EARLY";
  if (score >= 40) return "WATCH";
  return "WEAK";
}

// gapPct: real signed %, preMarketPrice vs previous close (or open
//   fallback) — see premarket-store.js for the real fetch.
// rvolApprox: real regularMarketVolume/averageDailyVolume3Month proxy —
//   explicitly approximate, not true premarket-session volume (honest
//   limitation carried over from premarket-alerts.js).
// hasNews: real boolean — was there at least one real recent headline for
//   this symbol — or null if the lookup wasn't run for it.
// spyChg / sectorChg: real premarket-or-current SPY/sector % change.
function computePremarketScore({ gapPct, rvolApprox, hasNews, spyChg = null, sectorChg = null }) {
  const subs = {
    gap: scoreGap(gapPct),
    volume: scoreVolume(rvolApprox),
    catalyst: scoreCatalyst(hasNews),
    market: scoreAlignment(gapPct, spyChg),
    sector: scoreAlignment(gapPct, sectorChg),
  };
  let weighted = 0, weightAvailable = 0;
  for (const [key, w] of Object.entries(WEIGHTS)) {
    const v = subs[key];
    if (v != null) { weighted += v * w; weightAvailable += w; }
  }
  if (!weightAvailable) return { score: null, state: null, coverage: 0, subs };
  const score = Math.round(weighted / weightAvailable);
  const totalWeight = Object.values(WEIGHTS).reduce((s, w) => s + w, 0);
  return { score, state: classifyPremarketState(score), coverage: Math.round((weightAvailable / totalWeight) * 100), subs };
}

module.exports = { computePremarketScore, classifyPremarketState, scoreGap, scoreVolume, scoreCatalyst, scoreAlignment, WEIGHTS };
