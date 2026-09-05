// Real tests for src/autopilot-risk-gate.js — the account-level gate
// extracted (Unified Autopilot merge, Stage 2) from server-autopilot.js,
// lightbox-autopilot-execute.js, and routes/autoexec.js, which each ran
// this exact same emergency-stop -> health -> daily -> weekly -> drawdown
// sequence independently. Every threshold is caller-supplied — these
// tests confirm the sequence's real short-circuit order and pass/fail
// behavior match what those three files already relied on individually.
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const RISK_STATE_PATH = path.join(__dirname, "..", "data", "autopilot-risk-state.json");
function resetRiskState() { try { fs.writeFileSync(RISK_STATE_PATH, JSON.stringify({ weekAnchorDate: "", weekStartEquity: 0, peakEquity: 0 })); } catch {} }

// emergency-stop.js's own state is a real, plain JSON file re-read on every
// call (not a cached module-level flag) — set/clear it directly rather
// than mocking a function reference, which wouldn't affect autopilot-
// risk-gate.js's own already-destructured import anyway.
const EMERGENCY_STOP_PATH = path.join(__dirname, "..", "data", "emergency-stop.json");
let _emergencyStopBackup = null;
function setEmergencyStopActive(active) {
  try { _emergencyStopBackup = fs.readFileSync(EMERGENCY_STOP_PATH, "utf8"); } catch { _emergencyStopBackup = null; }
  fs.writeFileSync(EMERGENCY_STOP_PATH, JSON.stringify({ active, activatedAt: active ? new Date().toISOString() : null, activatedBy: "test", reason: "test", rearmedAt: null, rearmedBy: null }));
}
function restoreEmergencyStop() {
  if (_emergencyStopBackup != null) fs.writeFileSync(EMERGENCY_STOP_PATH, _emergencyStopBackup);
  else try { fs.unlinkSync(EMERGENCY_STOP_PATH); } catch {}
}

console.log("Checking evaluateAccountGate — real emergency-stop/health/daily/weekly/drawdown cascade, in order…");

resetRiskState();
const { evaluateAccountGate } = require("../src/autopilot-risk-gate");

ok("emergency stop active -> EMERGENCY_STOP, checked before anything else", () => {
  setEmergencyStopActive(true);
  try {
    const r = evaluateAccountGate({ equity: 100000, cash: 100000, startOfDayEquity: 100000 });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, "EMERGENCY_STOP");
  } finally { restoreEmergencyStop(); }
});

ok("account blocked -> ACCOUNT_UNHEALTHY", () => {
  const r = evaluateAccountGate({ equity: 100000, cash: 100000, accountBlocked: true, startOfDayEquity: 100000 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "ACCOUNT_UNHEALTHY");
});

ok("daily loss breaker (maxLossPct) trips before weekly/drawdown are ever checked", () => {
  resetRiskState();
  const r = evaluateAccountGate({ equity: 97000, cash: 97000, startOfDayEquity: 100000, dailyMaxLossPct: 2 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "DAILY_LOSS_BREAKER");
});

ok("daily loss breaker (maxLossAbs, Tradier's own flat-dollar convention) trips the same way", () => {
  resetRiskState();
  const r = evaluateAccountGate({ equity: 99700, cash: 99700, startOfDayEquity: 100000, dailyMaxLossAbs: 200 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "DAILY_LOSS_BREAKER");
});

ok("a real pass returns ok:true with the real equity and a real riskState", () => {
  resetRiskState();
  const r = evaluateAccountGate({ equity: 100000, cash: 100000, startOfDayEquity: 100000, dailyMaxLossPct: 2 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.equity, 100000);
  assert.ok(r.riskState);
});

ok("weekly loss breaker trips when the daily breaker alone would not", () => {
  resetRiskState();
  // Seed a real prior week-start equity via one real pass, then simulate a
  // real 6% draw against that anchor on a later, unrelated day (daily pnl
  // itself flat, so only the weekly breaker should fire).
  evaluateAccountGate({ equity: 100000, cash: 100000, startOfDayEquity: 100000, dailyMaxLossPct: 2 });
  const r = evaluateAccountGate({ equity: 94000, cash: 94000, startOfDayEquity: 94000, dailyMaxLossPct: 2, weeklyMaxLossPct: 5 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "WEEKLY_LOSS_BREAKER");
});

console.log("\nChecking the consecutive-loss breaker (Unified Autopilot merge, Stage 6)…");

ok("recentTrades omitted entirely -> consecutive-loss check is skipped, never affects the result", () => {
  resetRiskState();
  const r = evaluateAccountGate({ equity: 100000, cash: 100000, startOfDayEquity: 100000, dailyMaxLossPct: 2 });
  assert.strictEqual(r.ok, true);
});

ok("3 real consecutive losses trips CONSECUTIVE_LOSS_BREAKER even though every $/% breaker still passes", () => {
  resetRiskState();
  const r = evaluateAccountGate({
    equity: 100000, cash: 100000, startOfDayEquity: 100000, dailyMaxLossPct: 2,
    recentTrades: [{ pnl: -10 }, { pnl: -20 }, { pnl: -5 }], maxConsecutiveLosses: 3,
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "CONSECUTIVE_LOSS_BREAKER");
});

ok("a real win anywhere in the trailing window resets the streak — gate passes", () => {
  resetRiskState();
  const r = evaluateAccountGate({
    equity: 100000, cash: 100000, startOfDayEquity: 100000, dailyMaxLossPct: 2,
    recentTrades: [{ pnl: -10 }, { pnl: 15 }, { pnl: -5 }], maxConsecutiveLosses: 3,
  });
  assert.strictEqual(r.ok, true);
});

ok("the daily-loss breaker still fires first even when a consecutive-loss streak is ALSO present", () => {
  resetRiskState();
  const r = evaluateAccountGate({
    equity: 97000, cash: 97000, startOfDayEquity: 100000, dailyMaxLossPct: 2,
    recentTrades: [{ pnl: -10 }, { pnl: -20 }, { pnl: -5 }], maxConsecutiveLosses: 3,
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "DAILY_LOSS_BREAKER");
});

resetRiskState();
console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("AUTOPILOT-RISK-GATE TEST FAILED");
else console.log("AUTOPILOT-RISK-GATE TEST OK");
