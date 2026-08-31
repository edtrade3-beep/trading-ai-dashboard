// Real tests for src/autopilot2-engine.js's sizeEntry — the one pure
// sizing calculation in this file (tick/managePositions/tryEnter all do
// real network scans + real account I/O, same "test the pure helpers"
// convention as the rest of this session's engine tests). Covers spec
// §17's exact real defaults: 0.5% risk/trade, $500 max real risk/trade,
// reusing risk-guardrails.js's own sizePositionByRisk (not a re-derived
// copy) with a real dollar ceiling layered on top since that function
// only knows percentages. Pure-function, synthetic-input, zero-network.
// Run: node test/autopilot2-engine.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { sizeEntry, sizeCryptoEntry, CRYPTO_UNIVERSE, RISK_PCT_PER_TRADE, MAX_TRADE_RISK_DOLLARS, isBullishCandidate, isBearishCandidate, BULLISH_RANK, BEARISH_RANK, symbolsToScan } = require("../src/autopilot2-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking sizeEntry — real risk-% sizing, real $ cap layered on top…");
ok(`real spec defaults: ${RISK_PCT_PER_TRADE}% risk/trade, $${MAX_TRADE_RISK_DOLLARS} max/trade`, () => {
  assert.strictEqual(RISK_PCT_PER_TRADE, 0.5);
  assert.strictEqual(MAX_TRADE_RISK_DOLLARS, 500);
});
ok("a real $100k account, tight stop -> the real 20% max-name-concentration cap binds before risk-pct or the $ cap do", () => {
  // 0.5% of 100k = $500 risk budget / $1 risk-per-share = 500 sh by
  // risk-pct alone, and the $500 cap ALSO allows 500 sh here — but
  // sizePositionByRisk's own real maxNamePct (default 20%) caps position
  // VALUE to $20,000, which at $50/share is only 400 sh — the real
  // binding constraint in this scenario, proving all 3 real caps are
  // actually enforced together, not just the two this file adds.
  const { qty } = sizeEntry({ equity: 100_000, cash: 100_000, entry: 50, stop: 49 });
  assert.strictEqual(qty, 400);
});
ok("a real wide stop -> the $500 dollar cap binds tighter than the % math, real risk never exceeds $500", () => {
  // 0.5% of 100k = $500 risk budget / $10 risk-per-share = 50 sh by
  // risk-pct; that's already within the $500 cap (50*10=$500) — use a
  // scenario where risk-pct alone would authorize MORE than $500 of real
  // risk to prove the dollar cap is the one that actually binds.
  const { qty, riskPerShare } = sizeEntry({ equity: 500_000, cash: 500_000, entry: 100, stop: 98 });
  // 0.5% of 500k = $2500 risk budget / $2 risk-per-share = 1250 sh by
  // risk-pct alone -> $2500 real risk, way over the real $500 ceiling.
  assert.ok(qty * riskPerShare <= MAX_TRADE_RISK_DOLLARS + 1e-9, `real dollar risk ${qty * riskPerShare} must never exceed the real $${MAX_TRADE_RISK_DOLLARS} cap`);
  assert.strictEqual(qty, 250, "expected the $500 cap / $2 risk-per-share = 250 sh to be the real binding constraint");
});
ok("insufficient real cash caps sizing below what the risk-pct math alone would allow", () => {
  const { qty } = sizeEntry({ equity: 100_000, cash: 200, entry: 50, stop: 49 });
  assert.ok(qty <= 4, `only $200 real cash at $50/share should cap qty to 4, got ${qty}`);
});
ok("an invalid stop (>= entry) is honestly rejected, never a fabricated size", () => {
  const { qty, reason } = sizeEntry({ equity: 100_000, cash: 100_000, entry: 50, stop: 51 });
  assert.strictEqual(qty, 0);
  assert.ok(reason);
});
ok("a real setup that risks less than $500 at the % sizing is never artificially shrunk further by the $ cap", () => {
  // 0.5% of 10k = $50 risk budget / $5 risk-per-share = 10 sh -> $50 real
  // risk, already well under the $500 cap — the cap must not bind here.
  const { qty } = sizeEntry({ equity: 10_000, cash: 10_000, entry: 50, stop: 45 });
  assert.strictEqual(qty, 10);
});

