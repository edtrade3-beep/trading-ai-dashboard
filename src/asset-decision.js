"use strict";

const { randomUUID } = require("node:crypto");
const { computeSignalState } = require("./signal-lifecycle");

const ASSET_DECISION_VERSION = "asset-decision-v1";
const FINAL_VERDICTS = new Set(["STRONG_BUY", "BUY", "WATCH", "WAIT", "HOLD", "REDUCE", "EXIT", "AVOID"]);
const OPPORTUNITY_STAGES = new Set(["DORMANT", "DEVELOPING", "EMERGING", "ACTIONABLE", "CONFIRMED", "EXTENDED", "EXHAUSTED", "INVALIDATED"]);

function standardizeOpportunityStage(opp) {
  if (!opp) return "DORMANT";
  if (opp.tier === "INVALIDATED") return "INVALIDATED";
  if (opp.tier === "EXTENDED") return opp.reversalTopRisk ? "EXHAUSTED" : "EXTENDED";
  if (opp.tier === "ACTIONABLE") return opp.entryStage === "EARLY" ? "EMERGING" : "ACTIONABLE";
  if (opp.tier === "DEVELOPING") return "DEVELOPING";
  if (opp.verdict === "BUY") return "CONFIRMED";
  return "DORMANT";
}

function standardizeDecision(opp, positionState = null) {
  if (positionState) {
    if (positionState === "EXIT" || positionState === "HARD_EXIT") return "EXIT";
    if (positionState === "TAKE_PARTIAL") return "REDUCE";
    return "HOLD";
  }
  if (opp?.verdict === "EARLY_BUY") return "STRONG_BUY";
  if (opp?.verdict === "BUY") return "BUY";
  if (opp?.verdict === "WATCH") return "WATCH";
  if (opp?.verdict === "WAIT") return "WAIT";
  return "AVOID";
}

function applyRiskPolicy({ decision, marketRegime, dataHealth, eventRisk = null, criticalFlags = 0 }) {
  const blockers = [];
  if (criticalFlags > 0) blockers.push(`${criticalFlags} critical setup risk flag${criticalFlags === 1 ? "" : "s"} active.`);
  if (dataHealth && !dataHealth.canTrade) blockers.push(...dataHealth.blockers.map((b) => `Required data ${b}.`));
  if (marketRegime?.regime === "CRISIS") blockers.push("Canonical market regime is CRISIS.");
  else if (marketRegime?.regime === "RISK_OFF") blockers.push("Canonical market regime is RISK_OFF.");
  if (eventRisk?.blocksNewExposure) blockers.push(eventRisk.reason || "High-impact event risk blocks new exposure.");
  const isNewBuy = decision === "STRONG_BUY" || decision === "BUY";
  let finalVerdict = decision;
  if (isNewBuy && blockers.length) finalVerdict = marketRegime?.regime === "CRISIS" || criticalFlags > 0 ? "AVOID" : "WAIT";
  return { finalVerdict, overridden: finalVerdict !== decision, blockers };
}

function buildChangeMyMind({ finalVerdict, opportunity, risk }) {
  const items = [];
  if (risk.blockers.some((b) => /data/i.test(b))) items.push("Required data sources return healthy and fresh.");
  if (risk.blockers.some((b) => /regime/i.test(b))) items.push("Canonical market regime improves to NEUTRAL or better.");
  if (risk.blockers.some((b) => /event/i.test(b))) items.push("The blocking event window passes without invalidating the setup.");
  if (opportunity?.chaseRisk === "EXTENDED" || opportunity?.chaseRisk === "DO_NOT_CHASE") items.push("Price returns to the canonical entry zone without breaking trend or relative strength.");
  if (opportunity?.entryPlan?.entryPrice == null && (finalVerdict === "WAIT" || finalVerdict === "WATCH")) items.push("A real executable entry forms with acceptable reward/risk.");
  if (!items.length && finalVerdict === "AVOID") items.push("The invalidating structure and critical risk flags clear in fresh data.");
  return [...new Set(items)];
}

