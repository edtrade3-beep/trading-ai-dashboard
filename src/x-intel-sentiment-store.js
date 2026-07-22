// x-intel-sentiment-store.js — per-ticker rolling sentiment history.
// Fulfills Module 5 (Sentiment Engine)'s "historical comparison / trend
// direction" ask, which nothing in X Intel persisted before — per-item
// sentiment/confidence was already real (see x-intel-ai.js's AI-search
// output), it just evaporated on reload instead of rolling up per ticker
// over time.
//
// Written once per existing 2x/day AI-search run (zero new AI cost — this
// only persists output that call already produces). Same atomic-write
// pattern as x-intel-store.js/x-intel-mentions-store.js.
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "x-intel-sentiment.json");
const RETENTION_MS = 90 * 24 * 3600_000; // ~90 days per the plan's retention target

function load() {
  const data = readJsonSafe(STORE_PATH, { snapshots: [] });
  return Array.isArray(data.snapshots) ? data.snapshots : [];
}

function save(snapshots) {
  writeJsonAtomic(STORE_PATH, { snapshots });
}

// One real snapshot per symbol per AI-search run — tallied from that run's
// real marketImpact[] entries (direction + confidence), never a guessed
// number. `bullish`/`bearish`/`neutral` are real counts of items in this
// run that named the symbol with that direction; `avgConfidence` is the
// real mean of those items' confidence values.
function logSentimentSnapshot({ symbol, bullish = 0, bearish = 0, neutral = 0, avgConfidence = null }) {
  const snapshots = load();
  const cutoff = Date.now() - RETENTION_MS;
  const pruned = snapshots.filter((s) => new Date(s.at).getTime() >= cutoff);
  pruned.push({ symbol, bullish, bearish, neutral, avgConfidence, at: new Date().toISOString() });
  save(pruned);
}

// Real trend for a symbol: current %-bullish/bearish/neutral (most recent
// snapshot), plus a real "was it more/less bullish N snapshots ago"
// direction — computed from actually-persisted history, never estimated
// when history is thin (returns trendDirection: null rather than guessing
// if fewer than 2 snapshots exist).
function getSentimentTrend(symbol, lookback = 90) {
  const cutoff = Date.now() - lookback * 24 * 3600_000;
  const history = load().filter((s) => s.symbol === symbol && new Date(s.at).getTime() >= cutoff)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  if (!history.length) return null;

  const latest = history[history.length - 1];
  const total = latest.bullish + latest.bearish + latest.neutral;
  const bullishPct = total > 0 ? Math.round((latest.bullish / total) * 100) : null;
  const bearishPct = total > 0 ? Math.round((latest.bearish / total) * 100) : null;
  const neutralPct = total > 0 ? Math.round((latest.neutral / total) * 100) : null;

  let trendDirection = null;
  if (history.length >= 2) {
    const prior = history[history.length - 2];
    const priorTotal = prior.bullish + prior.bearish + prior.neutral;
    const priorBullishPct = priorTotal > 0 ? (prior.bullish / priorTotal) * 100 : null;
    if (bullishPct != null && priorBullishPct != null) {
      const delta = bullishPct - priorBullishPct;
      trendDirection = delta >= 5 ? "improving" : delta <= -5 ? "deteriorating" : "stable";
    }
  }

  return {
    symbol, bullishPct, bearishPct, neutralPct,
    avgConfidence: latest.avgConfidence,
    trendDirection,
    historyDepth: history.length,
    asOf: latest.at,
  };
}

module.exports = { logSentimentSnapshot, getSentimentTrend };
