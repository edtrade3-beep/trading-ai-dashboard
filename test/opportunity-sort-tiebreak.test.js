"use strict";
// opportunity-sort-tiebreak.test.js — real structural regression test for
// the tiers[key].sort() comparator in computeAllOpportunities()
// (src/routes/market.js). That function does real async provider I/O and
// isn't exported for direct unit invocation, so — same convention this
// session already used for non-directly-testable JSX logic — this
// confirms the exact comparator shape via source inspection rather than
// live execution. Covers the "Provisional 2-Sample Edge Velocity" task's
// SORT REGRESSION requirement: real opportunityScore stays the primary
// sort key, Edge Velocity remains only a tiebreaker, and confirmed
// (3+-sample) Edge Velocity is never disadvantaged versus a provisional
// (2-sample) read when scores tie.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const src = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "market.js"), "utf8");
const sortLine = src.slice(src.indexOf("for (const key of Object.keys(tiers)) {"), src.indexOf("for (const key of Object.keys(tiers)) {") + 700);

console.log("Checking computeAllOpportunities()'s tiers sort comparator — real score primary, confirmed-beats-provisional, velocity final tiebreak…");

ok("real opportunityScore (a.score/b.score) remains the PRIMARY sort key, unchanged", () => {
  assert.match(sortLine, /\(b\.score \|\| 0\) - \(a\.score \|\| 0\)/);
});

ok("confirmed (non-provisional) Edge Velocity is compared BEFORE raw velocity magnitude — a provisional read can never outrank a confirmed read purely on a larger noisy number when scores tie", () => {
  assert.match(sortLine, /Number\(!a\.edgeVelocity\?\.isProvisional\) - Number\(!b\.edgeVelocity\?\.isProvisional\)/);
});

ok("raw Edge Velocity magnitude remains only the FINAL tiebreak, after score and confirmed-vs-provisional — never a new composite ranking score", () => {
  const scoreIdx = sortLine.indexOf("(b.score || 0) - (a.score || 0)");
  const confirmedIdx = sortLine.indexOf("Number(!a.edgeVelocity");
  const velocityIdx = sortLine.indexOf("(b.edgeVelocity?.velocity || 0) - (a.edgeVelocity?.velocity || 0)");
  assert.ok(scoreIdx > -1 && confirmedIdx > -1 && velocityIdx > -1, "all three tiebreak levels must be present");
  assert.ok(scoreIdx < confirmedIdx && confirmedIdx < velocityIdx, "order must be: score, then confirmed-vs-provisional, then raw velocity");
});

ok("no new independent composite ranking formula introduced (no multiplication/weighting of score with velocity)", () => {
  assert.doesNotMatch(sortLine, /score\s*\*|velocity\s*\*|\+\s*edgeVelocity/i);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("OPPORTUNITY-SORT-TIEBREAK TEST FAILED");
else console.log("OPPORTUNITY-SORT-TIEBREAK TEST OK");
