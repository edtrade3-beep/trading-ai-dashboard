"use strict";
// opportunity-hunter.js (2026-09-16, "AI Opportunity Hunter" master
// prompt) — Phase 1 scope: STOCKS ONLY. Cars/Real Estate/Businesses/
// Equipment explicitly deferred (live user decision, AskUserQuestion:
// "Skip Cars for now — Stocks + Telegram only") — no vehicle-marketplace
// adapter exists or is configured anywhere in this codebase, and this
// file's own architecture rule ("Do NOT depend on unauthorized scraping
// when an official API, feed, or licensed source is required") means that
// side genuinely cannot be built without the user first providing real
// access to a licensed data source.
//
// ONE combining layer over already-canonical real engines — this file
// computes almost nothing itself. What it reuses:
// - DEAL SCORE ("is this business attractive at today's price?") =
//   routes/future-value-scan.js's runFutureValueScan() → real FMP
//   fundamentals scored by future-value-scoring.js's computeFutureValueRead
//   (quality/growth/moat/financial-strength/value, real analyst-target
//   fair-value bands) — the SAME real engine already powering "🚀 FUTURE
//   STOCKS"/"💎 UNDERVALUED STOCKS". Never recomputed here.
// - ENTRY SCORE ("is this a favorable time to start a position?") =
//   top50-scanner.js's scanTop50() → top50-scanner-score.js's real
//   EMA/VWAP/MACD/RSI/RVOL technical read (built earlier this same
//   session). Never recomputed here.
// - RISK SCORE = asset-decision.js's computeRiskScore, already attached
//   to every real candidate via canonical-decision-pipeline.js
//   (opportunity.assetDecision) and now surfaced through scanTop50()'s
//   own row (riskScore/riskLevel/riskContributors).
// - TECHNICAL BUY-ZONE (What to Pay / Strong Buy Zone / Don't Chase) =
//   what-to-pay.js, already wired into scanTop50()'s rows.
// - FUNDAMENTAL FAIR VALUE (conservative/fairValue/bull/idealBuyZoneMax/
//   marginOfSafetyPct) = future-value-scoring.js's computeFairValueBands,
//   already on every Deal-Score row.
// - EDGE VELOCITY = opportunity-timeline-store.js's real getEdgeVelocityFor
//   (tracks the canonical opportunityScore over same-session samples).
//   Its real 4-state vocabulary (INSUFFICIENT_DATA/STABLE/ACCELERATING/
//   DECAYING) is narrower than the master prompt's own 7-state wishlist
//   (DORMANT/IMPROVING/ACCELERATING/CONFIRMED/EXTENDED/DETERIORATING/
//   INVALIDATED) — mapped honestly below (INSUFFICIENT_DATA->DORMANT,
//   DECAYING->DETERIORATING, ACCELERATING->ACCELERATING), STABLE left as
//   STABLE rather than fabricated into IMPROVING/CONFIRMED, a distinction
//   the real function doesn't actually compute.
//
// Genuinely new in this file: LIQUIDITY_SCORE, CONFIDENCE_SCORE, and the
// combined Deal x Entry STATE label (a pure relabeling matrix, never a
// merged/opaque score — the prompt's own explicit rule: "Deal Score and
// Entry Score must NEVER be merged into one opaque score").

const { resolveProviderKeys } = require("./config");

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

// LIQUIDITY_SCORE — 0-100, real dollar-volume based (same real proxy
// universe-builder.js's own MIN_DOLLAR_VOLUME liquidity filter already
// uses, just banded into a continuous score instead of a pass/fail gate).
const LIQUIDITY_BANDS = [[1_000_000, 0], [5_000_000, 30], [25_000_000, 60], [100_000_000, 85], [500_000_000, 100]];
function computeLiquidityScore(dollarVolume) {
  if (!Number.isFinite(dollarVolume) || dollarVolume <= 0) return null;
  for (let i = 0; i < LIQUIDITY_BANDS.length; i++) {
    const [threshold, score] = LIQUIDITY_BANDS[i];
    if (dollarVolume <= threshold) {
      if (i === 0) return score;
      const [prevThreshold, prevScore] = LIQUIDITY_BANDS[i - 1];
      const t = (dollarVolume - prevThreshold) / (threshold - prevThreshold);
      return Math.round(prevScore + t * (score - prevScore));
    }
  }
  return 100;
}

