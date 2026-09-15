"use strict";
// trade-gps-why-bullets.test.js — real structural regression test for
// TradeGpsCard.jsx's always-visible WHY bullet list (2026-09-15,
// "simplify the entire user experience" master prompt: "Show 3-5
// concise reasons for the verdict... Never force the user to mentally
// combine 15 indicators"). Same fs.readFileSync + regex structural-check
// convention as trade-gps-risk-display.test.js — no jsdom/
// testing-library exists in this repo to render React components.
// Confirms the card reuses the EXISTING tradeGps.breakdown fields
// (TradeGpsWhyPanel.jsx's own real 7-bucket score breakdown) rather than
// computing a second, independent reasons algorithm.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const src = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "TradeGpsCard.jsx"), "utf8");

console.log("Checking TradeGpsCard.jsx — real 3-5 bullet WHY reasons, always visible…");

ok("reads tradeGps.breakdown straight off the existing prop — never recomputes a second score-breakdown algorithm", () => {
  assert.match(src, /Object\.entries\(tradeGps\?\.breakdown \|\| \{\}\)/);
  assert.doesNotMatch(src, /function computeScoreBreakdown/, "must not redefine breakdown-scoring logic in the UI");
});

ok("only real positive contributors (score >= 60) become a bullet — never padded to a fixed count with fabricated reasons", () => {
  assert.match(src, /\.filter\(\(\[, score\]\) => Number\.isFinite\(score\) && score >= 60\)/);
});

ok("capped at 5 bullets, sorted by real score descending — strongest real reasons shown first", () => {
  assert.match(src, /\.sort\(\(a, b\) => b\[1\] - a\[1\]\)/);
  assert.match(src, /\.slice\(0, 5\)/);
});

ok("the bullet list only renders when real bullets exist — no empty/placeholder WHY section", () => {
  assert.match(src, /\{whyBullets\.length > 0 && \(/);
});

ok("uses the same 7 real bucket keys TradeGpsWhyPanel.jsx's own SCORE BREAKDOWN declares — same real names, not a re-invented set", () => {
  for (const key of ["regimeAlignment", "trendConfirmation", "catalystQuality", "relativeStrength", "volumeConfirmation", "riskRewardQuality", "optionsLiquidity"]) {
    assert.match(src, new RegExp(key));
  }
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TRADE-GPS-WHY-BULLETS TEST FAILED");
else console.log("TRADE-GPS-WHY-BULLETS TEST OK");
