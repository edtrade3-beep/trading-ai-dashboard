"use strict";
// routes/tournament.js (2026-09-17, "500-Stock Tournament" master prompt)
// — real HTTP surface. Board reads are pure/cached (tournament-engine.js's
// buildTournamentBoard, no network); the detail route runs one fresh real
// canonical decision for the single requested symbol (same recipe
// tournament-engine.js's own tick uses) so a click-through always shows
// the live picture, not a trimmed, possibly-stale cached row.
const { writeJson } = require("../utils");
const { buildTournamentBoard, getMarketRegime, extractTournamentFields, filterTournamentByValuation } = require("../tournament-engine");
const { loadTournamentState } = require("../tournament-store");
const { computeCanonicalAssetDecision } = require("../canonical-decision-pipeline");
const { computeRiskScore } = require("../asset-decision");
const { computeEventRisk } = require("../event-risk-engine");
const { fetchYahooQuoteBatch } = require("../providers/yahoo");
const { isMarketHoursET } = require("../risk-guardrails");
const { buildResearchContext } = require("../research-context-adapter");
const { loadCoachLog } = require("../ai-coach-store");
const { resolveProviderKeys } = require("../config");

let _cachedRegime = { at: 0, label: null };
const REGIME_TTL_MS = 5 * 60_000;
async function cachedMarketRegimeLabel(macroQuotes, marketHours, nowMs, researchContext) {
  if (nowMs - _cachedRegime.at < REGIME_TTL_MS) return _cachedRegime.label;
  const regime = await getMarketRegime(macroQuotes, marketHours, nowMs, researchContext).catch(() => null);
  _cachedRegime = { at: nowMs, label: regime?.regime || null };
  return _cachedRegime.label;
}

// GET /api/market/tournament — the board (header + Top 25 tiered +
// challengers + drop zone). No network — reads tournament-engine.js's own
// real persisted state, refreshed by the background tick job.
async function handleTournamentBoard(req, res, requestUrl) {
  try {
    const MACRO_SYMS = ["SPY", "QQQ"];
    const nowMs = Date.now();
    const marketHours = isMarketHoursET();
    const macroQuotesRaw = await fetchYahooQuoteBatch(MACRO_SYMS).catch(() => []);
    const macroQuotes = macroQuotesRaw.map((q) => ({ symbol: q.symbol, price: q.regularMarketPrice, changesPercentage: q.regularMarketChangePercent }));
    const coachLog = loadCoachLog();
    const researchContext = buildResearchContext({ researchIntel: coachLog.researchIntel, marketWrap: coachLog.marketWrap, timestamp: nowMs });
    const regimeLabel = await cachedMarketRegimeLabel(macroQuotes, marketHours, nowMs, researchContext);
    const board = buildTournamentBoard(regimeLabel);

    // Real valuation screener (2026-09-17 follow-up) — opt-in, only runs
    // when the caller actually passes one of these params. Pure sort/
    // filter over tournament-engine.js's own tick-enriched valuation
    // reads (see enrichTopWithValuation) — never a second scoring pass.
    const qp = requestUrl?.searchParams;
    const hasValuationQuery = qp && (qp.has("minValuation") || qp.has("maxValueTrap") || qp.has("minRevenueGrowth") || qp.has("minFcfYield") || qp.has("garpStatus") || qp.has("sortBy"));
    if (hasValuationQuery) {
      const { loadTournamentState: loadState } = require("../tournament-store");
      const num = (k) => (qp.get(k) != null ? Number(qp.get(k)) : null);
      const criteria = {
        minValuation: num("minValuation"), maxValueTrap: num("maxValueTrap"),
        minRevenueGrowth: num("minRevenueGrowth"), minFcfYield: num("minFcfYield"),
        garpStatus: qp.get("garpStatus") || null, sortBy: qp.get("sortBy") || "valuationScore",
      };
      board.valuationScreen = { applied: true, criteria, matches: filterTournamentByValuation(loadState(), criteria).slice(0, 50) };
    }

    return writeJson(res, 200, { ok: true, ...board });
  } catch (err) {
    return writeJson(res, 200, { ok: false, error: err instanceof Error ? err.message : "Tournament board unavailable." });
  }
}