function buildAssetDecision({ opportunity, marketRegime, dataHealth, positionState = null, positionReason = null, eventRisk = null, timestamp = Date.now() } = {}) {
  if (!opportunity?.symbol) return null;
  const decision = standardizeDecision(opportunity, positionState);
  const risk = applyRiskPolicy({ decision, marketRegime, dataHealth, eventRisk, criticalFlags: opportunity.criticalFlags || 0 });
  const confidenceBase = Number.isFinite(opportunity.probability) ? opportunity.probability : opportunity.score;
  const healthMultiplier = Number.isFinite(dataHealth?.confidenceMultiplier) ? dataHealth.confidenceMultiplier : 1;
  const entryPlan = opportunity.entryPlan || {};
  const entry = Number(entryPlan.entryPrice);
  const stop = Number(entryPlan.stop);
  const target = Number(entryPlan.target1 ?? entryPlan.target2);
  const derivedRr = entry > stop && target > entry ? (target - entry) / (entry - stop) : null;
  // Trade GPS (2026-09-03) — pre-entry state only; a held position (real
  // positionState supplied) already has its own real post-entry state
  // machine (position-decision-engine.js's HOLD/TRAIL/TAKE_PARTIAL/EXIT),
  // a separate concern this doesn't duplicate or override. No createdAtMs/
  // ttlMs here deliberately — this runs per-symbol in bulk scans of
  // 100+ real rows; real per-symbol TTL tracking (which needs a real
  // persisted creation timestamp) is reserved for the narrow contexts
  // that actually need it (signal-lifecycle.js's getOrSetSignalCreatedAt),
  // not fired on every bulk-scan row.
  const signalLifecycle = positionState ? null : computeSignalState({
    opportunityStage: standardizeOpportunityStage(opportunity), tier: opportunity.tier, entryStage: opportunity.entryStage,
    entry: opportunity.entry, executableEntry: opportunity.executableEntry, currentPrice: opportunity.price,
    invalidation: Number.isFinite(entryPlan.invalidation) ? entryPlan.invalidation : null,
    nowMs: timestamp,
  });
  // correlationId (2026-09-04, Phase 0 audit finding: symbol was the sole
  // identity field on this contract — no way to trace one specific
  // decision instance end-to-end through logs/journal/alerts by ID, only
  // by symbol+timestamp proximity). Fresh per decision computation, no
  // meaning beyond "this exact object" — NOT a stable cross-time
  // instrument identity (that needs real venue/asset-class/corporate-
  // action data this function doesn't have; deliberately not fabricated
  // here, scoped as its own later piece of work).
  const result = {
    symbol: opportunity.symbol, correlationId: randomUUID(), timestamp, price: opportunity.price ?? null,
    dataHealth: dataHealth || null, marketRegime: marketRegime || null,
    assetQuality: opportunity.fingerprint?.fundamentals ?? null,
    trendScore: opportunity.breakdown?.trend ?? null, momentumScore: opportunity.breakdown?.momentum ?? null,
    relativeStrengthScore: opportunity.breakdown?.relativeStrength ?? null, fundamentalScore: opportunity.breakdown?.fundamentals ?? null,
    flowScore: opportunity.breakdown?.institutional ?? opportunity.breakdown?.optionsConfirmation ?? null,
    newsScore: opportunity.breakdown?.catalyst ?? null, eventRiskScore: eventRisk?.score ?? null,
    valuationScore: opportunity.fingerprint?.valuation ?? null, setupScore: opportunity.entryScore ?? null,
    opportunityStage: standardizeOpportunityStage(opportunity), opportunityScore: opportunity.score ?? null,
    // Score transparency (2026-09-04, Phase 0 audit finding: "an
    // unvalidated score must be labeled HEURISTIC," and the 0-100 score
    // above must never be read as a probability). am-core-engine.js's own
    // header already discloses this score is a hand-weighted judgment
    // call, not backtested/quant-optimized — scoreValidation says so
    // explicitly rather than leaving a consumer to assume otherwise.
    // winProbability/expectedValue were ALREADY computed as real,
    // honestly-nullable fields on `opportunity` (institutional-scoring.js's
    // real bucketed historical win rate, and opportunity-engine.js's real
    // EV-after-costs formula) — they just never reached this final
    // contract before now. Not new computation, just no longer dropped.
    scoreValidation: "HEURISTIC",
    winProbability: opportunity.probability ?? null,
    winProbabilitySampleSize: opportunity.probabilitySampleCount ?? null,
    expectedValuePct: opportunity.expectedValue ?? null,
    confidence: Number.isFinite(confidenceBase) ? Math.round(confidenceBase * healthMultiplier) : null,
    entry: entryPlan.entryPrice ?? null, stop: entryPlan.stop ?? null,
    targets: [entryPlan.target1, entryPlan.target2].filter(Number.isFinite), riskReward: entryPlan.rr ?? derivedRr,
    invalidation: Number.isFinite(entryPlan.invalidation) ? entryPlan.invalidation : null,
    signalState: signalLifecycle?.state ?? null, signalExpiresAt: signalLifecycle?.expiresAtMs ?? null,
    // Trade Navigator Stage 6 (2026-09-03) — additive. ignored-alert-tracker.js
    // needs to tell a genuine TTL expiry ("nobody acted, still don't know if
    // it would have worked") apart from an invalidation ("thesis broke, real
    // exit was correct") — signal-lifecycle.js's own real reason string
    // already disambiguates this, it just was never surfaced before.
    signalStateReason: signalLifecycle?.reason ?? null,
    decision, riskOverride: risk.overridden ? { from: decision, to: risk.finalVerdict, reasons: risk.blockers } : null,
    verdict: risk.finalVerdict,
    reasons: [...new Set([positionState ? positionReason : opportunity.verdictReason, ...(opportunity.reasons || [])].filter(Boolean))],
    blockers: [...new Set(risk.blockers)], changeMyMind: buildChangeMyMind({ finalVerdict: risk.finalVerdict, opportunity, risk }),
    dataSources: (dataHealth?.sources || []).map((s) => s.source), engineVersion: ASSET_DECISION_VERSION,
  };
  if (!FINAL_VERDICTS.has(result.verdict) || !OPPORTUNITY_STAGES.has(result.opportunityStage)) throw new Error("Invalid canonical AssetDecision state");
  return result;
}

module.exports = { ASSET_DECISION_VERSION, FINAL_VERDICTS, OPPORTUNITY_STAGES, standardizeOpportunityStage, standardizeDecision, applyRiskPolicy, buildAssetDecision };
