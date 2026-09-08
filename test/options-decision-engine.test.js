"use strict";
const assert = require("node:assert");
const {
  classifyIv, classifyLiquidity, classifyRiskReward, classifyExpiration, classifyEarningsExposure,
  computeEntryStatus, computeOptionExitPlan, buildSellToCloseInstructions, sizeOptionPosition,
} = require("../src/options-decision-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking classifyIv — real IV Rank bucketing, reused thresholds…");

ok("no real ivRank -> honest N/A, never a guessed bucket", () => {
  const r = classifyIv(null);
  assert.strictEqual(r.label, "N/A");
});
ok("ivRank 10 -> CHEAP", () => { assert.strictEqual(classifyIv(10).label, "CHEAP"); });
ok("ivRank 40 -> FAIR", () => { assert.strictEqual(classifyIv(40).label, "FAIR"); });
ok("ivRank 65 -> EXPENSIVE (matches trade-structure-selector.js's HIGH_IV_RANK=60 floor)", () => {
  assert.strictEqual(classifyIv(65).label, "EXPENSIVE");
});
ok("ivRank 85 -> EXTREME (matches red-flag-engine.js's maxIvRankForNaked=80 floor)", () => {
  assert.strictEqual(classifyIv(85).label, "EXTREME");
});

console.log("Checking classifyLiquidity — real 0-100 liquidityScore bucketing…");

ok("no real score -> honest N/A", () => { assert.strictEqual(classifyLiquidity(null).label, "N/A"); });
ok("score 20 -> POOR", () => { assert.strictEqual(classifyLiquidity(20).label, "POOR"); });
ok("score 55 -> OK (matches trade-structure-selector.js's MIN_LIQUIDITY=40 floor)", () => {
  assert.strictEqual(classifyLiquidity(55).label, "OK");
});
ok("score 85 -> GOOD", () => { assert.strictEqual(classifyLiquidity(85).label, "GOOD"); });

console.log("Checking classifyRiskReward — spec's own explicit color bands…");

ok("2.3 -> green STRONG", () => { const r = classifyRiskReward(2.3); assert.strictEqual(r.color, "green"); assert.strictEqual(r.band, "STRONG"); });
ok("1.7 -> amber ACCEPTABLE", () => { assert.strictEqual(classifyRiskReward(1.7).band, "ACCEPTABLE"); });
ok("1.2 -> orange MARGINAL", () => { assert.strictEqual(classifyRiskReward(1.2).band, "MARGINAL"); });
ok("0.82 -> red WEAK (spec's own TSLA example)", () => { const r = classifyRiskReward(0.82); assert.strictEqual(r.color, "red"); assert.strictEqual(r.band, "WEAK"); });
ok("null -> honest N/A, never a fabricated ratio", () => { assert.strictEqual(classifyRiskReward(null).label, "N/A"); });

console.log("Checking classifyExpiration — spec's own explicit 21/14/7 DTE tiers…");

ok("39 DTE -> NORMAL", () => { assert.strictEqual(classifyExpiration(39).tier, "NORMAL"); });
ok("18 DTE -> TIME_DECAY_INCREASING", () => { assert.strictEqual(classifyExpiration(18).tier, "TIME_DECAY_INCREASING"); });
ok("10 DTE -> EXIT_ROLL_REVIEW", () => { assert.strictEqual(classifyExpiration(10).tier, "EXIT_ROLL_REVIEW"); });
ok("3 DTE -> HIGH_GAMMA_THETA", () => { assert.strictEqual(classifyExpiration(3).tier, "HIGH_GAMMA_THETA"); });
ok("no real DTE -> honest UNKNOWN", () => { assert.strictEqual(classifyExpiration(null).tier, "UNKNOWN"); });

console.log("Checking classifyEarningsExposure — real DTE vs. real earnings date…");

ok("no real earnings date -> honestly not exposed", () => {
  const r = classifyEarningsExposure({ dte: 30, earningsDte: null });
  assert.strictEqual(r.exposed, false);
});
ok("real earnings BEFORE expiry -> exposed", () => {
  const r = classifyEarningsExposure({ dte: 30, earningsDte: 5 });
  assert.strictEqual(r.exposed, true);
  assert.strictEqual(r.daysToEarnings, 5);
});
ok("real earnings AFTER expiry -> not exposed on this specific contract", () => {
  const r = classifyEarningsExposure({ dte: 5, earningsDte: 30 });
  assert.strictEqual(r.exposed, false);
});

console.log("Checking computeEntryStatus — real multi-reason reducer, never a single fabricated cause…");

