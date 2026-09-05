"use strict";
// autopilot-rejection-codes.js — Unified Autopilot merge, Stage 7 prep
// (see .claude/plans/proud-yawning-unicorn.md). A small, fixed enum so a
// REJECTED/FAILED shadow-log transition carries a machine-readable code
// alongside the free-text `reason` string it already had, instead of
// only prose a person has to read to tell rejections apart.
//
// This is prep only. It does NOT make the state machine authoritative
// over real order placement — that stays exactly as Stage 3 left it,
// shadow-only, never gating a real trade, until a real trading day's
// worth of shadow-log data has actually been checked against Alpaca's
// own order history (that verification still hasn't happened this
// session — every deploy so far has reset the observation clock before
// a tick could accumulate real records).
//
// ACCOUNT_LEVEL reuses the exact `code` strings autopilot-risk-gate.js's
// evaluateAccountGate() already returns, verbatim — so a future stage
// that logs an account-level KILLED_BY_RISK transition can pass
// gate.code straight through with no translation table.
const ACCOUNT_LEVEL = Object.freeze({
  EMERGENCY_STOP: "EMERGENCY_STOP",
  ACCOUNT_UNHEALTHY: "ACCOUNT_UNHEALTHY",
  DAILY_LOSS_BREAKER: "DAILY_LOSS_BREAKER",
  WEEKLY_LOSS_BREAKER: "WEEKLY_LOSS_BREAKER",
  DRAWDOWN_BREAKER: "DRAWDOWN_BREAKER",
  CONSECUTIVE_LOSS_BREAKER: "CONSECUTIVE_LOSS_BREAKER",
});

// Per-candidate/order codes — fixed names for rejections that
// server-autopilot.js and lightbox-autopilot-execute.js already produce
// today as ad hoc free text.
const CANDIDATE_LEVEL = Object.freeze({
  SECTOR_CAP_EXCEEDED: "SECTOR_CAP_EXCEEDED",
  LEARNING_ENGINE_VETO: "LEARNING_ENGINE_VETO",
  INVALID_STRUCTURE: "INVALID_STRUCTURE",
  SIZE_TOO_SMALL: "SIZE_TOO_SMALL",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  BROKER_ERROR: "BROKER_ERROR",
});

const REJECTION_CODES = Object.freeze({ ...ACCOUNT_LEVEL, ...CANDIDATE_LEVEL });

function isRejectionCode(code) { return Object.prototype.hasOwnProperty.call(REJECTION_CODES, code); }

module.exports = { REJECTION_CODES, ACCOUNT_LEVEL, CANDIDATE_LEVEL, isRejectionCode };
