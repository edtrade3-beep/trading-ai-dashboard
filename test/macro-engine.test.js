// Real tests for macro-engine.js's computeMacroRegime (Institutional
// Intelligence Phase 1, 2026-08-23). Pure-function, synthetic-input,
// zero-network — same discipline as test/am-core-engine.test.js. Run:
// node test/macro-engine.test.js (or npm test).
const assert = require("node:assert");
const { REGIME_META, computeMacroRegime } = require("../src/macro-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const fred = (over = {}) => ({
  yieldCurve: { value: 0.5 },
  fedFunds: { windowChangePct: 0 },
  unemployment: { windowChangePct: 0 },
  joblessClaims: { windowChangePct: 0 },
  cpi: { yoyChangePct: 2.5 },
  corePce: { yoyChangePct: 2.5 },
  ...over,
});

console.log("Checking REGIME_META covers every real state computeMacroRegime can return…");
ok("all 8 real states have an icon/label/color entry", () => {
  for (const r of ["FINANCIAL_STRESS", "RECESSION_RISK", "RISK_OFF", "LATE_CYCLE", "DISTRIBUTION", "SELECTIVE_RISK_ON", "RECOVERY", "RISK_ON"]) {
    assert.ok(REGIME_META[r], `missing meta for ${r}`);
    assert.ok(REGIME_META[r].icon && REGIME_META[r].label && REGIME_META[r].color);
  }
});

console.log("Checking the hard-gate cascade — most severe/specific state wins…");
ok("VIX >=30 -> FINANCIAL_STRESS regardless of everything else", () => {
  const r = computeMacroRegime({ fred: fred(), vixLevel: 35, spyChg: 2, qqqChg: 2 });
  assert.strictEqual(r.regime, "FINANCIAL_STRESS");
});
ok("deeply inverted curve + rising jobless claims -> FINANCIAL_STRESS", () => {
  const r = computeMacroRegime({ fred: fred({ yieldCurve: { value: -0.8 }, joblessClaims: { windowChangePct: 10 } }), vixLevel: 15, spyChg: 1, qqqChg: 1 });
  assert.strictEqual(r.regime, "FINANCIAL_STRESS");
});
ok("inverted curve + rising unemployment (not deep enough for FINANCIAL_STRESS) -> RECESSION_RISK", () => {
  const r = computeMacroRegime({ fred: fred({ yieldCurve: { value: -0.1 }, unemployment: { windowChangePct: 5 } }), vixLevel: 15, spyChg: 1, qqqChg: 1 });
  assert.strictEqual(r.regime, "RECESSION_RISK");
});
ok("VIX >=22 + SPY/QQQ both down -> RISK_OFF", () => {
  const r = computeMacroRegime({ fred: fred(), vixLevel: 24, spyChg: -1, qqqChg: -1.5 });
  assert.strictEqual(r.regime, "RISK_OFF");
});
ok("Fed funds not falling + elevated core inflation + rising jobless claims -> LATE_CYCLE", () => {
  const r = computeMacroRegime({ fred: fred({ fedFunds: { windowChangePct: 0 }, corePce: { yoyChangePct: 3.8 }, joblessClaims: { windowChangePct: 5 } }), vixLevel: 16, spyChg: 0.2, qqqChg: 0.2 });
  assert.strictEqual(r.regime, "LATE_CYCLE");
});
ok("SPY/QQQ flat-to-down + VIX 15-22 + curve flat-to-inverted -> DISTRIBUTION", () => {
  const r = computeMacroRegime({ fred: fred({ yieldCurve: { value: 0.1 } }), vixLevel: 18, spyChg: -0.2, qqqChg: -0.1 });
  assert.strictEqual(r.regime, "DISTRIBUTION");
});
ok("Fed funds falling + SPY/QQQ both up + inflation moderate -> RECOVERY", () => {
  const r = computeMacroRegime({ fred: fred({ fedFunds: { windowChangePct: -5 } }), vixLevel: 20, spyChg: 1, qqqChg: 1 });
  assert.strictEqual(r.regime, "RECOVERY");
});
ok("VIX low + SPY/QQQ up + curve non-inverted + inflation contained -> RISK_ON", () => {
  const r = computeMacroRegime({ fred: fred(), vixLevel: 14, spyChg: 0.8, qqqChg: 1.1 });
  assert.strictEqual(r.regime, "RISK_ON");
});
ok("no dominant real signal -> SELECTIVE_RISK_ON, never a crash or null", () => {
  const r = computeMacroRegime({ fred: fred(), vixLevel: 19, spyChg: 0.1, qqqChg: -0.1 });
  assert.strictEqual(r.regime, "SELECTIVE_RISK_ON");
});

console.log("Checking honest degrade — missing real data never fabricates a state…");
ok("completely empty input -> SELECTIVE_RISK_ON fallback, no crash, factors all null", () => {
  const r = computeMacroRegime({});
  assert.strictEqual(r.regime, "SELECTIVE_RISK_ON");
  assert.strictEqual(r.factors.vixLevel, null);
  assert.strictEqual(r.factors.yieldCurve, null);
  assert.ok(Number.isFinite(r.score));
});
ok("missing yield curve alone never fabricates RECESSION_RISK/FINANCIAL_STRESS", () => {
  const r = computeMacroRegime({ fred: fred({ yieldCurve: {} }), vixLevel: 15, spyChg: 1, qqqChg: 1 });
  assert.notStrictEqual(r.regime, "RECESSION_RISK");
  assert.notStrictEqual(r.regime, "FINANCIAL_STRESS");
});
ok("reasons array always present and names real factors, never empty on a matched branch", () => {
  const r = computeMacroRegime({ fred: fred(), vixLevel: 35, spyChg: 0, qqqChg: 0 });
  assert.ok(Array.isArray(r.reasons) && r.reasons.length > 0);
  assert.ok(r.reasons[0].includes("VIX"));
});

console.log("Checking score is always a real, clamped 0-100 number…");
ok("score is clamped 0-100 even with extreme real inputs", () => {
  const rHigh = computeMacroRegime({ fred: fred({ fedFunds: { windowChangePct: -20 } }), vixLevel: 10, spyChg: 3, qqqChg: 3 });
  const rLow = computeMacroRegime({ fred: fred({ yieldCurve: { value: -2 }, corePce: { yoyChangePct: 8 } }), vixLevel: 45, spyChg: -5, qqqChg: -5 });
  assert.ok(rHigh.score >= 0 && rHigh.score <= 100);
  assert.ok(rLow.score >= 0 && rLow.score <= 100);
  assert.ok(rHigh.score > rLow.score, "a genuinely healthier real backdrop must score higher than a genuinely stressed one");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("MACRO-ENGINE TEST FAILED"); else console.log("MACRO-ENGINE TEST OK");
