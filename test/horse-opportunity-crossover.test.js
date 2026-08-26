// Real tests for src/horse-opportunity-crossover.js (Horse Hunter upgrade,
// 2026-08-26) — the "⭐ BEST OF BOTH WORLDS" real join between Future
// Wallet's Horse scores and Light Box's live attentionScore. Pure-function,
// synthetic-input, zero-network.
// Run: node test/horse-opportunity-crossover.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { computeCrossover, DEFAULT_THRESHOLDS } = require("../src/horse-opportunity-crossover");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking computeCrossover — real join over two already-real datasets…");

ok("a symbol clearing BOTH real thresholds on both sides appears in the crossover", () => {
  const horse = [{ symbol: "XYZ", future_wealth_score: 80, stageLabel: "INFLECTION" }];
  const lightbox = [{ symbol: "XYZ", attentionScore: 85, lifecycle: "ACTIONABLE", ev: 1.2 }];
  const r = computeCrossover(horse, lightbox);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].symbol, "XYZ");
  assert.strictEqual(r[0].horseScore, 80);
  assert.strictEqual(r[0].attentionScore, 85);
  assert.strictEqual(r[0].horseStage, "INFLECTION");
});

ok("a symbol strong on ONLY the Horse side is honestly excluded, never force-included", () => {
  const horse = [{ symbol: "ABC", future_wealth_score: 90 }];
  const lightbox = [{ symbol: "ABC", attentionScore: 20 }];
  assert.strictEqual(computeCrossover(horse, lightbox).length, 0);
});

ok("a symbol strong on ONLY the Light Box side is honestly excluded", () => {
  const horse = [{ symbol: "DEF", future_wealth_score: 20 }];
  const lightbox = [{ symbol: "DEF", attentionScore: 95 }];
  assert.strictEqual(computeCrossover(horse, lightbox).length, 0);
});

ok("a symbol present on only one side never appears (no fabricated join)", () => {
  const horse = [{ symbol: "SOLO", future_wealth_score: 90 }];
  assert.strictEqual(computeCrossover(horse, []).length, 0);
});

ok("null/missing real scores on either side are honestly excluded, not treated as zero", () => {
  const horse = [{ symbol: "GHI", future_wealth_score: null }];
  const lightbox = [{ symbol: "GHI", attentionScore: 90 }];
  assert.strictEqual(computeCrossover(horse, lightbox).length, 0);
});

ok("results are sorted by combined real score, strongest first", () => {
  const horse = [{ symbol: "A", future_wealth_score: 70 }, { symbol: "B", future_wealth_score: 95 }];
  const lightbox = [{ symbol: "A", attentionScore: 75 }, { symbol: "B", attentionScore: 90 }];
  const r = computeCrossover(horse, lightbox);
  assert.strictEqual(r[0].symbol, "B");
  assert.strictEqual(r[1].symbol, "A");
});

ok("custom real thresholds are honored over the defaults", () => {
  const horse = [{ symbol: "X", future_wealth_score: 50 }];
  const lightbox = [{ symbol: "X", attentionScore: 50 }];
  assert.strictEqual(computeCrossover(horse, lightbox, DEFAULT_THRESHOLDS).length, 0);
  assert.strictEqual(computeCrossover(horse, lightbox, { horseScore: 40, attentionScore: 40 }).length, 1);
});

console.log(`\n${passed} checks passed.`);
console.log("HORSE-OPPORTUNITY-CROSSOVER TEST OK");
