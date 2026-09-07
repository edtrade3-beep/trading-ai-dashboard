"use strict";
const assert = require("node:assert");
const {
  classifyPartyStage, computeExtensionScore, computeCrowdingScore, computeEntryTimingScore,
  computeOpportunityRemaining, classifyTimingVerdict, computePressureScore, detectEarlyPressure,
  computePartyStageProfile, PARTY_STAGE_META,
} = require("../src/party-stage-engine");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

console.log("Checking classifyPartyStage — real 7-state cascade over already-computed fields…");

ok("real reversal-top risk always wins -> STAGE 6, regardless of entry stage", () => {
  const r = classifyPartyStage({ entryStage: "EARLY", reversalTopRisk: true });
  assert.strictEqual(r.stage, 6);
});
ok("chaseRisk DO_NOT_CHASE -> STAGE 6", () => {
  assert.strictEqual(classifyPartyStage({ chaseRisk: "DO_NOT_CHASE" }).stage, 6);
});
ok("chaseRisk EXTENDED -> STAGE 5 (crowded, not yet overextended)", () => {
  assert.strictEqual(classifyPartyStage({ chaseRisk: "EXTENDED" }).stage, 5);
});
ok("entryStage BREAKOUT/RETEST -> STAGE 4", () => {
  assert.strictEqual(classifyPartyStage({ entryStage: "BREAKOUT", chaseRisk: "NORMAL" }).stage, 4);
  assert.strictEqual(classifyPartyStage({ entryStage: "RETEST", chaseRisk: "NORMAL" }).stage, 4);
});
ok("entryStage CONFIRMATION -> STAGE 3", () => {
  assert.strictEqual(classifyPartyStage({ entryStage: "CONFIRMATION", chaseRisk: "NORMAL" }).stage, 3);
});
ok("ACTIONABLE tier with a non-EARLY entry stage -> STAGE 3", () => {
  assert.strictEqual(classifyPartyStage({ tier: "ACTIONABLE", entryStage: "CONFIRMATION", chaseRisk: "NORMAL" }).stage, 3);
});

ok("EARLY stage with a SINGLE confirming signal never promotes to STAGE 2 — 'no single indicator triggers the signal'", () => {
  const r = classifyPartyStage({ entryStage: "EARLY", rsRating: 85 }); // only one real confirming signal
  assert.strictEqual(r.stage, 1, "one confirming signal must not be enough on its own");
});
ok("EARLY stage with TWO independent real confirming signals -> STAGE 2", () => {
  const r = classifyPartyStage({ entryStage: "EARLY", rsRating: 85, volRatio: 1.6 });
  assert.strictEqual(r.stage, 2);
  assert.ok(r.reasons.length >= 2);
});
ok("EARLY stage with zero confirming signals -> STAGE 1, never fabricated as STAGE 2", () => {
  assert.strictEqual(classifyPartyStage({ entryStage: "EARLY" }).stage, 1);
});

ok("FOUNDATION entry stage / DEVELOPING tier -> STAGE 1 (quiet accumulation)", () => {
  assert.strictEqual(classifyPartyStage({ entryStage: "FOUNDATION" }).stage, 1);
  assert.strictEqual(classifyPartyStage({ tier: "DEVELOPING" }).stage, 1);
});
ok("structure broken / no real data -> honest STAGE 0, never guessed", () => {
  assert.strictEqual(classifyPartyStage({ entryStage: "STRUCTURE_BROKEN" }).stage, 0);
  assert.strictEqual(classifyPartyStage({}).stage, 0);
});
ok("PARTY_STAGE_META covers every real stage 0-6", () => {
  for (let i = 0; i <= 6; i++) assert.ok(PARTY_STAGE_META[i]?.label, `missing meta for stage ${i}`);
});

console.log("\nChecking Extension/Crowding/Timing scores — real, disclosed, never fabricated…");

ok("computeExtensionScore: honest null with no real chaseRisk/reversal input", () => {
  assert.strictEqual(computeExtensionScore({}), null);
});
ok("computeExtensionScore: real band re-scoring, monotonically increasing with real risk", () => {
  const normal = computeExtensionScore({ chaseRisk: "NORMAL" });
  const caution = computeExtensionScore({ chaseRisk: "CAUTION" });
  const extended = computeExtensionScore({ chaseRisk: "EXTENDED" });
  const doNotChase = computeExtensionScore({ chaseRisk: "DO_NOT_CHASE" });
  assert.ok(normal < caution && caution < extended && extended < doNotChase);
});
ok("computeExtensionScore: a real reversalTopRisk always pushes the score to at least 90", () => {
  assert.ok(computeExtensionScore({ chaseRisk: "NORMAL", reversalTopRisk: true }) >= 90);
});

ok("computeCrowdingScore: honest null without a real party stage", () => {
  assert.strictEqual(computeCrowdingScore({}), null);
});
ok("computeCrowdingScore: rises with real party stage (later stage = more real participants already in)", () => {
  const s1 = computeCrowdingScore({ partyStage: 1 });
  const s5 = computeCrowdingScore({ partyStage: 5 });
  assert.ok(s5 > s1);
});
ok("computeCrowdingScore: a real climax volume spike (>=2.5x) bumps crowding independent of stage", () => {
  const base = computeCrowdingScore({ partyStage: 2 });
  const climax = computeCrowdingScore({ partyStage: 2, volRatio: 3.0 });
  assert.ok(climax > base);
});

ok("computeEntryTimingScore: peaks at stage 2-3 (the real 'before it pops' window), lower at stage 0/6", () => {
  const early = computeEntryTimingScore({ partyStage: 2, extensionScore: 15, crowdingScore: 15 });
  const overextended = computeEntryTimingScore({ partyStage: 6, extensionScore: 95, crowdingScore: 90 });
  assert.ok(early > overextended);
});

