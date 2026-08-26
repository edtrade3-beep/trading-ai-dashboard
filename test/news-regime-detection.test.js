// Real tests for src/news/classifier.js's SYSTEMIC_RISK/GEOPOLITICAL/MACRO
// categories (2026-08-26, explicit user request: "make sure system
// platform detect big/major news that change market regime/change
// narrative"). Pure-function, synthetic-input, zero-network, zero-DB —
// exercises the actual catalyst classifier + real impact scorer together
// so the fix is proven end to end (a real regime headline now clears the
// HIGH/EXTREME bar /majornews and the new regime alert both gate on),
// not just that a category label changed.
// Run: node test/news-regime-detection.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { classifyCatalyst } = require("../src/news/classifier");
const { computeImpactScore } = require("../src/news/scorer");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking classifyCatalyst — real regime/narrative-shifting categories…");

ok("a surprise Fed rate move classifies MACRO with a real high catalyst weight", () => {
  const r = classifyCatalyst({ headline: "Fed Surprises Markets With Emergency Rate Cut", summary: "" });
  assert.strictEqual(r.category, "MACRO");
  assert.ok(r.catalystWeight >= 80, `expected a real high weight for a regime-shifting Fed headline, got ${r.catalystWeight}`);
});

ok("a hot CPI print classifies MACRO", () => {
  const r = classifyCatalyst({ headline: "Hot Inflation Data Sends Yields Higher", summary: "Core CPI report beats estimates" });
  assert.strictEqual(r.category, "MACRO");
});

ok("a war escalation headline classifies GEOPOLITICAL with a real high catalyst weight", () => {
  const r = classifyCatalyst({ headline: "Russia Escalates Conflict, Markets Slide on Geopolitical Risk", summary: "" });
  assert.strictEqual(r.category, "GEOPOLITICAL");
  assert.ok(r.catalystWeight >= 80, `expected a real high weight, got ${r.catalystWeight}`);
});

ok("a bank failure headline classifies SYSTEMIC_RISK with the highest real catalyst weight tier", () => {
  const r = classifyCatalyst({ headline: "Regional Bank Failure Sparks Banking Crisis Fears", summary: "" });
  assert.strictEqual(r.category, "SYSTEMIC_RISK");
  assert.ok(r.catalystWeight >= 90, `expected a top-tier real weight, got ${r.catalystWeight}`);
});

ok("regression: a real regime headline was previously scored BELOW a routine product launch (weight 50 vs 55) — now it must score higher", () => {
  const regime = classifyCatalyst({ headline: "Federal Reserve Signals Emergency Rate Cut", summary: "" });
  const product = classifyCatalyst({ headline: "Company Unveils New Product Line", summary: "" });
  assert.ok(regime.catalystWeight > product.catalystWeight, `expected regime weight (${regime.catalystWeight}) > routine product weight (${product.catalystWeight})`);
});

ok("ordinary single-stock catalysts (M&A/FDA/earnings) are unaffected by the new top-of-list regime rules", () => {
  assert.strictEqual(classifyCatalyst({ headline: "Acme Corp to Be Acquired by Rival in All-Cash Deal", summary: "" }).category, "M&A");
  assert.strictEqual(classifyCatalyst({ headline: "Drug Wins FDA Approval After Phase 3 Trial", summary: "" }).category, "FDA");
  assert.strictEqual(classifyCatalyst({ headline: "Company Reports Q2 Earnings, Beats EPS Estimates", summary: "" }).category, "EARNINGS");
});

ok("no false-positive substring collisions on common financial vocabulary (e.g. bare 'war'/'bank' inside unrelated words)", () => {
  assert.strictEqual(classifyCatalyst({ headline: "Company Moving Forward With Share Buyback, Rewards Shareholders", summary: "" }).category, "OTHER");
  assert.strictEqual(classifyCatalyst({ headline: "Investment Bankers See Strong Deal Pipeline This Quarter", summary: "" }).category, "OTHER");
});

ok("an unrelated headline still honestly falls through to OTHER with the low real default weight", () => {
  const r = classifyCatalyst({ headline: "Local Store Opens New Location Downtown", summary: "" });
  assert.strictEqual(r.category, "OTHER");
  assert.strictEqual(r.catalystWeight, 30);
});

console.log("Checking computeImpactScore — a real regime headline now clears the HIGH/EXTREME bar…");

// Confirmation unavailable is the realistic case for genuinely breaking
// regime news — price/volume confirmation data hasn't caught up within the
// same 5-min ingestion tick the headline lands in.
ok("a fresh, credible, high-sentiment MACRO headline clears the 80 HIGH-impact bar the regime alert and /majornews both gate on, even before price confirmation catches up", () => {
  const item = { catalystWeight: classifyCatalyst({ headline: "Fed Surprises Markets With Emergency Rate Cut", summary: "" }).catalystWeight,
    source: "Reuters", publishedAt: new Date().toISOString(), sentiment: "STRONGLY_BEARISH" };
  const { impactScore, classification } = computeImpactScore(item, { available: false, confirmed: null });
  assert.ok(impactScore >= 80, `expected impactScore >= 80, got ${impactScore}`);
  assert.ok(["HIGH", "EXTREME"].includes(classification), `expected HIGH/EXTREME, got ${classification}`);
});

ok("regression: the same real inputs at the OLD weight (50) would NOT have cleared the bar — proves the fix, not just a relabel", () => {
  const item = { catalystWeight: 50, source: "Reuters", publishedAt: new Date().toISOString(), sentiment: "STRONGLY_BEARISH" };
  const { impactScore } = computeImpactScore(item, { available: false, confirmed: null });
  assert.ok(impactScore < 80, `expected the old weight to stay below 80 (proving this was a real gap), got ${impactScore}`);
});

console.log(`\n${passed} checks passed.`);
console.log("NEWS-REGIME-DETECTION TEST OK");
