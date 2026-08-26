// Real tests for src/lightbox-intelligence.js (Market Opportunity
// Intelligence Engine upgrade, 2026-08-26) — EV/Chase/Opportunity-Gap/
// WHY-NOT/Attention-Score, all composed from already-real, already-tested
// engines. Pure-function, synthetic-input, zero-network.
// Run: node test/lightbox-intelligence.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const {
  computeDayTradeEV, computeDayTradeChase, computeOpportunityGap, computeDayTradeRedFlags, computeAttentionScore,
} = require("../src/lightbox-intelligence");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking computeDayTradeEV — real EV, direction-aware…");
ok("a real BULLISH setup (target above entry, stop below) computes a real positive EV at a strong win rate", () => {
  const ev = computeDayTradeEV({ winRate: 70, entry: 100, stop: 98, target: 104, direction: "BULLISH" });
  assert.ok(ev > 0, `expected positive EV, got ${ev}`);
});
ok("the mirror-image real BEARISH setup (target below entry, stop above) at the same real win rate produces the SAME magnitude EV as its bullish mirror", () => {
  const bullish = computeDayTradeEV({ winRate: 70, entry: 100, stop: 98, target: 104, direction: "BULLISH" });
  const bearish = computeDayTradeEV({ winRate: 70, entry: 100, stop: 102, target: 96, direction: "BEARISH" });
  assert.strictEqual(bearish, bullish, "a symmetric bearish setup must produce the identical real EV magnitude, not an inverted-sign bug");
});
ok("honest null when winRate is unavailable (insufficient real data) — never fabricated", () => {
  assert.strictEqual(computeDayTradeEV({ winRate: null, entry: 100, stop: 98, target: 104, direction: "BULLISH" }), null);
});

console.log("Checking computeDayTradeChase — real direction-aware extension band…");
ok("BULLISH price well past real orHigh reads a real extended/chase band", () => {
  const r = computeDayTradeChase({ direction: "BULLISH", px: 110, orHigh: 100 });
  assert.ok(["EXTENDED", "DO_NOT_CHASE"].includes(r.band), `expected an extended band, got ${r.band}`);
});
ok("BULLISH price right at real orHigh reads NORMAL, not extended", () => {
  const r = computeDayTradeChase({ direction: "BULLISH", px: 100.5, orHigh: 100 });
  assert.strictEqual(r.band, "NORMAL");
});
ok("BEARISH price well past real orLow (real breakdown extension) reads a real extended/chase band", () => {
  const r = computeDayTradeChase({ direction: "BEARISH", px: 90, orLow: 100 });
  assert.ok(["EXTENDED", "DO_NOT_CHASE"].includes(r.band), `expected an extended band, got ${r.band}`);
});
ok("missing real orHigh/orLow -> honest null band, never fabricated", () => {
  assert.strictEqual(computeDayTradeChase({ direction: "BULLISH", px: 100, orHigh: null }).band, null);
});

console.log("Checking computeOpportunityGap — real current-vs-potential EV…");
ok("a real setup not yet at its best entry shows a real, non-zero opportunity gap", () => {
  const dt = { px: 98, bestEntry: 100, stop: 96, target: 106, direction: "BULLISH" };
  const gap = computeOpportunityGap({ winRate: 65, dt });
  assert.ok(gap && Number.isFinite(gap.gap), "expected a real computed gap object");
});
ok("honest null when winRate is unavailable", () => {
  assert.strictEqual(computeOpportunityGap({ winRate: null, dt: { px: 98, bestEntry: 100, stop: 96, target: 106, direction: "BULLISH" } }), null);
});

