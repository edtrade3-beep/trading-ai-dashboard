"use strict";

const { computeRegime, regimeToEntryVocabulary } = require("./trade-planner-scoring");
const { computeOpportunity } = require("./opportunity-engine");
const { computeDataHealth } = require("./data-health-engine");
const { computeMarketRegimeState } = require("./market-regime-engine");
const { buildAssetDecision } = require("./asset-decision");
const { computeEventRisk } = require("./event-risk-engine");

const PIPELINE_VERSION = "canonical-pipeline-v1";

function latestTimestampMs(rows) {
  return (rows || []).reduce((latest, row) => {
    const raw = Number(row?.regularMarketTime ?? row?.timestamp ?? row?.ts);
    if (!Number.isFinite(raw) || raw <= 0) return latest;
    const ms = raw < 10_000_000_000 ? raw * 1000 : raw;
    return Math.max(latest, ms);
  }, 0) || null;
}

function computeCanonicalAssetDecision({
  symbol, row, macroQuotes = [], marketContext = null, sectorInfo = null, adx = null,
  optionsFlow = null, trackReport = null, spreadPct = null, eventRisk = null,
  fundamentals = null, news = null, executionHealth = null,
  researchContext = null,
  nowMs = Date.now(), marketHours = false, extraDataSources = [],
} = {}) {
  if (!row || row.error || !symbol) return null;
  const legacyRegime = computeRegime(macroQuotes);
  const dataHealth = computeDataHealth([
    { source: "market-price", available: Number.isFinite(row.price), timestamp: latestTimestampMs([row]), staleAfterMs: marketHours ? 5 * 60_000 : null, required: true },
    { source: "macro-quotes", available: macroQuotes.length > 0, timestamp: latestTimestampMs(macroQuotes), staleAfterMs: marketHours ? 15 * 60_000 : null, required: true },
    { source: "options-flow", available: optionsFlow != null, required: false },
    { source: "fundamentals", available: fundamentals != null, required: false },
    { source: "news", available: news != null, required: false },
    { source: "execution-paper-broker", available: executionHealth !== false, required: false },
    { source: "research-market-wrap", available: researchContext?.available === true, required: false },
    ...extraDataSources,
  ], { nowMs });
  const marketRegime = computeMarketRegimeState({ macroQuotes, marketContext, dataHealth, timestamp: nowMs });
  const opportunity = computeOpportunity({
    symbol, row, regime: legacyRegime, marketRegime: marketRegime.regime,
    sectorInfo, adx, optionsFlow, trackReport, spreadPct,
  });
  if (!opportunity) return null;
  const resolvedEventRisk = eventRisk || computeEventRisk({ earningsDte: row.earningsDte, nowMs });
  const assetDecision = buildAssetDecision({ opportunity, marketRegime, dataHealth, eventRisk: resolvedEventRisk, timestamp: nowMs });
  opportunity.assetDecision = assetDecision;
  return { assetDecision, opportunity, marketRegime, dataHealth, compatibilityRegime: legacyRegime, engineVersion: PIPELINE_VERSION };
}

module.exports = { PIPELINE_VERSION, latestTimestampMs, computeCanonicalAssetDecision };
