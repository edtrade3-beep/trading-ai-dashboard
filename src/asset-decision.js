"use strict";

const { randomUUID } = require("node:crypto");
const { computeSignalState } = require("./signal-lifecycle");
const { computeInvestmentCommittee } = require("./investment-committee");

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

function applyRiskPolicy({ decision, marketRegime, dataHealth, eventRisk = null, criticalFlags = 0, committee = null }) {
  const blockers = [];
  if (criticalFlags > 0) blockers.push(`${criticalFlags} critical setup risk flag${criticalFlags === 1 ? "" : "s"} active.`);
  if (dataHealth && !dataHealth.canTrade) blockers.push(...dataHealth.blockers.map((b) => `Required data ${b}.`));
  if (marketRegime?.regime === "CRISIS") blockers.push("Canonical market regime is CRISIS.");
  else if (marketRegime?.regime === "RISK_OFF") blockers.push("Canonical market regime is RISK_OFF.");
  if (eventRisk?.blocksNewExposure) blockers.push(eventRisk.reason || "High-impact event risk blocks new exposure.");
  const isNewBuy = decision === "STRONG_BUY" || decision === "BUY";
  let finalVerdict = decision;
  if (isNewBuy && blockers.length) finalVerdict = marketRegime?.regime === "CRISIS" || criticalFlags > 0 ? "AVOID" : "WAIT";
  // Investment Committee (2026-09-04, direct user spec: "A trade cannot
  // receive STRONG_BUY when a critical reviewer identifies unresolved
  // stale data, accounting, liquidity, corporate-action, or event
  // risk."). Narrower than the blockers above — this only ever downgrades
  // STRONG_BUY to BUY, never blocks a trade outright (the existing
  // blockers logic above already owns that). Real committee reviewer
  // concerns only; never triggered by a reviewer this pipeline stage
  // honestly couldn't evaluate (investment-committee.js never sets
  // blocksStrongBuy off a NOT_EVALUATED reviewer).
  if (finalVerdict === "STRONG_BUY" && committee?.blocksStrongBuy) {
    finalVerdict = "BUY";
    blockers.push(`Investment Committee: ${committee.criticalConcerns.map((k) => committee.reviewers[k].reason).join(" ")}`);
  }
  return { finalVerdict, overridden: finalVerdict !== decision, blockers };
}

const RISK_LEVEL_THRESHOLDS = [
  { max: 19, level: "LOW" },
  { max: 39, level: "NORMAL" },
  { max: 59, level: "ELEVATED" },
  { max: 79, level: "HIGH" },
  { max: 100, level: "CRITICAL" },
];
function riskLevelFor(score) { return RISK_LEVEL_THRESHOLDS.find((t) => score <= t.max).level; }