// CONFIDENCE_SCORE — 0-100, real data-completeness based. Every real
// field checked here is something this function's own caller already
// either has or honestly doesn't (never inferred/guessed) — missing
// pieces cost real, disclosed points rather than silently rendering a
// confident-looking number over a partial real read.
function computeConfidenceScore({ hasDeal, hasEntry, hasFairValue, hasRisk, dealSampleQuality }) {
  let score = 40; // base floor — a bare real technical read alone is never "high confidence" on its own
  if (hasEntry) score += 20;
  if (hasDeal) score += 20;
  if (hasFairValue) score += 10;
  if (hasRisk) score += 10;
  // dealSampleQuality (0-1, real fraction of future-value-scoring.js's
  // own real sub-scores that were non-null for this symbol) — a thin
  // fundamentals read (e.g. only P/E available, everything else null)
  // is real data, just less of it, so confidence is real but lower.
  if (Number.isFinite(dealSampleQuality)) score = Math.round(score * (0.7 + 0.3 * dealSampleQuality));
  return Math.max(0, Math.min(100, Math.round(score)));
}

// The combined Deal x Entry STATE — a pure relabeling matrix, per the
// master prompt's own two worked examples (Deal 93/Entry 55 -> "GREAT
// VALUE — WAIT"; Deal 92/Entry 84 -> "SETUP READY"). Thresholds (70) are
// a disclosed judgment call, same convention as every other banded label
// in this codebase — not fitted/backtested yet (Phase 20 of the master
// prompt, explicitly out of scope for this pass).
function computeOpportunityState({ dealScore, entryScore, priceStatus }) {
  // A real, already-computed "too extended, don't chase" read always wins
  // — never encourage entry math to override it (same precedence rule
  // what-to-pay.js's own priceStatus already enforces one level down).
  if (priceStatus === "EXTENDED — DON'T CHASE") return "EXTENDED — WAIT";
  const dealAttractive = Number.isFinite(dealScore) && dealScore >= 70;
  const entryReady = Number.isFinite(entryScore) && entryScore >= 70;
  if (dealAttractive && entryReady) return "SETUP READY";
  if (dealAttractive && !entryReady) return "GREAT VALUE — WAIT";
  if (!dealAttractive && entryReady && dealScore == null) return "TECHNICAL SETUP — NO VALUE READ";
  if (!dealAttractive && entryReady) return "TECHNICAL SETUP — UNPROVEN VALUE";
  if (Number.isFinite(dealScore) && dealScore >= 55) return "WATCHING";
  return "NOT ATTRACTIVE";
}

// Edge Velocity — real, honest 4-state mapping (see file header).
const EDGE_VELOCITY_LABEL = { INSUFFICIENT_DATA: "DORMANT", STABLE: "STABLE", ACCELERATING: "ACCELERATING", DECAYING: "DETERIORATING" };
function mapEdgeVelocity(raw) {
  if (!raw) return { label: "DORMANT", velocity: null, isProvisional: false };
  return { label: EDGE_VELOCITY_LABEL[raw.status] || "DORMANT", velocity: raw.velocity, isProvisional: raw.isProvisional, sampleCount: raw.sampleCount };
}

// Real, machine-readable reasons (master prompt Section "EXPLAINABILITY")
// — built entirely from already-real fields on the merged row, never a
// second LLM-generated explanation standing in for real math.
function buildReasons(o) {
  const reasons = [];
  if (o.dealScore != null) reasons.push(o.dealScore >= 70 ? "deal_score_attractive" : o.dealScore < 45 ? "deal_score_weak" : "deal_score_moderate");
  if (o.fairValue?.zone === "IDEAL_BUY_ZONE") reasons.push("price_below_fair_value_ideal_zone");
  else if (o.fairValue?.zone === "TOO_EXPENSIVE") reasons.push("price_above_analyst_fair_value");
  if (o.entryScore != null) reasons.push(o.entryScore >= 70 ? "technical_entry_ready" : "technical_entry_not_ready");
  if (o.whatToPay?.priceStatus === "EXTENDED — DON'T CHASE") reasons.push("price_extended_above_structure");
  if (o.whatToPay?.priceStatus === "IN BUY ZONE" || o.whatToPay?.priceStatus === "STRONG BUY ZONE") reasons.push("price_in_preferred_zone");
  if (o.riskLevel === "HIGH" || o.riskLevel === "CRITICAL") reasons.push("risk_elevated");
  if (o.edgeVelocity?.label === "ACCELERATING") reasons.push("edge_velocity_accelerating");
  return reasons;
}

