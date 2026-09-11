"use strict";
// red-team-engine.test.js — formal Red-Team Agent (2026-09-11, explicit
// user request via a revised master platform spec). Pure logic, fully
// unit-testable — zero AI/network dependency.
const assert = require("node:assert");
const { buildRedTeamReview } = require("../src/red-team-engine");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

const baseDecision = {
  verdict: "BUY", reasons: ["Trend confirmed", "Strong RS"], blockers: [], invalidation: 92,
  changeMyMind: ["Price reclaims the 50-day."], relativeStrengthScore: 9, momentumScore: 8,
  eventRiskScore: 0, riskOverride: null, dataQuality: 100, modelConfidence: 85,
  marketRegime: { regime: "RISK_ON" },
};

console.log("Checking buildRedTeamReview — real contradiction detection, never a fabricated attack…");

ok("null decision -> null review, never fabricated", () => {
  assert.equal(buildRedTeamReview(null), null);
});
ok("a genuinely strong BUY with no real contradictions gets an honest 'nothing found' counterargument, never an invented one", () => {
  const r = buildRedTeamReview(baseDecision);
  assert.equal(r.contradictions.length, 0);
  assert.match(r.strongestCounterargument, /No real, evidence-backed counterargument found/);
  assert.equal(r.reviewedVerdict, "BUY");
  assert.equal(r.isHighConviction, true);
});
ok("an active real blocker always wins as the strongest counterargument over a detected contradiction", () => {
  const r = buildRedTeamReview({ ...baseDecision, blockers: ["Required data price return unhealthy."], relativeStrengthScore: 2 });
  assert.equal(r.strongestCounterargument, "Required data price return unhealthy.");
});
ok("a real weak relative-strength score on a high-conviction verdict is flagged as a genuine contradiction", () => {
  const r = buildRedTeamReview({ ...baseDecision, relativeStrengthScore: 2 });
  assert.ok(r.contradictions.some((c) => /relative strength/.test(c)));
  assert.match(r.strongestCounterargument, /relative strength/);
});
ok("a real weak momentum score on a high-conviction verdict is flagged", () => {
  const r = buildRedTeamReview({ ...baseDecision, momentumScore: 1 });
  assert.ok(r.contradictions.some((c) => /momentum/.test(c)));
});
ok("a lukewarm regime (not RISK_ON) on a high-conviction verdict is flagged as a real contradiction", () => {
  const r = buildRedTeamReview({ ...baseDecision, marketRegime: { regime: "NEUTRAL" } });
  assert.ok(r.contradictions.some((c) => /NEUTRAL/.test(c)));
});
ok("an active event-risk score not already blocking the trade is surfaced as a real contradiction", () => {
  const r = buildRedTeamReview({ ...baseDecision, eventRiskScore: 15 });
  assert.ok(r.contradictions.some((c) => /event-risk/.test(c)));
});
ok("a real risk-override downgrade is always surfaced as a contradiction", () => {
  const r = buildRedTeamReview({ ...baseDecision, riskOverride: { from: "BUY", to: "WAIT", reasons: ["Canonical market regime is CRISIS."] } });
  assert.ok(r.contradictions.some((c) => /downgraded this from BUY to WAIT/.test(c)));
});
ok("low real dataQuality on a high-conviction verdict is flagged", () => {
  const r = buildRedTeamReview({ ...baseDecision, dataQuality: 60 });
  assert.ok(r.contradictions.some((c) => /Data quality is 60/.test(c)));
});
ok("low real modelConfidence with no other contradiction present becomes the honest strongest counterargument", () => {
  const r = buildRedTeamReview({ ...baseDecision, modelConfidence: 40 });
  assert.match(r.strongestCounterargument, /Model confidence is only 40\/100/);
});
ok("a non-BUY-family verdict (e.g. WAIT) is not flagged as high conviction, and its own contradictions checks are skipped", () => {
  const r = buildRedTeamReview({ ...baseDecision, verdict: "WAIT", relativeStrengthScore: 1, momentumScore: 1 });
  assert.equal(r.isHighConviction, false);
  assert.equal(r.contradictions.length, 0);
});
ok("thesis/invalidation/conditionsToFlip are forwarded verbatim from the real decision, never re-derived", () => {
  const r = buildRedTeamReview(baseDecision);
  assert.deepStrictEqual(r.thesis, baseDecision.reasons);
  assert.equal(r.invalidation, baseDecision.invalidation);
  assert.deepStrictEqual(r.conditionsToFlip, baseDecision.changeMyMind);
});

console.log(`\n${passed} checks passed.`);
if (!process.exitCode) console.log("RED-TEAM-ENGINE TEST OK");