// Unified Risk Score (2026-09-13, explicit user task: "ADD UNIFIED RISK
// SCORE ONLY" — additive, observational, must never change existing
// verdict/blocker behavior). Reuses ONLY the same real risk inputs
// applyRiskPolicy above already receives — no new fetch, no new API.
// Higher score = higher risk, always; never mixes in opportunity quality.
// Missing/unavailable inputs use a conservative non-zero default (never
// silently "safe") per explicit instruction.
function computeRiskScore({ dataHealth, marketRegime, eventRisk, criticalFlags = 0, committee = null, riskReward = null }) {
  const contributors = [];
  const add = (source, points, reason) => { if (points > 0) contributors.push({ source, points, reason }); };

  // Data Health Risk — up to 25.
  let dataPoints;
  if (!dataHealth) { dataPoints = 15; add("dataHealth", dataPoints, "Data health unavailable — unknown reliability."); }
  else if (dataHealth.canTrade === false) { dataPoints = 25; add("dataHealth", dataPoints, "Required data sources are stale/missing."); }
  else {
    const health = Number.isFinite(dataHealth.score) ? Math.max(0, Math.min(100, dataHealth.score)) : 70;
    dataPoints = Math.round(((100 - health) / 100) * 25);
    add("dataHealth", dataPoints, `Data health score ${health}/100.`);
  }

  // Market Regime Risk — up to 20. Real vocabulary only (market-regime-engine.js):
  // RISK_ON | SELECTIVE_RISK_ON | NEUTRAL | RISK_OFF | CRISIS.
  const REGIME_POINTS = { CRISIS: 20, RISK_OFF: 14, NEUTRAL: 6, SELECTIVE_RISK_ON: 3, RISK_ON: 0 };
  const regimeLabel = marketRegime?.regime;
  const regimePoints = regimeLabel in REGIME_POINTS ? REGIME_POINTS[regimeLabel] : 8; // unknown regime: conservative default, not 0
  add("marketRegime", regimePoints, regimeLabel ? `Market regime is ${regimeLabel}.` : "Market regime unavailable.");

  // Event Risk — up to 20.
  let eventPoints;
  if (!eventRisk) { eventPoints = 6; add("eventRisk", eventPoints, "Event risk unavailable — unknown near-term catalysts."); }
  else if (eventRisk.blocksNewExposure) { eventPoints = 20; add("eventRisk", eventPoints, eventRisk.reason || "High-impact event blocks new exposure."); }
  else if (Number.isFinite(eventRisk.score)) {
    eventPoints = Math.round((Math.max(0, Math.min(100, eventRisk.score)) / 100) * 20);
    add("eventRisk", eventPoints, `Event risk score ${eventRisk.score}/100.`);
  } else { eventPoints = 4; add("eventRisk", eventPoints, "No material near-term event risk detected."); }

  // Critical Flags — up to 20.
  const flags = Number.isFinite(criticalFlags) ? Math.max(0, criticalFlags) : 0;
  const flagPoints = flags <= 0 ? 0 : flags === 1 ? 12 : flags === 2 ? 18 : 20;
  add("criticalFlags", flagPoints, flags > 0 ? `${flags} critical setup flag${flags === 1 ? "" : "s"} active.` : null);

  // Committee / Confidence Risk — up to 10. Only scored when committee
  // disagreement is already reliably represented; absent committee data
  // contributes 0 here (not a "missing = risky" case, per explicit
  // instruction narrower than the general conservative-default rule).
  let committeePoints = 0;
  if (committee?.blocksStrongBuy) {
    const concerns = Array.isArray(committee.criticalConcerns) ? committee.criticalConcerns.length : 0;
    committeePoints = Math.min(10, 6 + concerns * 2);
    add("committee", committeePoints, `${concerns || "Investment"} committee concern${concerns === 1 ? "" : "s"} flagged.`);
  }

  // Trade Structure Risk — up to 5. Only the one structural field already
  // directly available in buildAssetDecision's scope (riskReward) — no
  // new calculation requiring unrelated files.
  let structurePoints;
  if (!Number.isFinite(riskReward)) { structurePoints = 2; add("tradeStructure", structurePoints, "Risk/reward not established yet."); }
  else if (riskReward < 1) { structurePoints = 5; add("tradeStructure", structurePoints, `Poor risk/reward (${riskReward.toFixed(2)}:1).`); }
  else if (riskReward < 1.5) { structurePoints = 3; add("tradeStructure", structurePoints, `Marginal risk/reward (${riskReward.toFixed(2)}:1).`); }
  else structurePoints = 0;

  const score = Math.max(0, Math.min(100, Math.round(dataPoints + regimePoints + eventPoints + flagPoints + committeePoints + structurePoints)));
  return { score, level: riskLevelFor(score), contributors };
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
  const committee = computeInvestmentCommittee({ opportunity, marketRegime, dataHealth, eventRisk });
  const risk = applyRiskPolicy({ decision, marketRegime, dataHealth, eventRisk, criticalFlags: opportunity.criticalFlags || 0, committee });
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
  // opportunityScore is the ONE canonical public score field (2026-09-13
  // duplication cleanup — targeted reference search found 8 real
  // production/UI consumers of opportunityScore — TradeDeskTab.jsx via
  // CanonicalVerdictStrip.jsx, AMCortexTab.jsx, CortexMiniPanel.jsx,
  // axiom-live.jsx's command-palette answers — vs. zero for tradeScore
  // outside this file's own tests). Computed once here so the two fields
  // below are structurally guaranteed identical, not just coincidentally
  // equal from two separately-written expressions.
  const opportunityScoreValue = opportunity.score ?? null;
  const result = {
    symbol: opportunity.symbol, correlationId: randomUUID(), timestamp, price: opportunity.price ?? null,
    dataHealth: dataHealth || null, marketRegime: marketRegime || null,
    assetQuality: opportunity.fingerprint?.fundamentals ?? null,
    trendScore: opportunity.breakdown?.trend ?? null, momentumScore: opportunity.breakdown?.momentum ?? null,
    relativeStrengthScore: opportunity.breakdown?.relativeStrength ?? null, fundamentalScore: opportunity.breakdown?.fundamentals ?? null,
    flowScore: opportunity.breakdown?.institutional ?? opportunity.breakdown?.optionsConfirmation ?? null,
    newsScore: opportunity.breakdown?.catalyst ?? null, eventRiskScore: eventRisk?.score ?? null,
    valuationScore: opportunity.fingerprint?.valuation ?? null, setupScore: opportunity.entryScore ?? null,
    opportunityStage: standardizeOpportunityStage(opportunity), opportunityScore: opportunityScoreValue,
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
    // Trade Score / Model Confidence / Data Quality / Estimated
    // Probability separation (2026-09-11, explicit user request via a
    // revised master platform spec's Quant Agent section: "Do NOT
    // present '87% probability of winning' merely because an AI model
    // produced 87" — separate trade score, model confidence, data
    // quality, and probability). Purely additive: `confidence` and
    // `opportunityScore` above are untouched for their existing real
    // consumers (TradeDeskTab.jsx, TradeGpsCard.jsx,
    // CanonicalVerdictStrip.jsx, trade-gps-notifier.js) — these are new,
    // more precisely-named exposures of real values, not a new
    // computation layered on top of guesses.
    //
    // tradeScore: DEPRECATED alias of opportunityScore above (2026-09-13 —
    // confirmed via targeted reference search: no live production/UI/API
    // consumer of tradeScore exists anywhere in the repo, only this file's
    // own tests). Kept only for backward compatibility per explicit
    // instruction not to remove it in this pass; structurally guaranteed
    // identical to opportunityScore (same local value, not a second
    // calculation) — always HEURISTIC per scoreValidation, never a
    // probability.
    tradeScore: opportunityScoreValue,
    // dataQuality: the real per-source completeness/freshness score
    // data-health-engine.js already computes, exposed at the top level
    // instead of only nested under dataHealth.
    dataQuality: dataHealth?.score ?? null,
    dataQualityStatus: dataHealth?.status ?? null,
    // modelConfidence: genuinely distinct from tradeScore — measures how
    // complete/reliable the INPUTS behind this classification are, not
    // how good the setup looks. Built entirely from already-real signals:
    // real data completeness (dataHealth.score, weighted to 90% so even a
    // perfectly fresh/complete data set doesn't alone imply maximum
    // classification reliability — a real backtested track record is a
    // genuinely separate kind of evidence, not just "more of the same"),
    // a real 10-point bonus reserved specifically for when a genuinely
    // calibrated historical win rate backs this call (see
    // probabilityCalibrationStatus below — never a heuristic dressed up
    // as calibration), and a real penalty for active critical red flags
    // (a reliability concern, distinct from the setup-quality concern
    // tradeScore already reflects). Bounded 0-100 — never a fabricated
    // precision number.
    modelConfidence: Math.max(0, Math.min(100, Math.round(
      (Number.isFinite(dataHealth?.score) ? dataHealth.score : 50) * 0.9
      + (Number.isFinite(opportunity.probability) ? 10 : 0)
      - ((opportunity.criticalFlags || 0) > 0 ? 15 : 0)
    ))),
    // estimatedProbability / probabilityCalibrationStatus: the Quant
    // Agent's specific requirement — never present a probability unless
    // it has actually been calibrated from real historical results.
    // winProbFor() (institutional-scoring.js) already enforces a real
    // minimum sample size (MIN_WIN_SAMPLE=10) before ever returning a
    // real winRate; this only surfaces that already-real, already-gated
    // number under a clearer name plus an honest calibration-status
    // label — never a new computation, never a probability shown without
    // a real sample behind it.
    estimatedProbability: Number.isFinite(opportunity.probability) ? opportunity.probability : null,
    probabilityCalibrationStatus: Number.isFinite(opportunity.probability) ? "CALIBRATED"
      : Number.isFinite(opportunity.probabilitySampleCount) ? "INSUFFICIENT_SAMPLE"
      : "NOT_CALIBRATED",
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
    investmentCommittee: committee,
  };
  // Unified Risk Score — additive, observational only (see computeRiskScore
  // above). Computed from the exact same real inputs applyRiskPolicy already
  // used above; never influences `decision`/`verdict`/`blockers`.
  const riskAssessment = computeRiskScore({ dataHealth, marketRegime, eventRisk, criticalFlags: opportunity.criticalFlags || 0, committee, riskReward: result.riskReward });
  result.riskScore = riskAssessment.score;
  result.riskLevel = riskAssessment.level;
  result.riskContributors = riskAssessment.contributors;
  if (!FINAL_VERDICTS.has(result.verdict) || !OPPORTUNITY_STAGES.has(result.opportunityStage)) throw new Error("Invalid canonical AssetDecision state");
  return result;
}

module.exports = { ASSET_DECISION_VERSION, FINAL_VERDICTS, OPPORTUNITY_STAGES, standardizeOpportunityStage, standardizeDecision, applyRiskPolicy, computeRiskScore, buildAssetDecision };
