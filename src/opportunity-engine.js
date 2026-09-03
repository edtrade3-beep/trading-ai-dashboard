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
const { computeCoreScore, classifyCoreVerdict, computeBearishScore, classifyBearishVerdict } = require("./am-core-engine");
const { computeAPlusScore } = require("./trade-planner-scoring");
const { buildEvFromRow } = require("./setup-evidence");
const { winProbFor } = require("./institutional-scoring");
const { getUpcomingMacroEvents } = require("./macro-calendar");
const { computeReversalDetector, computeReversalTopRisk } = require("./sniper-decision");

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
function classifyOpportunityTier({ verdict, entryStage, antiChaseBand, structurallyInvalid, reversalTopRisk = false }) {
  // reversalTopRisk folded into the same "EXTENDED" tier as the anti-chase
  // bands (2026-09-01 sniper merge) — semantically the same real class of
  // gate: too risky to enter RIGHT NOW (temporary technical exhaustion),
  // not a permanent structural disqualification like INVALIDATED covers.
  const chaseBlocked = antiChaseBand === "EXTENDED" || antiChaseBand === "DO_NOT_CHASE" || reversalTopRisk;
  if (verdict === "AVOID_LONG") {
    if (chaseBlocked) return "EXTENDED";
    return structurallyInvalid ? "INVALIDATED" : "WAIT";
  }
  if (chaseBlocked) return "EXTENDED";
  // Real bug fix (Autopilot goal audit, 2026-08-30): entry-engine.js's own
  // "EARLY" entryStage (computeEntryPlan) carries a real, non-null
  // entryPrice — a genuinely executable setup, same as BREAKOUT/RETEST/
  // CONFIRMATION — but was missing from this check, so an EARLY_BUY-
  // verdict, EARLY-stage row (exactly the "caught it before it became
  // obvious" case the platform's own stated goal cares most about) fell
  // through to the final `return "WAIT"` below and was indistinguishable
  // from a setup that genuinely isn't ready yet. Included now.
  if ((verdict === "EARLY_BUY" || verdict === "BUY") &&
      (entryStage === "EARLY" || entryStage === "BREAKOUT" || entryStage === "RETEST" || entryStage === "CONFIRMATION")) {
    return "ACTIONABLE";
  }
  if (verdict === "WATCH") return "DEVELOPING";
  return "WAIT";
}

// Unified EARLY/DEVELOPING/CONFIRMED/LATE/FAILED/EXIT display vocabulary
// (Autopilot goal spec, 2026-08-30) — a pure translation layer over the
// two real classifiers that already exist (classifyOpportunityTier above,
// for pre-entry candidates; position-decision-engine.js's computePositionState,
// for open positions), NOT a merge of the two functions themselves. Each
// keeps its own real vocabulary for its own existing consumers (tiers.
// actionable/.../invalidated groupings, HARD_EXIT/TAKE_PARTIAL/TRAIL/
// WARNING/HOLD position-management branches) — nothing about how either
// one is COMPUTED changes here. This only gives a caller that wants one
// consistent label spanning both pre- and post-entry (e.g. a single
// Autopilot activity/opportunity feed) a real, honest way to display that,
// instead of two different vocabularies bleeding into one UI.
function toOpportunityStage({ tier, entryStage } = {}) {
  if (tier === "ACTIONABLE") return entryStage === "EARLY" ? "EARLY" : "CONFIRMED";
  if (tier === "DEVELOPING") return "DEVELOPING";
  if (tier === "WAIT") return "DEVELOPING"; // not yet actionable, not dead — same real meaning as DEVELOPING in this vocabulary
  if (tier === "EXTENDED") return "LATE";
  if (tier === "INVALIDATED") return "FAILED";
  return null; // honest null — never guess a stage for an unrecognized/missing tier
}

// Same translation for an OPEN position's real state (position-decision-
// engine.js's computePositionState) — the vocabulary's one EXIT value.
// HOLD/WARNING/TRAIL/TAKE_PARTIAL are all "still an active, managed
// position" in this coarser 6-value vocabulary — WARNING/TRAIL/
// TAKE_PARTIAL keep their own real distinct meaning wherever
// computePositionState's own output is already shown directly; this is
// only for a caller that wants the SAME 6-value label used for pre-entry
// opportunities to also cover open positions.
function toOpportunityStageFromPosition(positionState) {
  if (positionState === "HARD_EXIT" || positionState === "EXIT") return "EXIT";
  if (positionState === "TAKE_PARTIAL" || positionState === "TRAIL" || positionState === "WARNING" || positionState === "HOLD") return "CONFIRMED";
  return null;
}

