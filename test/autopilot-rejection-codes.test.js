// Real tests for src/autopilot-rejection-codes.js — the fixed enum
// server-autopilot.js and lightbox-autopilot-execute.js now tag onto
// their existing shadow-log REJECTED/FAILED transitions (Unified
// Autopilot merge, Stage 7 prep). This is a pure data/lookup module —
// these checks confirm the enum stays fixed and that ACCOUNT_LEVEL
// stays byte-identical to autopilot-risk-gate.js's own real `code`
// values, since a future stage is meant to pass gate.code straight
// through with no translation table.
const assert = require("node:assert");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking autopilot-rejection-codes — fixed enum, real risk-gate code parity…");

const { REJECTION_CODES, ACCOUNT_LEVEL, CANDIDATE_LEVEL, isRejectionCode } = require("../src/autopilot-rejection-codes");

ok("every ACCOUNT_LEVEL code is a real code evaluateAccountGate() can actually return", () => {
  // Drive autopilot-risk-gate.js's real cascade through each of its own
  // failure branches and confirm the exact same code strings come back —
  // not a hand-copied duplicate list that could silently drift.
  const { evaluateAccountGate } = require("../src/autopilot-risk-gate");
  const path = require("node:path");
  const fs = require("node:fs");
  const RISK_STATE_PATH = path.join(__dirname, "..", "data", "autopilot-risk-state.json");
  const reset = () => { try { fs.writeFileSync(RISK_STATE_PATH, JSON.stringify({ weekAnchorDate: "", weekStartEquity: 0, peakEquity: 0 })); } catch {} };

  reset();
  const daily = evaluateAccountGate({ equity: 97000, cash: 97000, startOfDayEquity: 100000, dailyMaxLossPct: 2 });
  assert.strictEqual(daily.code, ACCOUNT_LEVEL.DAILY_LOSS_BREAKER);

  reset();
  const unhealthy = evaluateAccountGate({ equity: 100000, cash: 100000, accountBlocked: true, startOfDayEquity: 100000 });
  assert.strictEqual(unhealthy.code, ACCOUNT_LEVEL.ACCOUNT_UNHEALTHY);

  reset();
  const consec = evaluateAccountGate({
    equity: 100000, cash: 100000, startOfDayEquity: 100000, dailyMaxLossPct: 2,
    recentTrades: [{ pnl: -10 }, { pnl: -20 }, { pnl: -5 }], maxConsecutiveLosses: 3,
  });
  assert.strictEqual(consec.code, ACCOUNT_LEVEL.CONSECUTIVE_LOSS_BREAKER);

  reset();
});

ok("CANDIDATE_LEVEL has a fixed code for every rejection server-autopilot.js/lightbox-autopilot-execute.js produce today", () => {
  for (const key of ["SECTOR_CAP_EXCEEDED", "LEARNING_ENGINE_VETO", "INVALID_STRUCTURE", "SIZE_TOO_SMALL", "VALIDATION_FAILED", "BROKER_ERROR"]) {
    assert.strictEqual(CANDIDATE_LEVEL[key], key);
  }
});

ok("REJECTION_CODES merges both groups with no key collisions", () => {
  const accountKeys = Object.keys(ACCOUNT_LEVEL);
  const candidateKeys = Object.keys(CANDIDATE_LEVEL);
  const overlap = accountKeys.filter((k) => candidateKeys.includes(k));
  assert.strictEqual(overlap.length, 0);
  assert.strictEqual(Object.keys(REJECTION_CODES).length, accountKeys.length + candidateKeys.length);
});

ok("isRejectionCode is real and honest — true only for a known code", () => {
  assert.strictEqual(isRejectionCode("SECTOR_CAP_EXCEEDED"), true);
  assert.strictEqual(isRejectionCode("DAILY_LOSS_BREAKER"), true);
  assert.strictEqual(isRejectionCode("NOT_A_REAL_CODE"), false);
});

ok("the enum is frozen — an accidental mutation can't silently corrupt it at runtime", () => {
  "use strict";
  assert.throws(() => { REJECTION_CODES.NEW_FAKE_CODE = "x"; });
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("AUTOPILOT-REJECTION-CODES TEST FAILED");
else console.log("AUTOPILOT-REJECTION-CODES TEST OK");
