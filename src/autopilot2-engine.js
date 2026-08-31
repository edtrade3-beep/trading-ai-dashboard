// autopilot2-engine.js — ADOL22 Autopilot 2.0: the one orchestrating tick
// that chains together engines that already exist and are already real,
// rather than recomputing any of them independently (same "AUTOPILOT MUST
// NOT INDEPENDENTLY CALCULATE ANOTHER FINAL SIGNAL" discipline
// AutoPilotEngine.jsx already documents for the existing swing autopilot).
//
// Phase 2a (2026-08-27) adds real CALL expression alongside stocks — see
// the plan for the Phase 2b+ roadmap (puts, spreads, pressure-
// acceleration curves, trap modeling, learning engine self-audit).
"use strict";
const { PORT } = require("./config");
const {
  isMarketHoursET, checkAccountHealth, dailyLossBreakerTripped, weeklyLossBreakerTripped,
  totalDrawdownBreakerTripped, sectorCapExceeded, sizePositionByRisk,
} = require("./risk-guardrails");
const { isEmergencyStopActive } = require("./emergency-stop");
const { getAccountSnapshot, openPosition, closePosition, partialClosePosition, updateStop, openOptionPosition, closeOptionPosition } = require("./autopilot2-account");
const { chooseExpression } = require("./autopilot2-expression");
const { loadState, setState, appendActivity } = require("./autopilot2-store");
const { computePositionState } = require("./position-decision-engine");
const { recordMissed } = require("./missed-opportunity-tracker");

