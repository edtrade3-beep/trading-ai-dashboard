// Real tests for the BTC + HPC Deep Scan's pure classification logic
// (src/btc-hpc-scan.js, 2026-08-20). Pure-function, synthetic-input,
// zero-network, same discipline as test/entry-engine.test.js. Run:
// node test/btc-hpc-scan.test.js (or npm test).
const assert = require("node:assert");
const { computeBtcRegime, HPC_MINER_UNIVERSE } = require("../src/btc-hpc-scan");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

function bar(i, close, volume) { return { time: i * 86_400_000, open: close, high: close * 1.01, low: close * 0.99, close, volume: volume ?? 1000 }; }

console.log("Checking HPC_MINER_UNIVERSE…");
ok("the expanded real BTC-mining/HPC-hosting universe (12 tickers, user-requested expansion)", () => {
  assert.deepStrictEqual(HPC_MINER_UNIVERSE, ["IREN", "WULF", "CORZ", "CIFR", "RIOT", "MARA", "CLSK", "HUT", "BITF", "HIVE", "APLD", "BTBT"]);
  assert.strictEqual(new Set(HPC_MINER_UNIVERSE).size, HPC_MINER_UNIVERSE.length, "no duplicate tickers");
});

console.log("Checking computeBtcRegime…");
ok("honest unavailable with too little real history", () => {
  const r = computeBtcRegime([bar(0, 100)]);
  assert.strictEqual(r.regime, null);
  assert.strictEqual(r.dataInsufficient, true);
});
ok("a real sustained uptrend classifies BULLISH", () => {
  const bars = Array.from({ length: 70 }, (_, i) => bar(i, 100 + i * 2));
  const r = computeBtcRegime(bars);
  assert.strictEqual(r.regime, "BULLISH");
  assert.ok(r.momentum > 0);
});
ok("a real sustained downtrend classifies BEARISH", () => {
  const bars = Array.from({ length: 70 }, (_, i) => bar(i, 300 - i * 2));
  const r = computeBtcRegime(bars);
  assert.strictEqual(r.regime, "BEARISH");
  assert.ok(r.momentum < 0);
});
ok("a genuinely flat series (no real trend) classifies NEUTRAL, not fabricated as bullish or bearish", () => {
  const bars = Array.from({ length: 70 }, (_, i) => bar(i, 200));
  const r = computeBtcRegime(bars);
  assert.strictEqual(r.regime, "NEUTRAL");
  assert.strictEqual(r.momentum, 0);
});

// classifyDeepScanDecision's own tests were retired here (One Engine
// Migration Phase 6, 2026-08-23) along with the function itself — its
// real hard-gate-cascade coverage (structure broken -> AVOID, extended
// breakout -> no chase, strong-quality early entry, etc.) lives in
// test/am-core-engine.test.js's classifyCoreVerdict checks now, the one
// real verdict engine this file's own former consumers all migrated to.

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("BTC-HPC-SCAN TEST FAILED"); else console.log("BTC-HPC-SCAN TEST OK");
