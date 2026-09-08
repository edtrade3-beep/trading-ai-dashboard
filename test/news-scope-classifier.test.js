"use strict";
const assert = require("node:assert");
const {
  classifyNewsScope, classifyDirection, classifyAlreadyPriced, shouldReviewVerdict, horizonEffect, buildNewsBrief,
} = require("../src/news/scope-classifier");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

console.log("Checking classifyNewsScope — real 4-bucket classification…");

ok("MACRO/GEOPOLITICAL/SYSTEMIC_RISK categories -> MARKET_MOVING regardless of ticker", () => {
  assert.strictEqual(classifyNewsScope({ category: "MACRO", ticker: "AAPL", impact_score: 90 }), "MARKET_MOVING");
  assert.strictEqual(classifyNewsScope({ category: "GEOPOLITICAL", ticker: "XOM", impact_score: 85 }), "MARKET_MOVING");
  assert.strictEqual(classifyNewsScope({ category: "SYSTEMIC_RISK", ticker: "JPM", impact_score: 95 }), "MARKET_MOVING");
});
ok("a real ticker tagged MARKET (the pipeline's own broad-market SPY/QQQ/DIA leg) -> MARKET_MOVING", () => {
  assert.strictEqual(classifyNewsScope({ category: "EARNINGS", ticker: "MARKET", impact_score: 70 }), "MARKET_MOVING");
});
ok("AI/CRYPTO_REGULATORY categories -> SECTOR_MOVING", () => {
  assert.strictEqual(classifyNewsScope({ category: "AI", ticker: "NVDA", impact_score: 75 }), "SECTOR_MOVING");
  assert.strictEqual(classifyNewsScope({ category: "CRYPTO_REGULATORY", ticker: "BTC", impact_score: 75 }), "SECTOR_MOVING");
});
ok("company-specific catalysts (EARNINGS/M&A/FDA/CONTRACT) -> TICKER_MOVING", () => {
  assert.strictEqual(classifyNewsScope({ category: "EARNINGS", ticker: "AAPL", impact_score: 70 }), "TICKER_MOVING");
  assert.strictEqual(classifyNewsScope({ category: "M&A", ticker: "PFE", impact_score: 80 }), "TICKER_MOVING");
});
ok("OTHER category -> honest NOISE, never elevated to a false catalyst", () => {
  assert.strictEqual(classifyNewsScope({ category: "OTHER", ticker: "AAPL", impact_score: 50 }), "NOISE");
});
ok("a real low-impact story is NOISE even with a genuine ticker-specific category", () => {
  assert.strictEqual(classifyNewsScope({ category: "EARNINGS", ticker: "AAPL", impact_score: 25 }), "NOISE");
});
ok("supports the news/store.js snake_case field name (impact_score) as well as the pipeline's own camelCase", () => {
  assert.strictEqual(classifyNewsScope({ category: "EARNINGS", ticker: "AAPL", impactScore: 70 }), "TICKER_MOVING");
});

console.log("\nChecking classifyDirection — real 3-state BULLISH/BEARISH/MIXED…");

ok("a genuine real news-price divergence always reads MIXED, even with a strong sentiment tier", () => {
  assert.strictEqual(classifyDirection({ sentiment: "STRONGLY_BULLISH", confirmation: { divergence: "NEWS_PRICE_DIVERGENCE" } }), "MIXED");
});
ok("bullish/bearish tiers map cleanly without a real divergence", () => {
  assert.strictEqual(classifyDirection({ sentiment: "BULLISH", confirmation: null }), "BULLISH");
  assert.strictEqual(classifyDirection({ sentiment: "STRONGLY_BEARISH", confirmation: null }), "BEARISH");
});
ok("NEUTRAL sentiment -> honest MIXED, never forced to a side", () => {
  assert.strictEqual(classifyDirection({ sentiment: "NEUTRAL", confirmation: null }), "MIXED");
});

console.log("\nChecking classifyAlreadyPriced — real confirmation-based read, never a guess…");