// High-level LONG/SHORT/WAIT/NO_TRADE/EXIT display vocabulary (Central
// Opportunity & Options Engine goal, 2026-08-30: "The central engine must
// produce ONE final verdict. Allowed high-level verdicts: LONG / SHORT /
// WAIT / NO TRADE / EXIT"). A pure translation over
// am-core-engine.js's classifyCoreVerdict output — that function's own
// real vocabulary (EARLY_BUY/BUY/WATCH/WAIT/AVOID_LONG pre-entry,
// EXIT/TAKE_PROFIT/HOLD in-position) is untouched and stays the field
// every existing consumer reads; this only gives a caller that wants the
// coarser 5-value label a real, honest way to show it.
//
// SHORT is deliberately never returned here. classifyCoreVerdict itself
// returns null for input.direction === "SHORT" (its own header: "this
// app's real short-side signal maturity hasn't been audited with the
// same rigor the long-side engines got"). Faking a SHORT label off a
// bearish dailyBias/AVOID_LONG read would be exactly the kind of
// invented conclusion this goal explicitly prohibits ("never invent
// data... a competing decision engine") — so a genuinely bearish setup
// honestly reads NO_TRADE, same as any other real reason a long isn't
// valid right now, not a fabricated SHORT call this platform has no real
// execution/risk engine to back.
function toHighLevelVerdict(coreVerdict) {
  if (coreVerdict === "EARLY_BUY" || coreVerdict === "BUY" || coreVerdict === "HOLD") return "LONG";
  if (coreVerdict === "WATCH" || coreVerdict === "WAIT") return "WAIT";
  if (coreVerdict === "AVOID_LONG") return "NO_TRADE";
  if (coreVerdict === "EXIT" || coreVerdict === "TAKE_PROFIT") return "EXIT";
  return null; // honest null for an unrecognized/missing verdict — never a guessed label
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

// Real, honest, disclosed bearish stop/target — added 2026-08-31
// (bidirectional trading, "trade up and down"). There is no bearish
// counterpart to entry-engine.js's pivot/contractionLow machinery in this
// codebase (that module is long-only, and computeOpportunity takes no raw
// bars/ATR input to compute one independently — it stays a pure,
// fetch-free function per its own header). Rather than invent a new
// structural-level detector or thread raw bars through 13+ existing
// callers, this reuses the SAME real `row.pivot` the long side already
// keys its own stop/target off, applying the real, standard technical
// convention that a broken support level becomes overhead resistance —
// the pivot becomes the short's real stop (a small 0.5% buffer above it,
// same "don't sit exactly on the level" logic most real stop placement
// uses), with target1/target2 as the same 1R/2R convention
// buildEvFromRow already uses for the long side. Only returns real levels
// when price has actually broken below the real pivot — otherwise
// honestly null, never fabricated.
function buildBearishLevels(row) {
  const price = Number(row?.price), pivot = Number(row?.pivot);
  if (!Number.isFinite(price) || !Number.isFinite(pivot) || !(price < pivot)) {
    return { stop: null, target1: null, target2: null };
  }
  const stop = round2(pivot * 1.005);
  const risk = round2(stop - price);
  if (!(risk > 0)) return { stop: null, target1: null, target2: null };
  return { stop, target1: round2(price - risk), target2: round2(price - 2 * risk) };
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
function computeOpportunity({ symbol, row, regime, marketRegime, sectorInfo = null, adx = null, optionsFlow = null, trackReport = null, spreadPct = null, nowMs = Date.now() }) {
  if (!row || row.error) return null;

  const ev = buildEvFromRow(row, marketRegime);
  const entryPlan = computeEntryPlan(ev);
  // Trade GPS Trap Shield (2026-09-03) — the real, honestly-static macro
  // calendar read (macro-calendar.js's own seed; see that file's header
  // for why it's static, not fetched). Same 48h blocking window as
  // event-risk-engine.js's own blockWithinDays=2 default, for consistency.
  const macroEvents = getUpcomingMacroEvents({ nowMs, windowHours: 48 });
  if (macroEvents.length) {
    ev.macroEventRisk = true;
    ev.macroEventReason = `${macroEvents[0].label} is imminent — new exposure blocked.`;
  }
  const redFlagResult = computeRedFlags(ev);
  const { score: aPlusScore } = computeAPlusScore(row, regime);
  const coreScore = computeCoreScore({
    passCount: row.passCount, rsRating: row.rsRating, momentum: row.momentum,
    stage: row.stage, volRatio: row.volRatio, regime, sectorInfo,
    adx, smc: row.smc, epsGrowth: row.epsGrowth, vcpScore: row.vcpScore,
    riskPct: row.riskPct, pctFromHigh: row.pctFromHigh, antiChase: ev.antiChase,
    optionsFlow, dollarVolume: row.dollarVolume,
  });
  // Sniper merge (2026-09-01 platform audit) — the real reversal-detector
  // read sniper-decision.js's own standalone verdict used to gate on
  // (NO_CHASE on reversalTopRisk), computed here off the exact same real
  // row fields screenTrendTemplate already attaches (hi52/lo52/rsi/
  // volRatio/dayChangePct/weekChangePct/ma50) — zero new fetch. Threaded
  // into classifyCoreVerdict as one more hard gate so the Master Verdict
  // itself now carries this signal, instead of it only ever showing up in
  // a second, separately-computed verdict that could disagree.
  const reversal = computeReversalDetector({
    price: row.price, hi52: row.hi52, lo52: row.lo52, rsi: row.rsi,
    rvol: row.volRatio, dayChangePct: row.dayChangePct, weekChangePct: row.weekChangePct, ma50: row.ma50,
  });
  const deep = classifyCoreVerdict({
    score: coreScore.score, entryPlan, redFlagResult,
    stage: row.stage, dailyBias: ev.dailyBias, entryScore: aPlusScore,
    hasPosition: false, reversalTopRisk: computeReversalTopRisk(row),
  });
  if (!deep) return null; // SHORT direction or otherwise unclassifiable — honest null, never a guess

  // Bearish read — additive, computed off the exact same real inputs
  // already gathered above for the long side, one scan not a second one
  // (bidirectional trading, 2026-08-31). See am-core-engine.js's
  // computeBearishScore/classifyBearishVerdict for the full v1-gap
  // disclosure: no dedicated bearish red-flag set and no real "extension
  // below breakdown" magnitude data exist yet in this codebase, so those
  // two gates simply don't fire this phase (bearishExtension/entryScore
  // left undefined) rather than being approximated with a wrong or
  // fabricated number.
  const bearishScore = computeBearishScore({
    passCount: row.passCount, rsRating: row.rsRating, momentum: row.momentum,
    stage: row.stage, volRatio: row.volRatio, regime, sectorInfo,
    adx, smc: row.smc, epsGrowth: row.epsGrowth,
    riskPct: row.riskPct, optionsFlow, dollarVolume: row.dollarVolume,
  });
  const bearishLevels = buildBearishLevels(row);
  const bearishDeep = classifyBearishVerdict({
    score: bearishScore.score, smc: row.smc, stage: row.stage, dailyBias: ev.dailyBias,
    hasPosition: false, hasRealEntry: bearishLevels.stop != null && bearishLevels.target1 != null,
  });

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
  const tier = classifyOpportunityTier({ verdict: deep.verdict, entryStage: entryPlan.stage, antiChaseBand: ev.antiChase?.band, structurallyInvalid, reversalTopRisk: !!(reversal && reversal.isTop) });
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
    // High-level LONG/WAIT/NO_TRADE/EXIT display label (see
    // toHighLevelVerdict above) — additive, `verdict` stays the real
    // am-core-engine.js field every existing consumer reads.
    highLevelVerdict: toHighLevelVerdict(deep.verdict),
    tier,
    // Unified EARLY/DEVELOPING/CONFIRMED/LATE/FAILED display label (see
    // toOpportunityStage above) — additive, `tier` stays the real field
    // every existing consumer already groups/filters on.
    stage: toOpportunityStage({ tier, entryStage: entryPlan.stage }),
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
    // The one setup object consumed beside this verdict. Alerts and
    // execution should not rebuild entry/stop/target/checks independently.
    entryPlan,
    stop: entryPlan.stop,
    target: entryPlan.target1,
    invalidation: entryPlan.invalidation,
    options,
    fingerprint,
    counterfactual,
    criticalFlags: redFlagResult.criticalCount,
    redFlags: redFlagResult.flags,
    // Real reversal-detector read (sniper merge, 2026-09-01) — exposed so
    // a consumer can show WHY a reversalTopRisk-gated AVOID_LONG fired
    // (e.g. Sniper AI/Telegram's /sniper, which used to compute this
    // itself as a second, standalone verdict) without recomputing it.
    // null when no real top-risk signal is present, same honest-null
    // discipline as every other field here.
    reversalTopRisk: !!(reversal && reversal.isTop),
    reversal: reversal || null,
    // Bearish fields — additive, `verdict`/`stop`/`target` above stay the
    // real long-side fields every existing consumer already reads.
    bearishVerdict: bearishDeep?.verdict ?? null,
    bearishVerdictReason: bearishDeep?.reason ?? null,
    bearishScore: bearishScore.score,
    bearishEntry: bearishLevels.stop != null ? (row.price ?? null) : null,
    bearishStop: bearishLevels.stop,
    bearishTarget: bearishLevels.target1,
    bearishTarget2: bearishLevels.target2,
  };
}

module.exports = {
  computeOpportunity, computeExpectedValue, classifyOpportunityTier, checkOptionsConfirmsStructure,
  buildMarketFingerprint, computeCounterfactualEv, toOpportunityStage, toOpportunityStageFromPosition,
  toHighLevelVerdict,
};