console.log("\nChecking sizeCryptoEntry — real risk-% sizing with real fractional units (2026-08-30, \"make it 24/7 trade because of crypto\")…");
ok("a real BTC-priced entry (~$78,750) sizes to a real fraction of a coin, never floored to 0", () => {
  const { qty } = sizeCryptoEntry({ equity: 100_000, cash: 100_000, entry: 78_750, stop: 75_000 });
  assert.ok(qty > 0, `expected a real positive fractional qty, got ${qty}`);
  assert.ok(qty < 1, `expected LESS than one whole coin at this risk budget, got ${qty}`);
});
ok("the real risk-%-based dollar amount actually spent matches the disclosed risk budget (0.5% of equity / risk-per-unit), not a whole-unit rounding artifact", () => {
  // 0.5% of 100k = $500 risk / $3750 risk-per-unit = 0.133333... coin
  const { qty, riskPerShare } = sizeCryptoEntry({ equity: 100_000, cash: 100_000, entry: 78_750, stop: 75_000 });
  assert.strictEqual(riskPerShare, 3750);
  assert.strictEqual(Math.round(qty * riskPerShare), 500);
});
ok("rounds to real 6-decimal crypto precision, not a raw float", () => {
  const { qty } = sizeCryptoEntry({ equity: 100_000, cash: 100_000, entry: 78_750, stop: 75_000 });
  assert.strictEqual(qty, Math.floor(qty * 1e6) / 1e6);
});
ok("insufficient real cash caps the real fractional qty accordingly, never goes negative", () => {
  const { qty } = sizeCryptoEntry({ equity: 100_000, cash: 100, entry: 78_750, stop: 75_000 });
  assert.ok(qty >= 0 && qty * 78_750 <= 100.000001, `expected qty capped to real available cash, got ${qty}`);
});
ok("no real valid entry/stop -> honest 0, same discipline as sizeEntry", () => {
  assert.strictEqual(sizeCryptoEntry({ equity: 100_000, cash: 100_000, entry: 100, stop: 110 }).qty, 0);
});
ok("a small, real, disclosed crypto universe — not silently expanded or empty", () => {
  assert.ok(Array.isArray(CRYPTO_UNIVERSE) && CRYPTO_UNIVERSE.length > 0);
  assert.ok(CRYPTO_UNIVERSE.includes("BTC-USD"));
});

console.log("\nChecking sizeEntry/sizeCryptoEntry with direction:\"SHORT\" (2026-08-31, bidirectional trading)…");
ok("sizeEntry SHORT: a real stop ABOVE entry is valid (mirrors lightbox-autopilot-execute.js's own stopValid convention)", () => {
  const { qty, riskPerShare } = sizeEntry({ equity: 100_000, cash: 100_000, entry: 100, stop: 105, direction: "SHORT" });
  assert.strictEqual(riskPerShare, 5);
  assert.ok(qty > 0);
});
ok("sizeEntry SHORT: a stop BELOW entry (a real long-shaped stop) is rejected as invalid for a short", () => {
  const { qty, reason } = sizeEntry({ equity: 100_000, cash: 100_000, entry: 100, stop: 95, direction: "SHORT" });
  assert.strictEqual(qty, 0);
  assert.ok(reason);
});
ok("sizeEntry SHORT sizes identically to the equivalent LONG risk-per-share (symmetric risk math)", () => {
  const short = sizeEntry({ equity: 100_000, cash: 100_000, entry: 100, stop: 105, direction: "SHORT" });
  const long = sizeEntry({ equity: 100_000, cash: 100_000, entry: 100, stop: 95 });
  assert.strictEqual(short.qty, long.qty);
  assert.strictEqual(short.riskPerShare, long.riskPerShare);
});
ok("sizeEntry with no direction defaults to LONG — full backward compatibility", () => {
  const withoutDirection = sizeEntry({ equity: 100_000, cash: 100_000, entry: 100, stop: 95 });
  const explicitLong = sizeEntry({ equity: 100_000, cash: 100_000, entry: 100, stop: 95, direction: "LONG" });
  assert.deepStrictEqual(withoutDirection, explicitLong);
});
ok("sizeCryptoEntry SHORT: real fractional short-simulated sizing, same stop-validity convention as sizeEntry", () => {
  const { qty, riskPerShare } = sizeCryptoEntry({ equity: 100_000, cash: 100_000, entry: 78_750, stop: 82_500, direction: "SHORT" });
  assert.strictEqual(riskPerShare, 3750);
  assert.ok(qty > 0 && qty < 1);
});
ok("sizeCryptoEntry SHORT: a long-shaped stop (below entry) is rejected", () => {
  const { qty } = sizeCryptoEntry({ equity: 100_000, cash: 100_000, entry: 78_750, stop: 75_000, direction: "SHORT" });
  assert.strictEqual(qty, 0, "stop below entry is a LONG-shaped stop, invalid for a real short");
});

