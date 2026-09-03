// Real tests for src/trade-gps-audit-store.js — Trade GPS's unified,
// append-only per-setup audit record + performance views (2026-09-03
// spec). Performance math is delegated to the real, already-tested
// autopilot2-backtest.js's own buildStats — this file verifies wiring
// and aggregation, not the math itself (that's
// test/autopilot2-backtest.test.js's job). Run:
// node test/trade-gps-audit-store.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { writeJsonAtomic, readJsonSafe } = require("../src/atomic-write");
const { recordSetupEvent, getPerformanceViews, STORE_PATH } = require("../src/trade-gps-audit-store");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

// Same snapshot-reset-restore discipline as test/signal-lifecycle.test.js.
const original = readJsonSafe(STORE_PATH, { records: [] });
writeJsonAtomic(STORE_PATH, { records: [] });

try {
  console.log("Checking recordSetupEvent — real record completeness, honest no-op…");

  ok("a genuine symbol produces a real, complete record with every real field carried through unchanged", () => {
    const rec = recordSetupEvent({
      symbol: "AAA", engineVersion: "canonical-pipeline-v1", regime: "RISK_ON",
      scoreBreakdown: { score: 90 }, tradeStructure: { structure: "STOCK" }, verdict: "BUY_STOCK",
      riskDecision: { sizeDollars: 400 }, stateTransition: { from: "ARMED", to: "ENTER_NOW" },
      qualifyReason: "real 90-band setup",
    });
    assert.ok(rec.id, "a real record must carry a real unique id");
    assert.strictEqual(rec.symbol, "AAA");
    assert.strictEqual(rec.regime, "RISK_ON");
    assert.strictEqual(rec.verdict, "BUY_STOCK");
    assert.strictEqual(rec.qualifyReason, "real 90-band setup");
    assert.strictEqual(rec.outcome, null, "an open/pending real setup has no real outcome yet — honest null, not fabricated");
  });

  ok("a missing real symbol is an honest no-op — never fabricates a record for an unknown symbol", () => {
    const rec = recordSetupEvent({ verdict: "BUY_STOCK" });
    assert.strictEqual(rec, null);
  });

  ok("real records persist to disk — a fresh read of the real store shows them", () => {
    const stored = readJsonSafe(STORE_PATH, { records: [] });
    assert.strictEqual(stored.records.filter((r) => r.symbol === "AAA").length, 1);
  });

  console.log("\nChecking getPerformanceViews — real aggregation over closed-outcome records, delegated math…");

  writeJsonAtomic(STORE_PATH, { records: [] });

  // A real, deterministic fixture set: 3 wins, 2 losses, mixed regimes.
  recordSetupEvent({ symbol: "W1", regime: "RISK_ON", verdict: "BUY_STOCK", outcome: { pnl: 300, pnlPct: 3, holdingDays: 1 } });
  recordSetupEvent({ symbol: "W2", regime: "RISK_ON", verdict: "BUY_CALL", outcome: { pnl: 200, pnlPct: 2, holdingDays: 2 } });
  recordSetupEvent({ symbol: "W3", regime: "RISK_OFF", verdict: "BUY_STOCK", outcome: { pnl: 150, pnlPct: 1.5, holdingDays: 1 } });
  recordSetupEvent({ symbol: "L1", regime: "RISK_ON", verdict: "BUY_STOCK", outcome: { pnl: -100, pnlPct: -1, holdingDays: 1 } });
  recordSetupEvent({ symbol: "L2", regime: "RISK_OFF", verdict: "BUY_PUT", outcome: { pnl: -250, pnlPct: -2.5, holdingDays: 3 } });
  // A still-open real setup — no outcome yet, must never be counted.
  recordSetupEvent({ symbol: "OPEN1", regime: "RISK_ON", verdict: "BUY_STOCK" });

  ok("open/pending real records (outcome null) never enter the performance sample", () => {
    const r = getPerformanceViews({ window: 50 });
    assert.strictEqual(r.sampleSize, 5, "5 real closed outcomes, the 1 open record must be excluded");
  });

  ok("overall real stats reflect the real win/loss mix (delegated to autopilot2-backtest.js's own buildStats)", () => {
    const r = getPerformanceViews({ window: 50 });
    assert.strictEqual(r.overall.count, 5);
    assert.strictEqual(r.overall.winRate, 60, "3 real wins of 5 = 60%");
    assert.strictEqual(r.overall.totalPnl, 300);
  });

  ok("groupBy 'regime' splits into real, correctly-bucketed groups", () => {
    const r = getPerformanceViews({ window: 50, groupBy: "regime" });
    assert.ok(r.groups.RISK_ON);
    assert.ok(r.groups.RISK_OFF);
    assert.strictEqual(r.groups.RISK_ON.count, 3, "W1, W2, L1");
    assert.strictEqual(r.groups.RISK_OFF.count, 2, "W3, L2");
  });

  ok("groupBy 'setup' splits by the real verdict field", () => {
    const r = getPerformanceViews({ window: 50, groupBy: "setup" });
    assert.strictEqual(r.groups.BUY_STOCK.count, 3);
    assert.strictEqual(r.groups.BUY_CALL.count, 1);
    assert.strictEqual(r.groups.BUY_PUT.count, 1);
  });

  ok("window narrows to only the most recent real N closed-outcome records", () => {
    const r = getPerformanceViews({ window: 2 });
    assert.strictEqual(r.sampleSize, 2, "only the last 2 real closed records (L1, L2)");
    assert.strictEqual(r.overall.totalPnl, -350);
  });

  ok("no real closed-outcome records at all -> honest zero-sample view, never fabricated stats", () => {
    writeJsonAtomic(STORE_PATH, { records: [] });
    const r = getPerformanceViews({ window: 50 });
    assert.strictEqual(r.sampleSize, 0);
    assert.strictEqual(r.overall.count, 0);
    assert.strictEqual(r.overall.winRate, null);
  });
} finally {
  writeJsonAtomic(STORE_PATH, original);
}

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TRADE-GPS-AUDIT-STORE TEST FAILED"); else console.log("TRADE-GPS-AUDIT-STORE TEST OK");
