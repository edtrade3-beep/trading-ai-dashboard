"use strict";
// autopilot-risk-gate.js — Unified Autopilot merge, Stage 2 (see
// .claude/plans/proud-yawning-unicorn.md). Pure extraction, no threshold
// changes: server-autopilot.js, lightbox-autopilot-execute.js, and
// routes/autoexec.js each already run the exact same account-level gate
// sequence in the exact same order (emergency stop -> account health ->
// daily loss -> weekly loss -> total drawdown) before ever looking at a
// candidate symbol — server-autopilot.js and lightbox-autopilot-
// execute.js even had byte-identical readRiskState/writeRiskState
// helpers over the same shared data/autopilot-risk-state.json file.
//
// Every threshold below is a caller-supplied parameter, not a default
// baked in here — this changes WHERE the sequence lives, not what it
// does for any existing caller. Consolidating real duplicate logic
// before it drifts is the same real fix already applied once before to
// ATR (foundation-engine.js/future-wallet-quant.js, 2026-08-20) and to
// EMA/RSI (2026-09-04 platform audit) — same principle, applied here to
// the risk-gate sequence itself.
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { isEmergencyStopActive } = require("./emergency-stop");
const {
  checkAccountHealth, dailyLossBreakerTripped, weeklyLossBreakerTripped,
  totalDrawdownBreakerTripped, updateWeeklyDrawdownState,
} = require("./risk-guardrails");

const RISK_STATE_PATH = path.join(ROOT, "data", "autopilot-risk-state.json");
const DEFAULT_RISK_STATE = { weekAnchorDate: "", weekStartEquity: 0, peakEquity: 0 };
function readRiskState() { return { ...DEFAULT_RISK_STATE, ...readJsonSafe(RISK_STATE_PATH, null) }; }
function writeRiskState(state) { writeJsonAtomic(RISK_STATE_PATH, state); }

// Account-level gate — emergency stop, then the real breaker cascade every
// order-placing system already runs, in the same order, before it's ever
// allowed to look at a candidate symbol. Returns {ok:true, equity,
// riskState} on a pass, or {ok:false, code, reason} on the first breaker
// that trips (same short-circuit-on-first-failure behavior every existing
// caller already has). `code` is a small fixed enum so callers can build
// a machine-readable REJECTED/KILLED_BY_RISK reason later without parsing
// prose.
//
// `riskState` is optional — pass it when the caller already persists its
// OWN weekly/drawdown state (e.g. routes/autoexec.js's cfg object, a
// SEPARATE Tradier-account store, never the shared Alpaca file below).
// When omitted, this reads/writes the one shared data/autopilot-risk-
// state.json file server-autopilot.js and lightbox-autopilot-execute.js
// both already used (byte-identical helpers, now just living in one
// place) — real state, mutated and returned either way, but only auto-
// persisted here for the shared-file case; a caller-supplied riskState
// remains that caller's own object to persist however it already does.
function evaluateAccountGate({
  equity, cash, tradingBlocked, accountBlocked, startOfDayEquity,
  dailyMaxLossPct, dailyMaxLossAbs, weeklyMaxLossPct = 5, maxDrawdownPct = 15,
  riskState: callerRiskState,
}) {
  if (isEmergencyStopActive()) {
    return { ok: false, code: "EMERGENCY_STOP", reason: "Emergency Stop is active." };
  }

  const health = checkAccountHealth({ equity, cash, tradingBlocked, accountBlocked });
  if (!health.ok) {
    return { ok: false, code: "ACCOUNT_UNHEALTHY", reason: health.reason };
  }

  if (dailyLossBreakerTripped({ equity, startOfDayEquity, maxLossPct: dailyMaxLossPct, maxLossAbs: dailyMaxLossAbs })) {
    return { ok: false, code: "DAILY_LOSS_BREAKER", reason: "Daily loss limit reached — no new entries today." };
  }

  const usingSharedFile = !callerRiskState;
  const riskState = callerRiskState || readRiskState();
  if (equity > 0) {
    updateWeeklyDrawdownState(riskState, equity);
    if (usingSharedFile) writeRiskState(riskState);
  }
  if (weeklyLossBreakerTripped({ equity, weekStartEquity: riskState.weekStartEquity, maxLossPct: weeklyMaxLossPct })) {
    return { ok: false, code: "WEEKLY_LOSS_BREAKER", reason: "Weekly loss limit reached — no new entries this week." };
  }
  if (totalDrawdownBreakerTripped({ equity, peakEquity: riskState.peakEquity, maxDrawdownPct })) {
    return { ok: false, code: "DRAWDOWN_BREAKER", reason: "Total drawdown limit reached — no new entries." };
  }

  return { ok: true, equity, riskState };
}

module.exports = { evaluateAccountGate, readRiskState, writeRiskState, RISK_STATE_PATH, DEFAULT_RISK_STATE };