ok("every real check clears -> ENTER_NOW", () => {
  const r = computeEntryStatus({ quoteAgeMinutes: 1, spreadPct: 2, ivRank: 40, riskReward: 2.1, confirmed: true });
  assert.strictEqual(r.status, "ENTER_NOW");
});
ok("stale quote alone -> WAIT, never DO_NOT_ENTER", () => {
  const r = computeEntryStatus({ quoteAgeMinutes: 30, spreadPct: 2, ivRank: 40, riskReward: 2.1 });
  assert.strictEqual(r.status, "WAIT");
  assert.ok(r.reasons.some((x) => x.includes("stale")));
});
ok("extreme IV escalates to DO_NOT_ENTER even with a good R:R", () => {
  const r = computeEntryStatus({ quoteAgeMinutes: 1, spreadPct: 2, ivRank: 90, riskReward: 3.0 });
  assert.strictEqual(r.status, "DO_NOT_ENTER");
});
ok("weak R:R alone -> WAIT with the real named reason", () => {
  const r = computeEntryStatus({ quoteAgeMinutes: 1, spreadPct: 2, ivRank: 40, riskReward: 0.82 });
  assert.strictEqual(r.status, "WAIT");
  assert.ok(r.reasons.some((x) => x.includes("R:R too low")));
});
ok("multiple real reasons all surface, not just the first", () => {
  const r = computeEntryStatus({ quoteAgeMinutes: 30, spreadPct: 15, ivRank: 40, riskReward: 0.5 });
  assert.ok(r.reasons.length >= 3);
});

console.log("Checking computeOptionExitPlan — real combined take-profit/stop/time-exit, never a fixed 20% for every trade…");

ok("no real entry premium -> honest unavailable, never a fabricated plan", () => {
  const r = computeOptionExitPlan({ entryPremium: null });
  assert.strictEqual(r.available, false);
});
ok("normal IV/DTE uses the base 25%/50%/20% real thresholds", () => {
  const r = computeOptionExitPlan({ entryPremium: 20, ivRank: 40, dte: 40 });
  assert.strictEqual(r.takeProfit1, 25);
  assert.strictEqual(r.takeProfit2, 30);
  assert.strictEqual(r.optionStop, 16);
});
ok("elevated IV pulls targets in and widens the stop", () => {
  const r = computeOptionExitPlan({ entryPremium: 20, ivRank: 70, dte: 40 });
  assert.ok(r.takeProfit1Pct < 25);
  assert.ok(r.optionStopPct > 20);
});
ok("short DTE tightens the stop back down regardless of IV", () => {
  const r = computeOptionExitPlan({ entryPremium: 20, ivRank: 70, dte: 10 });
  assert.ok(r.optionStopPct <= 15);
});
ok("real underlying invalidation passes through untouched, never re-derived", () => {
  const r = computeOptionExitPlan({ entryPremium: 20, ivRank: 40, dte: 40, underlyingInvalidation: 365, underlyingSymbol: "TSLA" });
  assert.strictEqual(r.underlyingInvalidation, 365);
});

console.log("Checking buildSellToCloseInstructions — spec §9's own explicit 'never confuse with opening a short' requirement…");

ok("single-leg long option -> explicit SELL TO CLOSE, not a new short", () => {
  const steps = buildSellToCloseInstructions({ symbol: "TSLA", legs: [{ strike: 380, type: "put" }] });
  assert.ok(steps.some((s) => s.includes("SELL TO CLOSE") && s.includes("NOT a new short")));
});
ok("multi-leg spread -> closed as one combined order, not two", () => {
  const steps = buildSellToCloseInstructions({ symbol: "TSLA", legs: [{ strike: 380, type: "put" }, { strike: 370, type: "put" }] });
  assert.ok(steps.some((s) => s.includes("one order")));
});
ok("no real legs -> honest empty array, never fabricated steps", () => {
  assert.deepStrictEqual(buildSellToCloseInstructions({ symbol: "TSLA", legs: [] }), []);
});

console.log("Checking sizeOptionPosition — same real 0.5%/$500 policy as TradeGpsCard.jsx's previewPositionSize…");

ok("real equity/cash/maxLoss -> a real bounded contract count", () => {
  const n = sizeOptionPosition({ equity: 100000, cash: 100000, maxLossPerContract: 2815 });
  // 0.5% of 100,000 = $500 risk budget; $500 / $2815 -> 0 contracts (real, honest, not rounded up)
  assert.strictEqual(n, 0);
});
ok("a cheaper real contract allows more than zero contracts", () => {
  const n = sizeOptionPosition({ equity: 100000, cash: 100000, maxLossPerContract: 100 });
  assert.strictEqual(n, 5); // $500 / $100
});
ok("missing real inputs -> honest null, never a guessed size", () => {
  assert.strictEqual(sizeOptionPosition({ equity: null, cash: 100000, maxLossPerContract: 100 }), null);
});

console.log(`${passed} checks passed.`);
console.log("OPTIONS-DECISION-ENGINE TEST OK");
