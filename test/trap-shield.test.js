// Real tests for src/trap-shield.js — Trade GPS's thin BLOCK/WARN/CLEAR
// aggregator over this codebase's own already-computed real red-flag/
// anti-chase/market-agreement signals (2026-09-03 spec). Pure-function,
// synthetic-input, zero-network. Run: node test/trap-shield.test.js
// (or npm test).
"use strict";
const assert = require("node:assert");
const { evaluateTrapShield, computeMarketAgreement } = require("../src/trap-shield");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking evaluateTrapShield — real BLOCK/WARN/CLEAR decision…");

ok("no real inputs at all -> CLEAR, never a fabricated block", () => {
  const r = evaluateTrapShield({});
  assert.strictEqual(r.blocked, false);
  assert.strictEqual(r.warningLevel, "NONE");
});

ok("a real critical red flag -> BLOCKED, warningLevel HIGH", () => {
  const r = evaluateTrapShield({ redFlags: { count: 1, criticalCount: 1 } });
  assert.strictEqual(r.blocked, true);
  assert.strictEqual(r.warningLevel, "HIGH");
  assert.match(r.message, /critical red flag/);
});

ok("real antiChaseBand DO_NOT_CHASE alone -> BLOCKED (chase risk), even with zero red flags", () => {
  const r = evaluateTrapShield({ redFlags: { count: 0, criticalCount: 0 }, antiChaseBand: "DO_NOT_CHASE" });
  assert.strictEqual(r.blocked, true);
  assert.match(r.message, /do-not-chase/);
});

ok("real non-critical flags only -> CAUTION, not blocked", () => {
  const r = evaluateTrapShield({ redFlags: { count: 2, criticalCount: 0 } });
  assert.strictEqual(r.blocked, false);
  assert.strictEqual(r.warningLevel, "CAUTION");
});

ok("real antiChaseBand EXTENDED alone -> CAUTION, not blocked", () => {
  const r = evaluateTrapShield({ antiChaseBand: "EXTENDED" });
  assert.strictEqual(r.blocked, false);
  assert.strictEqual(r.warningLevel, "CAUTION");
});

ok("real antiChaseBand NORMAL -> no warning contribution", () => {
  const r = evaluateTrapShield({ antiChaseBand: "NORMAL" });
  assert.strictEqual(r.blocked, false);
  assert.strictEqual(r.warningLevel, "NONE");
});

ok("real weak market agreement (< 50%) alone -> CAUTION", () => {
  const r = evaluateTrapShield({ marketAgreementCount: 2, marketAgreementTotal: 8 });
  assert.strictEqual(r.blocked, false);
  assert.strictEqual(r.warningLevel, "CAUTION");
  assert.match(r.message, /weak market agreement/);
});

ok("real strong market agreement (>= 50%) contributes no warning", () => {
  const r = evaluateTrapShield({ marketAgreementCount: 7, marketAgreementTotal: 8 });
  assert.strictEqual(r.warningLevel, "NONE");
});

ok("missing real marketAgreementTotal (0 or absent) never divides by zero or fabricates a warning", () => {
  const r = evaluateTrapShield({ marketAgreementCount: 3, marketAgreementTotal: 0 });
  assert.strictEqual(r.warningLevel, "NONE");
});

ok("a real critical flag + a real weak agreement -> still BLOCKED (critical wins), message leads with the block reason", () => {
  const r = evaluateTrapShield({ redFlags: { count: 1, criticalCount: 1 }, marketAgreementCount: 1, marketAgreementTotal: 8 });
  assert.strictEqual(r.blocked, true);
  assert.doesNotMatch(r.message, /weak market agreement/, "once blocked, the message should lead with the real blocking reason(s), not pad in the warn-only reasons");
});

console.log("\nChecking computeMarketAgreement — real factor counting, honest omission…");

ok("all real factors true -> count === total", () => {
  const r = computeMarketAgreement({ regimeAligned: true, trendAligned: true, sectorAligned: true, volumeAligned: true });
  assert.strictEqual(r.count, 4);
  assert.strictEqual(r.total, 4);
});

ok("a real mix of true/false -> count reflects only the true ones", () => {
  const r = computeMarketAgreement({ regimeAligned: true, trendAligned: false, sectorAligned: true });
  assert.strictEqual(r.count, 2);
  assert.strictEqual(r.total, 3);
});

ok("a genuinely unknown factor (null/undefined) is excluded from the denominator, never counted as false", () => {
  const r = computeMarketAgreement({ regimeAligned: true, trendAligned: null, sectorAligned: undefined });
  assert.strictEqual(r.count, 1);
  assert.strictEqual(r.total, 1);
});

ok("zero real factors supplied -> count 0, total 0, never fabricated", () => {
  const r = computeMarketAgreement({});
  assert.strictEqual(r.count, 0);
  assert.strictEqual(r.total, 0);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TRAP-SHIELD TEST FAILED"); else console.log("TRAP-SHIELD TEST OK");
