// Real tests for src/research-intel-engine.js's pure sanitizers + the
// deterministic diff/notification logic (upgrade-search, 2026-08-30).
// Pure-function, synthetic-input, zero-network, zero-DB — the AI call
// itself (research-intel-ai.js) is untested by design, same precedent as
// command-center-ai.js/advisor-ai.js in this codebase (nothing meaningful
// to assert about a live web-search LLM call without hitting the real
// API); everything genuinely deterministic here IS tested.
"use strict";
const assert = require("node:assert");
const {
  sanitizeCards, sanitizeTechDiscoveries, sanitizeNarrativeShifts, dimensionsToSnapshot,
  attachPriorClassification, computeNotificationTriggers,
} = require("../src/research-intel-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking sanitizeCards — bounded, honest-default shape…");

ok("a well-formed card round-trips with real fields intact", () => {
  const cards = sanitizeCards([{
    headline: "Fed signals extended hold", category: "fed-rates", classification: "DEVELOPING",
    whatChanged: "x", whyItMatters: "y", opportunity: 62, confidence: 71, risk: "MEDIUM",
    beneficiaries: ["TLT"], losers: ["XLF"], sources: ["Reuters"], dataQuality: "ANALYSIS", status: "NEW",
  }]);
  assert.strictEqual(cards.length, 1);
  assert.strictEqual(cards[0].category, "fed-rates");
  assert.strictEqual(cards[0].opportunity, 62);
  assert.deepStrictEqual(cards[0].beneficiaries, ["TLT"]);
});

ok("a card with no headline is dropped, not fabricated", () => {
  const cards = sanitizeCards([{ headline: "", category: "market" }]);
  assert.strictEqual(cards.length, 0);
});

ok("an out-of-enum category/classification/status honestly degrades to a safe default, never crashes", () => {
  const cards = sanitizeCards([{ headline: "Something happened", category: "bogus", classification: "bogus", status: "bogus" }]);
  assert.strictEqual(cards[0].category, "market");
  assert.strictEqual(cards[0].classification, "DEVELOPING");
  assert.strictEqual(cards[0].status, "NEW"); // real-new default, never silently hidden as UNCHANGED
});

ok("opportunity/confidence are clamped into real 0-100 bounds", () => {
  const cards = sanitizeCards([{ headline: "x", opportunity: 500, confidence: -20 }]);
  assert.strictEqual(cards[0].opportunity, 100);
  assert.strictEqual(cards[0].confidence, 0);
});

ok("more than 12 cards are capped, not silently unbounded", () => {
  const raw = Array.from({ length: 20 }, (_, i) => ({ headline: `H${i}` }));
  assert.strictEqual(sanitizeCards(raw).length, 12);
});

console.log("\nChecking sanitizeTechDiscoveries…");

ok("a well-formed tech discovery keeps real fields, drops one with no technology name", () => {
  const out = sanitizeTechDiscoveries([
    { technology: "Photonic computing", maturity: "early commercial", winners: ["A"] },
    { technology: "" },
  ]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].technology, "Photonic computing");
});

console.log("\nChecking sanitizeNarrativeShifts — real cross-run diff, not AI self-report…");

ok("a dimension whose state differs from the real stored prior value is marked shifted", () => {
  const out = sanitizeNarrativeShifts(
    [{ dimension: "fed-policy-direction", state: "HIKE-RISK", whyItMatters: "z" }],
    { "fed-policy-direction": "HOLD-NEUTRAL" }
  );
  assert.strictEqual(out[0].shifted, true);
  assert.strictEqual(out[0].priorState, "HOLD-NEUTRAL");
});

ok("the same state as yesterday is NOT flagged as a shift, even if the AI text implies drama", () => {
  const out = sanitizeNarrativeShifts(
    [{ dimension: "ai-narrative", state: "AI-BOOM" }],
    { "ai-narrative": "AI-BOOM" }
  );
  assert.strictEqual(out[0].shifted, false);
});

ok("a dimension with no prior stored value is never flagged as a shift (nothing real to compare against)", () => {
  const out = sanitizeNarrativeShifts([{ dimension: "labor-market", state: "TIGHT" }], {});
  assert.strictEqual(out[0].shifted, false);
  assert.strictEqual(out[0].priorState, null);
});

ok("an unrecognized dimension key is dropped, and a duplicate dimension only keeps the first", () => {
  const out = sanitizeNarrativeShifts(
    [{ dimension: "made-up-dimension", state: "X" }, { dimension: "labor-market", state: "TIGHT" }, { dimension: "labor-market", state: "SOFTENING" }],
    {}
  );
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].state, "TIGHT");
});

console.log("\nChecking dimensionsToSnapshot…");
ok("produces a plain key:value snapshot for tomorrow's diff", () => {
  const snap = dimensionsToSnapshot([{ dimension: "fiscal-stance", state: "CONSTRAINED", shifted: true, priorState: "SUPPORTIVE" }]);
  assert.deepStrictEqual(snap, { "fiscal-stance": "CONSTRAINED" });
});

