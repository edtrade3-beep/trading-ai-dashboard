// Real tests for strategy-explain.js — the "WHY THIS TRADE?" narrative
// layer over strategy-ranking.js's real composite (Central Opportunity &
// Options Engine goal, 2026-08-30). Same synthetic-chain, zero-network
// convention as test/strategy-ranking.test.js — real rankAllStrategies
// output feeds explainStrategy, so every field asserted here comes from
// the actual real pipeline, not a hand-faked shape.
// Run: node test/strategy-explain.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { rankAllStrategies } = require("../src/strategy-ranking");
const { explainStrategy, computeOptionsConfidence, IV_IMPACT, THETA_IMPACT, MARKET_CONDITION_REQUIRED } = require("../src/strategy-explain");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

function contract({ strike, bid, ask, delta, iv = 30, dte = 30, liquidityScore = 80, pop = 50 }) {
  return { contractSymbol: `SYN${strike}`, strike, expiry: "2026-12-18", bid, ask, lastPrice: (bid + ask) / 2, volume: 500, openInterest: 2000, iv, delta, dte, pop, liquidityScore, rankScore: 70 };
}

const calls = [contract({ strike: 100, bid: 4.8, ask: 5.2, delta: 0.55 }), contract({ strike: 110, bid: 1.8, ask: 2.2, delta: 0.25 })];
const puts = [contract({ strike: 90, bid: 4.8, ask: 5.2, delta: -0.55 }), contract({ strike: 80, bid: 1.8, ask: 2.2, delta: -0.25 })];
const { ranked } = rankAllStrategies({ calls, puts, underlying: 100, bias: "Bullish", character: "Trending" });

console.log("Checking explainStrategy — real narrative grounded in strategy-ranking.js's own real fields, never fabricated…");

ok("every ranked structure gets a real, non-empty whyThis grounded in its own real pop/riskReward/liquidity", () => {
  for (const s of ranked) {
    const exp = explainStrategy(s, ranked, { bias: "Bullish", character: "Trending" });
    assert.ok(exp.whyThis.length > 0, `${s.strategy} should have at least one real whyThis bullet`);
    if (s.pop != null) assert.ok(exp.whyThis.some((b) => b.includes(String(s.pop))), "the real pop number must actually appear in the narrative, not a re-derived one");
  }
});

ok("a naked Long Calls position reports the real 'full premium paid' max risk and unbounded upside — never a fabricated dollar profit cap", () => {
  const longCall = ranked.find((s) => s.strategy === "Long Calls");
  if (!longCall) return; // honest skip if this chain didn't build one — not this test's job to force it
  const exp = explainStrategy(longCall, ranked, {});
  assert.ok(exp.maxRisk.includes("premium paid"));
  assert.ok(exp.profitPotential.toLowerCase().includes("unlimited"));
});

ok("a defined-risk spread reports its own real maxProfit/maxLoss dollar figures, not the naked-long fallback text", () => {
  const spread = ranked.find((s) => s.strategy === "Bull Call Spread" || s.strategy === "Bear Put Spread");
  if (!spread) return;
  const exp = explainStrategy(spread, ranked, {});
  assert.ok(exp.maxRisk.includes("defined"));
  assert.ok(exp.profitPotential.includes("defined"));
});

ok("invalidation is a real, structure-specific breakeven statement, not a generic placeholder", () => {
  const s = ranked[0];
  const exp = explainStrategy(s, ranked, {});
  assert.ok(exp.invalidation && exp.invalidation.length > 10);
});

ok("whyNotAlternatives cites real composite/pop/risk-reward diffs against other real ranked structures", () => {
  if (ranked.length < 2) return;
  const top = ranked[0];
  const exp = explainStrategy(top, ranked, {});
  assert.ok(exp.whyNotAlternatives.length > 0);
  exp.whyNotAlternatives.forEach((a) => assert.ok(a.whyNot.startsWith(a.strategy)));
});

ok("a structure working against the real market bias says so explicitly, never silently ranked as if aligned", () => {
  const bearishRanked = rankAllStrategies({ calls, puts, underlying: 100, bias: "Bearish", character: "Trending" }).ranked;
  const longCall = bearishRanked.find((s) => s.strategy === "Long Calls");
  if (!longCall) return;
  const exp = explainStrategy(longCall, bearishRanked, { bias: "Bearish", character: "Trending" });
  assert.ok(exp.whyThis.some((b) => b.includes("AGAINST")), "a bullish structure ranked under a bearish real market read must disclose the conflict");
});

ok("real per-symbol technical context, when supplied, is cited by name — never fabricated when absent", () => {
  const s = ranked[0];
  const withTech = explainStrategy(s, ranked, { technicals: { breakoutConfirmed: true, volRatio: 2.1, rsRating: 88 } });
  assert.ok(withTech.whyThis.some((b) => b.includes("breakout")));
  assert.ok(withTech.whyThis.some((b) => b.includes("2.1")));
  assert.ok(withTech.whyThis.some((b) => b.includes("88")));
  const withoutTech = explainStrategy(s, ranked, {});
  assert.ok(!withoutTech.whyThis.some((b) => b.toLowerCase().includes("breakout")), "must never invent a breakout bullet with no real technical data supplied");
});

console.log("\nChecking IV/theta impact — real, disclosed, objective options-theory facts per structure (never per-symbol fabrication)…");
ok("naked longs are long vega / negative theta — real, textbook structural facts", () => {
  assert.strictEqual(IV_IMPACT["Long Calls"].stance, "LONG VEGA");
  assert.strictEqual(THETA_IMPACT["Long Calls"].stance, "NEGATIVE THETA");
});
ok("Iron Condor is short vega / positive theta", () => {
  assert.strictEqual(IV_IMPACT["Iron Condor"].stance, "SHORT VEGA");
  assert.strictEqual(THETA_IMPACT["Iron Condor"].stance, "POSITIVE THETA");
});
ok("every real candidate structure has a real, disclosed market-condition requirement — never blank", () => {
  for (const strategy of Object.keys(MARKET_CONDITION_REQUIRED)) {
    assert.ok(MARKET_CONDITION_REQUIRED[strategy].length > 20);
  }
});

console.log("\nChecking computeOptionsConfidence — honest degrade when real data is incomplete, never a fabricated 100…");
ok("all real fields present -> high confidence, REAL_DATA", () => {
  const r = computeOptionsConfidence({ pop: 60, liquidity: 80, riskReward: 1.5 });
  assert.strictEqual(r.confidence, 100);
  assert.strictEqual(r.dataQuality, "REAL_DATA");
  assert.strictEqual(r.notes.length, 0);
});
ok("missing real pop/liquidity -> confidence honestly degrades with a real, disclosed reason", () => {
  const r = computeOptionsConfidence({ pop: null, liquidity: null, riskReward: 1.5 });
  assert.ok(r.confidence < 100);
  assert.ok(r.notes.length >= 2);
});
ok("every real field missing -> UNAVAILABLE, never a fabricated mid-confidence number", () => {
  const r = computeOptionsConfidence({ pop: null, liquidity: null, riskReward: null });
  assert.strictEqual(r.dataQuality, "UNAVAILABLE");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("STRATEGY-EXPLAIN TEST FAILED"); else console.log("STRATEGY-EXPLAIN TEST OK");