console.log("\nChecking isBullishCandidate/isBearishCandidate — real near-miss WATCH inclusion, widening the opportunity pool (2026-08-31, \"make $1000/day... best setup\")…");
ok("EARLY_BUY/BUY are always actionable, regardless of executableEntry", () => {
  assert.strictEqual(isBullishCandidate({ verdict: "EARLY_BUY" }), true);
  assert.strictEqual(isBullishCandidate({ verdict: "BUY", executableEntry: null }), true);
});
ok("a real WATCH verdict WITH a real executable entry is now accepted — the actual widening", () => {
  assert.strictEqual(isBullishCandidate({ verdict: "WATCH", executableEntry: 123.45 }), true);
});
ok("a real WATCH verdict with NO real executable entry is still rejected — a WATCH with nothing to trade can never become tradeable just by relaxing the bar", () => {
  assert.strictEqual(isBullishCandidate({ verdict: "WATCH", executableEntry: null }), false);
  assert.strictEqual(isBullishCandidate({ verdict: "WATCH" }), false);
});
ok("AVOID_LONG/WAIT are never accepted — this only widens the SOFT score bar, hard gates (already baked into the verdict) are untouched", () => {
  assert.strictEqual(isBullishCandidate({ verdict: "AVOID_LONG", executableEntry: 100 }), false);
  assert.strictEqual(isBullishCandidate({ verdict: "WAIT", executableEntry: 100 }), false);
});
ok("EARLY_SHORT/SHORT are always actionable", () => {
  assert.strictEqual(isBearishCandidate({ bearishVerdict: "EARLY_SHORT" }), true);
  assert.strictEqual(isBearishCandidate({ bearishVerdict: "SHORT" }), true);
});
ok("a real WATCH_SHORT with a real bearishEntry is accepted — the bearish mirror of the widening", () => {
  assert.strictEqual(isBearishCandidate({ bearishVerdict: "WATCH_SHORT", bearishEntry: 88.5 }), true);
});
ok("a real WATCH_SHORT with no real bearishEntry is rejected", () => {
  assert.strictEqual(isBearishCandidate({ bearishVerdict: "WATCH_SHORT", bearishEntry: null }), false);
});
ok("AVOID_SHORT is never accepted", () => {
  assert.strictEqual(isBearishCandidate({ bearishVerdict: "AVOID_SHORT", bearishEntry: 100 }), false);
});
ok("BULLISH_RANK/BEARISH_RANK real ordering puts EARLY_ before plain, and both before the new WATCH near-miss tier", () => {
  assert.ok(BULLISH_RANK.EARLY_BUY < BULLISH_RANK.BUY && BULLISH_RANK.BUY < BULLISH_RANK.WATCH);
  assert.ok(BEARISH_RANK.EARLY_SHORT < BEARISH_RANK.SHORT && BEARISH_RANK.SHORT < BEARISH_RANK.WATCH_SHORT);
});

console.log("\nChecking the widened CRYPTO_UNIVERSE (2026-08-31, real trade-frequency fix)…");
ok("real, live-verified additions are present (TRX/ATOM/NEAR/ETC/XLM/FIL/OP/ICP)", () => {
  for (const s of ["TRX-USD", "ATOM-USD", "NEAR-USD", "ETC-USD", "XLM-USD", "FIL-USD", "OP-USD", "ICP-USD"]) {
    assert.ok(CRYPTO_UNIVERSE.includes(s), `expected ${s} in the widened universe`);
  }
});
ok("symbols with a real confirmed $0-pricing data-quality gap are deliberately excluded, not silently traded", () => {
  assert.ok(!CRYPTO_UNIVERSE.includes("SHIB-USD"));
  assert.ok(!CRYPTO_UNIVERSE.includes("ARB-USD"));
  assert.ok(!CRYPTO_UNIVERSE.includes("APT-USD"), "no real Yahoo chart data for this symbol");
});
ok("the original 11-symbol universe is still fully intact — purely additive", () => {
  for (const s of ["BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "DOGE-USD", "ADA-USD", "AVAX-USD", "LINK-USD", "LTC-USD", "BCH-USD", "DOT-USD"]) {
    assert.ok(CRYPTO_UNIVERSE.includes(s));
  }
  assert.strictEqual(CRYPTO_UNIVERSE.length, 19);
});

console.log("\nChecking symbolsToScan — real Trade Desk watchlist dedup logic (2026-08-31, \"trade desk will be also money makers\")…");
ok("a real watchlist symbol not in SCAN_UNIVERSE and not already scanned is included", () => {
  const r = symbolsToScan(["ZZZZ"], ["AAPL", "MSFT"], new Set(["TSLA"]));
  assert.deepStrictEqual(r, ["ZZZZ"]);
});
ok("a watchlist symbol already in SCAN_UNIVERSE is excluded — never a redundant duplicate scan", () => {
  const r = symbolsToScan(["AAPL", "ZZZZ"], ["AAPL", "MSFT"], new Set());
  assert.deepStrictEqual(r, ["ZZZZ"]);
});
ok("a watchlist symbol already scanned this same tick is excluded too", () => {
  const r = symbolsToScan(["TSLA", "ZZZZ"], ["AAPL"], new Set(["TSLA"]));
  assert.deepStrictEqual(r, ["ZZZZ"]);
});
ok("duplicate watchlist symbols are deduped", () => {
  const r = symbolsToScan(["ZZZZ", "ZZZZ", "YYYY"], [], new Set());
  assert.deepStrictEqual(r, ["ZZZZ", "YYYY"]);
});
ok("an empty real watchlist returns an empty real list, never fabricated symbols", () => {
  assert.deepStrictEqual(symbolsToScan([], ["AAPL"], new Set()), []);
  assert.deepStrictEqual(symbolsToScan(null, ["AAPL"], new Set()), []);
});
ok("alreadyScanned accepts a plain array too, not just a Set", () => {
  const r = symbolsToScan(["TSLA", "ZZZZ"], [], ["TSLA"]);
  assert.deepStrictEqual(r, ["ZZZZ"]);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("AUTOPILOT2-ENGINE TEST FAILED"); else console.log("AUTOPILOT2-ENGINE TEST OK");
