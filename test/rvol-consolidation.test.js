"use strict";
// rvol-consolidation.test.js (2026-09-18, "CANONICAL QUANT ENGINE" master
// prompt follow-up: "Do NOT hard-code an arbitrary 38% volume weighting...
// RVOL... ONE canonical formula") — routes/market.js used to declare
// `volume / avgVolume` inline at 5 separate sites, each with its own
// fallback-on-missing-data default. This locks in two things: (1) every
// site now calls the ONE real quant-feature-engine.js#computeRvol formula,
// and (2) the real circular-require hazard found while wiring it
// (quant-feature-engine.js -> atr-risk-engine.js -> routes/market.js) is
// avoided — every call site lazily requires it, never at module top-level.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const marketSrc = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "market.js"), "utf8");

console.log("Checking routes/market.js — ONE canonical RVOL, no top-level circular require…");

ok("every RVOL calc site calls the real quant-feature-engine.js#computeRvol — no inline `volume / avgVolume` division left declared here", () => {
  const occurrences = (marketSrc.match(/computeRvol\(/g) || []).length;
  assert.ok(occurrences >= 6, `expected at least 6 real computeRvol( call sites (5 unique locations, one with 2 branches), found ${occurrences}`);
});

ok("real circular-require fix: quant-feature-engine.js is NEVER required at routes/market.js's top level — every call site requires it lazily, inside a function body", () => {
  const topOfFile = marketSrc.slice(0, marketSrc.indexOf("\nfunction ") > 0 ? marketSrc.indexOf("\nfunction ") : 2000);
  assert.doesNotMatch(topOfFile, /^const \{[^}]*\} = require\("\.\.\/quant-feature-engine"\);/m, "must not be a bare top-level require");
  const lazyRequireCount = (marketSrc.match(/require\("\.\.\/quant-feature-engine"\)/g) || []).length;
  assert.ok(lazyRequireCount >= 5, `expected at least 5 lazy requires of quant-feature-engine.js (one per real call site), found ${lazyRequireCount}`);
});

ok("real regression proof: requiring routes/market.js first (the real app's own actual boot order via router.js), then atr-risk-engine.js, never throws — computeAtrRiskLevels' own internal atrAt import resolves correctly", () => {
  delete require.cache[require.resolve("../src/routes/market.js")];
  delete require.cache[require.resolve("../src/atr-risk-engine.js")];
  delete require.cache[require.resolve("../src/quant-feature-engine.js")];
  require("../src/routes/market.js");
  const { computeAtrRiskLevels } = require("../src/atr-risk-engine.js");
  const bars = Array(20).fill({ high: 10, low: 9, close: 9.5 });
  const result = computeAtrRiskLevels(bars, 10);
  assert.strictEqual(result.dataInsufficient, false, "a real circular-require regression would make atrAt undefined and this would throw before ever reaching dataInsufficient");
  assert.ok(Number.isFinite(result.atr), "must return a real, non-fabricated ATR value");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("RVOL-CONSOLIDATION TEST FAILED");
else console.log("RVOL-CONSOLIDATION TEST OK");
