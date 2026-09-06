"use strict";

// trade-outcome-classifier.js — the platform's decision-vs-outcome taxonomy
// (platform-consolidation Part 13, 2026-09-06): the standard trading-
// psychology distinction between "was this a good DECISION" (knowable at
// entry) and "was this a good OUTCOME" (only knowable after the fact) — a
// good decision can still lose, and a bad decision can still win. Takes
// trade-autopsy.js's own real classifyExit() result as a parameter
// (computed by the caller, which already needs it for its own grading)
// rather than importing trade-autopsy.js directly — that file's real
// checkTradeAutopsy() will call into this one, so importing it back here
// would be a circular require.
//
// Real, disclosed scope limit: decision quality is read off the real
// tier ("A"/"B") server-autopilot.js already assigns at entry to size
// positions (A = full risk, B = half risk) — the platform's own real
// capital-allocation judgment of setup quality, not a new invented score.
// Journal entries without a real "A"/"B" tier (untagged manual trades,
// lightbox's "DAYTRADE" tag, or no journal match at all) are honestly
// UNCLASSIFIED rather than guessed.
//
// SYSTEM_ERROR and MARKET_RANDOMNESS are NOT auto-assigned. No real,
// reliable signal exists anywhere in this codebase today to distinguish
// "a genuine platform bug affected this specific closed trade" or "an
// outlier market event overrode an otherwise-sound plan" from an ordinary
// good-decision loss — inventing a heuristic for either would be exactly
// the fabrication this app's own conventions (see classifyExit's header)
// consistently refuse to do. Both labels are exported in TRADE_OUTCOMES
// so a human can apply them manually (e.g. a journal-note override), but
// the automatic classifier only ever returns one of the other five.

const TRADE_OUTCOMES = [
  "GOOD_TRADE_GOOD_OUTCOME", "GOOD_TRADE_BAD_OUTCOME",
  "BAD_TRADE_GOOD_OUTCOME", "BAD_TRADE_BAD_OUTCOME",
  "EXECUTION_ERROR",
  // Manual-only — see header comment. Never returned by classifyTradeOutcome.
  "SYSTEM_ERROR", "MARKET_RANDOMNESS",
  "UNCLASSIFIED",
];

function classifyTradeOutcome(trade, match, exit) {
  if (!match || !match.entry || !match.stop) {
    return { outcome: "UNCLASSIFIED", reason: "No real plan on file (untagged/manual entry) — nothing to grade the decision against." };
  }

  if (exit?.verdict === "stop_violated") {
    return {
      outcome: "EXECUTION_ERROR",
      reason: `Exit ($${Number(trade.exit).toFixed(2)}) landed materially past the real stop ($${Number(match.stop).toFixed(2)}) — the fill failed to honor the real risk plan, independent of whether the original setup was sound.`,
      rMultiple: exit?.rMultiple ?? null,
    };
  }

  const decisionQualityKnown = match.tier === "A" || match.tier === "B";
  if (!decisionQualityKnown) {
    return { outcome: "UNCLASSIFIED", reason: `No real A/B decision-quality tier on file (tier: ${match.tier ?? "none"}) — logged for the record only.` };
  }

  const goodTrade = match.tier === "A";
  // >= 0 (code review, 2026-09-06): an exact-$0 breakeven close (e.g. a
  // commission-free scratch exit) is not a bad outcome — `> 0` would have
  // misclassified it as one, skewing tallyTradeOutcomes' rollup.
  const goodOutcome = Number(trade.pnl) >= 0;
  const outcome = goodTrade
    ? (goodOutcome ? "GOOD_TRADE_GOOD_OUTCOME" : "GOOD_TRADE_BAD_OUTCOME")
    : (goodOutcome ? "BAD_TRADE_GOOD_OUTCOME" : "BAD_TRADE_BAD_OUTCOME");
  return { outcome, tier: match.tier, rMultiple: exit?.rMultiple ?? null };
}

module.exports = { classifyTradeOutcome, TRADE_OUTCOMES };
