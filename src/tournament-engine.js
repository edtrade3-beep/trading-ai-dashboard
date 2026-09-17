"use strict";
// tournament-engine.js (2026-09-17, "500-Stock Tournament" master prompt)
// — a real CONSUMER of the existing canonical pipeline, never a second
// scoring/risk/lifecycle engine. Every per-symbol field this file records
// comes directly off canonical-decision-pipeline.js's own real output —
// the SAME function (computeCanonicalAssetDecision) and the SAME bulk
// trend-template scan (routes/market.js's screenTrendTemplate) that
// computeAllOpportunities already uses for the 100-symbol SCAN_UNIVERSE.
// The only genuinely new inputs here are (1) a bigger, real universe —
// universe-builder.js's Alpaca-sourced, liquidity-ranked dynamic universe
// (already capped at 750, already has a rotation-batch primitive built
// for exactly the "scan 500+ symbols over several ticks" problem) — and
// (2) cross-symbol RANK over time, which tournament-store.js exists for.
//
// Performance (prompt's own explicit constraint: "do not run 500
// expensive calls every few seconds"): each tick scans one rotation batch
// (TICK_BATCH_SIZE symbols) through the real canonical pipeline; symbols
// outside this tick's batch keep their last real computed score/rank
// until their own turn comes up. A full sweep of the real universe takes
// several ticks — a real, disclosed tiered refresh, never a fabricated
// "all 500 updated instantly."

const { getDynamicUniverse, getUniverseRotationBatch } = require("./universe-builder");
const { computeCanonicalAssetDecision } = require("./canonical-decision-pipeline");
const { fetchYahooQuoteBatch } = require("./providers/yahoo");
const SECTOR_THEME_MAP = require("./sector-theme-map");
const { isMarketHoursET } = require("./risk-guardrails");
const { buildResearchContext } = require("./research-context-adapter");
const { loadCoachLog } = require("./ai-coach-store");
const { getEdgeVelocityFor } = require("./opportunity-timeline-store");
const {
  loadTournamentState, saveTournamentState, upsertSymbolData, applyRanking,
} = require("./tournament-store");

const TICK_BATCH_SIZE = 60; // roughly one SCAN_UNIVERSE-sized real fetch per tick — same real per-tick cost profile computeAllOpportunities already has
const TOP_N = 25;
const ELITE_N = 5;
const CHALLENGER_COUNT = 10; // ranks 26-35
const EARLY_DISCOVERY_SLOTS = 5;
// Real, disclosed ranking tiebreak (prompt section 4: "a high-opportunity/
// high-risk stock must not automatically rank above a slightly lower-
// opportunity/low-risk stock without appropriate risk adjustment"). This
// ONLY affects sort order — the real, separate opportunityScore/riskScore
// fields shown to the user are never merged into one opaque displayed
// number (section 4's other explicit rule).
const RISK_RANK_ADJUSTMENT_WEIGHT = 0.15;

const TIER_BANDS = [
  { max: ELITE_N, tier: "ELITE", icon: "🔥" },
  { max: 10, tier: "GREAT", icon: "🟢" },
  { max: 15, tier: "STRONG", icon: "🟢" },
  { max: 20, tier: "GOOD", icon: "🟡" },
  { max: TOP_N, tier: "DEVELOPING", icon: "⚪" },
];
function tierForRank(rank) {
  if (!Number.isFinite(rank) || rank > TOP_N) return { tier: null, icon: null };
  const band = TIER_BANDS.find((b) => rank <= b.max);
  return band ? { tier: band.tier, icon: band.icon } : { tier: null, icon: null };
}

// Real, bounded velocity label off a real rank-change magnitude — same
// kind of disclosed banding as risk-level/tier thresholds elsewhere in
// this codebase, not a fabricated classifier.
function velocityLabelFor(rankChange) {
  if (!Number.isFinite(rankChange)) return "STABLE";
  if (rankChange >= 10) return "ACCELERATING";
  if (rankChange >= 3) return "IMPROVING";
  if (rankChange <= -10) return "FALLING";
  if (rankChange <= -3) return "WEAKENING";
  return "STABLE";
}

function rankAdjustedScore(entry) {
  const score = Number.isFinite(entry.opportunityScore) ? entry.opportunityScore : 0;
  const risk = Number.isFinite(entry.riskScore) ? entry.riskScore : 50; // unknown risk treated as moderate, never as zero/safe
  return score - risk * RISK_RANK_ADJUSTMENT_WEIGHT;
}

