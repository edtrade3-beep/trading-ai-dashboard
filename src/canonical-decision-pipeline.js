"use strict";

const { computeRegime, regimeToEntryVocabulary } = require("./trade-planner-scoring");
const { computeOpportunity } = require("./opportunity-engine");
const { computeDataHealth } = require("./data-health-engine");
const { computeMarketRegimeState } = require("./market-regime-engine");
const { buildAssetDecision } = require("./asset-decision");
const { computeEventRisk } = require("./event-risk-engine");
const { computeTradeGpsScore, mapOpportunityToTradeGpsInputs, BREAKDOWN_MAX_POINTS, normalizeToHundred } = require("./trade-gps-score");
const { selectTradeStructure } = require("./trade-structure-selector");
const { evaluateTrapShield, computeMarketAgreement } = require("./trap-shield");
const { translateToTradeGpsVerdict } = require("./trade-gps-verdict");

const PIPELINE_VERSION = "canonical-pipeline-v1";

function latestTimestampMs(rows) {
  return (rows || []).reduce((latest, row) => {
    const candidate = row?.regularMarketTime ?? row?.timestamp ?? row?.ts ?? row?.updatedAt ?? row?.asOf ?? row?.generatedAt;
    const raw = typeof candidate === "string" && !/^\d+(\.\d+)?$/.test(candidate) ? Date.parse(candidate) : Number(candidate);
    if (!Number.isFinite(raw) || raw <= 0) return latest;
    const ms = raw < 10_000_000_000 ? raw * 1000 : raw;
    return Math.max(latest, ms);
  }, 0) || null;
}

