// Real tests for src/car-business-engine.js's pure sanitizers + the
// deterministic diff/notification logic (Car Business Intelligence,
// 2026-08-30). Pure-function, synthetic-input, zero-network, zero-DB — the
// AI call itself (car-business-ai.js) is untested by design, same
// precedent as research-intel-ai.js/command-center-ai.js in this codebase.
"use strict";
const assert = require("node:assert");
const {
  sanitizeMarketSections, sanitizeInventoryScores, sanitizeOpportunityCards, sanitizeDimensions, dimensionsToSnapshot,
  computeNotificationTriggers,
} = require("../src/car-business-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking sanitizeMarketSections — bounded, honest-default shape…");

ok("a well-formed section round-trips with real fields intact", () => {
  const out = sanitizeMarketSections([{ category: "Used SUVs", classification: "STRONG", summary: "x", dataQuality: "DATA", sources: ["Manheim"] }]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].classification, "STRONG");
  assert.deepStrictEqual(out[0].sources, ["Manheim"]);
});
ok("a section with no category is dropped, not fabricated", () => {
  assert.strictEqual(sanitizeMarketSections([{ category: "" }]).length, 0);
});
ok("an out-of-enum classification honestly degrades to NORMAL, never crashes", () => {
  const out = sanitizeMarketSections([{ category: "Trucks", classification: "bogus" }]);
  assert.strictEqual(out[0].classification, "NORMAL");
});

console.log("\nChecking sanitizeInventoryScores — REAL VIN grounding, never an invented vehicle…");

const REAL_VINS = ["1HGCM82633A004352", "5FRYD4H45KB012345"];

ok("a real VIN on the real lot is scored and kept", () => {
  const out = sanitizeInventoryScores([{ vin: "1hgcm82633a004352", score: 82, classification: "BUY", reason: "x" }], REAL_VINS);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].vin, "1HGCM82633A004352"); // normalized uppercase
  assert.strictEqual(out[0].score, 82);
});
ok("a VIN NOT on the real lot is dropped — never scores an invented vehicle", () => {
  const out = sanitizeInventoryScores([{ vin: "FAKEVIN0000000001", score: 90, classification: "BUY_AGGRESSIVELY" }], REAL_VINS);
  assert.strictEqual(out.length, 0);
});
ok("score is clamped into real 0-100 bounds", () => {
  const out = sanitizeInventoryScores([{ vin: REAL_VINS[0], score: 500 }], REAL_VINS);
  assert.strictEqual(out[0].score, 100);
});

console.log("\nChecking sanitizeOpportunityCards…");

ok("a well-formed card keeps real fields, drops one with no headline", () => {
  const out = sanitizeOpportunityCards([
    { headline: "Wholesale trucks cheap this week", classification: "EARLY", confidence: 70, risk: "MEDIUM" },
    { headline: "" },
  ]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].classification, "EARLY");
});
ok("more than 12 cards are capped, not silently unbounded", () => {
  const raw = Array.from({ length: 20 }, (_, i) => ({ headline: `H${i}` }));
  assert.strictEqual(sanitizeOpportunityCards(raw).length, 12);
});

console.log("\nChecking sanitizeDimensions — real cross-run diff, not AI self-report…");

ok("a dimension whose state differs from the real stored prior value is marked shifted", () => {
  const out = sanitizeDimensions([{ dimension: "credit-environment", state: "TIGHT" }], { "credit-environment": "NORMAL" });
  assert.strictEqual(out[0].shifted, true);
  assert.strictEqual(out[0].priorState, "NORMAL");
});
ok("the same state as yesterday is NOT flagged as a shift", () => {
  const out = sanitizeDimensions([{ dimension: "inventory-stance", state: "BUY" }], { "inventory-stance": "BUY" });
  assert.strictEqual(out[0].shifted, false);
});
ok("a dimension with no prior stored value is never flagged as a shift", () => {
  const out = sanitizeDimensions([{ dimension: "pricing-direction", state: "STABLE" }], {});
  assert.strictEqual(out[0].shifted, false);
  assert.strictEqual(out[0].priorState, null);
});
ok("an unrecognized dimension key is dropped", () => {
  const out = sanitizeDimensions([{ dimension: "made-up", state: "X" }], {});
  assert.strictEqual(out.length, 0);
});

console.log("\nChecking dimensionsToSnapshot…");
ok("produces a plain key:value snapshot for tomorrow's diff", () => {
  const snap = dimensionsToSnapshot([{ dimension: "used-market", state: "STRONG", shifted: true, priorState: "NORMAL" }]);
  assert.deepStrictEqual(snap, { "used-market": "STRONG" });
});

console.log("\nChecking computeNotificationTriggers — only real, disclosed triggers fire…");

ok("an ordinary run with no shifts/invalidations/high scores produces zero triggers", () => {
  const triggers = computeNotificationTriggers({
    dimensions: [{ dimension: "used-market", state: "NORMAL", shifted: false }],
    opportunities: [{ headline: "x", status: "UNCHANGED", classification: "DEVELOPING", confidence: 30 }],
    inventoryScores: [{ vin: REAL_VINS[0], classification: "WATCH", score: 50 }],
  });
  assert.strictEqual(triggers.length, 0);
});
ok("a real business-dimension shift fires exactly one BUSINESS_SHIFT trigger", () => {
  const triggers = computeNotificationTriggers({
    dimensions: [{ dimension: "credit-environment", state: "TIGHT", shifted: true, priorState: "NORMAL", whyItMatters: "z" }],
    opportunities: [], inventoryScores: [],
  });
  assert.strictEqual(triggers.length, 1);
  assert.strictEqual(triggers[0].kind, "BUSINESS_SHIFT");
});
ok("an INVALIDATED opportunity fires OPPORTUNITY_INVALIDATED", () => {
  const triggers = computeNotificationTriggers({
    dimensions: [], inventoryScores: [],
    opportunities: [{ headline: "Thesis broke", status: "INVALIDATED", classification: "DEVELOPING", confidence: 20 }],
  });
  assert.ok(triggers.some((t) => t.kind === "OPPORTUNITY_INVALIDATED"));
});
ok("a high-confidence NEW early opportunity fires NEW_OPPORTUNITY", () => {
  const triggers = computeNotificationTriggers({
    dimensions: [], inventoryScores: [],
    opportunities: [{ headline: "Undervalued trucks at auction", status: "NEW", classification: "EARLY", confidence: 75 }],
  });
  assert.ok(triggers.some((t) => t.kind === "NEW_OPPORTUNITY"));
});
ok("a strong BUY_AGGRESSIVELY real lot vehicle fires STRONG_LOT_VEHICLE", () => {
  const triggers = computeNotificationTriggers({
    dimensions: [], opportunities: [],
    inventoryScores: [{ vin: REAL_VINS[0], classification: "BUY_AGGRESSIVELY", score: 92, reason: "strong real comps" }],
  });
  assert.ok(triggers.some((t) => t.kind === "STRONG_LOT_VEHICLE"));
});

console.log(`\n${passed} checks passed.`);
console.log("CAR-BUSINESS-ENGINE TEST OK");