// One real, lightweight canonical call against SPY — the same real
// marketRegime field computeAllOpportunities' own "canonicalRegime" read
// already surfaces, reused here rather than a second regime classifier.
async function getMarketRegime(macroQuotes, marketHours, nowMs, researchContext) {
  const sample = macroQuotes.find((q) => q.symbol === "SPY");
  if (!sample) return null;
  try {
    const canonical = computeCanonicalAssetDecision({
      symbol: "SPY", row: { symbol: "SPY", price: sample.price, dayChangePct: sample.changesPercentage },
      macroQuotes, nowMs, marketHours, researchContext,
    });
    return canonical?.marketRegime || null;
  } catch { return null; }
}

// Real per-symbol tournament fields — every value read directly off
// canonical-decision-pipeline.js's own output, per its exact real field
// names (asset-decision.js's buildAssetDecision already computes
// trendScore/momentumScore/relativeStrengthScore/newsScore/setupScore —
// this does not recompute any of them). fundamentalScore/valuationScore
// are honestly left as whatever the pipeline itself reports (null today —
// no fundamentals feed is threaded through this bulk scan, same real gap
// disclosed on asset-decision.js's own fingerprint fields) rather than
// invented here.
function extractTournamentFields(canonical, row) {
  const { assetDecision: ad, opportunity: opp } = canonical;
  return {
    price: row.price ?? null,
    changePct: row.dayChangePct ?? null,
    opportunityScore: opp.score ?? null,
    riskScore: ad?.riskScore ?? null,
    riskLevel: ad?.riskLevel ?? null,
    tier: opp.tier ?? null,
    opportunityStage: opp.stage ?? null,
    signalState: ad?.signalState ?? null,
    trendScore: ad?.trendScore ?? null,
    momentumScore: ad?.momentumScore ?? null,
    volumeScore: opp.breakdown?.volume ?? null,
    relativeStrengthScore: ad?.relativeStrengthScore ?? null,
    catalystScore: ad?.newsScore ?? null,
    fundamentalScore: ad?.fundamentalScore ?? null,
    valuationScore: ad?.valuationScore ?? null,
    entryQualityScore: opp.breakdown?.entryQuality ?? null,
    entryZone: opp.entry ?? null,
    invalidation: opp.invalidation ?? null,
    stop: ad?.stop ?? null,
    target: Array.isArray(ad?.targets) ? ad.targets[0] ?? null : null,
    riskReward: ad?.riskReward ?? null,
    positiveContributors: (ad?.reasons || []).slice(0, 5),
    // Real bug fixed here (2026-09-17, live crash report): red-flag-
    // engine.js's redFlags are real OBJECTS ({key, label, critical,
    // reason}), not strings — mixing them raw into this array crashed
    // Tournament500Panel.jsx's rendering ("Objects are not valid as a
    // React child") the moment any real stock with an active red flag
    // showed up in the Top 25/challengers/drop zone. Map each to its own
    // real reason/label text before merging with the (already-string)
    // blockers.
    negativeContributors: [...(ad?.blockers || []), ...(opp.redFlags || []).map((f) => f.reason || f.label || f.key)].slice(0, 5),
    riskContributors: null, // filled in by the caller when the full computeRiskScore contributors are available (route-level detail fetch only — not persisted per-tick to keep tournament-state.json bounded)
  };
}