console.log("Checking computeDayTradeRedFlags — real WHY-NOT, generic + day-trade-specific…");
ok("a real unacceptable R:R trips the shared generic unacceptableRR flag", () => {
  const r = computeDayTradeRedFlags({ px: 100, stop: 99, rr: 0.8, direction: "BULLISH", rvol: 2, orBreakout: true, orHigh: 99 });
  assert.ok(r.flags.some((f) => f.key === "unacceptableRR"));
});
ok("real weak RVOL (<1.0x) trips the new day-trade-specific weakRvolIntraday flag", () => {
  const r = computeDayTradeRedFlags({ px: 100, stop: 98, rr: 2, direction: "BULLISH", rvol: 0.6, orBreakout: true, orHigh: 99 });
  assert.ok(r.flags.some((f) => f.key === "weakRvolIntraday"));
});
ok("real strong RVOL does NOT trip weakRvolIntraday", () => {
  const r = computeDayTradeRedFlags({ px: 100, stop: 98, rr: 2, direction: "BULLISH", rvol: 2.0, orBreakout: true, orHigh: 99 });
  assert.ok(!r.flags.some((f) => f.key === "weakRvolIntraday"));
});
ok("not yet above a real orHigh trips notAtOpeningRangeLevel for a BULLISH setup", () => {
  const r = computeDayTradeRedFlags({ px: 98, stop: 96, rr: 2, direction: "BULLISH", rvol: 2, orBreakout: false, orHigh: 100 });
  assert.ok(r.flags.some((f) => f.key === "notAtOpeningRangeLevel"));
});
ok("criticalCount reflects only real critical flags among what fired", () => {
  const r = computeDayTradeRedFlags({ px: 100, stop: 99, rr: 0.5, direction: "BULLISH", rvol: 2, orBreakout: true, orHigh: 99 });
  assert.ok(r.criticalCount >= 1, "unacceptableRR is a real critical flag");
});

console.log("Checking computeAttentionScore — real disclosed weighted ranking…");
ok("a confirmed, accelerating, non-extended setup scores higher than a plain baseline of the same quality", () => {
  const base = computeAttentionScore({ quality: 70, entryTriggerStatus: "NOT_READY", chaseBand: "NORMAL", edgeVelocityStatus: "STABLE", ev: null, highCorrelation: false });
  const better = computeAttentionScore({ quality: 70, entryTriggerStatus: "CONFIRMED", chaseBand: "NORMAL", edgeVelocityStatus: "ACCELERATING", ev: null, highCorrelation: false });
  assert.ok(better > base, `expected ${better} > ${base}`);
});
ok("a DO_NOT_CHASE band or high portfolio correlation real-penalizes the score", () => {
  const normal = computeAttentionScore({ quality: 70, entryTriggerStatus: "CONFIRMED", chaseBand: "NORMAL", edgeVelocityStatus: "STABLE", ev: null, highCorrelation: false });
  const chased = computeAttentionScore({ quality: 70, entryTriggerStatus: "CONFIRMED", chaseBand: "DO_NOT_CHASE", edgeVelocityStatus: "STABLE", ev: null, highCorrelation: false });
  const correlated = computeAttentionScore({ quality: 70, entryTriggerStatus: "CONFIRMED", chaseBand: "NORMAL", edgeVelocityStatus: "STABLE", ev: null, highCorrelation: true });
  assert.ok(chased < normal);
  assert.ok(correlated < normal);
});
ok("score always stays within the real 0-100 bounds even with stacked penalties", () => {
  const s = computeAttentionScore({ quality: 0, entryTriggerStatus: "INVALIDATED", chaseBand: "DO_NOT_CHASE", edgeVelocityStatus: "DECAYING", ev: -20, highCorrelation: true });
  assert.ok(s >= 0 && s <= 100, `expected 0-100, got ${s}`);
});
ok("a null EV (insufficient real data) is honestly skipped, not treated as zero-penalty or fabricated", () => {
  const withEv = computeAttentionScore({ quality: 70, entryTriggerStatus: "CONFIRMED", chaseBand: "NORMAL", edgeVelocityStatus: "STABLE", ev: 2, highCorrelation: false });
  const withoutEv = computeAttentionScore({ quality: 70, entryTriggerStatus: "CONFIRMED", chaseBand: "NORMAL", edgeVelocityStatus: "STABLE", ev: null, highCorrelation: false });
  assert.notStrictEqual(withEv, withoutEv, "a real positive EV should shift the score relative to no-EV-data");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("LIGHTBOX-INTELLIGENCE TEST FAILED"); else console.log("LIGHTBOX-INTELLIGENCE TEST OK");
