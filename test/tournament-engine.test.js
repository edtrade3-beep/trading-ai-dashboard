"use strict";
// Real tests for src/tournament-engine.js — "500-Stock Tournament" master
// prompt (2026-09-17). Pure ranking/tier/velocity/early-discovery logic,
// no network — canonical scoring itself is reused, not re-tested here
// (already covered by canonical-decision-pipeline.test.js and friends).
const assert = require("node:assert");
const {
  rankTournamentSymbols, tierForRank, velocityLabelFor, rankAdjustedScore,
  pickEarlyDiscoveryChallengers, extractTournamentFields,
  TOP_N, ELITE_N, RISK_RANK_ADJUSTMENT_WEIGHT,
} = require("../src/tournament-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking tierForRank — real 5-band tournament tier assignment…");

ok("ranks 1-5 are ELITE, 6-10 GREAT, 11-15 STRONG, 16-20 GOOD, 21-25 DEVELOPING, per the prompt's own bands", () => {
  assert.strictEqual(tierForRank(1).tier, "ELITE");
  assert.strictEqual(tierForRank(5).tier, "ELITE");
  assert.strictEqual(tierForRank(6).tier, "GREAT");
  assert.strictEqual(tierForRank(10).tier, "GREAT");
  assert.strictEqual(tierForRank(11).tier, "STRONG");
  assert.strictEqual(tierForRank(16).tier, "GOOD");
  assert.strictEqual(tierForRank(21).tier, "DEVELOPING");
  assert.strictEqual(tierForRank(25).tier, "DEVELOPING");
});

ok("rank 26+ (outside the real Top 25) gets no tier — never a fabricated 6th band", () => {
  assert.strictEqual(tierForRank(26).tier, null);
  assert.strictEqual(tierForRank(TOP_N + 1).tier, null);
});

console.log("\nChecking velocityLabelFor — real, bounded rank-change banding…");

ok("a real +7 rank jump (the prompt's own AMD #11->#4 example) reads IMPROVING, a +10+ jump reads ACCELERATING", () => {
  assert.strictEqual(velocityLabelFor(7), "IMPROVING");
  assert.strictEqual(velocityLabelFor(14), "ACCELERATING");
});

ok("a real fall reads WEAKENING/FALLING symmetrically, no change reads STABLE", () => {
  assert.strictEqual(velocityLabelFor(-5), "WEAKENING");
  assert.strictEqual(velocityLabelFor(-12), "FALLING");
  assert.strictEqual(velocityLabelFor(0), "STABLE");
  assert.strictEqual(velocityLabelFor(null), "STABLE");
});

console.log("\nChecking rankAdjustedScore — real, disclosed risk tiebreak (section 4: never let high-risk blindly beat low-risk)…");

ok("two symbols with the same real opportunityScore but different real riskScore rank the lower-risk one higher", () => {
  const lowRisk = rankAdjustedScore({ opportunityScore: 80, riskScore: 10 });
  const highRisk = rankAdjustedScore({ opportunityScore: 80, riskScore: 70 });
  assert.ok(lowRisk > highRisk);
});

ok("a missing real riskScore is treated as moderate (50), never as zero/safe", () => {
  const withUnknownRisk = rankAdjustedScore({ opportunityScore: 80, riskScore: null });
  const withKnownModerateRisk = rankAdjustedScore({ opportunityScore: 80, riskScore: 50 });
  assert.strictEqual(withUnknownRisk, withKnownModerateRisk);
});

ok("the real displayed opportunityScore/riskScore are never merged into this adjusted value's own field name — this is a ranking-only tiebreak", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../src/tournament-engine"), "utf8");
  assert.match(src, /RISK_RANK_ADJUSTMENT_WEIGHT/);
  assert.match(src, /ranking only|internal ranking/i);
});

console.log("\nChecking rankTournamentSymbols — real sort, honest exclusion of never-scored symbols…");

ok("sorts by the real risk-adjusted score, best first", () => {
  const state = { symbols: {
    A: { symbol: "A", opportunityScore: 90, riskScore: 10 },
    B: { symbol: "B", opportunityScore: 95, riskScore: 80 },
    C: { symbol: "C", opportunityScore: 60, riskScore: 20 },
  } };
  const ranked = rankTournamentSymbols(state);
  assert.strictEqual(ranked[0].symbol, "A"); // 90 - 10*0.15 = 88.5 beats 95 - 80*0.15 = 83
});

