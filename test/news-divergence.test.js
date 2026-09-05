// Real tests for News Intelligence Engine V1's news/price divergence
// detection and multi-asset verdict (src/news/confirmation.js's
// detectNewsDivergence, src/news/scorer.js's computeAssetImpact — see
// .claude/plans/proud-yawning-unicorn.md). Same minimal no-framework
// style as test/news-regime-detection.test.js.
"use strict";
const assert = require("node:assert");
const { detectNewsDivergence, confirmationFromRow } = require("../src/news/confirmation");
const { computeAssetImpact } = require("../src/news/scorer");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking detectNewsDivergence — real news-sentiment-vs-SPY/QQQ contradiction detection…");

ok("bearish-read headline + SPY and QQQ both real up -> NEWS_PRICE_DIVERGENCE", () => {
  const r = detectNewsDivergence({ sentimentTier: "BEARISH", spyChg: 0.6, qqqChg: 0.9 });
  assert.strictEqual(r.divergence, "NEWS_PRICE_DIVERGENCE");
});

ok("bullish-read headline + SPY and QQQ both real down -> NEWS_PRICE_DIVERGENCE", () => {
  const r = detectNewsDivergence({ sentimentTier: "STRONGLY_BULLISH", spyChg: -0.5, qqqChg: -0.7 });
  assert.strictEqual(r.divergence, "NEWS_PRICE_DIVERGENCE");
});

ok("bearish-read headline + SPY and QQQ both real down -> ALIGNED, never a false divergence", () => {
  const r = detectNewsDivergence({ sentimentTier: "BEARISH", spyChg: -0.4, qqqChg: -0.3 });
  assert.strictEqual(r.divergence, "ALIGNED");
});

ok("bullish-read headline + SPY and QQQ both real up -> ALIGNED", () => {
  const r = detectNewsDivergence({ sentimentTier: "BULLISH", spyChg: 0.3, qqqChg: 0.5 });
  assert.strictEqual(r.divergence, "ALIGNED");
});

ok("SPY/QQQ moving in OPPOSITE directions is never forced into a divergence call either way", () => {
  const r = detectNewsDivergence({ sentimentTier: "BEARISH", spyChg: 0.5, qqqChg: -0.5 });
  assert.strictEqual(r.divergence, "ALIGNED");
});

ok("neutral sentiment has no directional read to compare -> NOT_APPLICABLE, never fabricated", () => {
  const r = detectNewsDivergence({ sentimentTier: "NEUTRAL", spyChg: 1.0, qqqChg: 1.0 });
  assert.strictEqual(r.divergence, "NOT_APPLICABLE");
});

ok("missing real SPY/QQQ data is an honest UNKNOWN, never assumed ALIGNED", () => {
  const r = detectNewsDivergence({ sentimentTier: "BEARISH", spyChg: null, qqqChg: null });
  assert.strictEqual(r.divergence, "UNKNOWN");
});

console.log("\nChecking rejectionLabel — sharper Market Rejection / Bad-News-Good-Price framing (A+ V1.1)…");

ok("bearish news + real market up -> BEARISH_NEWS_REJECTED", () => {
  const r = detectNewsDivergence({ sentimentTier: "BEARISH", spyChg: 0.6, qqqChg: 0.9 });
  assert.strictEqual(r.rejectionLabel, "BEARISH_NEWS_REJECTED");
});

ok("bullish news + real market down -> BULLISH_NEWS_REJECTED", () => {
  const r = detectNewsDivergence({ sentimentTier: "BULLISH", spyChg: -0.5, qqqChg: -0.7 });
  assert.strictEqual(r.rejectionLabel, "BULLISH_NEWS_REJECTED");
});

ok("an aligned read has no rejection label, never fabricated", () => {
  const r = detectNewsDivergence({ sentimentTier: "BULLISH", spyChg: 0.5, qqqChg: 0.6 });
  assert.strictEqual(r.rejectionLabel, null);
});

