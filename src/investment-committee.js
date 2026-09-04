"use strict";

// investment-committee.js — real disagreement-surfacing layer over the
// canonical pipeline's already-computed signals (2026-09-04, direct user
// spec: "Investment Committee... run separate evaluations... expose
// disagreements. A trade cannot receive STRONG_BUY when a critical
// reviewer identifies unresolved stale data, accounting, liquidity,
// corporate-action, or event risk.").
//
// This does NOT compute a new score or a second verdict — asset-
// decision.js's own applyRiskPolicy remains the one place a verdict can
// be changed. This module packages signals the canonical pipeline
// (opportunity-engine.js's red-flag/reversal detection, data-health-
// engine.js, event-risk-engine.js, market-regime-engine.js) already
// computes into a structured, explainable per-reviewer read, and derives
// one real boolean (blocksStrongBuy) that asset-decision.js applies
// additively. Reviewers with no real input available at this pipeline
// stage today are honestly marked NOT_EVALUATED — never fabricated, and
// never allowed to trigger blocksStrongBuy (blocking on the absence of
// data would be a fabricated finding, not a real one).
//
// Fundamental quality, accounting/valuation, and portfolio correlation
// are real, disclosed gaps: no fundamentals or open-position correlation
// data reaches buildAssetDecision's call site today. Wiring those in is
// separate, later work — not faked here to look complete.

const REVIEWER_KEYS = [
  "technicalTiming", "macroRegimeFit", "adversarialBearCase",
  "dataQuality", "eventRisk",
  "fundamentalQuality", "accountingValuation", "portfolioCorrelation",
];

function reviewerResult(verdict, reason) {
  return { verdict, reason };
}

function computeInvestmentCommittee({ opportunity, marketRegime, dataHealth, eventRisk } = {}) {
  const reviewers = {};

  // 1. Technical timing — real entry-stage/chase-risk read.
  const stage = opportunity?.entryStage;
  const chaseBand = opportunity?.chaseRisk;
  if (stage == null) {
    reviewers.technicalTiming = reviewerResult("NOT_EVALUATED", "No real entry-stage data available.");
  } else if (chaseBand === "DO_NOT_CHASE" || chaseBand === "EXTENDED") {
    reviewers.technicalTiming = reviewerResult("CONCERN", `Entry stage is ${stage}, chase risk ${chaseBand} — timing is not clean right now.`);
  } else if (stage === "STRUCTURE_BROKEN") {
    reviewers.technicalTiming = reviewerResult("CONCERN", "Structure is broken — no real valid entry level exists.");
  } else {
    reviewers.technicalTiming = reviewerResult("SUPPORTIVE", `Entry stage ${stage}, no real chase-risk flag.`);
  }

  // 2. Macro/regime fit — real regime classification.
  if (!marketRegime?.regime) {
    reviewers.macroRegimeFit = reviewerResult("NOT_EVALUATED", "No real market-regime data available.");
  } else if (marketRegime.regime === "CRISIS" || marketRegime.regime === "RISK_OFF") {
    reviewers.macroRegimeFit = reviewerResult("CONCERN", `Real regime is ${marketRegime.regime} — unfavorable for new long risk.`);
  } else if (marketRegime.regime === "RISK_ON") {
    reviewers.macroRegimeFit = reviewerResult("SUPPORTIVE", "Real regime is RISK_ON.");
  } else {
    reviewers.macroRegimeFit = reviewerResult("NEUTRAL", `Real regime is ${marketRegime.regime}.`);
  }

  // 3. Adversarial bear case — real red-flag/reversal-top-risk read.
  const criticalFlags = Number(opportunity?.criticalFlags) || 0;
  const reversalTopRisk = !!opportunity?.reversalTopRisk;
  if (opportunity?.redFlags == null && !reversalTopRisk) {
    reviewers.adversarialBearCase = reviewerResult("NOT_EVALUATED", "No real red-flag data available.");
  } else if (criticalFlags > 0) {
    reviewers.adversarialBearCase = reviewerResult("CONCERN", `${criticalFlags} real critical red flag${criticalFlags === 1 ? "" : "s"} active.`);
  } else if (reversalTopRisk) {
    reviewers.adversarialBearCase = reviewerResult("CONCERN", "Real reversal-top risk detected — this could be a local top, not a continuation.");
  } else {
    reviewers.adversarialBearCase = reviewerResult("SUPPORTIVE", "No real critical red flags or reversal-top risk detected.");
  }

  // 4. Data quality — real freshness/availability read.
  if (!dataHealth) {
    reviewers.dataQuality = reviewerResult("NOT_EVALUATED", "No real data-health read available.");
  } else if (!dataHealth.canTrade) {
    reviewers.dataQuality = reviewerResult("CONCERN", `Required data sources not healthy: ${(dataHealth.blockers || []).join("; ") || "unspecified"}.`);
  } else if (dataHealth.status === "DEGRADED" || dataHealth.status === "POOR") {
    reviewers.dataQuality = reviewerResult("NEUTRAL", `Data health is ${dataHealth.status} but not blocking.`);
  } else {
    reviewers.dataQuality = reviewerResult("SUPPORTIVE", "Required data sources are healthy and fresh.");
  }

  // 5. Event risk — real earnings/macro-event read.
  if (!eventRisk) {
    reviewers.eventRisk = reviewerResult("NOT_EVALUATED", "No real event-risk read available.");
  } else if (eventRisk.blocksNewExposure) {
    reviewers.eventRisk = reviewerResult("CONCERN", eventRisk.reason || "A high-impact event blocks new exposure.");
  } else {
    reviewers.eventRisk = reviewerResult("SUPPORTIVE", "No real blocking event risk detected.");
  }

  // 6-8. Genuinely not wired to this pipeline stage yet — see file header.
  reviewers.fundamentalQuality = reviewerResult("NOT_EVALUATED", "Fundamentals are not yet threaded into this pipeline stage.");
  reviewers.accountingValuation = reviewerResult("NOT_EVALUATED", "Accounting/valuation signals are not yet threaded into this pipeline stage.");
  reviewers.portfolioCorrelation = reviewerResult("NOT_EVALUATED", "Portfolio-correlation data is not yet threaded into this pipeline stage.");

  const concerns = REVIEWER_KEYS.filter((k) => reviewers[k].verdict === "CONCERN");
  const evaluatedCount = REVIEWER_KEYS.filter((k) => reviewers[k].verdict !== "NOT_EVALUATED").length;
  const supportiveCount = REVIEWER_KEYS.filter((k) => reviewers[k].verdict === "SUPPORTIVE").length;

  return {
    reviewers,
    criticalConcerns: concerns,
    // A genuine split — at least one real reviewer flags concern while at
    // least one other is genuinely supportive. Never true off a
    // NOT_EVALUATED reviewer.
    disagreement: concerns.length > 0 && supportiveCount > 0,
    // Scoped to the reviewers this module can actually evaluate today
    // (data quality, event risk, adversarial bear case) — never blocks on
    // a NOT_EVALUATED reviewer, since that would be blocking on the
    // absence of data, not a real finding.
    blocksStrongBuy: reviewers.dataQuality.verdict === "CONCERN" || reviewers.eventRisk.verdict === "CONCERN" || reviewers.adversarialBearCase.verdict === "CONCERN",
    evaluatedCount, totalReviewers: REVIEWER_KEYS.length,
    engineVersion: "investment-committee-v1",
  };
}

module.exports = { computeInvestmentCommittee, REVIEWER_KEYS };
