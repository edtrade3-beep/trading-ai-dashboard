"use strict";
// Real tests for src/opportunity-hunter.js — "AI Opportunity Hunter"
// master prompt (2026-09-16), Phase 1 (Stocks only — Properties/Cars
// explicitly deferred pending a real data-source decision). Pure
// functions, no network — computeOpportunityState/computeLiquidityScore/
// computeConfidenceScore/mapEdgeVelocity/buildReasons are all plain math
// over caller-supplied real numbers.
const assert = require("node:assert");
const {
  computeOpportunityState, computeLiquidityScore, computeConfidenceScore, mapEdgeVelocity, buildReasons,
} = require("../src/opportunity-hunter");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking computeOpportunityState — real Deal x Entry matrix, never merged into one opaque score…");

ok("the master prompt's own worked example: Deal 93 / Entry 55 -> GREAT VALUE — WAIT", () => {
  assert.strictEqual(computeOpportunityState({ dealScore: 93, entryScore: 55 }), "GREAT VALUE — WAIT");
});

ok("the master prompt's own worked example: Deal 92 / Entry 84 -> SETUP READY (both real reads clear the 70 floor)", () => {
  assert.strictEqual(computeOpportunityState({ dealScore: 92, entryScore: 84 }), "SETUP READY");
});

ok("a real EXTENDED — DON'T CHASE price status always wins, regardless of how attractive Deal/Entry look", () => {
  const r = computeOpportunityState({ dealScore: 95, entryScore: 95, priceStatus: "EXTENDED — DON'T CHASE" });
  assert.strictEqual(r, "EXTENDED — WAIT");
});

ok("a real technical setup with no fundamentals data at all (dealScore null) is honestly labeled, never silently treated as unattractive", () => {
  assert.strictEqual(computeOpportunityState({ dealScore: null, entryScore: 80 }), "TECHNICAL SETUP — NO VALUE READ");
});

ok("a real technical setup where fundamentals ARE known but weak reads differently from no-data-at-all", () => {
  assert.strictEqual(computeOpportunityState({ dealScore: 40, entryScore: 80 }), "TECHNICAL SETUP — UNPROVEN VALUE");
});

ok("weak on both real reads -> NOT ATTRACTIVE, never dressed up", () => {
  assert.strictEqual(computeOpportunityState({ dealScore: 30, entryScore: 20 }), "NOT ATTRACTIVE");
});

console.log("\nChecking computeLiquidityScore — real dollar-volume banding…");

ok("honest null on missing/zero real dollar volume, never a guessed score", () => {
  assert.strictEqual(computeLiquidityScore(null), null);
  assert.strictEqual(computeLiquidityScore(0), null);
});

ok("real monotonic banding — more real dollar volume never scores lower", () => {
  const a = computeLiquidityScore(2_000_000), b = computeLiquidityScore(50_000_000), c = computeLiquidityScore(1_000_000_000);
  assert.ok(a < b && b <= c);
  assert.strictEqual(c, 100);
});

console.log("\nChecking computeConfidenceScore — real data-completeness based, never fabricated precision…");

ok("full real data (deal+entry+fairValue+risk, complete deal sample) scores higher than a bare technical-only read", () => {
  const full = computeConfidenceScore({ hasDeal: true, hasEntry: true, hasFairValue: true, hasRisk: true, dealSampleQuality: 1 });
  const bare = computeConfidenceScore({ hasDeal: false, hasEntry: true, hasFairValue: false, hasRisk: false, dealSampleQuality: null });
  assert.ok(full > bare);
});

ok("a thin real fundamentals sample (dealSampleQuality low) scores lower than a complete one, even with the same booleans", () => {
  const thin = computeConfidenceScore({ hasDeal: true, hasEntry: true, hasFairValue: true, hasRisk: true, dealSampleQuality: 0.2 });
  const full = computeConfidenceScore({ hasDeal: true, hasEntry: true, hasFairValue: true, hasRisk: true, dealSampleQuality: 1 });
  assert.ok(thin < full);
});

