"use strict";

// opportunity-engine.js — Market Opportunity Engine, Phase 1 "one brain"
// wrapper (user's 36-section spec, 2026-08-25 — "Use one unified
// mathematical engine"). computeOpportunity introduces ZERO new signal
// math for anything that already exists: score/verdict/reasons come
// straight from am-core-engine.js (the SAME real engine every other
// surface in this app already uses, and the exact real assembly order
// watchlist-setup-alerts.js's own working alert pipeline already proved
// — buildEvFromRow -> computeEntryPlan -> computeRedFlags ->
// computeAPlusScore -> computeCoreScore -> classifyCoreVerdict). This
// file adds exactly the 3 pieces the spec calls for that were genuinely
// missing anywhere in the codebase:
//   1. computeExpectedValue — a real probability x EV - costs formula
//   2. classifyOpportunityTier — the spec's 5-tier vocabulary (today's
//      classifyCoreVerdict collapses EXTENDED and INVALIDATED into one
//      AVOID_LONG)
//   3. checkOptionsConfirmsStructure — the spec's explicit non-negotiable
//      (options-math.js's interpretFlowRow was confirmed, by a full read,
//      to never cross-check its bullish/bearish read against the real
//      underlying technical structure)
// Every honest-null case (insufficient win-rate sample, no options flow
// data, no real executable entry yet) stays null here — never fabricated.

const { computeEntryPlan } = require("./entry-engine");
const { computeRedFlags } = require("./red-flag-engine");
const { computeCoreScore, classifyCoreVerdict } = require("./am-core-engine");
const { computeAPlusScore } = require("./trade-planner-scoring");
const { buildEvFromRow } = require("./watchlist-setup-alerts");
const { winProbFor } = require("./institutional-scoring");

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

// EV = P(favorable) x ExpectedGain - P(adverse) x ExpectedLoss - Costs
// (spec's own verbatim formula). winRate is the real historical bucketed
// win rate from winProbFor — honest null on insufficient sample, which
// this function passes straight through as a null EV rather than ever
// substituting a fabricated 50/50 guess. Costs = a real bid/ask spread
// when the caller has one (spreadPct) + one disclosed flat slippage
// assumption — never a silently-zero cost.
const DISCLOSED_SLIPPAGE_PCT = 0.05;
function computeExpectedValue({ winRate, entry, stop, target, spreadPct }) {
  if (winRate == null || !Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(target) || entry <= 0) return null;
  const pFavorable = Math.max(0, Math.min(1, winRate / 100));
  const pAdverse = 1 - pFavorable;
  const gainPct = ((target - entry) / entry) * 100;
  const lossPct = ((entry - stop) / entry) * 100;
  const costsPct = (Number.isFinite(spreadPct) ? spreadPct : 0) + DISCLOSED_SLIPPAGE_PCT;
  return round2(pFavorable * gainPct - pAdverse * lossPct - costsPct);
}

// Spec's 5-tier vocabulary (section 21), mapped from the SAME real
// verdict (classifyCoreVerdict), entry-stage (computeEntryPlan), and
// anti-chase band (computeAntiChase) states already in play — no new
// detection logic. Today's single AVOID_LONG verdict genuinely conflates
// two different real situations: a setup that's simply too extended to
// chase right now (real, still-valid structure, just bad timing) vs one
// whose structure is actually broken or gated by a critical red flag —
// this is the one real split this phase adds.
//
// Chase-blocked is checked BEFORE the verdict branches, not only inside
// the AVOID_LONG branch: entry-engine.js's own hard gate
// (classifyCoreVerdict's doNotChaseZone check) only fires AVOID_LONG for
// band DO_NOT_CHASE — band EXTENDED alone just blocks entryPrice and
// typically lands on WATCH (no real executable entry yet), NOT
// AVOID_LONG. A setup extended-but-real still belongs in EXTENDED, not
// silently absorbed into DEVELOPING just because the verdict cascade
// landed on WATCH for an unrelated reason.
//
// `structurallyInvalid` (real, caller-computed — see computeOpportunity)
// separates two very different AVOID_LONG causes classifyCoreVerdict's
// hard-gate cascade otherwise collapses into one verdict: a genuinely
// broken/bearish thesis (structure broken, critical red flag, Stage 4,
// bearish daily trend) vs. an intact setup that simply doesn't clear the
// Entry Score floor for a NEW long yet. Verified against live production
// data (2026-08-25): without this split, ~93% of the real scan universe
// landed in INVALIDATED purely off the entry-score gate, mislabeling
// plenty of genuinely-developing setups as dead. The entry-score-only
// case reads as WAIT — not ready for a new position right now, but not a
// broken thesis either.
function classifyOpportunityTier({ verdict, entryStage, antiChaseBand, structurallyInvalid }) {
  const chaseBlocked = antiChaseBand === "EXTENDED" || antiChaseBand === "DO_NOT_CHASE";
  if (verdict === "AVOID_LONG") {
    if (chaseBlocked) return "EXTENDED";
    return structurallyInvalid ? "INVALIDATED" : "WAIT";
  }
  if (chaseBlocked) return "EXTENDED";
  if ((verdict === "EARLY_BUY" || verdict === "BUY") &&
      (entryStage === "BREAKOUT" || entryStage === "RETEST" || entryStage === "CONFIRMATION")) {
    return "ACTIONABLE";
  }
  if (verdict === "WATCH") return "DEVELOPING";
  return "WAIT";
}