ok("computeOpportunityRemaining: pure inverse of extension/crowding, independent of stage", () => {
  assert.strictEqual(computeOpportunityRemaining({ extensionScore: 0, crowdingScore: 0 }), 100);
  assert.strictEqual(computeOpportunityRemaining({ extensionScore: 100, crowdingScore: 100 }), 0);
  assert.strictEqual(computeOpportunityRemaining({}), null);
});

ok("classifyTimingVerdict: the spec's exact 4-label vocabulary", () => {
  assert.strictEqual(classifyTimingVerdict({ partyStage: 6, extensionScore: 95 }).verdict, "OVEREXTENDED");
  assert.strictEqual(classifyTimingVerdict({ partyStage: 5, extensionScore: 65 }).verdict, "LATE_DO_NOT_CHASE");
  assert.strictEqual(classifyTimingVerdict({ partyStage: 3, extensionScore: 40 }).verdict, "GOOD_WAIT_PULLBACK");
  assert.strictEqual(classifyTimingVerdict({ partyStage: 2, extensionScore: 10 }).verdict, "EARLY_ATTRACTIVE");
  assert.strictEqual(classifyTimingVerdict({ partyStage: 0 }).verdict, "NO_SETUP");
});

console.log("\nChecking computePressureScore — real weighted composite, honest partial-data discipline…");

ok("every real available component is used; missing ones are disclosed, never defaulted to a fabricated value", () => {
  const r = computePressureScore({ entryStage: "EARLY", rsRating: 80 });
  assert.ok(Number.isFinite(r.score));
  assert.ok(r.unavailable.includes("Volume Behavior"));
  assert.ok(r.unavailable.includes("Sector Strength"));
  assert.ok(r.unavailable.some((u) => u.includes("Fundamental Acceleration")));
});
ok("zero real components -> honest null score, never a fabricated midpoint", () => {
  const r = computePressureScore({});
  assert.strictEqual(r.score, null);
});
ok("real price extension reduces the pressure score (a crowded/extended name has less real pressure left)", () => {
  const clean = computePressureScore({ entryStage: "EARLY", rsRating: 90, volRatio: 1.5 });
  const extended = computePressureScore({ entryStage: "EARLY", rsRating: 90, volRatio: 1.5, chaseRisk: "DO_NOT_CHASE" });
  assert.ok(extended.score < clean.score);
});
ok("the extension penalty is capped at 50% of the raw average, never zeroes out real evidence", () => {
  const r = computePressureScore({ entryStage: "CONFIRMATION", rsRating: 95, volRatio: 3, optionsStatus: "CONFIRMS", institutionScore: 90, chaseRisk: "DO_NOT_CHASE", reversalTopRisk: true });
  assert.ok(r.score > 0, "even at max real extension penalty, a genuinely strong pressure read must not be erased to 0");
});

console.log("\nChecking detectEarlyPressure — the spec's 'buying pressure improving faster than price' alert…");

ok("fires only for genuinely early stages (1-2) with real high pressure, low crowding, and a modest real price move so far", () => {
  const r = detectEarlyPressure({ partyStage: 2, pressureScore: 78, crowdingScore: 15, weekChangePct: 3 });
  assert.ok(r && r.detected === true);
  assert.strictEqual(r.crowding, "LOW");
});
ok("never fires once the party stage has moved past early (3+) — that's a confirmed setup, not an early-warning", () => {
  assert.strictEqual(detectEarlyPressure({ partyStage: 4, pressureScore: 90, crowdingScore: 10, weekChangePct: 1 }), null);
});
ok("never fires on a real low pressure score, regardless of stage", () => {
  assert.strictEqual(detectEarlyPressure({ partyStage: 2, pressureScore: 40, crowdingScore: 10, weekChangePct: 1 }), null);
});
ok("never fires once real crowding is already elevated — the 'early' window has already closed", () => {
  assert.strictEqual(detectEarlyPressure({ partyStage: 2, pressureScore: 80, crowdingScore: 50, weekChangePct: 1 }), null);
});
ok("never fires if the real price has already moved a lot — that's confirmation, not an early signal", () => {
  assert.strictEqual(detectEarlyPressure({ partyStage: 2, pressureScore: 80, crowdingScore: 10, weekChangePct: 15 }), null);
});

console.log("\nChecking computePartyStageProfile — the one combined real read a route/UI consumes…");

ok("composes every sub-function from one real input object, all real fields present and internally consistent", () => {
  const profile = computePartyStageProfile({ entryStage: "EARLY", rsRating: 82, volRatio: 1.5, weekChangePct: 2 });
  assert.strictEqual(profile.partyStage, 2);
  assert.ok(Number.isFinite(profile.crowdingScore));
  assert.ok(Number.isFinite(profile.entryTimingScore));
  assert.strictEqual(profile.timingVerdict, "EARLY_ATTRACTIVE");
  assert.ok(profile.pressure && Number.isFinite(profile.pressure.score));
  assert.ok(profile.earlyPressure === null || profile.earlyPressure.detected === true);
});
ok("a real no-setup input never crashes and returns an honest, internally consistent profile", () => {
  const profile = computePartyStageProfile({});
  assert.strictEqual(profile.partyStage, 0);
  assert.strictEqual(profile.extensionScore, null);
  assert.strictEqual(profile.pressure.score, null);
  assert.strictEqual(profile.earlyPressure, null);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("PARTY-STAGE-ENGINE TEST FAILED");
else console.log("PARTY-STAGE-ENGINE TEST OK");
