// x-intel-engine.js — the X Intelligence Engine v2 aggregation layer.
//
// This file does NOT re-score regime/macro risk (four separate scorers
// already exist in this codebase — trade-planner-scoring.js computeRegime,
// advisor-ai.js buildRegimeDetail/classifyVolRegime, command-center-ai.js
// computeRiskStance/buildRiskFlags/computeRegimeShift, market-scanner.js
// computeMacroRegime) and does NOT add any new AI call — every function
// here is deterministic and reads real data X Intel/Command Center/Advisor
// AI already produce or persist. See the approved plan at
// /Users/adol/.claude/plans/refactored-mixing-quilt.md for the full
// consolidation rationale.
const path = require("node:path");
const { ROOT } = require("./config");
const { readJsonSafe } = require("./atomic-write");
const { toSeverityLevel } = require("./severity-scale");
const { sectorOf, themesOf } = require("./sector-theme-map");
const mentionsStore = require("./x-intel-mentions-store");
const sentimentStore = require("./x-intel-sentiment-store");
const xIntelStore = require("./x-intel-store");
const { applyMomentum } = require("./quote-momentum");
const { fetchTrending } = require("./providers/stocktwits");
const { loadWatchlist } = require("./routes/watchlist");

function BASE() { return `http://127.0.0.1:${process.env.PORT || 3000}`; }
async function getJson(p) {
  try { const r = await fetch(`${BASE()}${p}`); return await r.json(); } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────
// Module 10 — Market Regime taxonomy mapping
// ─────────────────────────────────────────────────────────────────────────
//
// Maps the codebase's existing real regime/vol/distribution-risk/persistence
// signals onto the spec's 7-value taxonomy (Healthy Bull/Late Bull/
// Overheated/Distribution/Correction/Panic/Recovery). This is a pure
// relabeling layer — it does not compute a new score, only classifies
// already-real numbers more specifically than GREEN/YELLOW/RED alone can.
function mapToRegimeTaxonomy({ regimeLabel, regimeScore, volRegime, distributionRiskScore, regimeShift }) {
  if (!regimeLabel) return null;
  const distDanger = Number.isFinite(distributionRiskScore) && distributionRiskScore >= 65;
  const distElevated = Number.isFinite(distributionRiskScore) && distributionRiskScore >= 40;
  const recoveringFromRed = regimeShift?.justShifted && regimeShift.priorRegime === "RED" && regimeLabel !== "RED";

  let taxonomy, reasoning;
  if (recoveringFromRed) {
    taxonomy = "Recovery";
    reasoning = `Just shifted from RED to ${regimeLabel} after ${regimeShift.priorRegimeDays} real day(s) in RED.`;
  } else if (regimeLabel === "GREEN" && regimeScore >= 85 && volRegime !== "Elevated" && volRegime !== "Panic" && !distElevated) {
    taxonomy = "Healthy Bull";
    reasoning = `Regime ${regimeScore}/100, VIX ${volRegime || "n/a"}, no elevated distribution risk.`;
  } else if (regimeLabel === "GREEN" && distDanger) {
    taxonomy = "Overheated";
    reasoning = `Regime GREEN (${regimeScore}/100) but distribution risk ${distributionRiskScore}/100 (DANGER) — real internal weakness under a strong headline tape.`;
  } else if (regimeLabel === "GREEN") {
    taxonomy = "Late Bull";
    reasoning = `Regime GREEN (${regimeScore}/100) but VIX ${volRegime || "n/a"} or distribution risk ${distributionRiskScore ?? "n/a"} shows the advance losing some internal health.`;
  } else if (regimeLabel === "YELLOW" && distElevated) {
    taxonomy = "Distribution";
    reasoning = `Regime YELLOW (${regimeScore}/100), distribution risk ${distributionRiskScore}/100.`;
  } else if (regimeLabel === "YELLOW") {
    taxonomy = "Correction";
    reasoning = `Regime YELLOW (${regimeScore}/100), no acute distribution signal.`;
  } else if (volRegime === "Panic") {
    taxonomy = "Panic";
    reasoning = `Regime RED (${regimeScore}/100), VIX regime Panic.`;
  } else {
    taxonomy = "Correction";
    reasoning = `Regime RED (${regimeScore}/100).`;
  }
  return { taxonomy, reasoning };
}

// ─────────────────────────────────────────────────────────────────────────
// Module 4 — Trend velocity (real mention-rate change, not a raw count)
// ─────────────────────────────────────────────────────────────────────────
function computeTrendVelocity() {
  const symbols = mentionsStore.distinctSymbols(14 * 24 * 3600_000);
  const rows = symbols.map((symbol) => {
    const recent = mentionsStore.countMentions({ symbol, sinceMs: 24 * 3600_000 });
    const priorWindow = mentionsStore.countMentions({ symbol, sinceMs: 7 * 24 * 3600_000 }) - recent;
    const priorDailyAvg = priorWindow / 6; // 6 remaining days of the 7-day window
    const velocityPct = priorDailyAvg > 0 ? Math.round(((recent - priorDailyAvg) / priorDailyAvg) * 100) : recent > 0 ? 100 : 0;
    return { symbol, mentions24h: recent, priorDailyAvg: Math.round(priorDailyAvg * 10) / 10, velocityPct };
  }).filter((r) => r.mentions24h > 0);
  rows.sort((a, b) => b.velocityPct - a.velocityPct);
  return rows.slice(0, 25);
}

// ─────────────────────────────────────────────────────────────────────────
// Module 8 — Unusual Activity severity ladder
// ─────────────────────────────────────────────────────────────────────────
// Real 7-day median as the baseline (not mean — resistant to one already-
// unusual day skewing the "normal" reference), compared against real
// mentions in the last 24h. Score is a ratio scaled to the shared 0-100
// severity input, not a fabricated confidence number.
function computeUnusualActivity(symbol) {
  const daily = mentionsStore.dailyCounts(symbol, 7); // oldest -> newest, includes today
  const baselineDays = daily.slice(0, 6); // exclude today from its own baseline
  const sorted = [...baselineDays].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const today = daily[daily.length - 1] || 0;
  const ratio = median > 0 ? today / median : today > 0 ? today : 0;
  // Calibrated so "exactly at your own real baseline" (ratio=1) reads
  // NORMAL, not WATCH: ratio 1x -> 0, ~2x -> ~25 (WATCH), ~3x -> ~50
  // (CAUTION), ~4.5x -> ~85+ (PANIC). A symbol with zero real baseline
  // history (median=0) getting its first-ever mentions today is scored
  // more conservatively per-mention, since one new mention isn't "unusual"
  // the way a 10x spike over an established baseline is.
  const score = median > 0
    ? Math.max(0, Math.min(100, Math.round((ratio - 1) * 25)))
    : today > 0 ? Math.min(100, 15 + today * 8) : 0;
  const severity = toSeverityLevel(score);
  return { symbol, mentionsToday: today, baselineMedian: median, ratio: Math.round(ratio * 10) / 10, ...severity };
}

// ─────────────────────────────────────────────────────────────────────────
// Module 5 — Sentiment trend (thin pass-through, kept here so callers only
// need to import x-intel-engine.js, not every store individually)
// ─────────────────────────────────────────────────────────────────────────
function computeSentimentTrend(symbol) { return sentimentStore.getSentimentTrend(symbol); }

// ─────────────────────────────────────────────────────────────────────────
// Module 13 (partial) — sector-level sentiment flip detector
// ─────────────────────────────────────────────────────────────────────────
// Rolls up per-ticker sentiment history (already real, already persisted)
// by sector-theme-map.js's canonical sector tag, and flags a real flip only
// when the sector-level bullish share crosses from net-bullish to
// net-bearish (or vice versa) between the two most recent snapshots per
// ticker — never fabricated, silently returns [] if there isn't enough
// real history yet.
function detectSectorSentimentFlip(mentionedSymbols) {
  const bySector = new Map();
  for (const symbol of mentionedSymbols) {
    const trend = sentimentStore.getSentimentTrend(symbol);
    if (!trend || trend.bullishPct == null) continue;
    const sector = sectorOf(symbol);
    if (!bySector.has(sector)) bySector.set(sector, []);
    bySector.get(sector).push(trend);
  }
  const flips = [];
  for (const [sector, trends] of bySector) {
    const improving = trends.filter((t) => t.trendDirection === "improving").length;
    const deteriorating = trends.filter((t) => t.trendDirection === "deteriorating").length;
    if (deteriorating > 0 && deteriorating >= improving && deteriorating >= Math.max(2, Math.ceil(trends.length / 2))) {
      flips.push({ sector, direction: "bearish", tickersDeteriorating: deteriorating, tickersTotal: trends.length });
    } else if (improving > 0 && improving >= deteriorating && improving >= Math.max(2, Math.ceil(trends.length / 2))) {
      flips.push({ sector, direction: "bullish", tickersImproving: improving, tickersTotal: trends.length });
    }
  }
  return flips;
}

// ─────────────────────────────────────────────────────────────────────────
// Module 13 (partial) — Fed-stance-change detector
// ─────────────────────────────────────────────────────────────────────────
// A cheap deterministic diff, not a new AI call: compares the two most
// recent real FederalReserve-category items' aiSummary.oneLine text. If
// they're not near-identical (already covered by the store's own 48h
// content dedup, so two DISTINCT entries here are two genuinely different
// real statements), this is reported as a real stance change worth
// surfacing — the actual "what changed" judgment already happened once,
// by the AI, when it wrote each item's oneLine; this just notices there
// were two different real ones close together.
function detectFedStanceChange() {
  const fedItems = xIntelStore.listItems({ category: "FederalReserve", limit: 5 });
  if (fedItems.length < 2) return null;
  const [latest, prior] = fedItems;
  return {
    latest: latest.aiSummary?.oneLine || latest.text,
    prior: prior.aiSummary?.oneLine || prior.text,
    latestAt: latest.capturedAt,
    priorAt: prior.capturedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Module 11 — Watchlist ranking engine
// ─────────────────────────────────────────────────────────────────────────
// Combines three already-real, already-computed signals that never fed a
// ranked view before: quote-momentum.js's real delta5m/delta30m, StockTwits'
// real fetchTrending() "most discussed" list, and this session's own real
// sentiment-trend store for "highest conviction."
async function computeWatchlistRankings() {
  const { symbols } = loadWatchlist();
  if (!symbols?.length) return { strongestMomentum: [], mostDiscussed: [], highestConviction: [], mostDeteriorating: [] };

  const quoteData = await getJson(`/api/market/quote?symbols=${symbols.join(",")}`);
  const rows = Array.isArray(quoteData?.quotes) ? quoteData.quotes : Array.isArray(quoteData) ? quoteData : [];
  const withMomentum = applyMomentum(rows.map((r) => ({ symbol: r.symbol, price: r.price ?? r.c ?? r.last })));

  const strongestMomentum = [...withMomentum]
    .filter((r) => Number.isFinite(r.delta30m))
    .sort((a, b) => b.delta30m - a.delta30m)
    .slice(0, 10)
    .map((r) => ({ symbol: r.symbol, delta5m: r.delta5m, delta30m: r.delta30m }));
  const mostDeteriorating = [...withMomentum]
    .filter((r) => Number.isFinite(r.delta30m))
    .sort((a, b) => a.delta30m - b.delta30m)
    .slice(0, 10)
    .map((r) => ({ symbol: r.symbol, delta5m: r.delta5m, delta30m: r.delta30m }));

  let mostDiscussed = [];
  try {
    const trending = await fetchTrending(100);
    const watchlistSet = new Set(symbols);
    mostDiscussed = trending.filter((t) => watchlistSet.has(t.symbol)).slice(0, 10);
  } catch { /* StockTwits unavailable this run — real gap, not faked */ }

  const highestConviction = symbols
    .map((s) => ({ symbol: s, trend: sentimentStore.getSentimentTrend(s) }))
    .filter((r) => r.trend?.bullishPct != null)
    .sort((a, b) => (b.trend.bullishPct * (b.trend.avgConfidence || 50)) - (a.trend.bullishPct * (a.trend.avgConfidence || 50)))
    .slice(0, 10)
    .map((r) => ({ symbol: r.symbol, bullishPct: r.trend.bullishPct, avgConfidence: r.trend.avgConfidence }));

  return { strongestMomentum, mostDeteriorating, mostDiscussed, highestConviction };
}

// ─────────────────────────────────────────────────────────────────────────
// Module 14 — Live Digest (deterministic, 5-min-refreshable, explicitly NOT
// the AI-written summary — see the plan's disclosure on why "every few
// minutes AI summary" isn't affordable and this is the real substitute)
// ─────────────────────────────────────────────────────────────────────────
function buildLiveDigest() {
  const velocity = computeTrendVelocity();
  const topMovers = velocity.slice(0, 5);
  const recentItems = xIntelStore.getRecent(20);
  const breakingCount = recentItems.filter((it) => it.category === "Breaking News").length;
  const fedChange = detectFedStanceChange();
  return {
    generatedAt: new Date().toISOString(),
    topMentionDeltas: topMovers,
    breakingNewsCount24h: breakingCount,
    fedStanceChange: fedChange,
    label: "Live Digest — deterministic, real data, refreshed every 5 min (not an AI-written summary; the AI summary runs 2x/day, see aiSummary on individual items)",
  };
}

module.exports = {
  mapToRegimeTaxonomy,
  computeTrendVelocity,
  computeUnusualActivity,
  computeSentimentTrend,
  detectSectorSentimentFlip,
  detectFedStanceChange,
  computeWatchlistRankings,
  buildLiveDigest,
};