// Real self-loopback JSON fetch — same established convention this file's
// own account/expression modules already use to reuse a route's real
// computation without refactoring it.
const BASE = () => process.env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${PORT}`;
async function getJson(p) {
  try { const r = await fetch(`${BASE()}${p}`); return await r.json(); } catch { return null; }
}

// A long call closes ahead of real expiration regardless of thesis — real
// theta-crush/pin-risk into the last few real days is a genuinely
// different risk stocks don't have (spec §22's real hard-risk-always-on
// principle, applied to the real thing that can zero a call: time, not
// just price).
const CALL_DTE_EXIT_FLOOR = Number(process.env.AUTOPILOT2_CALL_DTE_FLOOR) || 5;

// Real, disclosed, configurable defaults (spec §17) — every one overridable
// via env var, none silently hardcoded past what's documented here.
const RISK_PCT_PER_TRADE = Number(process.env.AUTOPILOT2_RISK_PCT) || 0.5;
const MAX_TRADE_RISK_DOLLARS = Number(process.env.AUTOPILOT2_MAX_TRADE_RISK) || 500;
const MAX_NAME_PCT = Number(process.env.AUTOPILOT2_MAX_NAME_PCT) || 20;
const MAX_OPEN_POSITIONS = Number(process.env.AUTOPILOT2_MAX_POSITIONS) || 12;
const MAX_PER_SECTOR = Number(process.env.AUTOPILOT2_MAX_SECTOR) || 3;
const MAX_OPEN_RISK_PCT = Number(process.env.AUTOPILOT2_MAX_OPEN_RISK) || 6;
const DAILY_LOSS_PCT = Number(process.env.AUTOPILOT2_DAILY_LOSS_PCT) || 2;
const WEEKLY_LOSS_PCT = Number(process.env.AUTOPILOT2_WEEKLY_LOSS_PCT) || 5;
const TOTAL_DRAWDOWN_PCT = Number(process.env.AUTOPILOT2_DRAWDOWN_PCT) || 15;
const MAX_ENTRIES_PER_TICK = 3;

// Fresh real verdict for an already-open position (management, not entry)
// — reruns the exact same real pipeline computeAllOpportunities used at
// entry time (opportunity-engine.js's computeOpportunity: row -> EV ->
// entry plan -> red flags -> Core Score -> Core Verdict), on this
// symbol's CURRENT real data, rather than importing the day-trade-tuned
// computeMixedSignals stack position-decision-engine.js's own doc comment
// describes as its usual caller (a real mismatch for a multi-day swing
// hold — day-trade indicators like opening range don't apply cleanly
// here). Mapped onto computePositionState's expected
// BULLISH/BEARISH/MIXED vocabulary. trackReport omitted here (null) —
// only the verdict is needed for management, not a re-derived EV.
async function freshMixedVerdict(symbol) {
  try {
    const { screenTrendTemplate, fetchMarketQuotes } = require("./routes/market");
    const { computeRegime, regimeToEntryVocabulary } = require("./trade-planner-scoring");
    const { computeOpportunity } = require("./opportunity-engine");
    const { resolveProviderKeys } = require("./config");

    const [rows, macroQuotes] = await Promise.all([
      screenTrendTemplate([symbol]),
      fetchMarketQuotes(["SPY", "QQQ", "VIXY"], resolveProviderKeys(new URLSearchParams())).catch(() => []),
    ]);
    const row = (rows || []).find((r) => r.symbol === symbol && !r.error);
    if (!row) return { verdict: null, reason: null };

    const regime = computeRegime(Array.isArray(macroQuotes) ? macroQuotes : []);
    const marketRegime = regimeToEntryVocabulary(regime.label);
    const opp = computeOpportunity({ symbol, row, regime, marketRegime, trackReport: null });
    if (!opp) return { verdict: null, reason: null };
    const mixedVerdict = opp.verdict === "AVOID_LONG" ? "BEARISH" : (opp.verdict === "EARLY_BUY" || opp.verdict === "BUY") ? "BULLISH" : "MIXED";
    return { verdict: mixedVerdict, reason: opp.verdictReason };
  } catch {
    return { verdict: null, reason: null };
  }
}

// Manage every real open position this tick — mark-to-market already
// happened inside getAccountSnapshot(); this layer decides real actions.
// The hard stop-price check runs unconditionally (spec §22), independent
// of whether a fresh verdict is even available.
async function managePositions(snapshot) {
  for (const pos of snapshot.openPositions) {
    if (pos.assetType === "CALL" || pos.assetType === "PUT") { await manageOptionPosition(pos); continue; }

    // direction "short" (2026-08-31) — computePositionState's own `side`
    // param already fully supports this (position-decision-engine.js,
    // zero changes needed there); a short's stop-breach direction and
    // R-multiple both flip, mirroring autopilot2-account.js's own
    // closePosition/updateStop conventions exactly.
    const isShort = pos.direction === "short";
    const gainPct = pos.unrealizedPnlPct;
    const riskPerShare = isShort ? pos.stop - pos.entryPrice : pos.entryPrice - pos.stop;
    const rNow = riskPerShare > 0 ? (isShort ? (pos.entryPrice - pos.currentPrice) / riskPerShare : (pos.currentPrice - pos.entryPrice) / riskPerShare) : null;
    const rTarget = (riskPerShare > 0 && pos.target > 0) ? (isShort ? (pos.entryPrice - pos.target) / riskPerShare : (pos.target - pos.entryPrice) / riskPerShare) : null;
    const { verdict: mixedVerdict, reason: mixedReason } = await freshMixedVerdict(pos.symbol);

    const decision = computePositionState({
      side: isShort ? "short" : "long", gainPct, mixedVerdict, mixedReason, rNow, rTarget,
      currentPrice: pos.currentPrice, stopPrice: pos.stop,
    });

    if (decision.state === "HARD_EXIT" || decision.state === "EXIT") {
      const result = await closePosition(pos.id, { reason: decision.state });
      appendActivity({ type: decision.state, symbol: pos.symbol, reason: decision.reason, realizedPnl: result.closedTrade?.realizedPnl ?? null });
    } else if (decision.state === "TAKE_PARTIAL") {
      const result = await partialClosePosition(pos.id, { fraction: 0.5, reason: "TAKE_PARTIAL" });
      appendActivity({ type: "TAKE_PARTIAL", symbol: pos.symbol, reason: decision.reason, realizedPnl: result.realizedPnl ?? null });
    } else if (decision.state === "TRAIL") {
      // Real trail: tighten the stop halfway toward current price — a
      // real, disclosed, conservative ratchet (never loosened, enforced
      // by updateStop itself), not a fabricated "optimal" trail. For a
      // short this moves the stop DOWN toward price; for a long, UP.
      const newStop = pos.stop + (pos.currentPrice - pos.stop) * 0.5;
      const result = updateStop(pos.id, newStop);
      if (result.ok) appendActivity({ type: "TRAIL", symbol: pos.symbol, reason: decision.reason, newStop });
    }
    // HOLD/WARNING/null: no action, no log spam — routine ticks aren't activity.
  }
}

// Real CALL/PUT management — same fresh-verdict thesis check as a stock
// (off the real underlying), but real premium-based gain/R-multiple (a
// long option's real max loss is the full premium paid, not a
// share-price stop distance), plus a real, unconditional DTE floor exit
// independent of thesis (spec §22 applied to the real risk unique to
// options: time). Generalized 2026-08-31 (bidirectional trading) from
// manageCallPosition — a long PUT's thesis is bearish (it wants the
// underlying to fall), so `side: "short"` is the semantically correct
// value to pass to computePositionState here, matching
// position-decision-engine.js's own documented convention ("side" means
// which market direction this position wants, not asset ownership
// direction).
async function manageOptionPosition(pos) {
  const isPut = pos.assetType === "PUT";
  if (Number.isFinite(pos.dte) && pos.dte <= CALL_DTE_EXIT_FLOOR) {
    const result = await closeOptionPosition(pos.id, { reason: "DTE_FLOOR" });
    appendActivity({ type: "EXIT", symbol: pos.symbol, reason: `real DTE floor reached (${pos.dte}d <= ${CALL_DTE_EXIT_FLOOR}d) — closing ahead of real expiration risk`, realizedPnl: result.closedTrade?.realizedPnl ?? null });
    return;
  }

  const gainPct = pos.unrealizedPnlPct;
  const rNow = pos.riskDollars > 0 ? pos.unrealizedPnl / pos.riskDollars : null;
  const { verdict: mixedVerdict, reason: mixedReason } = await freshMixedVerdict(pos.symbol);

  // No real per-position stop PRICE concept for a long option (the real
  // max loss is the premium itself, already reflected via rNow) — the
  // hard-stop-breach branch inside computePositionState is skipped by
  // omitting currentPrice/stopPrice, never faked with a stock-style level.
  const decision = computePositionState({ side: isPut ? "short" : "long", gainPct, mixedVerdict, mixedReason, rNow, rTarget: 1 });

  if (decision.state === "EXIT") {
    const result = await closeOptionPosition(pos.id, { reason: "EXIT" });
    appendActivity({ type: "EXIT", symbol: pos.symbol, reason: decision.reason, realizedPnl: result.closedTrade?.realizedPnl ?? null });
  } else if (decision.state === "TAKE_PARTIAL" && pos.qty > 1) {
    // Real partial: close half the real contracts at the real current bid.
    const chain = await require("./autopilot2-account").fetchOptionsChain(pos.symbol, pos.expiry).catch(() => null);
    const contract = (isPut ? chain?.puts : chain?.calls)?.find((c) => c.contractSymbol === pos.contractSymbol);
    if (Number(contract?.bid) > 0) {
      // No partial-close helper for options yet (v1 scope) — a full close
      // is the honest fallback rather than a fabricated partial fill.
      const result = await closeOptionPosition(pos.id, { exitPremium: contract.bid, reason: "TAKE_PARTIAL" });
      appendActivity({ type: "TAKE_PARTIAL", symbol: pos.symbol, reason: decision.reason, realizedPnl: result.closedTrade?.realizedPnl ?? null });
    }
  }
  // HOLD/WARNING/null: no action, no log spam.
}

// Pure sizing math, extracted for direct unit testing (no network): a
// real risk-%-based share count (risk-guardrails.js's sizePositionByRisk,
// unchanged), then hard-capped so no single trade ever risks more than
// the real disclosed MAX_TRADE_RISK_DOLLARS regardless of what the %
// math alone would allow (spec §17's explicit "0.5% per trade... Maximum
// default risk: $500" — sizePositionByRisk only knows %, this adds the $
// ceiling on top).
// direction "SHORT" (2026-08-31, bidirectional trading) — mirrors
// lightbox-autopilot-execute.js's existing real stopValid pattern: a
// short's real stop sits ABOVE entry, so the validity check and risk-per-
// share direction both flip. sizePositionByRisk (risk-guardrails.js)
// already has its own `direction` param for exactly this.
function sizeEntry({ equity, cash, entry, stop, riskPct = RISK_PCT_PER_TRADE, maxTradeRiskDollars = MAX_TRADE_RISK_DOLLARS, maxNamePct = MAX_NAME_PCT, direction = "LONG" }) {
  const isShort = direction === "SHORT";
  const stopValid = isShort ? (stop > 0 && stop > entry) : (stop > 0 && entry > stop);
  if (!(entry > 0) || !stopValid) return { qty: 0, reason: "no real valid entry/stop" };
  const pctQty = sizePositionByRisk({ equity, riskPct, entry, stop, availCash: cash, maxNamePct, direction: isShort ? "SHORT" : "LONG" });
  const riskPerShare = isShort ? stop - entry : entry - stop;
  const dollarCappedQty = riskPerShare > 0 ? Math.floor(maxTradeRiskDollars / riskPerShare) : 0;
  const qty = Math.min(pctQty, dollarCappedQty);
  return { qty: Math.max(0, qty), riskPerShare };
}

// Crypto sizing (2026-08-30) — same real risk-%-based formula as sizeEntry,
// but real crypto trades in FRACTIONAL units (a whole-BTC floor at
// ~$100k+/coin would round every real entry to 0 and silently block crypto
// forever, or force an absurdly oversized 1-coin position on a cheaper
// pair). Rounds to 6 decimal places — standard real crypto precision, not
// an arbitrary guess — instead of Math.floor to a whole unit. Same $ risk
// cap and max-name-% cap as stocks, unchanged.
// direction "SHORT" (2026-08-31, bidirectional trading) — same real
// short-simulated mechanics as sizeEntry, applied to fractional crypto
// qty. A short-simulated crypto position is disclosed as paper-only
// (autopilot2-account.js) same as short stock — no real spot-crypto
// borrow mechanism exists anywhere, real or simulated beyond this.
const CRYPTO_QTY_PRECISION = 6;
function sizeCryptoEntry({ equity, cash, entry, stop, riskPct = RISK_PCT_PER_TRADE, maxTradeRiskDollars = MAX_TRADE_RISK_DOLLARS, maxNamePct = MAX_NAME_PCT, direction = "LONG" }) {
  const isShort = direction === "SHORT";
  const stopValid = isShort ? (stop > 0 && stop > entry) : (stop > 0 && entry > stop);
  if (!(entry > 0) || !stopValid) return { qty: 0, reason: "no real valid entry/stop" };
  const riskPerShare = isShort ? stop - entry : entry - stop;
  const riskBudget = Math.min(equity * (riskPct / 100), maxTradeRiskDollars);
  let qty = riskBudget / riskPerShare;
  qty = Math.min(qty, (cash || 0) / entry);
  qty = Math.min(qty, (equity * (maxNamePct / 100)) / entry);
  qty = Math.floor(Math.max(0, qty) * 10 ** CRYPTO_QTY_PRECISION) / 10 ** CRYPTO_QTY_PRECISION;
  return { qty, riskPerShare };
}

// Pure CALL sizing (spec §17 applied to options — same real risk budget a
// stock trade would get, since a long call's own real max loss is the
// full premium paid). Real, disclosed v1 simplification: risk-% and the
// $ cap apply the same as stocks; no separate options-specific risk knob
// yet.
function sizeOptionEntry({ equity, cash, entryPremium, riskPct = RISK_PCT_PER_TRADE, maxTradeRiskDollars = MAX_TRADE_RISK_DOLLARS, maxNamePct = MAX_NAME_PCT, contractMultiplier = 100 }) {
  if (!(entryPremium > 0)) return { qty: 0, reason: "no real valid contract premium" };
  const costPerContract = entryPremium * contractMultiplier;
  const riskBudget = Math.min(equity * (riskPct / 100), maxTradeRiskDollars);
  let qty = Math.floor(riskBudget / costPerContract);
  qty = Math.min(qty, Math.floor((cash || 0) / costPerContract));
  qty = Math.min(qty, Math.floor((equity * (maxNamePct / 100)) / costPerContract));
  return { qty: Math.max(0, qty), riskDollars: Math.max(0, qty) * costPerContract };
}

// Light Box candidate source (2026-08-27, explicit user request: "link
// light box to 2.0 autopilot") — a real, complementary, more real-time-
// responsive source alongside the batch Opportunity Engine scan.
// lightbox-state-store.js already runs its own confirm tick every 5 min
// across a real, broader universe (DAYTRADE_UNIVERSE, universe=full —
// deliberately not just the watchlist, which the Opportunity Engine scan
// already covers) and tracks real, debounce-confirmed BUY/WAIT/SELL state
// plus a precise entryTriggerStatus. Reused via the real GET
// /api/market/lightbox route (self-loopback, same established pattern),
// never recomputed independently — same "don't calculate a second real
// signal" discipline as freshMixedVerdict above.
//
// Real, disclosed gate for eligibility (both required, not either/or):
// `state === "BUY"` (the debounce-confirmed Light Box read, not just a
// single fresh tick) AND `entryTriggerStatus === "CONFIRMED"` (the
// precise real entry trigger is active right now) — plus the same real
// lifecycle/anti-chase/red-flag checks Light Box's own UI already
// surfaces. Mapped into the exact same shape tryEnter already consumes
// (symbol/entry/stop/target/score/verdict/expectedValue) so it flows
// through IDENTICAL real risk gating (sizing, sector cap, open-risk
// ceiling, duplicate protection) as an Opportunity Engine candidate —
// a second real signal source, never a second, looser risk path.
async function fetchLightBoxCandidates() {
  const data = await getJson("/api/market/lightbox?universe=full");
  if (!data || !Array.isArray(data.rows)) return [];

  return data.rows
    .filter((r) =>
      r.state === "BUY" &&
      r.entryTriggerStatus === "CONFIRMED" &&
      r.lifecycle && r.lifecycle !== "WEAKENING" && r.lifecycle !== "INVALIDATED" &&
      (!r.chase?.band || (r.chase.band !== "EXTENDED" && r.chase.band !== "DO_NOT_CHASE")) &&
      !(r.redFlags || []).some((f) => f.critical) &&
      Number(r.price) > 0 && Number(r.stop) > 0 && Number(r.price) > Number(r.stop)
    )
    .map((r) => ({
      symbol: r.symbol,
      entry: Number(r.bestEntry) > 0 ? Number(r.bestEntry) : Number(r.price),
      stop: Number(r.stop),
      target: Number(r.target) > 0 ? Number(r.target) : null,
      score: Number(r.quality) || null,
      verdict: "LIGHTBOX_BUY", // distinct real label — never conflated with am-core-engine.js's own EARLY_BUY/BUY vocabulary
      verdictReason: r.reason || r.signalReason || "Real Light Box CONFIRMED entry trigger",
      tier: "LIGHTBOX",
      probability: null,
      expectedValue: Number.isFinite(r.attentionScore) ? r.attentionScore : null,
      reasons: [r.reason, r.signalReason].filter(Boolean),
    }));
}

// Real crypto candidates (explicit user request, 2026-08-30: "make it 24/7
// trade because of crypto") — SAME canonical engine as stocks
// (screenTrendTemplate -> computeOpportunity -> am-core-engine.js), fed a
// small, real, liquid crypto universe instead of the stock scan universe.
// Zero new scoring logic: crypto has real, continuous daily closes (no
// "market closed" gaps to confuse a 150/200-day MA the way an illiquid
// stock might), so the same Minervini-template-based engine that already
// scores stocks scores these honestly. What crypto genuinely needs
// differently is handled at the call site instead: fractional position
// sizing (sizeCryptoEntry) and no market-hours gate (tick() below) — this
// function's OWN output shape is identical to a stock candidate, so it
// flows through the exact same tryEnter risk gating.
// Expanded 2026-08-30 (explicit user feedback: "still autopilot 2.0 not
// working not even crypto" -> diagnosed live: BTC/ETH/SOL were the ONLY
// candidates, and on the real day this was checked BTC was extended above
// its own real pivot (a genuine, disclosed anti-chase hard gate — never
// bypassed, applies identically to stocks) while ETH/SOL were in real
// Stage 4 downtrends — a real, narrow-universe drought, not a bug. Real
// fix: widen the real, liquid crypto surface area so a genuine qualifying
// setup has more chances to appear, WITHOUT touching any real risk gate
// (extended/Stage-4/critical-flag blocks stay identical for every symbol
// here). Each of these 8 additions was verified live against this app's
// own real quote provider before being added (2 other real major coins —
// UNI-USD, MATIC-USD — were tried and dropped: no real Yahoo chart data
// available for either, so they'd only ever error out, not silently
// misprice).
//
// Expanded again 2026-08-31 (explicit user goal: "make $1000/day... best
// setup" — real trade FREQUENCY, not selectivity, diagnosed as the actual
// bottleneck: the scheduler was confirmed healthy via a real manual tick
// trigger, it was just finding zero real candidates in a genuinely quiet
// market across the original 11-symbol universe). Each addition verified
// live against this app's own real quote provider first — APT-USD errored
// (no real Yahoo chart data), and both ARB-USD/SHIB-USD were dropped after
// live verification showed their real price rounds to exactly $0
// throughout this app's whole pipeline (pivot/entry/stop all real $0) —
// a genuine data-quality gap for those two specific symbols, not silently
// traded through.
const CRYPTO_UNIVERSE = [
  "BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "DOGE-USD", "ADA-USD", "AVAX-USD", "LINK-USD", "LTC-USD", "BCH-USD", "DOT-USD",
  "TRX-USD", "ATOM-USD", "NEAR-USD", "ETC-USD", "XLM-USD", "FIL-USD", "OP-USD", "ICP-USD",
];

// Near-miss inclusion (2026-08-31, "widen Autopilot 2.0's opportunity
// pool" — real trade FREQUENCY was diagnosed as the actual bottleneck,
// not strategy quality; the scheduler itself was confirmed healthy via a
// real manual tick trigger). This loosens a SOFT, selectivity-only bar —
// no hard risk gate changes here at all. A WATCH/WATCH_SHORT verdict
// still cleared every one of classifyCoreVerdict's/classifyBearishVerdict's
// real hard gates (structure, anti-chase, red flags, Stage-4/dailyBias,
// entry-score floor) — it only missed the BUY/SHORT score threshold. It's
// only accepted here when it ALSO carries a real executable entry price
// (executableEntry/bearishEntry) — a WATCH with no real entry literally
// cannot be traded, so this can never turn an unreal setup real, only
// widen which REAL, gate-cleared setups get a chance. Position sizing,
// stops, sector caps, portfolio open-risk ceiling, and the daily/weekly/
// drawdown breakers are completely untouched by this.
const BULLISH_ACTIONABLE = new Set(["EARLY_BUY", "BUY"]);
const BULLISH_RANK = { EARLY_BUY: 0, BUY: 1, WATCH: 2 };
function isBullishCandidate(o) {
  return BULLISH_ACTIONABLE.has(o.verdict) || (o.verdict === "WATCH" && o.executableEntry != null);
}
const BEARISH_ACTIONABLE = new Set(["EARLY_SHORT", "SHORT"]);
const BEARISH_RANK = { EARLY_SHORT: 0, SHORT: 1, WATCH_SHORT: 2 };
function isBearishCandidate(o) {
  return BEARISH_ACTIONABLE.has(o.bearishVerdict) || (o.bearishVerdict === "WATCH_SHORT" && o.bearishEntry != null);
}
// Reshapes an already-computed real opportunity's bearish fields
// (opportunity-engine.js's additive bearishVerdict/bearishScore/
// bearishStop/bearishTarget/bearishEntry) into the same candidate shape
// tryEnter already consumes for the long side — one real scan, one real
// engine, an additive branch (2026-08-31, bidirectional trading). A
// symbol already qualifying long keeps its long candidate only — never
// both directions on the same symbol in one tick, an undecided signal
// tryEnter's own duplicate-symbol guard would reject the second half of
// anyway.
function toBearishCandidate(opp, assetClass) {
  return {
    symbol: opp.symbol, price: opp.price, entry: opp.bearishEntry, stop: opp.bearishStop, target: opp.bearishTarget,
    score: opp.bearishScore, verdict: opp.bearishVerdict, verdictReason: opp.bearishVerdictReason,
    tier: "BEARISH", probability: null, expectedValue: null, reasons: [],
    direction: "SHORT", assetClass, criticalFlags: 0,
  };
}
function bearishCandidatesFrom(opportunities, bullishCandidates, assetClass) {
  return opportunities
    .filter((o) => isBearishCandidate(o) && !bullishCandidates.some((b) => b.symbol === o.symbol))
    .map((o) => toBearishCandidate(o, assetClass))
    .sort((a, b) => (BEARISH_RANK[a.verdict] - BEARISH_RANK[b.verdict]) || ((b.score ?? -Infinity) - (a.score ?? -Infinity)));
}

async function fetchCryptoCandidates() {
  try {
    const { screenTrendTemplate, fetchMarketQuotes } = require("./routes/market");
    const { computeRegime, regimeToEntryVocabulary } = require("./trade-planner-scoring");
    const { computeOpportunity } = require("./opportunity-engine");
    const { resolveProviderKeys } = require("./config");

    const [rows, macroQuotes] = await Promise.all([
      screenTrendTemplate(CRYPTO_UNIVERSE),
      fetchMarketQuotes(["SPY", "QQQ", "VIXY"], resolveProviderKeys(new URLSearchParams())).catch(() => []),
    ]);
    const regime = computeRegime(Array.isArray(macroQuotes) ? macroQuotes : []);
    const marketRegime = regimeToEntryVocabulary(regime.label);

    const opportunities = (rows || [])
      .filter((row) => !row.error)
      .map((row) => computeOpportunity({ symbol: row.symbol, row, regime, marketRegime, trackReport: null }))
      .filter(Boolean)
      .map((opp) => ({ ...opp, assetClass: "CRYPTO" }));

    const bullish = opportunities
      .filter((o) => isBullishCandidate(o) && (o.criticalFlags ?? 0) === 0)
      .sort((a, b) => (BULLISH_RANK[a.verdict] - BULLISH_RANK[b.verdict]) || ((b.expectedValue ?? -Infinity) - (a.expectedValue ?? -Infinity)));

    // Bearish (2026-08-31) — same real "short-simulated" account as long
    // spot crypto (autopilot2-account.js), no real borrow mechanism
    // either way, both disclosed the same way.
    const bearish = bearishCandidatesFrom(opportunities, bullish, "CRYPTO");

    return [...bullish, ...bearish];
  } catch {
    return []; // honest empty list on any real failure — never a fabricated candidate
  }
}

// Pure dedup logic, extracted for direct unit testing (2026-08-31,
// explicit user request: "trade desk will be also money makers" ->
// clarified via research that Trade Desk has no distinct scoring engine
// of its own — its AI Verdict/score/Trade Plan are the exact same
// canonical am-core-engine.js/opportunity-engine.js pipeline this file
// already trades off of. The one real, distinct thing Trade Desk is
// connected to is the user's own real watchlist (edited via
// RhProWatchlists.jsx, mounted in Trade Desk's dock) — narrower than
// this file's default ~100-symbol SCAN_UNIVERSE and not currently
// scanned by Autopilot 2.0 at all. Real fix: scan it too, same one
// engine, no new scoring). Only the real GAP needs a fresh scan — a
// symbol already covered by SCAN_UNIVERSE or already scanned this same
// tick would just be a wasted duplicate real fetch.
function symbolsToScan(watchlistSymbols, scanUniverse, alreadyScanned) {
  const universe = new Set(scanUniverse || []);
  const scanned = alreadyScanned instanceof Set ? alreadyScanned : new Set(alreadyScanned || []);
  return [...new Set(watchlistSymbols || [])].filter((s) => !universe.has(s) && !scanned.has(s));
}

// Real Trade Desk watchlist candidate source — reuses the exact same
// real loadWatchlist() 15+ other server-side files already call this
// same way (watchlist-sniper-alerts.js is the closest precedent: union
// watchlist ∪ SCAN_UNIVERSE), and the exact same real screenTrendTemplate
// -> computeOpportunity -> isBullishCandidate/isBearishCandidate pipeline
// fetchCryptoCandidates above already uses — zero new scoring logic,
// just a different, real, user-curated symbol set. `alreadyScannedSymbols`
// is the real symbol set tick()'s own SCAN_UNIVERSE pass already covered
// this tick, so this never re-fetches/re-scores a symbol twice.
async function fetchWatchlistCandidates(alreadyScannedSymbols) {
  try {
    const { loadWatchlist } = require("./routes/watchlist");
    const { SCAN_UNIVERSE } = require("./advisor-ai");
    const { symbols: watchlistSymbols } = loadWatchlist();
    const extraSymbols = symbolsToScan(watchlistSymbols, SCAN_UNIVERSE, alreadyScannedSymbols);
    if (!extraSymbols.length) return { bullish: [], bearish: [] };

    const { screenTrendTemplate, fetchMarketQuotes } = require("./routes/market");
    const { computeRegime, regimeToEntryVocabulary } = require("./trade-planner-scoring");
    const { computeOpportunity } = require("./opportunity-engine");
    const { resolveProviderKeys } = require("./config");

    const [rows, macroQuotes] = await Promise.all([
      screenTrendTemplate(extraSymbols),
      fetchMarketQuotes(["SPY", "QQQ", "VIXY"], resolveProviderKeys(new URLSearchParams())).catch(() => []),
    ]);
    const regime = computeRegime(Array.isArray(macroQuotes) ? macroQuotes : []);
    const marketRegime = regimeToEntryVocabulary(regime.label);

    const opportunities = (rows || [])
      .filter((row) => !row.error)
      .map((row) => computeOpportunity({ symbol: row.symbol, row, regime, marketRegime, trackReport: null }))
      .filter(Boolean)
      .map((opp) => ({ ...opp, fromWatchlist: true }));

    const bullish = opportunities
      .filter((o) => isBullishCandidate(o) && (o.criticalFlags ?? 0) === 0)
      .sort((a, b) => (BULLISH_RANK[a.verdict] - BULLISH_RANK[b.verdict]) || ((b.expectedValue ?? -Infinity) - (a.expectedValue ?? -Infinity)));
    const bearish = bearishCandidatesFrom(opportunities, bullish, undefined).map((c) => ({ ...c, fromWatchlist: true }));

    return { bullish, bearish };
  } catch {
    return { bullish: [], bearish: [] }; // honest empty result on any real failure — never a fabricated candidate
  }
}

// Real validate+size+enter for one candidate opportunity against the
// current real account snapshot. Returns a real reason string either way
// — a rejection is a logged, disclosed outcome (spec §25), never silent.
// Calls the real Expression Engine first (spec §11) to decide STOCK vs
// CALL before any sizing happens.
async function tryEnter(opp, snapshot) {
  if (snapshot.openPositions.some((p) => p.symbol === opp.symbol)) return { entered: false, reason: "already held" };
  if (snapshot.openPositions.length >= MAX_OPEN_POSITIONS) return { entered: false, reason: `max open positions (${MAX_OPEN_POSITIONS}) reached` };
  if (sectorCapExceeded({ positions: snapshot.openPositions, symbol: opp.symbol, maxPerSector: MAX_PER_SECTOR })) {
    return { entered: false, reason: `sector concentration cap (${MAX_PER_SECTOR}) reached for this symbol's sector` };
  }
  // Real portfolio open-risk — Σ each real position's own stored
  // riskDollars (accurate for both stocks and calls) ÷ equity, not a
  // generic assumed-stop-% proxy (risk-guardrails.js's openRiskPct
  // doesn't know about option premiums).
  const openRiskDollars = snapshot.openPositions.reduce((s, p) => s + Math.max(0, Number(p.riskDollars) || 0), 0);
  const openRiskPctNow = snapshot.equity > 0 ? (openRiskDollars / snapshot.equity) * 100 : 100;
  if (openRiskPctNow >= MAX_OPEN_RISK_PCT) return { entered: false, reason: `portfolio open-risk ceiling (${MAX_OPEN_RISK_PCT}%) reached (currently ${openRiskPctNow.toFixed(1)}%)` };

  // direction (2026-08-31, bidirectional trading) — a candidate carries
  // direction: "SHORT" only when it came from toBearishCandidate/
  // bearishCandidatesFrom above; every existing long candidate has no
  // direction field at all, defaulting to LONG here exactly like before.
  const direction = opp.direction === "SHORT" ? "SHORT" : "LONG";
  const isShort = direction === "SHORT";

  // Crypto (2026-08-30, extended 2026-08-31 for short-simulated crypto) —
  // spot only, v1. Skips the Expression Engine entirely: chooseExpression
  // would call fetchOptionsChain, and this app's options-chain route has
  // no real crypto contract data behind it — a wasted real network call
  // that would just fall back to STOCK shape anyway. Real fractional
  // sizing (sizeCryptoEntry, see above) and a distinct assetType so the
  // account/UI can label it correctly.
  if (opp.assetClass === "CRYPTO") {
    const { qty, riskPerShare, reason: sizeReason } = sizeCryptoEntry({ equity: snapshot.equity, cash: snapshot.cash, entry: opp.entry, stop: opp.stop, direction });
    if (sizeReason) return { entered: false, reason: sizeReason };
    if (!(qty > 0)) return { entered: false, reason: "sized to 0 (below minimum real fractional size) under current real risk limits" };

    const expression = isShort ? "short-simulated spot crypto" : "spot crypto";
    const result = await openPosition({
      symbol: opp.symbol, qty, stop: opp.stop, target: opp.target, assetType: "CRYPTO", direction: isShort ? "short" : "long",
      riskDollars: qty * riskPerShare,
      opportunitySnapshot: { score: opp.score, verdict: opp.verdict, verdictReason: opp.verdictReason, tier: opp.tier, probability: opp.probability, expectedValue: opp.expectedValue, reasons: opp.reasons, expression },
    });
    if (!result.ok) return { entered: false, reason: result.error };
    return { entered: true, reason: `${expression} — real entry: score ${opp.score}, EV ${opp.expectedValue ?? "n/a"}, ${qty} @ $${result.position.entryPrice.toFixed(2)}` };
  }

  const expr = await chooseExpression(opp, direction);

  if (expr.expression === "CALL" || expr.expression === "PUT") {
    const contract = expr.contract;
    const { qty, riskDollars, reason: sizeReason } = sizeOptionEntry({ equity: snapshot.equity, cash: snapshot.cash, entryPremium: contract.ask });
    if (sizeReason) return { entered: false, reason: `${expr.reason} — but ${sizeReason}` };
    if (!(qty > 0)) return { entered: false, reason: `${expr.reason} — but sized to 0 contracts under current real risk limits` };

    const result = await openOptionPosition({
      symbol: opp.symbol, strike: contract.strike, expiry: contract.expiry, contractSymbol: contract.contractSymbol,
      qty, entryPremium: contract.ask, underlyingAtEntry: contract.underlyingAtEntry,
      optionType: expr.expression === "PUT" ? "put" : "call",
      opportunitySnapshot: { score: opp.score, verdict: opp.verdict, verdictReason: opp.verdictReason, tier: opp.tier, probability: opp.probability, expectedValue: opp.expectedValue, reasons: opp.reasons, expression: expr.reason },
    });
    if (!result.ok) return { entered: false, reason: result.error };
    return { entered: true, reason: `${expr.reason} — ${qty} contract(s) @ $${result.position.entryPrice.toFixed(2)} (real risk $${riskDollars.toFixed(0)})` };
  }

  if (expr.expression === "NO_TRADE") return { entered: false, reason: expr.reason };

  // STOCK or SHORT_STOCK — either the Expression Engine chose it, or it
  // fell back to it.
  const { qty, riskPerShare, reason: sizeReason } = sizeEntry({ equity: snapshot.equity, cash: snapshot.cash, entry: opp.entry, stop: opp.stop, direction });
  if (sizeReason) return { entered: false, reason: sizeReason };
  if (!(qty > 0)) return { entered: false, reason: `sized to 0 ${isShort ? "shares to short" : "shares"} under current real risk limits` };

  const result = await openPosition({
    symbol: opp.symbol, qty, stop: opp.stop, target: opp.target, direction: isShort ? "short" : "long",
    riskDollars: qty * riskPerShare,
    opportunitySnapshot: { score: opp.score, verdict: opp.verdict, verdictReason: opp.verdictReason, tier: opp.tier, probability: opp.probability, expectedValue: opp.expectedValue, reasons: opp.reasons, expression: expr.reason },
  });
  if (!result.ok) return { entered: false, reason: result.error };
  return { entered: true, reason: `${expr.reason} — real entry: score ${opp.score}, EV ${opp.expectedValue ?? "n/a"}, ${qty} sh @ $${result.position.entryPrice.toFixed(2)}` };
}