// Options-vs-structure cross-check (spec section 13's explicit non-
// negotiable: "Never automatically interpret unusual call activity as
// bullish... determine whether options activity confirms or contradicts
// the underlying market structure"). Reuses the SAME real call/put
// notional ratio am-core-engine.js's own catalyst bucket already computes
// from optionsFlow — no second, competing options-interpretation
// pathway invented alongside options-math.js's real interpretFlowRow
// (that function reads a single trade print for the Options Chain/Gamma
// Lab UI; this is a symbol-level structure cross-check, a different real
// question).
function checkOptionsConfirmsStructure({ optionsFlow, verdict }) {
  const callN = Number(optionsFlow?.callNotional), putN = Number(optionsFlow?.putNotional);
  const total = (Number.isFinite(callN) ? callN : 0) + (Number.isFinite(putN) ? putN : 0);
  if (total <= 0) return { status: "NO_DATA", note: "No real options flow data available for this symbol." };
  const callRatio = callN / total;
  const optionsLeansBullish = callRatio > 0.55;
  const optionsLeansBearish = callRatio < 0.45;
  const structureBullish = verdict === "EARLY_BUY" || verdict === "BUY" || verdict === "WATCH";
  const structureBearish = verdict === "AVOID_LONG";
  if (optionsLeansBullish && structureBearish) {
    return { status: "CONTRADICTS", note: `Options flow leans bullish (${round2(callRatio * 100)}% call notional) but the real technical structure reads ${verdict} — do not treat this as bullish confirmation.` };
  }
  if (optionsLeansBearish && structureBullish) {
    return { status: "CONTRADICTS", note: `Options flow leans bearish (${round2((1 - callRatio) * 100)}% put notional) while the real technical structure reads ${verdict} — a real disagreement, not a confirming signal.` };
  }
  if ((optionsLeansBullish && structureBullish) || (optionsLeansBearish && structureBearish)) {
    return { status: "CONFIRMS", note: "Options flow direction agrees with the real technical structure." };
  }
  return { status: "NEUTRAL", note: "Options flow is not directionally decisive either way." };
}

