"use strict";
const assert = require("node:assert");
const {
  DEFAULT_MISPRICING_WEIGHTS, computeFundamentalDivergence, classifyValueTrapRisk, computeMispricingScore,
  answerWhy, answerWhyMarketWrong, answerWhatChanges, answerWhen, answerWhatInvalidates, computeHiddenGemProfile,
} = require("../src/mispricing-engine");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

function q(overrides) {
  return { date: "2026-01-01", revenueGrowth: 0.08, epsGrowth: 0.05, grossMargin: 0.4, operatingMargin: 0.14, netDebtToEbitda: 2.0, fcfYield: 0.02, ...overrides };
}

console.log("Checking computeFundamentalDivergence — real multi-quarter trend comparison…");

ok("fewer than 2 real quarters -> honest 'not enough history', never fabricated", () => {
  const r = computeFundamentalDivergence({ quarters: [q()] });
  assert.strictEqual(r.detected, false);
});

ok("the spec's own worked example — revenue/margin/EPS accelerating, debt declining, price flat -> DETECTED", () => {
  const quarters = [
    q({ date: "2026-01-01", revenueGrowth: 0.08, operatingMargin: 0.14, epsGrowth: 0.04, netDebtToEbitda: 3.5 }),
    q({ date: "2026-04-01", revenueGrowth: 0.11, operatingMargin: 0.15, epsGrowth: 0.06, netDebtToEbitda: 3.0 }),
    q({ date: "2026-07-01", revenueGrowth: 0.15, operatingMargin: 0.17, epsGrowth: 0.09, netDebtToEbitda: 2.5 }),
    q({ date: "2026-10-01", revenueGrowth: 0.19, operatingMargin: 0.19, epsGrowth: 0.12, netDebtToEbitda: 1.8 }),
  ];
  const r = computeFundamentalDivergence({ quarters, priceChangePct: 2.1 });
  assert.strictEqual(r.detected, true);
  assert.ok(r.evidence.some((e) => e.includes("Revenue growth")));
  assert.ok(r.evidence.some((e) => e.includes("accelerating") || e.includes("expanding") || e.includes("declining")));
});

ok("fundamentals improving but the real price ALREADY moved a lot -> not flagged as a fresh divergence", () => {
  const quarters = [q({ revenueGrowth: 0.05 }), q({ revenueGrowth: 0.20 })];
  const r = computeFundamentalDivergence({ quarters, priceChangePct: 45 });
  assert.strictEqual(r.detected, false);
});

ok("fundamentals genuinely deteriorating -> never fabricated as a divergence", () => {
  const quarters = [
    q({ revenueGrowth: 0.15, operatingMargin: 0.20, epsGrowth: 0.12, netDebtToEbitda: 1.5 }),
    q({ revenueGrowth: 0.05, operatingMargin: 0.14, epsGrowth: 0.02, netDebtToEbitda: 2.8 }),
  ];
  const r = computeFundamentalDivergence({ quarters, priceChangePct: 1 });
  assert.strictEqual(r.detected, false);
});

ok("real per-metric noise below the disclosed threshold never counts as 'improving'", () => {
  const quarters = [q({ revenueGrowth: 0.10 }), q({ revenueGrowth: 0.101 })]; // 0.1pp move, real noise
  const r = computeFundamentalDivergence({ quarters });
  assert.strictEqual(r.metrics.revenueGrowth.improving, false);
});

console.log("\nChecking classifyValueTrapRisk — the explicit 'cheap can be a value trap' guard…");

ok("a cheap valuation with real majority-deteriorating fundamentals -> flagged as a value trap, not a gem", () => {
  const quarters = [
    q({ revenueGrowth: 0.15, operatingMargin: 0.20, netDebtToEbitda: 1.5 }),
    q({ revenueGrowth: 0.02, operatingMargin: 0.12, netDebtToEbitda: 3.5 }),
  ];
  const divergence = computeFundamentalDivergence({ quarters, priceChangePct: 0 });
  const r = classifyValueTrapRisk({ valueScore: 85, divergence });
  assert.strictEqual(r.atRisk, true);
});

