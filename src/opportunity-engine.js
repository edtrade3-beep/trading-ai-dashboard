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

// Market Fingerprint (Phase 2, 2026-08-26) — packages fields
// computeOpportunity ALREADY computes into one named object for a
// cleaner Sniper Mode display. Zero new computation — pure bundling of
// real values already sitting in scope (regime/sectorInfo/entryStage/row
// fields), matching the spec's REGIME/SECTOR/STRUCTURE/RELATIVE
// STRENGTH/VOLUME/LIQUIDITY/VWAP/VOLATILITY/OPTIONS/CATALYST/ENTRY
// QUALITY list. Every field honestly null when its real input is absent.
function buildMarketFingerprint({ regime, sectorInfo, entryStage, row, vwap20, riskPct, optionsStatus, entryScore }) {
  return {
    regime: regime?.label || null,
    sector: sectorInfo ? { rank: sectorInfo.rank, of: sectorInfo.of } : null,
    structure: entryStage || null,
    relativeStrength: Number.isFinite(row.rsRating) ? row.rsRating : null,
    volume: Number.isFinite(row.volRatio) ? row.volRatio : null,
    liquidity: Number.isFinite(row.dollarVolume) ? row.dollarVolume : null,
    vwap: Number.isFinite(vwap20)
      ? { level: vwap20, above: Number.isFinite(row.price) ? row.price >= vwap20 : null }
      : null,
    volatility: Number.isFinite(riskPct) ? riskPct : null,
    options: optionsStatus || null,
    catalyst: Number.isFinite(row.epsGrowth) ? { epsGrowthPct: row.epsGrowth } : null,
    entryQuality: Number.isFinite(entryScore) ? entryScore : null,
  };
}

// Counterfactual EV (Phase 2, 2026-08-26, spec's "Wait Engine" /
// "Counterfactual Engine": "what would need to change?"). For WAIT/
// EXTENDED tiers only — re-runs the SAME real computeExpectedValue
// formula at two real price points: the real pivot (entry-engine.js's
// already-computed breakout-level reference, entryPlan.pivot — a
// disciplined re-entry) versus the real current live quote (livePrice —
// what chasing right now would actually cost). Same real
// stop/target/probability both times; only the entry price changes.
//
// This comparison, not "vs. the existing expectedValue field," is the
// real, non-redundant one: expectedValue itself is ALREADY computed at
// row.entry (the pivot, per the AMD EV-basis fix above) for every tier,
// so a counterfactual also anchored to the pivot would silently equal
// expectedValue in the common case where row.entry === entryPlan.pivot —
// confirmed live against production data (2026-08-26, ABNB: both read
// -1.49%, a no-op comparison). Comparing against the real live price
// instead answers the spec's actual question ("what needs to change")
// with two genuinely different, real numbers: the cost of chasing now
// vs. the real payoff of waiting for the disciplined level.
//
// Uses entryPlan.pivot rather than entryPlan.retestZone deliberately:
// buildEvFromRow (watchlist-setup-alerts.js) hardcodes atr: null for
// every caller (no real intraday ATR exists at this daily-scan-row
// level), and computeEntryZones' own real ATR-band formula returns null
// zones whenever atr is null — so retestZone is structurally ALWAYS null
// throughout this entire pipeline today, confirmed by reading both
// files. A counterfactual keyed to it would silently never fire.
//
// Honestly null when there's no real pivot, no real live price, or the
// real probability itself is null (insufficient sample) — never
// fabricates a number to fill the gap.
function computeCounterfactualEv({ tier, probability, entryPlan, spreadPct, livePrice }) {
  if (tier !== "WAIT" && tier !== "EXTENDED") return null;
  const hypotheticalEntry = entryPlan?.pivot;
  if (!Number.isFinite(hypotheticalEntry) || !Number.isFinite(livePrice)) return null;
  const expectedValue = computeExpectedValue({ winRate: probability, entry: hypotheticalEntry, stop: entryPlan.stop, target: entryPlan.target1, spreadPct });
  if (expectedValue == null) return null;
  // Real bug found against live production data (2026-08-26, AMD): a
  // WAIT-tier symbol's live price often sits BELOW the real stop (price
  // hasn't reached the pivot yet — the stop is benchmarked to the pivot,
  // not today's price), the exact same "entry below stop" structural
  // invalidity as the earlier AMD EV-basis bug. Computing a "chase EV"
  // there produced a nonsensical, large fake-looking positive number.
  // Only compute the chase comparison when livePrice is a structurally
  // valid long entry (above the real stop) — otherwise chasing "now"
  // isn't a real, evaluable trade at all, so this honestly stays null
  // rather than showing a number that looks real but describes an
  // invalid setup.
  const chaseIsValidEntry = Number.isFinite(entryPlan.stop) && livePrice > entryPlan.stop;
  const chaseExpectedValue = chaseIsValidEntry
    ? computeExpectedValue({ winRate: probability, entry: livePrice, stop: entryPlan.stop, target: entryPlan.target1, spreadPct })
    : null;
  return {
    hypotheticalEntry, expectedValue, chaseExpectedValue,
    note: `Waiting for a real pullback to the $${hypotheticalEntry} pivot: EV ${expectedValue > 0 ? "+" : ""}${expectedValue}%.` +
      (chaseExpectedValue != null
        ? ` Chasing now at $${livePrice}: EV ${chaseExpectedValue > 0 ? "+" : ""}${chaseExpectedValue}%.`
        : ` Chasing now at $${livePrice} isn't a valid entry — it's already below this setup's real stop level.`),
  };
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

  const fingerprint = buildMarketFingerprint({
    regime, sectorInfo, entryStage: entryPlan.stage, row, vwap20: ev.vwap20, riskPct: row.riskPct,
    optionsStatus: options.status, entryScore: aPlusScore,
  });
  const counterfactual = computeCounterfactualEv({ tier, probability, entryPlan, spreadPct, livePrice: row.price });

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
    fingerprint,
    counterfactual,
    criticalFlags: redFlagResult.criticalCount,
    redFlags: redFlagResult.flags,
  };
}

module.exports = {
  computeOpportunity, computeExpectedValue, classifyOpportunityTier, checkOptionsConfirmsStructure,
  buildMarketFingerprint, computeCounterfactualEv,
};