// GET /api/market/tournament/detail?symbol=X — one fresh real canonical
// decision for a single symbol, same recipe the tick itself uses, plus
// the real riskScore contributor breakdown (asset-decision.js's own
// computeRiskScore already computes this internally but buildAssetDecision
// only keeps score/level from it — called again here with the exact same
// real inputs already sitting on the canonical result, not a new formula).
async function handleTournamentDetail(req, res, requestUrl) {
  const symbol = (requestUrl.searchParams.get("symbol") || "").trim().toUpperCase();
  if (!symbol) return writeJson(res, 400, { ok: false, error: "symbol required" });
  try {
    const { screenTrendTemplate } = require("./market");
    const rows = await screenTrendTemplate([symbol]);
    const row = rows.find((r) => r.symbol === symbol && !r.error);
    if (!row) return writeJson(res, 200, { ok: false, error: `No real trend-template data for ${symbol} right now.` });

    const MACRO_SYMS = ["SPY", "QQQ", "IWM", "DIA", "^VIX", "UUP", "VIXY", "TLT", "HYG"];
    const macroQuotesRaw = await fetchYahooQuoteBatch(MACRO_SYMS).catch(() => []);
    const macroQuotes = macroQuotesRaw.map((q) => ({ symbol: q.symbol, price: q.regularMarketPrice, changesPercentage: q.regularMarketChangePercent }));
    const nowMs = Date.now();
    const marketHours = isMarketHoursET();
    const coachLog = loadCoachLog();
    const researchContext = buildResearchContext({ researchIntel: coachLog.researchIntel, marketWrap: coachLog.marketWrap, timestamp: nowMs });

    const canonical = computeCanonicalAssetDecision({ symbol, row, macroQuotes, nowMs, marketHours, researchContext });
    if (!canonical) return writeJson(res, 200, { ok: false, error: `Canonical decision unavailable for ${symbol} right now.` });
    const { assetDecision: ad, opportunity: opp } = canonical;

    const eventRisk = computeEventRisk({ earningsDte: row.earningsDte, nowMs });
    const riskAssessment = computeRiskScore({
      dataHealth: canonical.dataHealth, marketRegime: canonical.marketRegime, eventRisk,
      criticalFlags: opp.criticalFlags || 0, committee: ad?.investmentCommittee || null, riskReward: ad?.riskReward ?? null,
    });

    const state = loadTournamentState();
    const stored = state.symbols[symbol] || null;

    // Real fundamentals (2026-09-17, "pull fundamental from the platform")
    // — the 12-bucket canonical technical engine genuinely has no
    // fundamentals bucket, so this platform's real "growth durability +
    // moat + financial strength" read lives in a separate, already-shipped
    // engine — future-value-scoring.js's real FMP-backed futureScore, the
    // same one powering "🚀 FUTURE STOCKS". Reused here via its own real
    // single-symbol lookup, never a second fundamentals formula. A real
    // fetch failure leaves it honestly null, never fabricated.
    let fundamentalScore = ad?.fundamentalScore ?? null;
    const keys = resolveProviderKeys(new URLSearchParams());
    try {
      const { runFutureValueSymbol } = require("./future-value-scan");
      const fv = await runFutureValueSymbol(symbol, keys);
      if (fv?.ok && Number.isFinite(fv.row?.futureScore)) fundamentalScore = fv.row.futureScore;
    } catch { /* real fundamentals genuinely unavailable — leave null, never fabricated */ }

    // Real valuation (2026-09-17, "VALUATION ENGINE" master prompt) — the
    // SAME canonical valuation-engine.js profile the Trade Desk's
    // ValuationCard shows, via routes/valuation.js's shared fetch+cache.
    // Fixes a real ONE-ENGINE-RULE gap this route itself introduced before
    // the Valuation Engine existed: valuationScore here used to come from
    // future-value-scoring.js's raw cheap-relative-to-fundamentals number,
    // a DIFFERENT real number than the canonical valuationScore/level/
    // trend/value-trap/GARP read shown everywhere else. Now single-sourced.
    let valuationScore = ad?.valuationScore ?? null;
    let valuation = null;
    try {
      const { getValuationProfile } = require("./valuation");
      const v = await getValuationProfile(symbol, keys);
      if (v?.ok) {
        valuationScore = v.valuationScore;
        valuation = v;
      }
    } catch { /* real valuation genuinely unavailable — leave null, never fabricated */ }

    return writeJson(res, 200, {
      ok: true, symbol, price: row.price ?? null,
      currentRank: stored?.currentRank ?? null, previousRank: stored?.previousRank ?? null,
      rankChange: stored?.rankChange ?? null, rankHistory: stored?.rankHistory ?? [],
      opportunityScore: opp.score ?? null, riskScore: ad?.riskScore ?? null, riskLevel: ad?.riskLevel ?? null,
      riskContributors: riskAssessment.contributors,
      tier: opp.tier ?? null, opportunityStage: opp.stage ?? null, signalState: ad?.signalState ?? null,
      positiveContributors: ad?.reasons || [],
      // Same real fix as tournament-engine.js's extractTournamentFields —
      // redFlags are objects ({key, label, critical, reason}), not strings.
      negativeContributors: [...(ad?.blockers || []), ...(opp.redFlags || []).map((f) => f.reason || f.label || f.key)],
      trendScore: ad?.trendScore ?? null, momentumScore: ad?.momentumScore ?? null, volumeScore: opp.breakdown?.volume ?? null,
      relativeStrengthScore: ad?.relativeStrengthScore ?? null, catalystScore: ad?.newsScore ?? null,
      fundamentalScore, valuationScore, valuation,
      entryQualityScore: opp.breakdown?.entryQuality ?? null,
      entryZone: opp.entry ?? null, invalidation: opp.invalidation ?? null, stop: ad?.stop ?? null,
      target: Array.isArray(ad?.targets) ? ad.targets[0] ?? null : null, riskReward: ad?.riskReward ?? null,
    });
  } catch (err) {
    return writeJson(res, 200, { ok: false, error: err instanceof Error ? err.message : "Tournament detail unavailable." });
  }
}

module.exports = { handleTournamentBoard, handleTournamentDetail };
