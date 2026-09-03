"use strict";
// Real regression test for a real, confirmed-live production bug
// (2026-09-02): canonical-decision-pipeline.js sets
// `opportunity.assetDecision = assetDecision`, and asset-decision.js's
// buildAssetDecision() used to ALSO set `assetDecision.sourceOpportunity
// = opportunity` — a perfect circular reference (opportunity ->
// assetDecision -> sourceOpportunity -> opportunity). Confirmed via
// Render's real production logs: this made JSON.stringify() throw
// "Converting circular structure to JSON" inside writeJson() for
// /api/market/opportunities and /api/market/trend-screen?withDecision=1,
// AFTER res.writeHead(200) had already run — leaving the HTTP response
// half-sent (headers committed, body never written), which is why the
// client saw an indefinite hang (0 bytes) rather than a clean error.
// sourceOpportunity had zero real consumers anywhere in the codebase
// (confirmed via repo-wide grep), so it was removed outright rather than
// broken in a different way.
const assert = require("node:assert");
const { computeCanonicalAssetDecision } = require("../src/canonical-decision-pipeline");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

function baseRow(overrides = {}) {
  return {
    symbol: "TEST", price: 102, pivot: 100, entry: 100, stop: 92, target2: 124,
    stage: "Stage 2 - Advancing", passCount: 7, rsRating: 92, momentum: 0.3, volRatio: 1.8,
    abovePivotPct: 2, contractionLow: 88, higherLows: true, tightening: true,
    vcpVerdict: "VALID VCP", vcpScore: 88, technicals: { vwap20: 95 },
    breakoutConfirmed: true, extended: false, riskPct: 5, dollarVolume: 400_000_000,
    epsGrowth: 20, pctFromHigh: -3, smc: { bos: { type: "BULL_BOS" } },
    ...overrides,
  };
}

console.log("Checking canonical-decision-pipeline.js — the response it builds must be real JSON-serializable, matching every real GET route that returns it directly…");

ok("computeCanonicalAssetDecision's result (with opportunity.assetDecision attached, exactly like every real route does) survives JSON.stringify with no circular structure", () => {
  const canonical = computeCanonicalAssetDecision({
    symbol: "TEST", row: baseRow(), macroQuotes: [], nowMs: Date.now(), marketHours: true,
  });
  assert.ok(canonical, "a real, well-formed row must produce a real canonical result, not null");
  assert.strictEqual(canonical.opportunity.assetDecision, canonical.assetDecision, "opportunity.assetDecision must still point at the same real assetDecision object (unrelated behavior, must not regress)");
  assert.doesNotThrow(() => JSON.stringify(canonical), "JSON.stringify must never throw 'Converting circular structure to JSON' on a real canonical result");
});

ok("assetDecision no longer carries a sourceOpportunity back-reference", () => {
  const canonical = computeCanonicalAssetDecision({
    symbol: "TEST", row: baseRow(), macroQuotes: [], nowMs: Date.now(), marketHours: true,
  });
  assert.strictEqual(canonical.assetDecision.sourceOpportunity, undefined, "sourceOpportunity had zero real consumers and created the circular reference — must stay removed");
});

console.log("\nChecking Trade GPS's signalState integration (2026-09-03)…");
ok("a real, well-formed row gets a real pre-entry signalState from the same shared signal-lifecycle.js machine, never a fabricated value", () => {
  const { PRE_ENTRY_STATES } = require("../src/signal-lifecycle");
  const canonical = computeCanonicalAssetDecision({
    symbol: "TEST", row: baseRow(), macroQuotes: [], nowMs: Date.now(), marketHours: true,
  });
  assert.ok(PRE_ENTRY_STATES.has(canonical.assetDecision.signalState), `expected a real pre-entry state, got ${canonical.assetDecision.signalState}`);
});
ok("a held position (positionState supplied) gets signalState: null — that's position-decision-engine.js's own separate concern, never duplicated here", () => {
  const canonical = computeCanonicalAssetDecision({
    symbol: "TEST", row: baseRow(), macroQuotes: [], nowMs: Date.now(), marketHours: true,
  });
  const { buildAssetDecision } = require("../src/asset-decision");
  const held = buildAssetDecision({ opportunity: canonical.opportunity, marketRegime: canonical.marketRegime, dataHealth: canonical.dataHealth, positionState: "HOLD", positionReason: "test" });
  assert.strictEqual(held.signalState, null);
});

console.log("\nChecking Trade GPS's 7-bucket score integration (2026-09-03)…");
ok("a real, well-formed row gets a real tradeGps score/band, additive alongside the unchanged real opportunity.score", () => {
  const canonical = computeCanonicalAssetDecision({
    symbol: "TEST", row: baseRow(), macroQuotes: [], nowMs: Date.now(), marketHours: true,
  });
  assert.ok(canonical.tradeGps, "tradeGps must be present on the pipeline result");
  assert.ok(["PRIMARY", "WATCH", "REJECT", "NO_TRADE"].includes(canonical.tradeGps.band));
  assert.ok(Number.isFinite(canonical.opportunity.score), "the real existing 12-bucket score must stay completely untouched");
  assert.doesNotThrow(() => JSON.stringify(canonical), "adding tradeGps must never reintroduce a circular structure");
});