ok("a cheap valuation with real IMPROVING fundamentals is never flagged as a value trap", () => {
  const quarters = [
    q({ revenueGrowth: 0.05, operatingMargin: 0.12, netDebtToEbitda: 3.5 }),
    q({ revenueGrowth: 0.18, operatingMargin: 0.19, netDebtToEbitda: 1.8 }),
  ];
  const divergence = computeFundamentalDivergence({ quarters, priceChangePct: 0 });
  const r = classifyValueTrapRisk({ valueScore: 85, divergence });
  assert.strictEqual(r.atRisk, false);
});

ok("a genuinely expensive stock is never flagged as a value trap (that check only applies to real 'cheap' screens)", () => {
  const r = classifyValueTrapRisk({ valueScore: 20, divergence: { totalReal: 3, improvingCount: 0 } });
  assert.strictEqual(r.atRisk, false);
});

console.log("\nChecking computeMispricingScore — real, CONFIGURABLE weights, honest partial-data…");

ok("zero real components -> honest null score", () => {
  const r = computeMispricingScore({});
  assert.strictEqual(r.score, null);
});

ok("every unavailable component is disclosed, never defaulted to a fabricated value", () => {
  const r = computeMispricingScore({ valueScore: 80 });
  assert.ok(Number.isFinite(r.score));
  assert.ok(r.unavailable.includes("institutionalBehavior"));
  assert.ok(r.unavailable.includes("catalystQuality"));
});

ok("weights are genuinely configurable, not hard-coded — a caller-supplied weight set changes the real result", () => {
  const inputs = { valueScore: 90, roic: 5 }; // low ROIC (5% -> 20/100), high valuation (90/100)
  const defaultResult = computeMispricingScore(inputs);
  const valuationHeavy = computeMispricingScore(inputs, { ...DEFAULT_MISPRICING_WEIGHTS, valuation: 0.9, roic: 0.1 });
  assert.notStrictEqual(defaultResult.score, valuationHeavy.score);
  assert.ok(valuationHeavy.score > defaultResult.score, "weighting valuation more heavily against a high valuation score must raise the real result");
});

ok("real ROIC is rescaled honestly (25% ROIC -> ~100), not a raw pass-through", () => {
  const r = computeMispricingScore({ roic: 25 }, { ...DEFAULT_MISPRICING_WEIGHTS });
  assert.strictEqual(r.components.roic, 100);
});

console.log("\nChecking the 5-question narrative — real, deterministic, never a generic 'low P/E' claim…");

ok("answerWhy never returns a generic 'low P/E' explanation — always a real, specific rule match", () => {
  const label = answerWhy({ divergence: { metrics: {} } });
  assert.ok(!/low p\/e/i.test(label));
});
ok("answerWhy cites real margin recovery when that's the strongest real signal", () => {
  const label = answerWhy({ divergence: { metrics: { margin: { improving: true }, revenueGrowth: { improving: false } } } });
  assert.ok(/margin/i.test(label));
});

ok("answerWhyMarketWrong cites real quarterly evidence, not an invented narrative", () => {
  const divergence = { metrics: { revenueGrowth: { improving: true } }, evidence: ["Revenue growth: 8% → 19% (accelerating)"] };
  const r = answerWhyMarketWrong({ divergence });
  assert.ok(r.evidence.includes("Revenue growth"));
});

ok("answerWhatChanges is honestly null when no real catalyst data exists", () => {
  const r = answerWhatChanges({});
  assert.strictEqual(r.catalystQuality, null);
});

