"use strict";
// Real structural tests for GET /api/market/what-to-pay (2026-09-16, "AI
// Trade Desk — Add 'What Price to Pay' to Every Stock").
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const marketSrc = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "market.js"), "utf8");

console.log("Checking GET /api/market/what-to-pay — real single-symbol route, same reuse discipline as the Top 50 scan…");

ok("the route exists, requires a real symbol, and delegates to the real computeWhatToPay() — no inline re-implementation", () => {
  assert.match(marketSrc, /pathname === "\/api\/market\/what-to-pay" && req\.method === "GET"/);
  assert.match(marketSrc, /if \(!symbol\) return writeJson\(res, 400, \{ ok: false, error: "symbol required" \}\);/);
  assert.match(marketSrc, /require\("\.\.\/what-to-pay"\)/);
});

ok("builds the real canonical tier the SAME way resolveCanonicalOptionsPermission already does (same row-construction recipe) — no second, independently-built row shape", () => {
  const start = marketSrc.indexOf('pathname === "/api/market/what-to-pay"');
  const end = marketSrc.indexOf("\n  }", marketSrc.indexOf("computeCanonicalAssetDecision", start));
  const block = marketSrc.slice(start, end);
  assert.match(block, /require\("\.\.\/canonical-decision-pipeline"\)/);
  assert.match(block, /computeCanonicalAssetDecision\(\{ symbol, row, macroQuotes: macroData/);
});

ok("reuses top50-scanner.js's real dailyEmaInputs() for EMA20/50 — no second EMA computation declared inline", () => {
  assert.match(marketSrc, /const \{ dailyEmaInputs \} = require\("\.\.\/top50-scanner"\);/);
  assert.doesNotMatch(marketSrc, /function dailyEmaInputs/, "dailyEmaInputs must not be redeclared in routes/market.js — only imported");
});

ok("reuses the real fetchDayTradeScanRows for the single symbol — same 15m VWAP/RVOL/MACD/RSI source as the 50-stock scan, never a second intraday fetch", () => {
  const start = marketSrc.indexOf('pathname === "/api/market/what-to-pay"');
  const end = marketSrc.indexOf("\n  }", start + 1000);
  const block = marketSrc.slice(start, marketSrc.indexOf("\n  }", start + 2500));
  assert.match(block, /fetchDayTradeScanRows\(\[symbol\]\)/);
});

ok("wires the real quant-feature-engine.js additively alongside What Price To Pay (2026-09-18, Quant Engine master prompt) — same real bars already fetched, no second fetch, no second entry/verdict engine", () => {
  const start = marketSrc.indexOf('pathname === "/api/market/what-to-pay"');
  const end = marketSrc.indexOf("\n  }", marketSrc.indexOf("computeQuantFeatures({ bars", start));
  const block = marketSrc.slice(start, end);
  assert.match(block, /require\("\.\.\/quant-feature-engine"\)/);
  assert.match(block, /computeQuantFeatures\(\{ bars, price: trend\.price \}\)/);
  assert.match(block, /quantFeatures/);
});

ok("wires the real support-resistance-engine.js additively too, reusing the SAME real bars/pivot/contractionLow already in hand — no second breakout/support calculation", () => {
  const start = marketSrc.indexOf('pathname === "/api/market/what-to-pay"');
  const end = marketSrc.indexOf("\n  }", marketSrc.indexOf("computeSupportResistanceZones({ bars", start));
  const block = marketSrc.slice(start, end);
  assert.match(block, /require\("\.\.\/support-resistance-engine"\)/);
  assert.match(block, /computeSupportResistanceZones\(\{ bars, price: trend\.price, pivot: trend\.setup\?\.pivot, contractionLow: trend\.setup\?\.contractionLow \}\)/);
  assert.match(block, /supportResistance/);
});

ok("real fix (2026-09-18 follow-up, 'only 2 candidates... not a true multi-source cluster'): supportResistance is computed exactly ONCE (not twice) and threaded into computeWhatToPay itself, so What Price To Pay's own STRONG BUY ZONE can anchor on the real cluster, not just EMA50/contractionLow", () => {
  const start = marketSrc.indexOf('pathname === "/api/market/what-to-pay"');
  const end = marketSrc.indexOf("\n  }", marketSrc.indexOf("computeQuantFeatures({ bars", start));
  const block = marketSrc.slice(start, end);
  const occurrences = (block.match(/computeSupportResistanceZones\(/g) || []).length;
  assert.strictEqual(occurrences, 1, "must compute the real cluster exactly once per request, never twice");
  assert.match(block, /computeWhatToPay\(\{[\s\S]*?supportResistance,?\s*\}\)/, "computeWhatToPay must receive the real supportResistance object");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("WHAT-TO-PAY-ROUTE TEST FAILED");
else console.log("WHAT-TO-PAY-ROUTE TEST OK");
