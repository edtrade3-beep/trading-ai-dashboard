// Real tests for src/market-wrap-engine.js's pure sanitizers — the daily
// 4:30 PM ET Market Wrap (explicit user request, 2026-08-31). Pure-
// function, synthetic-input, zero-network — the AI call itself
// (market-wrap-ai.js) is untested by design, same precedent as
// research-intel-ai.js/command-center-ai.js in this codebase.
"use strict";
const assert = require("node:assert");
const {
  HEALTH_VERDICTS, NEWS_IMPACTS,
  sanitizeHealth, mergeMoverReasons, mergeSectorNotes, sanitizeBigNews, sanitizeOutlook,
} = require("../src/market-wrap-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking sanitizeHealth — bounded, honest-default verdict…");
ok("a real, in-enum verdict + reason round-trips", () => {
  const h = sanitizeHealth({ verdict: "STRONG", reason: "Real breadth confirms the move." });
  assert.strictEqual(h.verdict, "STRONG");
  assert.strictEqual(h.reason, "Real breadth confirms the move.");
});
ok("an out-of-enum verdict honestly degrades to NEUTRAL, never crashes or fabricates STRONG/WEAK", () => {
  assert.strictEqual(sanitizeHealth({ verdict: "BOGUS" }).verdict, "NEUTRAL");
});
ok("malformed/missing input returns a real, safe default", () => {
  assert.deepStrictEqual(sanitizeHealth(null), { verdict: "NEUTRAL", reason: "" });
  assert.deepStrictEqual(sanitizeHealth(undefined), { verdict: "NEUTRAL", reason: "" });
});
ok(`every real HEALTH_VERDICTS entry is accepted`, () => {
  for (const v of HEALTH_VERDICTS) assert.strictEqual(sanitizeHealth({ verdict: v }).verdict, v);
});

console.log("\nChecking mergeMoverReasons — the real number always wins, the AI only adds color…");
const REAL_GAINERS = [
  { symbol: "NVDA", price: 245.5, changesPercentage: 4.2 },
  { symbol: "TSLA", price: 358.34, changesPercentage: 2.1 },
];
ok("a real AI reason matched by symbol is attached, real price/% are untouched", () => {
  const merged = mergeMoverReasons(REAL_GAINERS, [{ symbol: "NVDA", reason: "Real earnings beat." }]);
  assert.strictEqual(merged.length, 2);
  assert.strictEqual(merged[0].symbol, "NVDA");
  assert.strictEqual(merged[0].price, 245.5);
  assert.strictEqual(merged[0].changePct, 4.2);
  assert.strictEqual(merged[0].reason, "Real earnings beat.");
});
ok("a real mover with no matching AI reason gets an honest empty reason, never fabricated", () => {
  const merged = mergeMoverReasons(REAL_GAINERS, [{ symbol: "NVDA", reason: "x" }]);
  assert.strictEqual(merged[1].symbol, "TSLA");
  assert.strictEqual(merged[1].reason, "");
});
ok("an AI reason for a symbol NOT in the real movers list is silently dropped — never fabricates a new real-looking row", () => {
  const merged = mergeMoverReasons(REAL_GAINERS, [{ symbol: "FAKECO", reason: "invented" }]);
  assert.strictEqual(merged.length, 2);
  assert.ok(!merged.some((m) => m.symbol === "FAKECO"));
});
ok("real movers are returned in the SAME real order regardless of AI reason order", () => {
  const merged = mergeMoverReasons(REAL_GAINERS, [{ symbol: "TSLA", reason: "b" }, { symbol: "NVDA", reason: "a" }]);
  assert.deepStrictEqual(merged.map((m) => m.symbol), ["NVDA", "TSLA"]);
});
ok("missing/malformed real movers input returns an honest empty list", () => {
  assert.deepStrictEqual(mergeMoverReasons(null, []), []);
  assert.deepStrictEqual(mergeMoverReasons(undefined, [{ symbol: "X", reason: "y" }]), []);
});
ok("malformed AI reasons (not an array) are ignored, real movers still returned with empty reasons", () => {
  const merged = mergeMoverReasons(REAL_GAINERS, "not an array");
  assert.strictEqual(merged.length, 2);
  assert.strictEqual(merged[0].reason, "");
});

console.log("\nChecking mergeSectorNotes — same real-number-wins discipline for sectors…");
const REAL_SECTORS = [
  { sym: "XLK", name: "Technology", change: 1.8, status: "LEADING" },
  { sym: "XLE", name: "Energy", change: -0.9, status: "LAGGING" },
];
ok("a real AI note matched by sector symbol is attached, real change/status are untouched", () => {
  const merged = mergeSectorNotes(REAL_SECTORS, [{ sector: "XLK", note: "Real AI capex names led." }]);
  assert.strictEqual(merged[0].sector, "XLK");
  assert.strictEqual(merged[0].changePct, 1.8);
  assert.strictEqual(merged[0].status, "LEADING");
  assert.strictEqual(merged[0].note, "Real AI capex names led.");
});
ok("an AI note for a sector symbol not in the real list is dropped", () => {
  const merged = mergeSectorNotes(REAL_SECTORS, [{ sector: "XLZ", note: "invented" }]);
  assert.ok(!merged.some((s) => s.sector === "XLZ"));
  assert.strictEqual(merged.length, 2);
});

console.log("\nChecking sanitizeBigNews — bounded, honest-default impact…");
ok("a well-formed news item round-trips", () => {
  const news = sanitizeBigNews([{ headline: "Fed holds rates", summary: "x", impact: "HIGH" }]);
  assert.strictEqual(news.length, 1);
  assert.strictEqual(news[0].impact, "HIGH");
});
ok("a news item with no headline is dropped", () => {
  assert.strictEqual(sanitizeBigNews([{ headline: "", summary: "x" }]).length, 0);
});
ok("an out-of-enum impact honestly degrades to MEDIUM", () => {
  assert.strictEqual(sanitizeBigNews([{ headline: "x", impact: "BOGUS" }])[0].impact, "MEDIUM");
});
ok("caps at 10 real items, never unbounded", () => {
  const raw = Array.from({ length: 20 }, (_, i) => ({ headline: `Story ${i}` }));
  assert.strictEqual(sanitizeBigNews(raw).length, 10);
});
ok(`every real NEWS_IMPACTS entry is accepted`, () => {
  for (const imp of NEWS_IMPACTS) assert.strictEqual(sanitizeBigNews([{ headline: "x", impact: imp }])[0].impact, imp);
});

console.log("\nChecking sanitizeOutlook — bounded note + watchFor list…");
ok("a well-formed outlook round-trips", () => {
  const o = sanitizeOutlook({ note: "Real read.", watchFor: ["CPI print", "Fed speak"] });
  assert.strictEqual(o.note, "Real read.");
  assert.deepStrictEqual(o.watchFor, ["CPI print", "Fed speak"]);
});
ok("malformed input returns an honest empty outlook, never fabricated", () => {
  assert.deepStrictEqual(sanitizeOutlook(null), { note: "", watchFor: [] });
});
ok("watchFor caps at 6 real items", () => {
  const o = sanitizeOutlook({ note: "x", watchFor: Array.from({ length: 12 }, (_, i) => `item ${i}`) });
  assert.strictEqual(o.watchFor.length, 6);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("MARKET-WRAP-ENGINE TEST FAILED"); else console.log("MARKET-WRAP-ENGINE TEST OK");