// The one standardized Opportunity Object (spec section 32). `row` is a
// real screenTrendTemplate/screenWatchlistCached row, `regime` is
// computeRegime's real output, `marketRegime` is
// regimeToEntryVocabulary(regime.label) — the exact same three inputs
// watchlist-setup-alerts.js's own real, already-shipped alert pipeline
// already assembles from. `sectorInfo`/`adx`/`optionsFlow`/`trackReport`/
// `spreadPct` are optional real enrichments this phase adds on top of
// that pipeline (watchlist-setup-alerts.js passes sectorInfo/adx/
// optionsFlow as null today) — every one honestly degrades, never
// fabricates, when the caller doesn't have it.
function computeOpportunity({ symbol, row, regime, marketRegime, sectorInfo = null, adx = null, optionsFlow = null, trackReport = null, spreadPct = null }) {
  if (!row || row.error) return null;

  const ev = buildEvFromRow(row, marketRegime);
  const entryPlan = computeEntryPlan(ev);
  const redFlagResult = computeRedFlags(ev);
  const { score: aPlusScore } = computeAPlusScore(row, regime);
  const coreScore = computeCoreScore({
    passCount: row.passCount, rsRating: row.rsRating, momentum: row.momentum,
    stage: row.stage, volRatio: row.volRatio, regime, sectorInfo,
    adx, smc: row.smc, epsGrowth: row.epsGrowth, vcpScore: row.vcpScore,
    riskPct: row.riskPct, pctFromHigh: row.pctFromHigh, antiChase: ev.antiChase,
    optionsFlow, dollarVolume: row.dollarVolume,
  });
  const deep = classifyCoreVerdict({
    score: coreScore.score, entryPlan, redFlagResult,
    stage: row.stage, dailyBias: ev.dailyBias, entryScore: aPlusScore,
    hasPosition: false,
  });
  if (!deep) return null; // SHORT direction or otherwise unclassifiable — honest null, never a guess

  const winProb = trackReport ? winProbFor(trackReport, coreScore.score) : null;
  const probability = winProb?.winRate != null ? round2(winProb.winRate) : null;
  const probabilitySampleCount = winProb?.count ?? null;
  const probabilityHorizonDays = winProb?.horizon ?? null;

  // EV must use row.entry — the SAME real reference level buildEvFromRow's
  // target1 formula was computed against (target1 = row.entry + 1R) — not
  // entryPlan.entryPrice. Real bug found against live production data
  // (2026-08-25, AMD): entry-engine.js's EARLY/CONFIRMATION/RETEST stages
  // set entryPrice = ev.price (the CURRENT live quote, a starter-entry
  // price), which is a genuinely different real reference than row.entry
  // (the pivot-based level stop/target1 are keyed off). Mixing the two —
  // current price as "entry" against a pivot-relative stop/target — put
  // AMD's stop ($516.55) ABOVE its entry ($476), and the resulting EV
  // math (mismatched gain/loss basis) produced a nonsensical +14.68% EV
  // at a 33% real win rate. row.entry is always the correct, internally-
  // consistent basis regardless of stage.
  const expectedValue = computeExpectedValue({
    winRate: probability, entry: row.entry, stop: entryPlan.stop, target: entryPlan.target1, spreadPct,
  });

  // Same real conditions classifyCoreVerdict's own hard-gate cascade
  // checks (am-core-engine.js) BEFORE the entry-score-floor branch —
  // recomputed here (not re-derived from deep.reason's string) so tiering
  // never depends on parsing free-text, only on the same real structured
  // inputs the verdict engine itself already used.
  const structurallyInvalid = entryPlan.stage === "STRUCTURE_BROKEN"
    || redFlagResult.criticalCount > 0
    || String(row.stage || "").startsWith("Stage 4")
    || ev.dailyBias === "BEARISH";
  const tier = classifyOpportunityTier({ verdict: deep.verdict, entryStage: entryPlan.stage, antiChaseBand: ev.antiChase?.band, structurallyInvalid });
  const options = checkOptionsConfirmsStructure({ optionsFlow, verdict: deep.verdict });

  return {
    symbol,
    price: row.price,
    regime: regime?.label || null,
    verdict: deep.verdict,
    verdictReason: deep.reason,
    tier,
    score: coreScore.score,
    breakdown: coreScore.breakdown,
    reasons: coreScore.reasons,
    probability,
    probabilitySampleCount,
    probabilityHorizonDays,
    expectedValue,
    entryScore: aPlusScore,
    entryStage: entryPlan.stage,
    chaseRisk: ev.antiChase?.band || null,
    entry: row.entry ?? null,
    // Real, honest distinction (entry-engine.js's own core fix): a pivot/
    // reference entry level always exists, but a right-now EXECUTABLE
    // entry only exists in BREAKOUT/RETEST/CONFIRMATION(near-pivot)/EARLY
    // — null everywhere else (FOUNDATION/NONE/STRUCTURE_BROKEN/
    // FAILED_BREAKOUT), never fabricated as "actionable now."
    executableEntry: Number.isFinite(entryPlan.entryPrice) ? entryPlan.entryPrice : null,
    stop: entryPlan.stop,
    target: entryPlan.target1,
    invalidation: entryPlan.invalidation,
    options,
    criticalFlags: redFlagResult.criticalCount,
    redFlags: redFlagResult.flags,
  };
}

module.exports = { computeOpportunity, computeExpectedValue, classifyOpportunityTier, checkOptionsConfirmsStructure };
