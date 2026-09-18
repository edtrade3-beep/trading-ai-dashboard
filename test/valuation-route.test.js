"use strict";
// Real structural/reuse tests for src/routes/valuation.js, its router.js
// wiring, and the Trade Desk UI integration (2026-09-17, "VALUATION
// ENGINE" master prompt). No network — live responses are exercised
// manually against the deployed server, same convention this session
// already uses for every other provider-backed route.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const routeSrc = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "valuation.js"), "utf8");
const routerSrc = fs.readFileSync(path.join(__dirname, "..", "src", "router.js"), "utf8");
const cardSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "ValuationCard.jsx"), "utf8");
const tabSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "TradeDeskTab.jsx"), "utf8");

console.log("Checking routes/valuation.js — real reuse, no second valuation formula…");

ok("reuses the real computeValuationProfile (valuation-engine.js) — no inline scoring in the route", () => {
  assert.match(routeSrc, /require\("\.\.\/valuation-engine"\)/);
  assert.match(routeSrc, /computeValuationProfile/);
  assert.doesNotMatch(routeSrc, /function computeValuationProfile/, "must not redeclare the canonical valuation function");
});

ok("fetches real FMP fundamentals + real multi-quarter history + real Yahoo forward EPS — no fabricated inputs", () => {
  assert.match(routeSrc, /fetchFmpFundamentals\(/);
  assert.match(routeSrc, /fetchFmpFundamentalsHistory\(/);
  assert.match(routeSrc, /fetchYahooFundamentals\(/);
});

ok("router.js wires the real /api/market/valuation route to routes/valuation.js's real handler", () => {
  assert.match(routerSrc, /require\("\.\/routes\/valuation"\)/);
  assert.match(routerSrc, /\/api\/market\/valuation/);
});

console.log("\nChecking ValuationCard.jsx — real server-computed fields only, collapsed-by-default per the prompt's own UI rule…");

ok("fetches the real valuation endpoint — never computes a score/level/trend client-side", () => {
  assert.match(cardSrc, /fetch\(`\/api\/market\/valuation\?symbol=/);
  assert.doesNotMatch(cardSrc, /function computeValuationProfile|valuationScore\s*=\s*\d/, "must not recompute valuation client-side");
});

ok("the collapsed default view shows exactly the prompt's own 4 required fields (score, level, trend, value trap) before any expand", () => {
  const collapsedBlock = cardSrc.slice(cardSrc.indexOf("const levelColor"), cardSrc.lastIndexOf("View Valuation Details"));
  assert.match(collapsedBlock, /data\.valuationScore/);
  assert.match(collapsedBlock, /data\.valuationLevel/);
  assert.match(collapsedBlock, /data\.valuationTrend/);
  assert.match(collapsedBlock, /data\.valueTrapLevel/);
});

ok("a real expandable 'View Valuation Details' toggle exists, collapsed by default (expanded state starts false)", () => {
  assert.match(cardSrc, /useState\(false\)/);
  assert.match(cardSrc, /View Valuation Details/);
});

ok("N/A is shown for missing real fields — never a fabricated zero or blank", () => {
  assert.match(cardSrc, /function na\(v/);
  assert.match(cardSrc, /"N\/A"/);
});

console.log("\nChecking TradeDeskTab.jsx — embedded in the existing stock card, not a new tab/dock module…");

ok("ValuationCard is rendered inline in the existing 4-column analysis area (same column as WhatToPayCard/RiskAvoidCard) — no new dockModule entry, no new activeTab route", () => {
  assert.match(tabSrc, /import ValuationCard from "\.\/ValuationCard\.jsx"/);
  assert.match(tabSrc, /<ValuationCard symbol={symbol}/);
  assert.doesNotMatch(tabSrc, /key: "valuation"/, "must not add a new dock module for this");
});

console.log("\nChecking the shared getValuationProfile export (2026-09-17 follow-up: reused by tournament-engine.js's Top-25 enrichment and routes/tournament.js's detail handler)…");

ok("exports a reusable getValuationProfile alongside the HTTP handler, backed by the same 15-min cache — so every consumer of a symbol's valuation shares one real fetch+compute path", () => {
  assert.match(routeSrc, /module\.exports = \{ handleValuation, getValuationProfile \}/);
  assert.match(routeSrc, /async function getValuationProfile\(symbol, keys\)/);
  assert.match(routeSrc, /async function handleValuation/);
  const require2 = require("../src/routes/valuation");
  assert.strictEqual(typeof require2.getValuationProfile, "function");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("VALUATION-ROUTE TEST FAILED");
else console.log("VALUATION-ROUTE TEST OK");