ok("no real confirmation data -> honest UNKNOWN", () => {
  assert.strictEqual(classifyAlreadyPriced(null), "UNKNOWN");
  assert.strictEqual(classifyAlreadyPriced({ available: false }), "UNKNOWN");
});
ok("a real divergence means the price hasn't moved with the news yet -> NOT_YET_PRICED", () => {
  assert.strictEqual(classifyAlreadyPriced({ available: true, divergence: "NEWS_PRICE_DIVERGENCE" }), "NOT_YET_PRICED");
});
ok("real confirmed price movement in the sentiment's direction -> PARTIALLY_PRICED", () => {
  assert.strictEqual(classifyAlreadyPriced({ available: true, confirmed: true }), "PARTIALLY_PRICED");
});

console.log("\nChecking shouldReviewVerdict — a real 'worth a fresh look' flag, never a forced verdict change…");

ok("high impact + strong sentiment + not yet priced -> flagged for review", () => {
  assert.strictEqual(shouldReviewVerdict({ impactClassification: "HIGH", sentiment: "STRONGLY_BULLISH", alreadyPriced: "NOT_YET_PRICED" }), true);
});
ok("already partially priced -> not flagged, even at high impact", () => {
  assert.strictEqual(shouldReviewVerdict({ impactClassification: "EXTREME", sentiment: "BEARISH", alreadyPriced: "PARTIALLY_PRICED" }), false);
});
ok("low/moderate impact never flags a review regardless of sentiment", () => {
  assert.strictEqual(shouldReviewVerdict({ impactClassification: "LOW", sentiment: "STRONGLY_BULLISH", alreadyPriced: "NOT_YET_PRICED" }), false);
});
ok("neutral sentiment never flags a review, even at high impact", () => {
  assert.strictEqual(shouldReviewVerdict({ impactClassification: "HIGH", sentiment: "NEUTRAL", alreadyPriced: "NOT_YET_PRICED" }), false);
});

console.log("\nChecking horizonEffect — real, disclosed category->timeframe heuristic…");

ok("EARNINGS is real short-term dominant, not long-term", () => {
  const h = horizonEffect("EARNINGS");
  assert.strictEqual(h.shortTerm, true);
  assert.strictEqual(h.longTerm, false);
});
ok("an unrecognized category honestly returns null/null, never guessed", () => {
  const h = horizonEffect("SOME_UNKNOWN_CATEGORY");
  assert.strictEqual(h.shortTerm, null);
  assert.strictEqual(h.longTerm, null);
});

console.log("\nChecking buildNewsBrief — the one combined real per-item brief…");

ok("composes every real field for a genuine high-impact ticker-specific story", () => {
  const brief = buildNewsBrief({
    headline: "Company beats Q3 earnings estimates", category: "EARNINGS", impact_score: 85,
    sentiment: "STRONGLY_BULLISH", ticker: "AAPL",
    confirmation: { available: true, confirmed: true, assetImpact: [{ symbol: "AAPL" }, { symbol: "XLK" }] },
  });
  assert.strictEqual(brief.scope, "TICKER_MOVING");
  assert.strictEqual(brief.whatHappened, "Company beats Q3 earnings estimates");
  assert.strictEqual(brief.direction, "BULLISH");
  assert.strictEqual(brief.alreadyPriced, "PARTIALLY_PRICED");
  assert.deepStrictEqual(brief.whichTickers, ["AAPL", "XLK"]);
  assert.strictEqual(brief.impactClassification, "HIGH");
});
ok("gracefully parses a real JSON-string confirmation field (news/store.js's DB row shape)", () => {
  const brief = buildNewsBrief({
    category: "MACRO", impact_score: 90, sentiment: "BEARISH", ticker: "MARKET",
    confirmation: JSON.stringify({ available: true, divergence: "NEWS_PRICE_DIVERGENCE" }),
  });
  assert.strictEqual(brief.scope, "MARKET_MOVING");
  assert.strictEqual(brief.direction, "MIXED");
  assert.strictEqual(brief.alreadyPriced, "NOT_YET_PRICED");
});
ok("never crashes on a minimal/empty real item", () => {
  const brief = buildNewsBrief({});
  assert.strictEqual(brief.scope, "NOISE");
  assert.strictEqual(brief.whatHappened, null);
  assert.deepStrictEqual(brief.whichTickers, []);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("NEWS-SCOPE-CLASSIFIER TEST FAILED");
else console.log("NEWS-SCOPE-CLASSIFIER TEST OK");
