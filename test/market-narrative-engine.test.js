"use strict";
// market-narrative-engine.test.js — Master Agent, Market Narrative ("كيف
// داير السوق اليوم"), rendered in English per explicit user request ("For
// Market, answer me with English no Arabic"). Covers
// renderMarketNarrativeText only — buildMarketNarrative itself does real
// internal HTTP fetches against a running server, same convention as
// morning-mode-engine.js/deep-scan-engine.js's own build* functions
// (exercised live, not unit-tested).
const assert = require("node:assert");
const { renderMarketNarrativeText } = require("../src/market-narrative-engine");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

const base = { generatedAt: new Date().toISOString(), macro: [], marketRegime: null, moversUp: [], moversDown: [], breakouts: [], universeSize: 0 };

console.log("Checking renderMarketNarrativeText — real, honest, never-fabricated market narrative, in English…");

ok("no real data at all renders honest empty-state lines, never fabricated movers", () => {
  const text = renderMarketNarrativeText(base);
  assert.ok(text.includes("unavailable right now"));
  assert.ok(text.includes("No strong real upside movers"));
  assert.ok(text.includes("No strong real downside movers"));
});

ok("real macro quotes are rendered with real price and change%", () => {
  const text = renderMarketNarrativeText({ ...base, macro: [{ symbol: "SPY", price: 550.2, changesPercentage: 1.1 }] });
  assert.ok(text.includes("SPY: 550.2 (+1.1%)"));
});

ok("a real BUY-family mover shows a real buy point/stop/target, never a fabricated sell point", () => {
  const mover = { symbol: "NVDA", price: 120, chgPct: 5.2, gapPct: 1.1, rvol: 3.2, aboveVwap: true, orBreakout: true, verdict: "STRONG_BUY", buyPoint: 118, stop: 112, targets: [130], reasons: ["strong RS"], bos: { label: "Bull BOS — Bullish Continuation", level: 119 }, choch: null };
  const text = renderMarketNarrativeText({ ...base, moversUp: [mover] });
  assert.ok(text.includes("NVDA — +5.2%"));
  assert.ok(text.includes("Opening Range Breakout"));
  assert.ok(text.includes("Bull BOS"));
  assert.ok(text.includes("STRONG_BUY (BUY)"));
  assert.ok(text.includes("Buy point: 118"));
  assert.ok(!text.includes("no real short-entry price"));
});

ok("a real AVOID/EXIT-family decliner shows the real stop level with an honest disclosure — never a fabricated short-entry price", () => {
  const mover = { symbol: "CVX", price: 90, chgPct: -3.1, gapPct: -1, rvol: 1.8, aboveVwap: false, orBreakout: false, verdict: "AVOID", buyPoint: null, stop: 88, targets: [], reasons: ["technical exhaustion"], bos: null, choch: { label: "ChoCh — Trend Weakening" } };
  const text = renderMarketNarrativeText({ ...base, moversDown: [mover] });
  assert.ok(text.includes("CVX — -3.1%"));
  assert.ok(text.includes("AVOID (SELL/AVOID)"));
  assert.ok(text.includes("real stop-loss 88"));
  assert.ok(text.includes("no real short-entry price yet"));
  assert.ok(text.includes("ChoCh — Trend Weakening"));
});

ok("a mover with no real verdict says so honestly, never inventing one", () => {
  const mover = { symbol: "XYZ", price: 10, chgPct: 2, gapPct: 0, rvol: null, aboveVwap: true, orBreakout: false, verdict: null, buyPoint: null, stop: null, targets: [], reasons: [], bos: null, choch: null };
  const text = renderMarketNarrativeText({ ...base, moversUp: [mover] });
  assert.ok(text.includes("No real verdict available"));
});

ok("real breakouts list renders with real RVOL, separate from the up/down mover lists", () => {
  const text = renderMarketNarrativeText({ ...base, breakouts: [{ symbol: "AMD", price: 150, chgPct: 4, rvol: 2.5 }] });
  assert.ok(text.includes("Real opening-range breakouts today"));
  assert.ok(text.includes("AMD @ 150"));
  assert.ok(text.includes("RVOL 2.5x"));
});

console.log(`\n${passed} checks passed.`);
if (!process.exitCode) console.log("MARKET-NARRATIVE-ENGINE TEST OK");