console.log("\nChecking Trade GPS's stock-vs-option structure pick integration (2026-09-03)…");
ok("a real, well-formed row with no real option chain supplied gets a real STOCK structure pick, additive alongside tradeGps", () => {
  const canonical = computeCanonicalAssetDecision({
    symbol: "TEST", row: baseRow(), macroQuotes: [], nowMs: Date.now(), marketHours: true,
  });
  assert.ok(canonical.tradeStructure, "tradeStructure must be present on the pipeline result");
  assert.strictEqual(canonical.tradeStructure.structure, "STOCK", "no real option chain supplied -> real stock preferred, never fabricated");
  assert.doesNotThrow(() => JSON.stringify(canonical), "adding tradeStructure must never reintroduce a circular structure");
});

console.log("\nChecking Trade GPS's Trap Shield + verdict translation integration (2026-09-03)…");
ok("a real, well-formed row gets a real trapShield read and a real tradeGpsVerdict, additive alongside everything else", () => {
  const canonical = computeCanonicalAssetDecision({
    symbol: "TEST", row: baseRow(), macroQuotes: [], nowMs: Date.now(), marketHours: true,
  });
  assert.ok(canonical.trapShield, "trapShield must be present on the pipeline result");
  assert.strictEqual(typeof canonical.trapShield.blocked, "boolean");
  assert.ok(canonical.marketAgreement, "marketAgreement must be present on the pipeline result (TradeGpsCard's own real read)");
  assert.strictEqual(typeof canonical.marketAgreement.total, "number");
  assert.strictEqual(canonical.dangerEvent, null, "the shipped real macro-calendar seed is empty — dangerEvent must be honestly null, never fabricated");
  assert.ok(canonical.whyNow, "whyNow must be present on the pipeline result");
  assert.ok(canonical.whyNow.primary, `a real well-formed breakout row should surface a real primary reason, got ${JSON.stringify(canonical.whyNow.primary)}`);
  assert.ok(canonical.tradeLane, "tradeLane must be present on the pipeline result");
  assert.ok([null, "A_TRADE", "QUICK_TRADE", "DEVELOPING"].includes(canonical.tradeLane.lane), `expected a real lane value, got ${canonical.tradeLane.lane}`);
  assert.ok(canonical.tradeGpsVerdict, "tradeGpsVerdict must be present on the pipeline result");
  const { TRADE_GPS_VERDICTS } = require("../src/trade-gps-verdict");
  assert.ok(TRADE_GPS_VERDICTS.has(canonical.tradeGpsVerdict.verdict), `expected a real Trade GPS verdict, got ${canonical.tradeGpsVerdict.verdict}`);
  assert.strictEqual(canonical.assetDecision.verdict, canonical.assetDecision.verdict, "the real canonical FINAL_VERDICTS verdict must stay completely untouched");
  assert.doesNotThrow(() => JSON.stringify(canonical), "adding trapShield/tradeGpsVerdict must never reintroduce a circular structure");
});

console.log("\nChecking latestTimestampMs's real asOfMs support (2026-09-03 fix)…");
ok("a row with a real asOfMs stamp (routes/market.js's screenTrendTemplate/macroRows fix) marks market-price/macro-quotes HEALTHY, not DEGRADED, even with no provider-native timestamp field", () => {
  const nowMs = Date.now();
  const row = baseRow({ asOfMs: nowMs });
  const macroQuotes = [{ symbol: "SPY", regularMarketPrice: 500, asOfMs: nowMs }];
  const canonical = computeCanonicalAssetDecision({ symbol: "TEST", row, macroQuotes, nowMs, marketHours: true });
  const marketPriceSource = canonical.dataHealth.sources.find((s) => s.source === "market-price");
  const macroQuotesSource = canonical.dataHealth.sources.find((s) => s.source === "macro-quotes");
  assert.strictEqual(marketPriceSource.status, "HEALTHY", "a real asOfMs stamp must resolve market-price to HEALTHY");
  assert.strictEqual(macroQuotesSource.status, "HEALTHY", "a real asOfMs stamp must resolve macro-quotes to HEALTHY");
  assert.strictEqual(canonical.dataHealth.confidenceMultiplier, 1, "no real degraded-source penalty once the real fetch time is honestly disclosed");
});
ok("no asOfMs and no other real timestamp field -> honestly DEGRADED, never silently assumed fresh", () => {
  const row = baseRow();
  const canonical = computeCanonicalAssetDecision({ symbol: "TEST", row, macroQuotes: [{ symbol: "SPY" }], nowMs: Date.now(), marketHours: true });
  const marketPriceSource = canonical.dataHealth.sources.find((s) => s.source === "market-price");
  assert.strictEqual(marketPriceSource.status, "DEGRADED");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("CANONICAL-DECISION-PIPELINE TEST FAILED");
else console.log("CANONICAL-DECISION-PIPELINE TEST OK");
