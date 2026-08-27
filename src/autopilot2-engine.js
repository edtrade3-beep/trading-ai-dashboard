// autopilot2-engine.js — ADOL22 Autopilot 2.0 Phase 1: the one
// orchestrating tick that chains together engines that already exist and
// are already real, rather than recomputing any of them independently
// (same "AUTOPILOT MUST NOT INDEPENDENTLY CALCULATE ANOTHER FINAL SIGNAL"
// discipline AutoPilotEngine.jsx already documents for the existing swing
// autopilot). Stocks only this phase — see the plan for the Phase 2+
// roadmap (options, pressure-acceleration curves, trap modeling, learning
// engine self-audit).
"use strict";
const {
  isMarketHoursET, checkAccountHealth, dailyLossBreakerTripped, weeklyLossBreakerTripped,
  totalDrawdownBreakerTripped, openRiskPct, sectorCapExceeded, sizePositionByRisk,
} = require("./risk-guardrails");
const { isEmergencyStopActive } = require("./emergency-stop");
const { getAccountSnapshot, openPosition, closePosition, partialClosePosition, updateStop } = require("./autopilot2-account");
const { loadState, setState, appendActivity } = require("./autopilot2-store");
const { computePositionState } = require("./position-decision-engine");

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

// Real validate+size+enter for one candidate opportunity against the
// current real account snapshot. Returns a real reason string either way
// — a rejection is a logged, disclosed outcome (spec §25), never silent.
async function tryEnter(opp, snapshot) {
  if (snapshot.openPositions.some((p) => p.symbol === opp.symbol)) return { entered: false, reason: "already held" };
  if (snapshot.openPositions.length >= MAX_OPEN_POSITIONS) return { entered: false, reason: `max open positions (${MAX_OPEN_POSITIONS}) reached` };
  if (sectorCapExceeded({ positions: snapshot.openPositions, symbol: opp.symbol, maxPerSector: MAX_PER_SECTOR })) {
    return { entered: false, reason: `sector concentration cap (${MAX_PER_SECTOR}) reached for this symbol's sector` };
  }
  const openRisk = openRiskPct({ positions: snapshot.openPositions.map((p) => ({ qty: p.qty, avgEntryPrice: p.entryPrice })), equity: snapshot.equity });
  if (openRisk >= MAX_OPEN_RISK_PCT) return { entered: false, reason: `portfolio open-risk ceiling (${MAX_OPEN_RISK_PCT}%) reached (currently ${openRisk.toFixed(1)}%)` };

  const { qty, riskPerShare, reason: sizeReason } = sizeEntry({ equity: snapshot.equity, cash: snapshot.cash, entry: opp.entry, stop: opp.stop });
  if (sizeReason) return { entered: false, reason: sizeReason };
  if (!(qty > 0)) return { entered: false, reason: "sized to 0 shares under current real risk limits" };

  const result = await openPosition({
    symbol: opp.symbol, qty, stop: opp.stop, target: opp.target,
    riskDollars: qty * riskPerShare,
    opportunitySnapshot: { score: opp.score, verdict: opp.verdict, verdictReason: opp.verdictReason, tier: opp.tier, probability: opp.probability, expectedValue: opp.expectedValue, reasons: opp.reasons },
  });
  if (!result.ok) return { entered: false, reason: result.error };
  return { entered: true, reason: `real entry: score ${opp.score}, EV ${opp.expectedValue ?? "n/a"}, ${qty} sh @ $${result.position.entryPrice.toFixed(2)}` };
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

  const candidates = [...(scan.tiers.actionable || [])].sort((a, b) => (b.expectedValue ?? -Infinity) - (a.expectedValue ?? -Infinity));
  let entered = 0;
  let workingSnapshot = freshSnapshot;
  for (const opp of candidates) {
    if (entered >= MAX_ENTRIES_PER_TICK) break;
    if (workingSnapshot.openPositions.length >= MAX_OPEN_POSITIONS) break;
    const result = await tryEnter(opp, workingSnapshot);
    appendActivity({ type: result.entered ? "ENTER" : "REJECT", symbol: opp.symbol, reason: result.reason });
    if (result.entered) {
      entered++;
      workingSnapshot = await getAccountSnapshot();
    }
  }

  return { ran: true, entered, candidatesConsidered: candidates.length };
}

module.exports = { tick, sizeEntry, RISK_PCT_PER_TRADE, MAX_TRADE_RISK_DOLLARS, MAX_OPEN_POSITIONS, MAX_PER_SECTOR, MAX_OPEN_RISK_PCT };
