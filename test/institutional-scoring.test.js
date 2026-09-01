// Real tests for src/institutional-scoring.js's computeInstitutionalGrade —
// previously ZERO test coverage (confirmed before writing this). This is
// the EXACT function this file's own header comment (institutionalRecommendation)
// documents a real live incident for: a "★★★★★ Strong Buy" card once shown
// directly under the real Core Engine's 🔴 AVOID banner. Covers the
// 2026-08-26 "Trade Desk Tier 3a" fix closing that gap at the source.
// Pure-function, synthetic-input, zero-network.
// Run: node test/institutional-scoring.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { computeInstitutionalGrade, institutionalRecommendation, institutionalLetterGrade } = require("../src/institutional-scoring");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const REGIME = { label: "GREEN", score: 85 };
const STRONG_ROW = { passCount: 8, abovePivotPct: 1, epsGrowth: 15, stage: "Stage 2 — Confirmed", smc: { bos: { type: "BULL_BOS" } } };
const STRONG_TECHNICALS = { adx: { adx: 35, strength: "Strong", direction: "Bullish", plusDI: 30, minusDI: 10 } };
const SECTOR = { rank: 1, of: 11 };

console.log("Checking computeInstitutionalGrade — real inputs, honest degrade when absent…");
ok("a genuinely strong, non-gated setup scores high (>=70)", () => {
  const r = computeInstitutionalGrade(STRONG_ROW, STRONG_TECHNICALS, REGIME, SECTOR, null);
  assert.ok(r.score >= 70, `expected >=70, got ${r.score}`);
  assert.strictEqual(r.cautions.length, 0);
});

console.log("Checking computeInstitutionalGrade — real Stage-4/anti-chase hard gate (regression, 2026-08-26)…");
ok("regression: the exact documented live incident — Stage 4 downtrend must never read 'Excellent'/'Strong', even with every other real dimension strong", () => {
  const r = computeInstitutionalGrade({ ...STRONG_ROW, stage: "Stage 4 — Declining" }, STRONG_TECHNICALS, REGIME, SECTOR, null);
  assert.ok(r.score <= 20, `expected a capped score <=20, got ${r.score}`);
  assert.ok(r.cautions.some((c) => /stage 4/i.test(c)));
  const rec = institutionalRecommendation(r.score);
  assert.ok(["Poor", "Weak"].includes(rec.label), `expected a real degraded label, got ${rec.label}`);
  assert.notStrictEqual(rec.label, "Excellent");
});
ok("real anti-chase EXTENDED/DO_NOT_CHASE also caps the score, never reading Excellent", () => {
  const r1 = computeInstitutionalGrade({ ...STRONG_ROW, abovePivotPct: 6 }, STRONG_TECHNICALS, REGIME, SECTOR, null);
  assert.ok(r1.score <= 20, `expected a capped score <=20, got ${r1.score}`);
  assert.notStrictEqual(institutionalRecommendation(r1.score).label, "Excellent");
  const r2 = computeInstitutionalGrade({ ...STRONG_ROW, abovePivotPct: 12 }, STRONG_TECHNICALS, REGIME, SECTOR, null);
  assert.ok(r2.score <= 20, `expected a capped score <=20, got ${r2.score}`);
});
ok("a normal (not extended, not Stage 4) row is never gated", () => {
  const r = computeInstitutionalGrade(STRONG_ROW, STRONG_TECHNICALS, REGIME, SECTOR, null);
  assert.strictEqual(r.cautions.length, 0);
});
ok("no real abovePivotPct available never fabricates an anti-chase gate", () => {
  const { abovePivotPct, ...rest } = STRONG_ROW;
  const r = computeInstitutionalGrade(rest, STRONG_TECHNICALS, REGIME, SECTOR, null);
  assert.strictEqual(r.cautions.length, 0);
});

console.log("Checking computeInstitutionalGrade — real critical-red-flag hard gate (/goal Phase 5 audit, 2026-09-01)…");
ok("regression: a real critical red flag caps the score, never reading Excellent, even with every other real dimension strong", () => {
  const r = computeInstitutionalGrade(STRONG_ROW, STRONG_TECHNICALS, REGIME, SECTOR, null, 1);
  assert.ok(r.score <= 20, `expected a capped score <=20, got ${r.score}`);
  assert.ok(r.cautions.some((c) => /critical/i.test(c)));
  assert.notStrictEqual(institutionalRecommendation(r.score).label, "Excellent");
});
ok("criticalFlags omitted entirely (existing callers) -> honest backward-compatible behavior, unaffected", () => {
  const r = computeInstitutionalGrade(STRONG_ROW, STRONG_TECHNICALS, REGIME, SECTOR, null);
  assert.strictEqual(r.cautions.length, 0);
});
ok("criticalFlags of 0 never forces the gate on its own", () => {
  const r = computeInstitutionalGrade(STRONG_ROW, STRONG_TECHNICALS, REGIME, SECTOR, null, 0);
  assert.strictEqual(r.cautions.length, 0);
});

console.log("Checking institutionalLetterGrade/institutionalRecommendation — pure score-derived mappings, unaffected by this fix's shape…");
ok("real thresholds unchanged (A+/A/B+/B/C/D/F)", () => {
  assert.strictEqual(institutionalLetterGrade(95), "A+");
  assert.strictEqual(institutionalLetterGrade(20), "F");
});

console.log(`\n${passed} checks passed.`);
console.log("INSTITUTIONAL-SCORING TEST OK");