ok("answerWhen requires REAL entry timing alongside quality — mandatory spec requirement, never undervalued alone", () => {
  const excellentButBadTiming = answerWhen({ mispricingScore: 90, entryTimingScore: 20 });
  assert.strictEqual(excellentButBadTiming.verdict, "EXCELLENT_COMPANY_WAIT");
  const excellentAndGoodTiming = answerWhen({ mispricingScore: 90, entryTimingScore: 80 });
  assert.strictEqual(excellentAndGoodTiming.verdict, "ACCUMULATE_NOW");
});
ok("answerWhen: a real weak mispricing score is honestly 'not a gem', regardless of timing", () => {
  assert.strictEqual(answerWhen({ mispricingScore: 30, entryTimingScore: 90 }).verdict, "NOT_A_GEM");
});
ok("answerWhen: no real mispricing score at all -> honest insufficient-data, never guessed", () => {
  assert.strictEqual(answerWhen({}).verdict, "INSUFFICIENT_DATA");
});
ok("answerWhen: a real confirmed value-trap risk is a hard gate — never ACCUMULATE_NOW regardless of how high the score still reads (regression: found live via this session's own adversarial audit, Scenario 10)", () => {
  const r = answerWhen({ mispricingScore: 90, entryTimingScore: 90, valueTrapRisk: { atRisk: true, reason: "real deteriorating fundamentals" } });
  assert.strictEqual(r.verdict, "VALUE_TRAP_AVOID");
});
ok("answerWhen: no real value-trap risk present -> the score/timing gates behave exactly as before (no regression)", () => {
  const r = answerWhen({ mispricingScore: 90, entryTimingScore: 90, valueTrapRisk: { atRisk: false } });
  assert.strictEqual(r.verdict, "ACCUMULATE_NOW");
});

ok("answerWhatInvalidates always includes real technical and time-based invalidation, even with no fundamental risk", () => {
  const items = answerWhatInvalidates({ divergence: { metrics: {} }, valueTrapRisk: { atRisk: false } });
  assert.ok(items.some((i) => i.startsWith("Technical:")));
  assert.ok(items.some((i) => i.startsWith("Time-based:")));
});
ok("answerWhatInvalidates surfaces the real value-trap warning when present", () => {
  const items = answerWhatInvalidates({ divergence: { metrics: {} }, valueTrapRisk: { atRisk: true, reason: "real deteriorating FCF" } });
  assert.ok(items.some((i) => i.startsWith("Fundamental:") && i.includes("real deteriorating FCF")));
});

console.log("\nChecking computeHiddenGemProfile — the one combined real read a route/UI consumes…");

ok("composes every sub-function from one real input object without crashing on empty input", () => {
  const profile = computeHiddenGemProfile({});
  assert.strictEqual(profile.divergence.detected, false);
  assert.strictEqual(profile.mispricing.score, null);
  assert.strictEqual(profile.when.verdict, "INSUFFICIENT_DATA");
  assert.ok(Array.isArray(profile.whatInvalidates) && profile.whatInvalidates.length > 0);
});
ok("a real strong, well-timed hidden-gem case resolves to ACCUMULATE_NOW end to end", () => {
  const quarters = [
    q({ date: "2026-01-01", revenueGrowth: 0.06, operatingMargin: 0.13, epsGrowth: 0.03, netDebtToEbitda: 3.2, fcfYield: 0.02 }),
    q({ date: "2026-10-01", revenueGrowth: 0.19, operatingMargin: 0.19, epsGrowth: 0.14, netDebtToEbitda: 1.6, fcfYield: 0.06 }),
  ];
  const profile = computeHiddenGemProfile({
    quarters, priceChangePct: 3, valueScore: 82, financialStrength: 78, roic: 18,
    catalystScore: 75, institutionScore: 70, relativeStrengthTiming: 85,
  });
  assert.strictEqual(profile.divergence.detected, true);
  assert.ok(profile.mispricing.score >= 55);
  assert.strictEqual(profile.when.verdict, "ACCUMULATE_NOW");
  assert.strictEqual(profile.valueTrapRisk.atRisk, false);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("MISPRICING-ENGINE TEST FAILED");
else console.log("MISPRICING-ENGINE TEST OK");