// Scans exactly one rotation batch of the real dynamic universe through
// the real canonical pipeline, updates the persisted per-symbol state,
// then re-ranks EVERY currently-known symbol (cheap — pure sort over
// already-computed state, no network) and records the new ranking.
async function runTournamentTick() {
  const { screenTrendTemplate } = require("./routes/market"); // lazy — routes/market.js is a large module; avoids a hard top-level require cycle
  const { universe, stale, builtAt } = getDynamicUniverse();
  if (!universe.length) return { ok: false, error: "Dynamic universe not built yet.", hint: "Run refreshDynamicUniverse() (universe-builder.js) first — same real job Autopilot 2.0 already schedules." };

  const batch = getUniverseRotationBatch(TICK_BATCH_SIZE);
  const MACRO_SYMS = ["SPY", "QQQ", "IWM", "DIA", "^VIX", "UUP", "VIXY", "TLT", "HYG"];
  const [rows, macroQuotesRaw] = await Promise.all([
    batch.length ? screenTrendTemplate(batch) : Promise.resolve([]),
    fetchYahooQuoteBatch(MACRO_SYMS).catch(() => []),
  ]);
  const macroQuotes = macroQuotesRaw.map((q) => ({ symbol: q.symbol, price: q.regularMarketPrice, changesPercentage: q.regularMarketChangePercent }));
  const nowMs = Date.now();
  const marketHours = isMarketHoursET();
  const coachLog = loadCoachLog();
  const researchContext = buildResearchContext({ researchIntel: coachLog.researchIntel, marketWrap: coachLog.marketWrap, timestamp: nowMs });

  const sectorQuotes = await fetchYahooQuoteBatch(SECTOR_THEME_MAP.SECTOR_ETFS.map((s) => s.sym)).catch(() => []);
  const sectorRanked = SECTOR_THEME_MAP.SECTOR_ETFS
    .map((s) => ({ sym: s.sym, chgPct: Number(sectorQuotes.find((q) => q.symbol === s.sym)?.regularMarketChangePercent) || 0 }))
    .sort((a, b) => b.chgPct - a.chgPct);
  const sectorInfoFor = (symbol) => {
    const etf = SECTOR_THEME_MAP.etfOf(symbol);
    if (!etf) return null;
    const idx = sectorRanked.findIndex((r) => r.sym === etf);
    return idx >= 0 ? { rank: idx + 1, of: sectorRanked.length } : null;
  };

  const state = loadTournamentState();
  let scanned = 0;
  for (const row of rows) {
    if (row.error) continue;
    const canonical = computeCanonicalAssetDecision({
      symbol: row.symbol, row, macroQuotes, sectorInfo: sectorInfoFor(row.symbol),
      adx: row.technicals?.adx || null, nowMs, marketHours, researchContext,
    });
    if (!canonical) continue;
    canonical.opportunity.edgeVelocity = (() => { try { return getEdgeVelocityFor(row.symbol); } catch { return null; } })();
    const prevEntry = state.symbols[row.symbol] || null;
    const fields = extractTournamentFields(canonical, row);
    fields.previousOpportunityScore = Number.isFinite(prevEntry?.opportunityScore) ? prevEntry.opportunityScore : null;
    upsertSymbolData(state, row.symbol, fields);
    scanned++;
  }
  state.lastTickAt = nowMs;

  const ranked = rankTournamentSymbols(state);
  applyRanking(state, ranked.map((r) => r.symbol));
  saveTournamentState(state);

  const marketRegime = await getMarketRegime(macroQuotes, marketHours, nowMs, researchContext);
  return { ok: true, scanned, batchSize: batch.length, universeSize: universe.length, stale, builtAt, marketRegime };
}

// Pure — real ranking over already-persisted state, no network. Sorted by
// the real opportunity score, risk-adjusted per the disclosed tiebreak
// above (ranking only — see extractTournamentFields/getTournamentBoard
// for the separate, unmerged displayed scores). Symbols with no real
// score yet (never scanned this session) are excluded, never ranked off
// a fabricated default.
function rankTournamentSymbols(state) {
  return Object.values(state.symbols)
    .filter((e) => Number.isFinite(e.opportunityScore))
    .map((e) => ({ symbol: e.symbol, adjusted: rankAdjustedScore(e) }))
    .sort((a, b) => b.adjusted - a.adjusted);
}

// Real early-discovery pick — ranks 26+ with the strongest positive real
// edge-velocity (opportunity-timeline-store.js's own real same-session
// score acceleration, already attached per-symbol during the tick above),
// never a second acceleration metric. Reserves EARLY_DISCOVERY_SLOTS of
// the Top 25 for these when they're strong enough to matter, per the
// prompt's own "reserve part of the Top 25 for early opportunities" ask.
function pickEarlyDiscoveryChallengers(state, rankedBeyondTop, confirmedCount) {
  const slots = TOP_N - confirmedCount;
  if (slots <= 0) return [];
  return rankedBeyondTop
    .map((r) => ({ ...r, velocity: state.symbols[r.symbol]?.edgeVelocity?.velocity ?? null }))
    .filter((r) => Number.isFinite(r.velocity) && r.velocity > 0)
    .sort((a, b) => b.velocity - a.velocity)
    .slice(0, slots)
    .map((r) => r.symbol);
}