ok("neutral/unknown cases also carry an honest null rejectionLabel, never undefined", () => {
  assert.strictEqual(detectNewsDivergence({ sentimentTier: "NEUTRAL", spyChg: 1, qqqChg: 1 }).rejectionLabel, null);
  assert.strictEqual(detectNewsDivergence({ sentimentTier: "BEARISH", spyChg: null, qqqChg: null }).rejectionLabel, null);
});

ok("rejectionLabel flows through confirmationFromRow's real confirmation object", () => {
  const c = confirmationFromRow({ chg: -1.2, rvol: 2.1, aboveVwap: false }, 0.6, "BEARISH", 0.9);
  assert.strictEqual(c.rejectionLabel, "BEARISH_NEWS_REJECTED");
});

console.log("\nChecking confirmationFromRow — divergence flows through into the real confirmation object…");

ok("a real confirmation object carries the divergence + divergenceReason fields", () => {
  const row = { chg: -1.2, rvol: 2.1, aboveVwap: false };
  const c = confirmationFromRow(row, 0.6, "BEARISH", 0.9);
  assert.strictEqual(c.divergence, "NEWS_PRICE_DIVERGENCE");
  assert.ok(c.divergenceReason);
  assert.ok(c.reasons.includes(c.divergenceReason));
});

ok("no real intraday row still carries an honest divergence read (not silently dropped)", () => {
  const c = confirmationFromRow(null, -0.5, "BEARISH", -0.6);
  assert.strictEqual(c.available, false);
  assert.strictEqual(c.divergence, "ALIGNED");
});

console.log("\nChecking computeAssetImpact — real per-asset directional read, never one universal verdict…");

ok("a real single-ticker bullish item reports the ticker, its real sector ETF, and SPY/QQQ", () => {
  const assets = computeAssetImpact({ ticker: "NVDA", sentiment: "BULLISH", confirmation: { divergence: "ALIGNED" } });
  const bySymbol = Object.fromEntries(assets.map((a) => [a.symbol, a]));
  assert.strictEqual(bySymbol.NVDA.direction, "BULLISH");
  assert.strictEqual(bySymbol.XLK.direction, "BULLISH"); // NVDA's real sector ETF (sector-theme-map.js)
  assert.strictEqual(bySymbol.SPY.direction, "BULLISH");
  assert.strictEqual(bySymbol.QQQ.direction, "BULLISH");
});

ok("a ticker with no real sector ETF (crypto) skips that row rather than fabricating one", () => {
  const assets = computeAssetImpact({ ticker: "COIN", sentiment: "BEARISH", confirmation: { divergence: "ALIGNED" } });
  assert.ok(!assets.some((a) => a.symbol !== "COIN" && a.symbol !== "SPY" && a.symbol !== "QQQ"));
});

ok("a broad MARKET-tagged item (no single real ticker) reports SPY/QQQ only", () => {
  const assets = computeAssetImpact({ ticker: "MARKET", sentiment: "BEARISH", confirmation: { divergence: "ALIGNED" } });
  assert.deepStrictEqual(assets.map((a) => a.symbol), ["SPY", "QQQ"]);
});

ok("a real divergence flips SPY/QQQ's reported direction to MIXED, not a false confident verdict", () => {
  const assets = computeAssetImpact({ ticker: "NVDA", sentiment: "BULLISH", confirmation: { divergence: "NEWS_PRICE_DIVERGENCE" } });
  const bySymbol = Object.fromEntries(assets.map((a) => [a.symbol, a]));
  assert.strictEqual(bySymbol.NVDA.direction, "BULLISH"); // the ticker's own headline-driven read is unchanged
  assert.strictEqual(bySymbol.SPY.direction, "MIXED"); // but the market-wide read honestly reflects the real contradiction
  assert.strictEqual(bySymbol.QQQ.direction, "MIXED");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("NEWS-DIVERGENCE TEST FAILED");
else console.log("NEWS-DIVERGENCE TEST OK");