ok("score always stays within the real 0-100 bound", () => {
  const r = computeConfidenceScore({ hasDeal: true, hasEntry: true, hasFairValue: true, hasRisk: true, dealSampleQuality: 1 });
  assert.ok(r >= 0 && r <= 100);
});

console.log("\nChecking mapEdgeVelocity — honest, partial real 4-state mapping (never fabricates the prompt's fuller 7-state vocabulary)…");

ok("real INSUFFICIENT_DATA maps to DORMANT", () => {
  assert.strictEqual(mapEdgeVelocity({ status: "INSUFFICIENT_DATA", velocity: null, isProvisional: false }).label, "DORMANT");
});

ok("real ACCELERATING maps to ACCELERATING (exact match, no relabeling needed)", () => {
  const r = mapEdgeVelocity({ status: "ACCELERATING", velocity: 12, isProvisional: false, sampleCount: 4 });
  assert.strictEqual(r.label, "ACCELERATING");
  assert.strictEqual(r.velocity, 12);
});

ok("real DECAYING maps to DETERIORATING", () => {
  assert.strictEqual(mapEdgeVelocity({ status: "DECAYING", velocity: -8, isProvisional: false }).label, "DETERIORATING");
});

ok("a real null/missing edge-velocity read defaults to DORMANT, never crashes", () => {
  assert.strictEqual(mapEdgeVelocity(null).label, "DORMANT");
});

console.log("\nChecking buildReasons — real machine-readable reasons off already-real fields, never LLM-invented…");

ok("a real attractive deal score in the ideal fair-value zone produces the matching real reason codes", () => {
  const reasons = buildReasons({ dealScore: 82, fairValue: { zone: "IDEAL_BUY_ZONE" }, entryScore: 40, riskLevel: "LOW", edgeVelocity: { label: "STABLE" } });
  assert.ok(reasons.includes("deal_score_attractive"));
  assert.ok(reasons.includes("price_below_fair_value_ideal_zone"));
  assert.ok(reasons.includes("technical_entry_not_ready"));
});

ok("a real elevated risk level and accelerating edge velocity both surface as real, distinct reason codes", () => {
  const reasons = buildReasons({ dealScore: 60, entryScore: 75, riskLevel: "HIGH", edgeVelocity: { label: "ACCELERATING" } });
  assert.ok(reasons.includes("risk_elevated"));
  assert.ok(reasons.includes("edge_velocity_accelerating"));
});

console.log("\nChecking reuse discipline (source-inspection tripwire)…");

ok("Deal Score reuses the real future-value-scoring.js engine (via routes/future-value-scan.js) — no second fundamentals-scoring formula declared in this file", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../src/opportunity-hunter"), "utf8");
  assert.match(src, /require\("\.\/routes\/future-value-scan"\)/);
  assert.doesNotMatch(src, /function computeFutureValueRead|function computeValueScore/, "must not redeclare fundamentals scoring");
});

ok("Entry Score/technical buy-zone/risk all reuse the real scanTop50() from top50-scanner.js — no second technical scan declared in this file", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../src/opportunity-hunter"), "utf8");
  assert.match(src, /require\("\.\/top50-scanner"\)/);
  assert.doesNotMatch(src, /function computeTop50Score/, "must not redeclare the technical score");
});

ok("Edge Velocity reuses the real opportunity-timeline-store.js — no second velocity-tracking implementation declared in this file", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../src/opportunity-hunter"), "utf8");
  assert.match(src, /require\("\.\/opportunity-timeline-store"\)/);
  assert.doesNotMatch(src, /function computeEdgeVelocity/, "must not redeclare edge-velocity math");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("OPPORTUNITY-HUNTER TEST FAILED");
else console.log("OPPORTUNITY-HUNTER TEST OK");