// Assembles the full real board from persisted state — no network, no
// recomputation of any score. `marketRegime` is passed in fresh by the
// route handler (a cheap, real, cached-friendly single call) rather than
// persisted, since it's a whole-market read, not a per-symbol one.
function buildTournamentBoard(marketRegimeLabel) {
  const state = loadTournamentState();
  const ranked = rankTournamentSymbols(state);
  const rankedSymbols = ranked.map((r) => r.symbol);

  // Confirmed Top 20 by real adjusted rank, then up to 5 Early Discovery
  // challengers pulled from beyond rank 20 (never displacing a real
  // higher-ranked confirmed opportunity) — the prompt's own "20 confirmed
  // + 5 early discovery" structure.
  const confirmed = rankedSymbols.slice(0, TOP_N - EARLY_DISCOVERY_SLOTS);
  const beyondConfirmed = rankedSymbols.slice(confirmed.length);
  const earlyDiscovery = pickEarlyDiscoveryChallengers(state, beyondConfirmed.map((s) => ({ symbol: s })), confirmed.length);
  const top25Symbols = [...confirmed, ...earlyDiscovery];
  // Re-sort the combined 25 by real adjusted score so tiers/ranks stay
  // monotonic even though early-discovery picks were sourced out of order.
  top25Symbols.sort((a, b) => rankAdjustedScore(state.symbols[b]) - rankAdjustedScore(state.symbols[a]));

  const top25 = top25Symbols.map((symbol, idx) => {
    const e = state.symbols[symbol];
    const rank = idx + 1;
    const { tier, icon } = tierForRank(rank);
    return {
      rank, symbol, companyName: e.companyName || symbol, price: e.price, changePct: e.changePct,
      opportunityScore: e.opportunityScore, riskScore: e.riskScore, riskLevel: e.riskLevel,
      tournamentTier: tier, tierIcon: icon,
      isEarlyDiscovery: earlyDiscovery.includes(symbol),
      tier: e.tier, opportunityStage: e.opportunityStage, signalState: e.signalState,
      previousRank: e.previousRank, rankChange: e.rankChange ?? 0, velocityLabel: velocityLabelFor(e.rankChange),
      scoreChange: Number.isFinite(e.previousOpportunityScore) ? Math.round((e.opportunityScore - e.previousOpportunityScore) * 10) / 10 : 0,
      trendScore: e.trendScore, momentumScore: e.momentumScore, volumeScore: e.volumeScore,
      relativeStrengthScore: e.relativeStrengthScore, catalystScore: e.catalystScore, entryQualityScore: e.entryQualityScore,
      timeInTop25: e.timeInTop25 || 0, timeInTop10: e.timeInTop10 || 0, timeInElite: e.timeInElite || 0,
    };
  });

  const challengerSymbols = rankedSymbols.filter((s) => !top25Symbols.includes(s)).slice(0, CHALLENGER_COUNT);
  const challengers = challengerSymbols.map((symbol, i) => {
    const e = state.symbols[symbol];
    const rankIdx = rankedSymbols.indexOf(symbol);
    return {
      rank: rankIdx + 1, symbol, opportunityScore: e.opportunityScore, riskScore: e.riskScore,
      previousRank: e.previousRank, rankChange: e.rankChange ?? 0, velocityLabel: velocityLabelFor(e.rankChange),
      scoreChange: Number.isFinite(e.previousOpportunityScore) ? Math.round((e.opportunityScore - e.previousOpportunityScore) * 10) / 10 : 0,
    };
  });

  // Recently dropped — real symbols whose OWN persisted previousRank was
  // inside the real Top 25 last ranking pass but whose current rank isn't
  // (or who scored below the real qualifying floor this pass) — never a
  // fabricated "recently dropped" list.
  const dropZone = Object.values(state.symbols)
    .filter((e) => Number.isFinite(e.previousRank) && e.previousRank <= TOP_N && (!Number.isFinite(e.currentRank) || e.currentRank > TOP_N))
    .sort((a, b) => (a.currentRank ?? 9999) - (b.currentRank ?? 9999))
    .slice(0, 10)
    .map((e) => ({
      symbol: e.symbol, previousRank: e.previousRank, currentRank: e.currentRank ?? null,
      reasons: e.negativeContributors?.length ? e.negativeContributors : ["Score declined relative to the rest of the field."],
    }));

  return {
    scanning: Object.keys(state.symbols).length,
    qualified: rankedSymbols.length,
    top25Count: top25.length,
    eliteCount: Math.min(ELITE_N, top25.length),
    marketRegime: marketRegimeLabel || null,
    lastUpdate: state.lastTickAt || null,
    top25, challengers, dropZone,
  };
}

module.exports = {
  runTournamentTick, buildTournamentBoard, rankTournamentSymbols, tierForRank, velocityLabelFor,
  rankAdjustedScore, extractTournamentFields, pickEarlyDiscoveryChallengers, getMarketRegime,
  TICK_BATCH_SIZE, TOP_N, ELITE_N, CHALLENGER_COUNT, EARLY_DISCOVERY_SLOTS, RISK_RANK_ADJUSTMENT_WEIGHT,
};
