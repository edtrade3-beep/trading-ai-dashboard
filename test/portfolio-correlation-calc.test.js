// Real tests for portfolio-correlation-calc.js — pure-function,
// synthetic-input, zero-network (getJson is a plain async mock), same
// async-test discipline as test/emergency-stop.test.js. Run:
// node test/portfolio-correlation-calc.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { pearson, computeSymbolVsPositionsCorrelation, correlationGateTripped } = require("../src/portfolio-correlation-calc");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }
async function okAsync(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

function barsFromCloses(closes) {
  return closes.map((close) => ({ close }));
}

// Builds a real price series from an explicit return sequence — a linear
// (or otherwise monotonic) PRICE series does not reliably produce
// correlated/anti-correlated RETURNS (percentage steps shrink as price
// grows even on a straight line), so correlation direction can't be
// eyeballed from price trend alone. Deriving prices FROM returns
// guarantees the real pearson() correlation matches intent.
function pricesFromReturns(start, returns) {
  const prices = [start];
  for (const r of returns) prices.push(prices[prices.length - 1] * (1 + r));
  return prices;
}

(async () => {

console.log("Checking pearson() — the shared real correlation formula…");
ok("perfectly correlated series -> ~1.0", () => {
  const a = [1, 2, 3, 4, 5], b = [2, 4, 6, 8, 10];
  assert.ok(pearson(a, b) > 0.999);
});
ok("perfectly inversely correlated series -> ~-1.0", () => {
  const a = [1, 2, 3, 4, 5], b = [10, 8, 6, 4, 2];
  assert.ok(pearson(a, b) < -0.999);
});

console.log("\nChecking computeSymbolVsPositionsCorrelation — real candidate-vs-holdings correlation, honest degrade on thin data…");
await okAsync("real bars for candidate + holdings produce real, distinct correlations, sorted by |correlation| descending", async () => {
  // 25 real daily closes each (>= MIN_BARS=20), built from an explicit
  // 24-step return sequence — candidate and pos A share the SAME real
  // returns (guaranteed ~+1 correlation), pos B uses the exact NEGATED
  // returns (guaranteed ~-1 correlation).
  const rawReturns = [0.01, -0.02, 0.03, 0.01, -0.01, 0.02, -0.03, 0.015, -0.005, 0.025, -0.015, 0.01, 0.02, -0.025, 0.005, 0.03, -0.01, 0.015, -0.02, 0.01, 0.005, -0.01, 0.02, -0.015];
  const candidateCloses = pricesFromReturns(100, rawReturns);
  const closesA = pricesFromReturns(50, rawReturns); // identical real returns
  const closesB = pricesFromReturns(200, rawReturns.map((r) => -r)); // exactly negated real returns

  const positions = [
    { symbol: "AAA", marketValue: 5000 },
    { symbol: "BBB", marketValue: 3000 },
  ];
  const getJson = async (url) => {
    if (url.includes("ticker=CAND")) return { bars: barsFromCloses(candidateCloses) };
    if (url.includes("ticker=AAA")) return { bars: barsFromCloses(closesA) };
    if (url.includes("ticker=BBB")) return { bars: barsFromCloses(closesB) };
    return { bars: [] };
  };
  const result = await computeSymbolVsPositionsCorrelation("CAND", positions, getJson);
  assert.strictEqual(result.candidateSymbol, "CAND");
  assert.strictEqual(result.correlations.length, 2);
  assert.strictEqual(result.insufficientData.length, 0);
  const aaa = result.correlations.find((c) => c.symbol === "AAA");
  const bbb = result.correlations.find((c) => c.symbol === "BBB");
  assert.ok(aaa.correlation > 0.9, `expected AAA highly positively correlated, got ${aaa.correlation}`);
  assert.ok(bbb.correlation < -0.9, `expected BBB highly negatively correlated, got ${bbb.correlation}`);
  assert.strictEqual(aaa.marketValue, 5000);
  assert.ok(Math.abs(result.correlations[0].correlation) >= Math.abs(result.correlations[1].correlation));
});
await okAsync("a held position with too few real bars (< MIN_BARS) is honestly excluded, not fabricated", async () => {
  const candidateCloses = Array.from({ length: 25 }, (_, i) => 100 + i);
  const positions = [{ symbol: "THIN", marketValue: 1000 }];
  const getJson = async (url) => {
    if (url.includes("ticker=CAND")) return { bars: barsFromCloses(candidateCloses) };
    if (url.includes("ticker=THIN")) return { bars: barsFromCloses([100, 101, 102]) }; // only 3 bars, well under MIN_BARS
    return { bars: [] };
  };
  const result = await computeSymbolVsPositionsCorrelation("CAND", positions, getJson);
  assert.strictEqual(result.correlations.length, 0);
  assert.deepStrictEqual(result.insufficientData, ["THIN"]);
});
await okAsync("the candidate symbol itself has too few real bars -> honest empty result, never a guessed correlation", async () => {
  const positions = [{ symbol: "AAA", marketValue: 1000 }];
  const getJson = async (url) => {
    if (url.includes("ticker=CAND")) return { bars: barsFromCloses([100, 101]) }; // too thin
    if (url.includes("ticker=AAA")) return { bars: barsFromCloses(Array.from({ length: 25 }, (_, i) => 50 + i)) };
    return { bars: [] };
  };
  const result = await computeSymbolVsPositionsCorrelation("CAND", positions, getJson);
  assert.strictEqual(result.correlations.length, 0);
  assert.strictEqual(result.candidateInsufficientData, true);
});
await okAsync("the candidate symbol is excluded from its own comparison set when already held (comparing a symbol to itself is meaningless)", async () => {
  const closes = Array.from({ length: 25 }, (_, i) => 100 + i);
  const positions = [{ symbol: "CAND", marketValue: 1000 }, { symbol: "AAA", marketValue: 2000 }];
  const getJson = async () => ({ bars: barsFromCloses(closes) });
  const result = await computeSymbolVsPositionsCorrelation("CAND", positions, getJson);
  assert.ok(!result.correlations.find((c) => c.symbol === "CAND"), "must never compare the candidate against itself");
});
await okAsync("no held positions at all -> honest empty result, no crash", async () => {
  const result = await computeSymbolVsPositionsCorrelation("CAND", [], async () => ({ bars: [] }));
  assert.deepStrictEqual(result, { candidateSymbol: "CAND", correlations: [], insufficientData: [] });
});

console.log("Checking correlationGateTripped — real pre-trade correlation hard-check…");
ok("a real r=0.85 correlation against a real large position (>=5% equity) trips the gate", () => {
  const hit = correlationGateTripped({ correlations: [{ symbol: "NVDA", correlation: 0.85, marketValue: 10_000 }], equity: 100_000 });
  assert.ok(hit && hit.symbol === "NVDA");
});
ok("a real r=0.85 correlation against a small position (<5% equity) does NOT trip the gate", () => {
  const hit = correlationGateTripped({ correlations: [{ symbol: "NVDA", correlation: 0.85, marketValue: 2_000 }], equity: 100_000 });
  assert.strictEqual(hit, null);
});
ok("a real r=0.5 correlation (below CLUSTER_THRESHOLD) never trips the gate, even against a huge position", () => {
  const hit = correlationGateTripped({ correlations: [{ symbol: "NVDA", correlation: 0.5, marketValue: 50_000 }], equity: 100_000 });
  assert.strictEqual(hit, null);
});
ok("a real negative correlation is judged on magnitude (|r|), not sign", () => {
  const hit = correlationGateTripped({ correlations: [{ symbol: "SPXS", correlation: -0.9, marketValue: 10_000 }], equity: 100_000 });
  assert.ok(hit);
});
ok("no positions/no equity -> honest null, never crashes", () => {
  assert.strictEqual(correlationGateTripped({ correlations: [], equity: 100_000 }), null);
  assert.strictEqual(correlationGateTripped({ correlations: [{ symbol: "X", correlation: 0.9, marketValue: 10_000 }], equity: 0 }), null);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("PORTFOLIO-CORRELATION-CALC TEST FAILED"); else console.log("PORTFOLIO-CORRELATION-CALC TEST OK");

})();