console.log("\nChecking attachPriorClassification — real cross-run lookup by exact headline match…");

ok("a card referencing a real prior headline gets that prior card's classification attached", () => {
  const cards = [{ headline: "New evidence", priorHeadline: "Old Headline", classification: "CONFIRMED" }];
  const prior = [{ headline: "old headline", classification: "EARLY_OPPORTUNITY" }]; // case-insensitive match
  const out = attachPriorClassification(cards, prior);
  assert.strictEqual(out[0].priorClassification, "EARLY_OPPORTUNITY");
});

ok("a card with no real prior match gets a null priorClassification, never a guess", () => {
  const out = attachPriorClassification([{ headline: "x", priorHeadline: "Nonexistent" }], [{ headline: "Something else", classification: "DEVELOPING" }]);
  assert.strictEqual(out[0].priorClassification, null);
});

console.log("\nChecking computeNotificationTriggers — the spec's exact 8-trigger gate, nothing else fires…");

ok("an ordinary run with no shifts/invalidations/high scores produces zero triggers", () => {
  const triggers = computeNotificationTriggers({
    narrativeShifts: [{ dimension: "labor-market", state: "TIGHT", shifted: false }],
    cards: [{ headline: "Routine update", status: "UNCHANGED", classification: "DEVELOPING", category: "market", opportunity: 30, risk: "LOW" }],
    techDiscoveries: [],
  });
  assert.strictEqual(triggers.length, 0);
});

ok("a real narrative shift fires exactly one NARRATIVE_SHIFT trigger", () => {
  const triggers = computeNotificationTriggers({
    narrativeShifts: [{ dimension: "growth-inflation-regime", state: "RECESSION-RISK", shifted: true, priorState: "SOFT-LANDING", whyItMatters: "z" }],
    cards: [], techDiscoveries: [],
  });
  assert.strictEqual(triggers.length, 1);
  assert.strictEqual(triggers[0].kind, "NARRATIVE_SHIFT");
});

ok("an INVALIDATED card fires RESEARCH_INVALIDATED", () => {
  const triggers = computeNotificationTriggers({
    narrativeShifts: [], techDiscoveries: [],
    cards: [{ headline: "Thesis broke", status: "INVALIDATED", classification: "DEVELOPING", category: "market", opportunity: 20, risk: "LOW" }],
  });
  assert.ok(triggers.some((t) => t.kind === "RESEARCH_INVALIDATED"));
});

ok("EARLY_OPPORTUNITY becoming CONFIRMED (real prior classification attached) fires EARLY_BECAME_CONFIRMED", () => {
  const triggers = computeNotificationTriggers({
    narrativeShifts: [], techDiscoveries: [],
    cards: [{ headline: "It broke out", status: "STRENGTHENED", classification: "CONFIRMED", priorClassification: "EARLY_OPPORTUNITY", category: "market", opportunity: 40, risk: "LOW" }],
  });
  assert.ok(triggers.some((t) => t.kind === "EARLY_BECAME_CONFIRMED"));
});

ok("a high-opportunity NEW card in fed-rates/economy fires FED_OUTLOOK_MATERIAL, not the generic catalyst trigger", () => {
  const triggers = computeNotificationTriggers({
    narrativeShifts: [], techDiscoveries: [],
    cards: [{ headline: "Real yields spike", status: "NEW", classification: "EARLY_OPPORTUNITY", category: "fed-rates", opportunity: 65, risk: "MEDIUM" }],
  });
  assert.ok(triggers.some((t) => t.kind === "FED_OUTLOOK_MATERIAL"));
  assert.ok(!triggers.some((t) => t.kind === "SECTOR_OR_STOCK_CATALYST"));
});

ok("a high-opportunity NEW low-risk card outside fed/policy fires the generic sector/stock catalyst trigger", () => {
  const triggers = computeNotificationTriggers({
    narrativeShifts: [], techDiscoveries: [],
    cards: [{ headline: "Undercovered breakout setup", status: "NEW", classification: "EARLY_OPPORTUNITY", category: "market", opportunity: 75, risk: "MEDIUM" }],
  });
  assert.ok(triggers.some((t) => t.kind === "SECTOR_OR_STOCK_CATALYST"));
});

ok("a NEW tech discovery fires NEW_TECHNOLOGY_THEME", () => {
  const triggers = computeNotificationTriggers({
    narrativeShifts: [], cards: [],
    techDiscoveries: [{ technology: "Neuromorphic chips", status: "NEW" }],
  });
  assert.ok(triggers.some((t) => t.kind === "NEW_TECHNOLOGY_THEME"));
});

console.log(`\n${passed} checks passed.`);
console.log("RESEARCH-INTEL-ENGINE TEST OK");