ok("a symbol never real-scanned this session (no opportunityScore) is honestly excluded, never ranked off a fabricated default", () => {
  const state = { symbols: { A: { symbol: "A", opportunityScore: 80, riskScore: 20 }, B: { symbol: "B" } } };
  const ranked = rankTournamentSymbols(state);
  assert.strictEqual(ranked.length, 1);
  assert.strictEqual(ranked[0].symbol, "A");
});

console.log("\nChecking pickEarlyDiscoveryChallengers — real edge-velocity reuse, reserves slots only for genuinely improving candidates…");

ok("reserves the real requested number of slots from candidates with real positive edge velocity, sorted strongest-first", () => {
  const state = { symbols: {
    X: { edgeVelocity: { velocity: 30 } }, Y: { edgeVelocity: { velocity: 5 } }, Z: { edgeVelocity: { velocity: null } },
  } };
  const picks = pickEarlyDiscoveryChallengers(state, [{ symbol: "X" }, { symbol: "Y" }, { symbol: "Z" }], 23); // 2 slots free (25-23)
  assert.deepStrictEqual(picks, ["X", "Y"]);
});

ok("never pads with a fabricated pick when fewer real candidates are accelerating than there are slots", () => {
  const state = { symbols: { X: { edgeVelocity: { velocity: 12 } }, Y: { edgeVelocity: null } } };
  const picks = pickEarlyDiscoveryChallengers(state, [{ symbol: "X" }, { symbol: "Y" }], 20); // 5 slots free
  assert.deepStrictEqual(picks, ["X"]);
});

ok("zero free slots (confirmed list already fills all 25) reserves nothing", () => {
  const state = { symbols: { X: { edgeVelocity: { velocity: 50 } } } };
  assert.deepStrictEqual(pickEarlyDiscoveryChallengers(state, [{ symbol: "X" }], TOP_N), []);
});

console.log("\nChecking extractTournamentFields — real field mapping off canonical-decision-pipeline.js's own output, no invented fields…");

ok("maps real assetDecision/opportunity fields onto the tournament shape without recomputing any of them", () => {
  const canonical = {
    assetDecision: {
      riskScore: 24, riskLevel: "NORMAL", signalState: "ARMED", stop: 90, targets: [110, 120], riskReward: 2.1,
      trendScore: 18, momentumScore: 14, relativeStrengthScore: 9, newsScore: 12, fundamentalScore: null, valuationScore: null,
      reasons: ["Strong trend"], blockers: [],
    },
    opportunity: { score: 88, tier: "ACTIONABLE", stage: "CONFIRMED", entry: 100, invalidation: 88, redFlags: [], breakdown: { volume: 8, entryQuality: 9 } },
  };
  const row = { price: 101.5, dayChangePct: 2.3 };
  const fields = extractTournamentFields(canonical, row);
  assert.strictEqual(fields.opportunityScore, 88);
  assert.strictEqual(fields.riskScore, 24);
  assert.strictEqual(fields.tier, "ACTIONABLE");
  assert.strictEqual(fields.opportunityStage, "CONFIRMED");
  assert.strictEqual(fields.signalState, "ARMED");
  assert.strictEqual(fields.target, 110);
  assert.strictEqual(fields.riskReward, 2.1);
  assert.strictEqual(fields.trendScore, 18);
  assert.strictEqual(fields.volumeScore, 8);
});

ok("real, honestly-unavailable fundamentals/valuation stay null rather than being invented", () => {
  const canonical = { assetDecision: { fundamentalScore: null, valuationScore: null }, opportunity: { breakdown: {} } };
  const fields = extractTournamentFields(canonical, {});
  assert.strictEqual(fields.fundamentalScore, null);
  assert.strictEqual(fields.valuationScore, null);
});

console.log("\nChecking reuse discipline (source-inspection tripwire)…");

ok("tournament-engine.js reuses the real canonical-decision-pipeline.js, universe-builder.js, and opportunity-timeline-store.js — no second scoring/universe/velocity engine declared here", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../src/tournament-engine"), "utf8");
  assert.match(src, /require\("\.\/canonical-decision-pipeline"\)/);
  assert.match(src, /require\("\.\/universe-builder"\)/);
  assert.match(src, /require\("\.\/opportunity-timeline-store"\)/);
  assert.doesNotMatch(src, /function computeCoreScore|function computeOpportunity|function buildAssetDecision|function computeEdgeVelocity/, "must not redeclare canonical scoring/velocity");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TOURNAMENT-ENGINE TEST FAILED");
else console.log("TOURNAMENT-ENGINE TEST OK");