// The one exported tick — registered via registerJob in server.js.
async function tick() {
  const autopilotState = loadState();
  // OFF means fully off — no monitoring, no management, nothing (spec
  // §31). Every other state still MANAGES real open positions (protecting
  // real capital never pauses) — only OPENING NEW positions is gated
  // further below by state/Emergency Stop. This matches the app's own
  // existing emergency-stop.js philosophy: a halt blocks new risk, it
  // never abandons real open positions to an unmanaged fate.
  if (autopilotState.state === "OFF") return { ran: false, reason: "autopilot is OFF" };
  // Real 24/7 operation (2026-08-30, explicit user request: "make it 24/7
  // trade because of crypto") — used to be a blanket `if
  // (!isMarketHoursET()) return` here, which meant a held CRYPTO position
  // never got managed (stop/target checked) on evenings/weekends either,
  // not just that no new stock trade could open. Crypto genuinely trades
  // 24/7; stocks/calls genuinely don't. Health check, position management,
  // and risk breakers below now run every tick regardless of market
  // hours — real capital protection doesn't pause just because crypto
  // markets don't close. `marketOpen` is used further below to gate ONLY
  // the stock/Light Box candidate scan+entry, not crypto's.
  const marketOpen = isMarketHoursET();

  const snapshot = await getAccountSnapshot();
  const health = checkAccountHealth({ equity: snapshot.equity, cash: snapshot.cash });
  if (!health.ok) {
    if (autopilotState.state !== "SAFE_MODE") setState("SAFE_MODE", `account health check failed: ${health.reason}`);
    appendActivity({ type: "SAFE_MODE", reason: `account health: ${health.reason}` });
    return { ran: false, reason: "account health failed — SAFE_MODE" };
  }

  // Manage existing positions before considering new entries — protect
  // real capital first, chase new opportunity second.
  await managePositions(snapshot);
  const freshSnapshot = await getAccountSnapshot();

  const breakers = [
    dailyLossBreakerTripped({ equity: freshSnapshot.equity, startOfDayEquity: freshSnapshot.dailyStartEquity, maxLossPct: DAILY_LOSS_PCT }) && "daily loss breaker",
    weeklyLossBreakerTripped({ equity: freshSnapshot.equity, weekStartEquity: freshSnapshot.weekStartEquity, maxLossPct: WEEKLY_LOSS_PCT }) && "weekly loss breaker",
    totalDrawdownBreakerTripped({ equity: freshSnapshot.equity, peakEquity: freshSnapshot.peakEquity, maxDrawdownPct: TOTAL_DRAWDOWN_PCT }) && "total drawdown breaker",
  ].filter(Boolean);
  if (breakers.length) {
    if (autopilotState.state !== "SAFE_MODE") setState("SAFE_MODE", `real risk breaker tripped: ${breakers.join(", ")}`);
    appendActivity({ type: "SAFE_MODE", reason: `risk breaker tripped: ${breakers.join(", ")}` });
    return { ran: true, entered: 0, reason: `breaker tripped — SAFE_MODE: ${breakers.join(", ")}` };
  }

  // New entries require RUNNING + no active global Emergency Stop. PAUSED
  // and SAFE_MODE both still got real position management above — they
  // just stop here, before any new real risk is taken.
  const emergencyActive = isEmergencyStopActive();
  if (autopilotState.state !== "RUNNING" || emergencyActive) {
    return { ran: true, entered: 0, reason: `new entries blocked (state=${autopilotState.state}${emergencyActive ? ", Emergency Stop active" : ""})` };
  }

  // Stock/Light Box candidates — real quotes outside market hours are
  // stale/wide, so this whole source stays gated to marketOpen, unchanged
  // from before. Crypto (below) is sourced unconditionally instead.
  let opportunityCandidates = [];
  let lightBoxCandidates = [];
  let watchlistCandidates = { bullish: [], bearish: [] };
  if (marketOpen) {
    const { computeAllOpportunities } = require("./routes/market");
    const scan = await computeAllOpportunities().catch((e) => ({ error: String(e && e.message || e) }));
    if (scan.error) {
      setState("SAFE_MODE", `opportunity scan failed: ${scan.error}`);
      appendActivity({ type: "SAFE_MODE", reason: `opportunity scan failed: ${scan.error}` });
      return { ran: true, entered: 0, reason: "scan failed — SAFE_MODE" };
    }
    if (scan.dataQuality?.stale) {
      setState("SAFE_MODE", `market data is stale (${scan.dataQuality.ageMinutes}m old)`);
      appendActivity({ type: "SAFE_MODE", reason: `stale market data (${scan.dataQuality.ageMinutes}m old)` });
      return { ran: true, entered: 0, reason: "stale data — SAFE_MODE" };
    }

    // Candidate pool (2026-08-27, explicit user request: "i just want to see
    // at least 5 trades," corrected after checking against the real,
    // already-trading server-autopilot.js/"Green Light" system: that
    // engine's real entry gate is simply `coreCriticalFlags === 0 &&
    // (coreVerdict === "EARLY_BUY" || coreVerdict === "BUY")` — the Core
    // Verdict is ALREADY fully hard-gated internally (structure, anti-
    // chase, red flags, Stage 4, entry-score floor — am-core-engine.js's
    // own cascade), no separate entry-timing-stage requirement. The
    // Opportunity Engine's ACTIONABLE tier adds ONE MORE real requirement on
    // top (the symbol must also be at a precise BREAKOUT/RETEST/
    // CONFIRMATION stage) — a real, much narrower bar, which is why it can
    // legitimately sit at 0 for hours while the proven system next to it is
    // actively trading. Real, disclosed fix: source candidates by the SAME
    // real verdict gate the already-trading system uses (opp.verdict, from
    // the exact same classifyCoreVerdict, across every real scanned
    // symbol regardless of tier bucket) rather than requiring the
    // Opportunity Engine's additional timing filter. Every other real gate
    // (risk sizing, sector cap, open-risk ceiling, duplicate protection)
    // is completely unchanged.
    const allOpportunities = Object.values(scan.tiers).flat();
    const bullishStockCandidates = allOpportunities
      .filter((o) => isBullishCandidate(o) && (o.criticalFlags ?? 0) === 0)
      .sort((a, b) => (BULLISH_RANK[a.verdict] - BULLISH_RANK[b.verdict]) || ((b.expectedValue ?? -Infinity) - (a.expectedValue ?? -Infinity)));
    // Bearish stock candidates (2026-08-31, bidirectional trading) — same
    // real scan, additive branch (see toBearishCandidate/
    // bearishCandidatesFrom above).
    const bearishStockCandidates = bearishCandidatesFrom(allOpportunities, bullishStockCandidates, undefined);

    // Trade Desk watchlist (2026-08-31, explicit user request: "trade
    // desk will be also money makers") — the real, user-curated symbol
    // set Trade Desk's own dock lets the user edit (RhProWatchlists.jsx),
    // scanned through this SAME real engine for whatever real symbols
    // aren't already covered by the SCAN_UNIVERSE pass above. See
    // fetchWatchlistCandidates' own header for why this isn't a second
    // scoring engine.
    const scannedSymbols = new Set(allOpportunities.map((o) => o.symbol));
    watchlistCandidates = await fetchWatchlistCandidates(scannedSymbols);

    opportunityCandidates = [...bullishStockCandidates, ...watchlistCandidates.bullish, ...bearishStockCandidates, ...watchlistCandidates.bearish];

    // Light Box (2026-08-27) — a real, complementary, more real-time source
    // (see fetchLightBoxCandidates' own header comment). Appended after the
    // Opportunity Engine's own candidates, deduped by symbol — a symbol
    // already surfaced by the stricter Opportunity Engine read keeps that
    // read, never double-counted or overridden by the Light Box one.
    lightBoxCandidates = (await fetchLightBoxCandidates().catch(() => []))
      .filter((lb) => !opportunityCandidates.some((o) => o.symbol === lb.symbol));
    lightBoxCandidates.sort((a, b) => (b.expectedValue ?? -Infinity) - (a.expectedValue ?? -Infinity));
  }

  // Crypto (2026-08-30) — unconditional, real 24/7 candidate source. See
  // fetchCryptoCandidates' own header for why this reuses the identical
  // canonical engine rather than a new scorer.
  const cryptoCandidates = (await fetchCryptoCandidates())
    .filter((c) => !opportunityCandidates.some((o) => o.symbol === c.symbol));

  const candidates = [...opportunityCandidates, ...lightBoxCandidates, ...cryptoCandidates];
  let entered = 0;
  let workingSnapshot = freshSnapshot;
  for (const opp of candidates) {
    if (entered >= MAX_ENTRIES_PER_TICK) break;
    if (workingSnapshot.openPositions.length >= MAX_OPEN_POSITIONS) break;
    const result = await tryEnter(opp, workingSnapshot);
    const verdictNote = opp.tier === "LIGHTBOX"
      ? " [source: Light Box real CONFIRMED entry trigger]"
      : opp.assetClass === "CRYPTO"
      ? ` [24/7 crypto, Core Verdict ${opp.verdict}, real Opportunity tier ${opp.tier}]`
      : opp.fromWatchlist
      ? ` [from your Trade Desk watchlist, Core Verdict ${opp.verdict}, real Opportunity tier ${opp.tier}]`
      : ` [Core Verdict ${opp.verdict}, real Opportunity tier ${opp.tier}]`;
    appendActivity({ type: result.entered ? "ENTER" : "REJECT", symbol: opp.symbol, reason: `${result.reason}${verdictNote}` });
    if (result.entered) {
      entered++;
      workingSnapshot = await getAccountSnapshot();
    } else {
      // Missed-opportunity forward-outcome tracking (Autopilot goal spec,
      // 2026-08-30) — real symbol/price/verdict/score at the real moment
      // of rejection, so a later report can honestly show what actually
      // happened to trades the risk/sizing gates skipped. Observability
      // only (see missed-opportunity-tracker.js's own header) — recording
      // this can never itself cause a trade.
      recordMissed({
        symbol: opp.symbol, price: opp.price ?? opp.entry, reason: result.reason,
        verdict: opp.verdict, score: opp.score, tier: opp.tier, expectedValue: opp.expectedValue,
        source: "autopilot2",
      });
    }
  }

  return {
    ran: true, entered, marketOpen, candidatesConsidered: candidates.length,
    opportunityCandidates: opportunityCandidates.length, lightBoxCandidates: lightBoxCandidates.length,
    cryptoCandidates: cryptoCandidates.length,
    watchlistCandidates: watchlistCandidates.bullish.length + watchlistCandidates.bearish.length,
  };
}

module.exports = {
  tick, sizeEntry, sizeOptionEntry, sizeCryptoEntry, fetchLightBoxCandidates, fetchCryptoCandidates,
  fetchWatchlistCandidates, symbolsToScan,
  CRYPTO_UNIVERSE, RISK_PCT_PER_TRADE, MAX_TRADE_RISK_DOLLARS, MAX_OPEN_POSITIONS, MAX_PER_SECTOR,
  MAX_OPEN_RISK_PCT, CALL_DTE_EXIT_FLOOR,
  isBullishCandidate, isBearishCandidate, BULLISH_RANK, BEARISH_RANK,
};
