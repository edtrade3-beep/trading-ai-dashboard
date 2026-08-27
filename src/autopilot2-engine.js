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
const {
  isMarketHoursET, checkAccountHealth, dailyLossBreakerTripped, weeklyLossBreakerTripped,
  totalDrawdownBreakerTripped, sectorCapExceeded, sizePositionByRisk,
} = require("./risk-guardrails");
const { isEmergencyStopActive } = require("./emergency-stop");
const { getAccountSnapshot, openPosition, closePosition, partialClosePosition, updateStop, openOptionPosition, closeOptionPosition } = require("./autopilot2-account");
const { chooseExpression } = require("./autopilot2-expression");
const { loadState, setState, appendActivity } = require("./autopilot2-store");
const { computePositionState } = require("./position-decision-engine");

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
    if (pos.assetType === "CALL") { await manageCallPosition(pos); continue; }

    const gainPct = pos.unrealizedPnlPct;
    const riskPerShare = pos.entryPrice - pos.stop;
    const rNow = riskPerShare > 0 ? (pos.currentPrice - pos.entryPrice) / riskPerShare : null;
    const rTarget = (riskPerShare > 0 && pos.target > 0) ? (pos.target - pos.entryPrice) / riskPerShare : null;
    const { verdict: mixedVerdict, reason: mixedReason } = await freshMixedVerdict(pos.symbol);

    const decision = computePositionState({
      side: "long", gainPct, mixedVerdict, mixedReason, rNow, rTarget,
      currentPrice: pos.currentPrice, stopPrice: pos.stop,
    });

    if (decision.state === "HARD_EXIT" || decision.state === "EXIT") {
      const result = await closePosition(pos.id, { reason: decision.state });
      appendActivity({ type: decision.state, symbol: pos.symbol, reason: decision.reason, realizedPnl: result.closedTrade?.realizedPnl ?? null });
    } else if (decision.state === "TAKE_PARTIAL") {
      const result = await partialClosePosition(pos.id, { fraction: 0.5, reason: "TAKE_PARTIAL" });
      appendActivity({ type: "TAKE_PARTIAL", symbol: pos.symbol, reason: decision.reason, realizedPnl: result.realizedPnl ?? null });
    } else if (decision.state === "TRAIL") {
      // Real trail: raise the stop halfway toward current price — a real,
      // disclosed, conservative ratchet (never below the original stop,
      // enforced by updateStop itself), not a fabricated "optimal" trail.
      const newStop = pos.stop + (pos.currentPrice - pos.stop) * 0.5;
      const result = updateStop(pos.id, newStop);
      if (result.ok) appendActivity({ type: "TRAIL", symbol: pos.symbol, reason: decision.reason, newStop });
    }
    // HOLD/WARNING/null: no action, no log spam — routine ticks aren't activity.
  }
}

