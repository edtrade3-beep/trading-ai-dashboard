// Real tests for src/atr-risk-engine.js — MTF Decision System Phase 4
// (2026-08-20). Same minimal style as test/smoke.js. Run: node
// test/atr-risk-engine.test.js (or npm test).
const assert = require("node:assert");
const { computeAtrRiskLevels, computeAntiChase } = require("../src/atr-risk-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

function makeBars(n, base = 100, dailyRange = 2) {
  const bars = [];
  let price = base;
  for (let i = 0; i < n; i++) {
    price += (i % 2 === 0 ? 0.3 : -0.1);
    bars.push({ high: price + dailyRange / 2, low: price - dailyRange / 2, close: price });
  }
  return bars;
}

console.log("Checking computeAtrRiskLevels…");
ok("computeAtrRiskLevels: honest insufficient-data for too-short history", () => {
  const r = computeAtrRiskLevels(makeBars(5), 100);
  assert.strictEqual(r.dataInsufficient, true);
});
ok("computeAtrRiskLevels: real ATR-based stop is exactly 1.5x ATR below price by default", () => {
  const bars = makeBars(30, 100, 4); // real ~4-point daily range -> real ATR near 4
  const price = bars[bars.length - 1].close;
  const r = computeAtrRiskLevels(bars, price);
  assert.strictEqual(r.dataInsufficient, false);
  assert.ok(r.atr > 0, "ATR must be a real positive number");
  const expectedStop = Math.round((price - 1.5 * r.atr) * 100) / 100;
  assert.strictEqual(r.stop, expectedStop);
});
ok("computeAtrRiskLevels: target1 is exactly 2R and target2 is exactly 3R off the real risk-per-share", () => {
  const bars = makeBars(30, 100, 4);
  const price = bars[bars.length - 1].close;
  const r = computeAtrRiskLevels(bars, price);
  const r1 = (r.target1 - price) / r.riskPerShare;
  const r2 = (r.target2 - price) / r.riskPerShare;
  assert.ok(Math.abs(r1 - 2) < 0.01, `target1 should be 2R, got ${r1}R`);
  assert.ok(Math.abs(r2 - 3) < 0.01, `target2 should be 3R, got ${r2}R`);
});
ok("computeAtrRiskLevels: target3 is exactly 4R by default, honors a custom target3R, and is null on insufficient data (2026-08-21, unified trading system spec §10)", () => {
  const bars = makeBars(30, 100, 4);
  const price = bars[bars.length - 1].close;
  const r = computeAtrRiskLevels(bars, price);
  const r3 = (r.target3 - price) / r.riskPerShare;
  assert.ok(Math.abs(r3 - 4) < 0.01, `target3 should be 4R by default, got ${r3}R`);
  const custom = computeAtrRiskLevels(bars, price, { target3R: 5 });
  const r3c = (custom.target3 - price) / custom.riskPerShare;
  assert.ok(Math.abs(r3c - 5) < 0.01, `target3R:5 should give 5R, got ${r3c}R`);
  assert.strictEqual(computeAtrRiskLevels(makeBars(5), 100).target3, null);
});
ok("computeAtrRiskLevels: custom multipliers are honored, not hardcoded", () => {
  const bars = makeBars(30, 100, 4);
  const price = bars[bars.length - 1].close;
  const r1 = computeAtrRiskLevels(bars, price, { stopMult: 1.5 });
  const r2 = computeAtrRiskLevels(bars, price, { stopMult: 3 });
  assert.ok(r2.stop < r1.stop, "a wider stop multiplier must produce a lower (further) stop for a long");
});

console.log("Checking computeAntiChase…");
ok("computeAntiChase: price not yet at the breakout is NOT a chase risk", () => {
  const r = computeAntiChase(-4.2);
  assert.strictEqual(r.band, "NOT_YET_BROKEN_OUT");
});
ok("computeAntiChase: 0-3% above breakout reads NORMAL", () => {
  assert.strictEqual(computeAntiChase(1.5).band, "NORMAL");
  assert.strictEqual(computeAntiChase(3.0).band, "NORMAL");
});
ok("computeAntiChase: 3-5% reads CAUTION with real waitingFor text", () => {
  const r = computeAntiChase(4.2);
  assert.strictEqual(r.band, "CAUTION");
  assert.ok(r.waitingFor && r.waitingFor.length > 0);
});
ok("computeAntiChase: 5-8% reads EXTENDED", () => {
  assert.strictEqual(computeAntiChase(6.5).band, "EXTENDED");
});
ok("computeAntiChase: >8% reads DO_NOT_CHASE — the spec's own explicit threshold", () => {
  const r = computeAntiChase(12.3);
  assert.strictEqual(r.band, "DO_NOT_CHASE");
  assert.ok(/do not chase/i.test(r.label));
});
ok("computeAntiChase: honest null for missing data, no fabricated band", () => {
  const r = computeAntiChase(null);
  assert.strictEqual(r.band, null);
});
ok("computeAntiChase: configurable thresholds are honored, not hardcoded universal truths", () => {
  const loose = computeAntiChase(6, { extendedMax: 10 });
  assert.notStrictEqual(loose.band, "DO_NOT_CHASE", "6% should not be DO_NOT_CHASE under a looser configured threshold");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("ATR-RISK-ENGINE TEST FAILED"); else console.log("ATR-RISK-ENGINE TEST OK");
