// Real tests for liquidity-employment-engine.js (Institutional
// Intelligence Phase 3, 2026-08-23). Pure-function, synthetic-input,
// zero-network — same discipline as test/macro-engine.test.js /
// test/treasury-credit-engine.test.js. Run:
// node test/liquidity-employment-engine.test.js (or npm test).
const assert = require("node:assert");
const { computeLiquidityScore, computeEmploymentScore } = require("../src/liquidity-employment-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking computeLiquidityScore — real Net Liquidity trend…");
ok("Net Liquidity meaningfully expanding over the window -> a high score", () => {
  // WALCL 7000 -> 7100 (net liq rises ~1.7% net of flat TGA/repo)
  const r = computeLiquidityScore({ fred: {
    fedBalanceSheet: { value: 7100, windowStartValue: 7000 },
    tgaBalance: { value: 900, windowStartValue: 900 },
    reverseRepo: { value: 0, windowStartValue: 0 },
  } });
  assert.ok(r.score >= 80, `expected a high score, got ${r.score}`);
  assert.strictEqual(r.factors.netLiquidity, 6200);
});
ok("Net Liquidity meaningfully contracting over the window -> a low score", () => {
  const r = computeLiquidityScore({ fred: {
    fedBalanceSheet: { value: 6800, windowStartValue: 7000 },
    tgaBalance: { value: 1000, windowStartValue: 900 },
    reverseRepo: { value: 50, windowStartValue: 0 },
  } });
  assert.ok(r.score <= 20, `expected a low score, got ${r.score}`);
});
ok("Net Liquidity roughly flat -> a neutral-ish score", () => {
  const r = computeLiquidityScore({ fred: {
    fedBalanceSheet: { value: 7001, windowStartValue: 7000 },
    tgaBalance: { value: 900, windowStartValue: 900 },
    reverseRepo: { value: 0, windowStartValue: 0 },
  } });
  assert.ok(r.score > 40 && r.score < 70, `expected a neutral score, got ${r.score}`);
});
ok("missing TGA data -> honest null Net Liquidity, neutral score 50, no crash", () => {
  const r = computeLiquidityScore({ fred: { fedBalanceSheet: { value: 7000 } } });
  assert.strictEqual(r.factors.netLiquidity, null);
  assert.strictEqual(r.score, 50);
});
ok("completely empty input -> honest neutral score, no crash", () => {
  const r = computeLiquidityScore({});
  assert.strictEqual(r.score, 50);
});
ok("score always clamped 0-100", () => {
  const r = computeLiquidityScore({ fred: { fedBalanceSheet: { value: 9000, windowStartValue: 1000 }, tgaBalance: { value: 0, windowStartValue: 0 }, reverseRepo: { value: 0, windowStartValue: 0 } } });
  assert.ok(r.score >= 0 && r.score <= 100);
});

console.log("Checking computeEmploymentScore…");
ok("real healthy labor market (falling unemployment/claims, payrolls growing, wages in the healthy band) -> a high score", () => {
  const r = computeEmploymentScore({ fred: {
    unemployment: { windowChangePct: -1 }, joblessClaims: { windowChangePct: -3 },
    payrolls: { windowChangePct: 0.3 }, wages: { yoyChangePct: 3.5 },
  } });
  assert.ok(r.score >= 85, `expected a high score, got ${r.score}`);
});
ok("real deteriorating labor market (rising unemployment/claims, contracting payrolls, weak wages) -> a low score", () => {
  const r = computeEmploymentScore({ fred: {
    unemployment: { windowChangePct: 6 }, joblessClaims: { windowChangePct: 20 },
    payrolls: { windowChangePct: -0.3 }, wages: { yoyChangePct: 0.5 },
  } });
  assert.ok(r.score <= 15, `expected a low score, got ${r.score}`);
});
ok("wage growth is banded, not monotonic — too-hot wages score lower than the healthy band", () => {
  const healthy = computeEmploymentScore({ fred: { wages: { yoyChangePct: 3 } } });
  const tooHot = computeEmploymentScore({ fred: { wages: { yoyChangePct: 6 } } });
  assert.ok(healthy.score > tooHot.score);
});
ok("completely empty input -> honest neutral score, no crash, factors all null", () => {
  const r = computeEmploymentScore({});
  assert.strictEqual(r.score, 50);
  assert.strictEqual(r.factors.unemploymentWindowChangePct, null);
});
ok("score always clamped 0-100", () => {
  const r = computeEmploymentScore({ fred: { unemployment: { windowChangePct: -50 }, joblessClaims: { windowChangePct: -50 }, payrolls: { windowChangePct: 5 }, wages: { yoyChangePct: 3 } } });
  assert.ok(r.score >= 0 && r.score <= 100);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("LIQUIDITY-EMPLOYMENT-ENGINE TEST FAILED"); else console.log("LIQUIDITY-EMPLOYMENT-ENGINE TEST OK");