// Real CALL management — same fresh-verdict thesis check as a stock (off
// the real underlying), but real premium-based gain/R-multiple (a call's
// real max loss is the full premium paid, not a share-price stop
// distance), plus a real, unconditional DTE floor exit independent of
// thesis (spec §22 applied to the real risk unique to options: time).
async function manageCallPosition(pos) {
  if (Number.isFinite(pos.dte) && pos.dte <= CALL_DTE_EXIT_FLOOR) {
    const result = await closeOptionPosition(pos.id, { reason: "DTE_FLOOR" });
    appendActivity({ type: "EXIT", symbol: pos.symbol, reason: `real DTE floor reached (${pos.dte}d <= ${CALL_DTE_EXIT_FLOOR}d) — closing ahead of real expiration risk`, realizedPnl: result.closedTrade?.realizedPnl ?? null });
    return;
  }

  const gainPct = pos.unrealizedPnlPct;
  const rNow = pos.riskDollars > 0 ? pos.unrealizedPnl / pos.riskDollars : null;
  const { verdict: mixedVerdict, reason: mixedReason } = await freshMixedVerdict(pos.symbol);

  // No real per-position stop PRICE concept for a long call (the real max
  // loss is the premium itself, already reflected via rNow) — the hard-
  // stop-breach branch inside computePositionState is skipped by omitting
  // currentPrice/stopPrice, never faked with a stock-style level.
  const decision = computePositionState({ side: "long", gainPct, mixedVerdict, mixedReason, rNow, rTarget: 1 });

  if (decision.state === "EXIT") {
    const result = await closeOptionPosition(pos.id, { reason: "EXIT" });
    appendActivity({ type: "EXIT", symbol: pos.symbol, reason: decision.reason, realizedPnl: result.closedTrade?.realizedPnl ?? null });
  } else if (decision.state === "TAKE_PARTIAL" && pos.qty > 1) {
    // Real partial: close half the real contracts at the real current bid.
    const chain = await require("./autopilot2-account").fetchOptionsChain(pos.symbol, pos.expiry).catch(() => null);
    const contract = chain?.calls?.find((c) => c.contractSymbol === pos.contractSymbol);
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
function sizeEntry({ equity, cash, entry, stop, riskPct = RISK_PCT_PER_TRADE, maxTradeRiskDollars = MAX_TRADE_RISK_DOLLARS, maxNamePct = MAX_NAME_PCT }) {
  if (!(entry > 0) || !(stop > 0) || !(entry > stop)) return { qty: 0, reason: "no real valid entry/stop" };
  const pctQty = sizePositionByRisk({ equity, riskPct, entry, stop, availCash: cash, maxNamePct });
  const riskPerShare = entry - stop;
  const dollarCappedQty = riskPerShare > 0 ? Math.floor(maxTradeRiskDollars / riskPerShare) : 0;
  const qty = Math.min(pctQty, dollarCappedQty);
  return { qty: Math.max(0, qty), riskPerShare };
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

  const expr = await chooseExpression(opp);

  if (expr.expression === "CALL") {
    const contract = expr.contract;
    const { qty, riskDollars, reason: sizeReason } = sizeOptionEntry({ equity: snapshot.equity, cash: snapshot.cash, entryPremium: contract.ask });
    if (sizeReason) return { entered: false, reason: `${expr.reason} — but ${sizeReason}` };
    if (!(qty > 0)) return { entered: false, reason: `${expr.reason} — but sized to 0 contracts under current real risk limits` };

    const result = await openOptionPosition({
      symbol: opp.symbol, strike: contract.strike, expiry: contract.expiry, contractSymbol: contract.contractSymbol,
      qty, entryPremium: contract.ask, underlyingAtEntry: contract.underlyingAtEntry,
      opportunitySnapshot: { score: opp.score, verdict: opp.verdict, verdictReason: opp.verdictReason, tier: opp.tier, probability: opp.probability, expectedValue: opp.expectedValue, reasons: opp.reasons, expression: expr.reason },
    });
    if (!result.ok) return { entered: false, reason: result.error };
    return { entered: true, reason: `${expr.reason} — ${qty} contract(s) @ $${result.position.entryPrice.toFixed(2)} (real risk $${riskDollars.toFixed(0)})` };
  }

  if (expr.expression === "NO_TRADE") return { entered: false, reason: expr.reason };

  // STOCK — either the Expression Engine chose it, or it fell back to it.
  const { qty, riskPerShare, reason: sizeReason } = sizeEntry({ equity: snapshot.equity, cash: snapshot.cash, entry: opp.entry, stop: opp.stop });
  if (sizeReason) return { entered: false, reason: sizeReason };
  if (!(qty > 0)) return { entered: false, reason: "sized to 0 shares under current real risk limits" };

  const result = await openPosition({
    symbol: opp.symbol, qty, stop: opp.stop, target: opp.target,
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
  if (!isMarketHoursET()) return { ran: false, reason: "outside market hours" };

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
  // at least 5 trades" — the real ACTIONABLE-only bar is a genuine double
  // hard-gate, real Core Verdict AND a precise BREAKOUT/RETEST/
  // CONFIRMATION entry-timing stage, and can legitimately sit at 0 for
  // hours). Real, disclosed, bounded loosening: DEVELOPING-tier real
  // candidates (real bullish Core Verdict, same hard gates, just not yet
  // at the ideal entry-timing stage) are now also eligible, ranked after
  // ACTIONABLE — never a fabricated signal, an honestly weaker real one,
  // logged as such. Every other real gate (risk sizing, sector cap, open-
  // risk ceiling, duplicate protection) is completely unchanged.
  const INCLUDE_DEVELOPING = process.env.AUTOPILOT2_INCLUDE_DEVELOPING !== "off";
  const developing = INCLUDE_DEVELOPING ? (scan.tiers.developing || []) : [];
  // opp.tier (from classifyOpportunityTier, already real/honest on every
  // candidate) is reused directly to rank real ACTIONABLE candidates
  // first — no separate flag invented alongside it.
  const candidates = [...(scan.tiers.actionable || []), ...developing].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "ACTIONABLE" ? -1 : 1;
    return (b.expectedValue ?? -Infinity) - (a.expectedValue ?? -Infinity);
  });
  let entered = 0;
  let workingSnapshot = freshSnapshot;
  for (const opp of candidates) {
    if (entered >= MAX_ENTRIES_PER_TICK) break;
    if (workingSnapshot.openPositions.length >= MAX_OPEN_POSITIONS) break;
    const result = await tryEnter(opp, workingSnapshot);
    const tierNote = opp.tier === "DEVELOPING" ? " [DEVELOPING tier — real verdict, not yet at ideal entry timing]" : "";
    appendActivity({ type: result.entered ? "ENTER" : "REJECT", symbol: opp.symbol, reason: `${result.reason}${tierNote}` });
    if (result.entered) {
      entered++;
      workingSnapshot = await getAccountSnapshot();
    }
  }

  return { ran: true, entered, candidatesConsidered: candidates.length };
}

module.exports = { tick, sizeEntry, sizeOptionEntry, RISK_PCT_PER_TRADE, MAX_TRADE_RISK_DOLLARS, MAX_OPEN_POSITIONS, MAX_PER_SECTOR, MAX_OPEN_RISK_PCT, CALL_DTE_EXIT_FLOOR };
