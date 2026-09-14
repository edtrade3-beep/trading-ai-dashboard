"use strict";
// trade-gps-risk-display.test.js — real structural regression test for
// surfacing the Unified Risk Score on Trade Desk's primary verdict card
// (2026-09-13). Same fs.readFileSync + regex structural-check convention
// as tasbeeh-counter-widget.test.js — no jsdom/testing-library exists in
// this repo to render React components. Confirms the card displays the
// EXISTING AssetDecision fields (riskScore/riskLevel/riskContributors)
// without recomputing risk itself.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const src = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "TradeGpsCard.jsx"), "utf8");

console.log("Checking TradeGpsCard.jsx — Unified Risk Score display, additive/read-only…");

ok("reads riskScore/riskLevel/riskContributors straight off the decision prop — never recomputes risk", () => {
  assert.match(src, /decision\?\.riskScore/);
  assert.match(src, /decision\?\.riskLevel/);
  assert.match(src, /decision\?\.riskContributors/);
  assert.doesNotMatch(src, /function computeRiskScore/, "must not redefine/recompute risk logic in the UI");
});

ok("NORMAL/HIGH DATA: renders the real numeric score and the real supplied level, never a hardcoded threshold in the frontend", () => {
  assert.match(src, /\$\{decision\.riskScore\}\/100/);
  assert.match(src, /decision\.riskLevel/);
  // The 5 level->color entries are a display-color lookup, not a
  // threshold redefinition — thresholds themselves stay in the backend.
  assert.match(src, /RISK_LEVEL_COLOR = \{ LOW:.*NORMAL:.*ELEVATED:.*HIGH:.*CRITICAL:/);
});

ok("CONTRIBUTORS: sorts by the existing real `points` field (display order only) and caps at 3, never invents a new score", () => {
  assert.match(src, /sort\(\(a, b\) => \(b\.points \|\| 0\) - \(a\.points \|\| 0\)\)/);
  assert.match(src, /\.slice\(0, 3\)/);
  assert.match(src, /topRiskContributors\.length > 0/);
});

ok("MISSING RISK: shows the literal UNAVAILABLE state, never a bare 0 when riskScore is absent", () => {
  assert.match(src, /"UNAVAILABLE"/);
  assert.match(src, /riskAvailable = Number\.isFinite\(decision\?\.riskScore\) && Boolean\(decision\?\.riskLevel\)/);
});

ok("risk display never touches verdict/color/label computation above it in the file", () => {
  const verdictIdx = src.indexOf("const verdict = tradeGpsVerdict");
  const riskIdx = src.indexOf("const riskAvailable");
  assert.ok(verdictIdx > -1 && riskIdx > -1 && riskIdx > verdictIdx, "risk block must come after, not intermix with, verdict computation");
});

console.log("\nChecking Opportunity Score display — paired with Risk, canonical field only…");

ok("NORMAL OPPORTUNITY SCORE: reads decision.opportunityScore directly — never tradeScore, never confidence as a substitute", () => {
  assert.match(src, /decision\?\.opportunityScore/);
  assert.match(src, /\$\{decision\.opportunityScore\}\/100/);
  // The badge value expression must not read tradeScore or confidence.
  const oppLine = src.split("\n").find((l) => l.includes('label="OPPORTUNITY"'));
  assert.ok(oppLine, "OPPORTUNITY badge not found");
  assert.doesNotMatch(oppLine, /tradeScore|confidence/i);
});

ok("ZERO SCORE: Number.isFinite(0) is true, so a real 0 renders as 0/100, not confused with missing data", () => {
  assert.match(src, /opportunityAvailable = Number\.isFinite\(decision\?\.opportunityScore\)/);
});

ok("MISSING SCORE: shows the literal UNAVAILABLE state", () => {
  const oppLine = src.split("\n").find((l) => l.includes('label="OPPORTUNITY"'));
  assert.match(oppLine, /UNAVAILABLE/);
});

ok("SEPARATION: Opportunity and Risk are two independent BigBadge calls, each reading its own field", () => {
  const bigBadgeCalls = src.match(/<BigBadge[^>]*>/g) || [];
  assert.strictEqual(bigBadgeCalls.length, 2);
  assert.ok(bigBadgeCalls.some((c) => c.includes('label="OPPORTUNITY"')));
  assert.ok(bigBadgeCalls.some((c) => c.includes('label="RISK"')));
});

ok("CONFIDENCE metric still exists, distinct from Opportunity Score (different concepts, both kept)", () => {
  assert.match(src, /label="CONFIDENCE"/);
});

ok("RISK CONTRIBUTOR FILTER: only positive-point contributors are kept, computeRiskScore itself is not touched", () => {
  assert.match(src, /decision\.riskContributors\.filter\(\(c\) => \(c\.points \|\| 0\) > 0\)/);
  assert.doesNotMatch(src, /function computeRiskScore/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TRADE-GPS-RISK-DISPLAY TEST FAILED");
else console.log("TRADE-GPS-RISK-DISPLAY TEST OK");