function computeCanonicalAssetDecision({
  symbol, row, macroQuotes = [], marketContext = null, sectorInfo = null, adx = null,
  optionsFlow = null, trackReport = null, spreadPct = null, eventRisk = null,
  fundamentals = null, news = null, executionHealth = null,
  researchContext = null, optionChain = [], ivRank = null,
  nowMs = Date.now(), marketHours = false, extraDataSources = [],
} = {}) {
  if (!row || row.error || !symbol) return null;
  const legacyRegime = computeRegime(macroQuotes);
  const dataHealth = computeDataHealth([
    { source: "market-price", available: Number.isFinite(row.price), timestamp: latestTimestampMs([row]), staleAfterMs: marketHours ? 5 * 60_000 : null, required: true },
    { source: "macro-quotes", available: macroQuotes.length > 0, timestamp: latestTimestampMs(macroQuotes), staleAfterMs: marketHours ? 15 * 60_000 : null, required: true },
    { source: "options-flow", available: optionsFlow != null, required: false },
    { source: "fundamentals", available: fundamentals != null, timestamp: latestTimestampMs([fundamentals]), staleAfterMs: 24 * 60 * 60_000, required: false },
    { source: "news", available: news != null, timestamp: latestTimestampMs([news]), staleAfterMs: 60 * 60_000, required: false },
    { source: "execution-paper-broker", available: executionHealth !== false, timestamp: latestTimestampMs([executionHealth]), staleAfterMs: 5 * 60_000, required: false },
    { source: "research-market-wrap", available: researchContext?.available === true, required: false },
    ...extraDataSources,
  ], { nowMs });
  const marketRegime = computeMarketRegimeState({ macroQuotes, marketContext, dataHealth, timestamp: nowMs });
  const opportunity = computeOpportunity({
    symbol, row, regime: legacyRegime, marketRegime: marketRegime.regime,
    sectorInfo, adx, optionsFlow, trackReport, spreadPct, nowMs,
  });
  if (!opportunity) return null;
  const resolvedEventRisk = eventRisk || computeEventRisk({ earningsDte: row.earningsDte, nowMs });
  const assetDecision = buildAssetDecision({ opportunity, marketRegime, dataHealth, eventRisk: resolvedEventRisk, timestamp: nowMs });
  opportunity.assetDecision = assetDecision;
  // Trade GPS (2026-09-03) — additive only, per the confirmed design
  // decision: this is a SECOND, narrower "is this specific setup
  // Trade-GPS-ready" read shown only on the new Trade GPS card, never a
  // replacement for the real 12-bucket am-core-engine.js composite that
  // already powers every other surface reading opportunity.score.
  const tradeGps = assetDecision ? computeTradeGpsScore(mapOpportunityToTradeGpsInputs(opportunity, assetDecision)) : null;
  // Trade GPS (2026-09-03) — stock-vs-option structure pick, additive.
  // Direction is derived from the real entry/stop relationship this
  // pipeline already produces (stop below entry = bullish/LONG, stop
  // above entry = bearish/SHORT) — no new bias field invented.
  const direction = Number.isFinite(assetDecision?.entry) && Number.isFinite(assetDecision?.stop)
    ? (assetDecision.stop < assetDecision.entry ? "LONG" : "SHORT")
    : "LONG";
  const stopDistance = Number.isFinite(assetDecision?.entry) && Number.isFinite(assetDecision?.stop)
    ? Math.abs(assetDecision.entry - assetDecision.stop) : null;
  const firstTarget = Array.isArray(assetDecision?.targets) ? assetDecision.targets[0] : null;
  const targetDistance = Number.isFinite(assetDecision?.entry) && Number.isFinite(firstTarget)
    ? Math.abs(firstTarget - assetDecision.entry) : null;
  const tradeStructure = assetDecision ? selectTradeStructure({
    symbol, price: opportunity.price, direction, stopDistance, targetDistance,
    optionChain, ivRank, tradeGpsScore: tradeGps,
  }) : null;
  // Trade GPS Trap Shield (2026-09-03) — a real, additive read built
  // entirely from fields opportunity-engine.js already computes (never a
  // second red-flag pass): opportunity.redFlags/criticalFlags (the same
  // real computeRedFlags() call every other surface already relies on)
  // and opportunity.chaseRisk (the same real anti-chase band). Market
  // agreement reuses the same real per-bucket breakdown scores
  // trade-gps-score.js's own mapOpportunityToTradeGpsInputs already
  // normalizes — "aligned" means a real bucket cleared >=50% of its own
  // real max points, a disclosed judgment call, not a fabricated read.
  // sectorAligned has no real source anywhere in this codebase yet and is
  // deliberately left omitted (honest null), same as trade-gps-score.js's
  // own disclosed catalyst-source gaps.
  function alignedFromBreakdown(key) {
    const max = BREAKDOWN_MAX_POINTS[key];
    const raw = opportunity.breakdown?.[key];
    if (!Number.isFinite(raw) || !Number.isFinite(max) || max <= 0) return null;
    return normalizeToHundred(raw, max) >= 50;
  }
  const marketAgreement = computeMarketAgreement({
    regimeAligned: alignedFromBreakdown("regime"),
    trendAligned: alignedFromBreakdown("trend"),
    volumeAligned: alignedFromBreakdown("volume"),
    relativeStrengthAligned: alignedFromBreakdown("relativeStrength"),
    catalystAligned: alignedFromBreakdown("catalyst"),
    optionsAligned: alignedFromBreakdown("optionsConfirmation"),
    riskRewardAligned: Number.isFinite(assetDecision?.riskReward) ? assetDecision.riskReward >= 1.5 : null,
  });
  const trapShield = evaluateTrapShield({
    redFlags: {
      count: Array.isArray(opportunity.redFlags) ? opportunity.redFlags.length : null,
      criticalCount: Number.isFinite(opportunity.criticalFlags) ? opportunity.criticalFlags : null,
    },
    antiChaseBand: opportunity.chaseRisk ?? null,
    marketAgreementCount: marketAgreement.count,
    marketAgreementTotal: marketAgreement.total,
  });
  // Trade GPS verdict translation (2026-09-03) — additive vocabulary
  // layer only; the real FINAL_VERDICTS enum on assetDecision.verdict is
  // completely untouched (confirmed design decision #2).
  const tradeGpsVerdict = assetDecision ? translateToTradeGpsVerdict({
    symbol, assetDecisionVerdict: assetDecision.verdict, tradeStructure,
    tradeGpsScore: tradeGps, trapShield, signalState: assetDecision.signalState, dataHealth,
  }) : null;
  return {
    assetDecision, opportunity, marketRegime, dataHealth, compatibilityRegime: legacyRegime,
    tradeGps, tradeStructure, trapShield, marketAgreement, tradeGpsVerdict, engineVersion: PIPELINE_VERSION,
  };
}

module.exports = { PIPELINE_VERSION, latestTimestampMs, computeCanonicalAssetDecision };