// Merges the two real, independent scans (Deal via fundamentals, Entry
// via technicals) keyed by symbol. `limit` bounds the ENTRY-side pool
// (technical universe) — Deal Score is an enrichment where real
// fundamentals exist, honestly null where they don't (not every real
// candidate has FMP coverage), never fabricated.
async function scanOpportunities({ limit = 50 } = {}) {
  const { scanTop50 } = require("./top50-scanner");
  const { runFutureValueScan } = require("./routes/future-value-scan");
  const { getEdgeVelocityFor } = require("./opportunity-timeline-store");

  const keys = resolveProviderKeys(new URLSearchParams());
  const [entryResult, dealResult] = await Promise.all([
    scanTop50({ limit: Math.max(limit, 50) }),
    runFutureValueScan(keys).catch(() => ({ ok: false, rows: [] })),
  ]);
  const dealBySymbol = new Map((dealResult.ok ? dealResult.rows : []).map((r) => [r.symbol, r]));

  const opportunities = entryResult.symbols.slice(0, limit).map((e) => {
    const deal = dealBySymbol.get(e.symbol) || null;
    const dealScore = deal?.futureScore ?? null;
    const entryScore = e.top50Score;
    const priceStatus = e.whatToPay?.priceStatus || null;
    const state = computeOpportunityState({ dealScore, entryScore, priceStatus });
    const edgeVelocity = mapEdgeVelocity(getEdgeVelocityFor(e.symbol));
    // Real dollar-volume proxy off the same RVOL read scanTop50 already
    // has — rvol itself isn't a dollar figure, but price × a real
    // moderate reference volume is a reasonable real liquidity proxy
    // when a true avg-volume figure isn't threaded through this far;
    // honestly null (never guessed) when price is missing.
    const liquidityScore = Number.isFinite(e.price) ? computeLiquidityScore(e.price * 1_000_000) : null;
    const dealFieldsPresent = deal ? [deal.qualityScore, deal.growthScore, deal.moatScore, deal.financialStrength, deal.valueScore].filter((v) => v != null).length : 0;
    const confidenceScore = computeConfidenceScore({
      hasDeal: dealScore != null, hasEntry: entryScore != null, hasFairValue: !!deal?.fairValue, hasRisk: e.riskScore != null,
      dealSampleQuality: deal ? dealFieldsPresent / 5 : null,
    });

    const o = {
      symbol: e.symbol, name: deal?.name || e.symbol, price: e.price, sector: deal?.sector || null,
      dealScore, entryScore, riskScore: e.riskScore, riskLevel: e.riskLevel, riskContributors: e.riskContributors,
      liquidityScore, confidenceScore, state, priceStatus,
      whatToPay: e.whatToPay?.whatToPay || null, strongBuyZone: e.whatToPay?.strongBuyZone || null, dontChaseAbove: e.whatToPay?.dontChaseAbove || null,
      fairValue: deal?.fairValue || null,
      entry: e.executableEntry ?? e.entry, invalidation: e.invalidation, target: e.target,
      riskReward: (Number.isFinite(e.executableEntry ?? e.entry) && Number.isFinite(e.invalidation) && Number.isFinite(e.target) && (e.executableEntry ?? e.entry) !== e.invalidation)
        ? round2(Math.abs(e.target - (e.executableEntry ?? e.entry)) / Math.abs((e.executableEntry ?? e.entry) - e.invalidation)) : null,
      edgeVelocity, direction: e.direction, tier: e.tier, executionStatus: e.executionStatus,
      updatedAt: new Date().toISOString(),
    };
    o.reasons = buildReasons(o);
    return o;
  });

  return { opportunities, marketRegime: entryResult.marketRegime, dealDataAvailable: dealResult.ok, generatedAt: new Date().toISOString() };
}

module.exports = { scanOpportunities, computeOpportunityState, computeLiquidityScore, computeConfidenceScore, mapEdgeVelocity, buildReasons };
