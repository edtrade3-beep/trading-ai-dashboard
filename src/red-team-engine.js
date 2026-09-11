"use strict";

// red-team-engine.js — formal Red-Team Agent (2026-09-11, explicit user
// request via a revised master platform spec's Red-Team Agent section:
// "Before high-conviction trades reach the user, independently attack the
// thesis... Return THESIS, STRONGEST COUNTERARGUMENT, CONTRADICTIONS,
// INVALIDATION, WHAT WOULD FLIP THE VERDICT. The Red-Team Agent cannot
// issue the final trade.").
//
// Purely deterministic — zero AI/Anthropic call, matching this platform's
// standing "Anthropic only for Story AI" rule. Every field here is
// assembled from evidence ALREADY computed on the canonical AssetDecision
// (src/asset-decision.js) — this is a real synthesis/attack pass over
// existing real signals, never a second, independently-invented risk
// assessment or a fabricated new data point.
const BUY_FAMILY = new Set(["STRONG_BUY", "BUY"]);

function findContradictions(decision) {
  const contradictions = [];
  const isHighConviction = BUY_FAMILY.has(decision.verdict);

  if (isHighConviction && Number.isFinite(decision.relativeStrengthScore) && decision.relativeStrengthScore < 5) {
    contradictions.push(`Verdict is ${decision.verdict} but relative strength score is weak (${decision.relativeStrengthScore}) — this isn't demonstrating genuine leadership.`);
  }
  if (isHighConviction && Number.isFinite(decision.momentumScore) && decision.momentumScore < 5) {
    contradictions.push(`Verdict is ${decision.verdict} but momentum score is weak (${decision.momentumScore}).`);
  }
  if (isHighConviction && decision.marketRegime?.regime && ["NEUTRAL", "SELECTIVE_RISK_ON"].includes(decision.marketRegime.regime)) {
    contradictions.push(`Market regime is only ${decision.marketRegime.regime}, not broad RISK_ON — a high-conviction call here needs the setup's own strength to justify going against a lukewarm tape.`);
  }
  if (Number.isFinite(decision.eventRiskScore) && decision.eventRiskScore > 0 && isHighConviction) {
    contradictions.push(`A real event-risk factor is active (score ${decision.eventRiskScore}) even though it did not block the trade outright.`);
  }
  if (decision.riskOverride) {
    contradictions.push(`Risk policy already downgraded this from ${decision.riskOverride.from} to ${decision.riskOverride.to}: ${decision.riskOverride.reasons.join(" ")}`);
  }
  if (Number.isFinite(decision.dataQuality) && decision.dataQuality < 100 && isHighConviction) {
    contradictions.push(`Data quality is ${decision.dataQuality}/100, not fully healthy, for a high-conviction call.`);
  }
  return contradictions;
}

function pickStrongestCounterargument(decision, contradictions) {
  // Preference order: an active real blocker (the risk layer's own
  // strongest concern) > a detected contradiction > a genuine model-
  // confidence gap > an honest "nothing found" disclosure. Never invents
  // a counterargument when none of these real signals are present.
  if (decision.blockers?.length) return decision.blockers[0];
  if (contradictions.length) return contradictions[0];
  if (Number.isFinite(decision.modelConfidence) && decision.modelConfidence < 60) {
    return `Model confidence is only ${decision.modelConfidence}/100 — the inputs behind this call are incomplete or uncalibrated, not because the setup itself looks weak.`;
  }
  return "No real, evidence-backed counterargument found in the current data. This does not mean the trade is risk-free — only that no active contradiction was detected against today's data.";
}

function buildRedTeamReview(decision) {
  if (!decision) return null;
  const contradictions = findContradictions(decision);
  return {
    thesis: decision.reasons || [],
    strongestCounterargument: pickStrongestCounterargument(decision, contradictions),
    contradictions,
    invalidation: decision.invalidation ?? null,
    conditionsToFlip: decision.changeMyMind || [],
    reviewedVerdict: decision.verdict,
    isHighConviction: BUY_FAMILY.has(decision.verdict),
    // Red-Team review is evidence only — it can never itself become the
    // trade's verdict (per spec). Consumers must keep reading
    // decision.verdict as the one canonical answer.
    engineVersion: "red-team-v1",
  };
}

module.exports = { buildRedTeamReview };
