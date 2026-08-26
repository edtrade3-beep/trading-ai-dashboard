// Real tests for opportunity-engine.js (Market Opportunity Engine Phase 1,
// 2026-08-25) — synthetic-input, zero-network, same discipline as
// test/am-core-engine.test.js / test/entry-engine.test.js. Run:
// node test/opportunity-engine.test.js (or npm test).
const assert = require("node:assert");
const { computeOpportunity, computeExpectedValue, classifyOpportunityTier, checkOptionsConfirmsStructure, buildMarketFingerprint, computeCounterfactualEv } = require("../src/opportunity-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const REGIME = { score: 85, label: "GREEN" };

function baseRow(overrides = {}) {
  return {
    symbol: "TEST", price: 102, pivot: 100, entry: 100, stop: 92, target2: 124,
    stage: "Stage 2 - Advancing", passCount: 7, rsRating: 92, momentum: 0.3, volRatio: 1.8,
    abovePivotPct: 2, contractionLow: 88, higherLows: true, tightening: true,
    vcpVerdict: "VALID VCP", vcpScore: 88, technicals: { vwap20: 95 },
    breakoutConfirmed: true, extended: false, riskPct: 5, dollarVolume: 400_000_000,
    epsGrowth: 20, pctFromHigh: -3, smc: { bos: { type: "BULL_BOS" } },
    ...overrides,
  };
}

console.log("Checking computeExpectedValue — real P x EV - costs formula, honest null on insufficient sample…");
ok("null winRate -> null EV, never a fabricated 50/50 guess", () => {
  assert.strictEqual(computeExpectedValue({ winRate: null, entry: 100, stop: 92, target: 116 }), null);
});
ok("a real positive-edge setup produces a positive EV net of disclosed costs", () => {
  const ev = computeExpectedValue({ winRate: 65, entry: 100, stop: 92, target: 116 });
  assert.ok(ev > 0, `expected a positive EV, got ${ev}`);
});
ok("EV subtracts the real spread when supplied, on top of the flat disclosed slippage assumption", () => {
  const noSpread = computeExpectedValue({ winRate: 65, entry: 100, stop: 92, target: 116 });
  const withSpread = computeExpectedValue({ winRate: 65, entry: 100, stop: 92, target: 116, spreadPct: 2 });
  assert.ok(withSpread < noSpread, "a real spread cost must lower EV, never be silently ignored");
});
ok("missing entry/stop/target -> honest null, not a partial/garbage number", () => {
  assert.strictEqual(computeExpectedValue({ winRate: 65, entry: null, stop: 92, target: 116 }), null);
});

console.log("\nChecking classifyOpportunityTier — the spec's 5-tier vocabulary, mapped from real existing states…");
ok("BUY/EARLY_BUY + a real confirmed-entry stage -> ACTIONABLE", () => {
  assert.strictEqual(classifyOpportunityTier({ verdict: "BUY", entryStage: "BREAKOUT", antiChaseBand: "NORMAL" }), "ACTIONABLE");
  assert.strictEqual(classifyOpportunityTier({ verdict: "EARLY_BUY", entryStage: "RETEST", antiChaseBand: "NORMAL" }), "ACTIONABLE");
});
ok("WATCH -> DEVELOPING", () => {
  assert.strictEqual(classifyOpportunityTier({ verdict: "WATCH", entryStage: "EARLY", antiChaseBand: "NORMAL" }), "DEVELOPING");
});
ok("WAIT -> WAIT", () => {
  assert.strictEqual(classifyOpportunityTier({ verdict: "WAIT", entryStage: "FOUNDATION", antiChaseBand: "NORMAL" }), "WAIT");
});
ok("a chase-blocked band (EXTENDED/DO_NOT_CHASE) always reads EXTENDED, even when the verdict itself lands on WATCH (not AVOID_LONG)", () => {
  assert.strictEqual(classifyOpportunityTier({ verdict: "WATCH", entryStage: "BREAKOUT", antiChaseBand: "EXTENDED" }), "EXTENDED");
  assert.strictEqual(classifyOpportunityTier({ verdict: "AVOID_LONG", entryStage: "BREAKOUT", antiChaseBand: "DO_NOT_CHASE", structurallyInvalid: true }), "EXTENDED");
});
ok("AVOID_LONG with a real structural cause (broken structure/critical flag/bearish trend) -> INVALIDATED", () => {
  assert.strictEqual(classifyOpportunityTier({ verdict: "AVOID_LONG", entryStage: "STRUCTURE_BROKEN", antiChaseBand: "NORMAL", structurallyInvalid: true }), "INVALIDATED");
});
ok("AVOID_LONG purely from the entry-score floor (structure otherwise intact) -> WAIT, not INVALIDATED — a real gap found against live data (93% of the scan universe was mislabeled dead before this split)", () => {
  assert.strictEqual(classifyOpportunityTier({ verdict: "AVOID_LONG", entryStage: "NONE", antiChaseBand: "NORMAL", structurallyInvalid: false }), "WAIT");
});

console.log("\nChecking checkOptionsConfirmsStructure — the spec's explicit non-negotiable, options never auto-read bullish…");
ok("no real options data -> honest NO_DATA, not a guessed direction", () => {
  const r = checkOptionsConfirmsStructure({ optionsFlow: null, verdict: "BUY" });
  assert.strictEqual(r.status, "NO_DATA");
});
ok("bullish options flow + a real bullish verdict -> CONFIRMS", () => {
  const r = checkOptionsConfirmsStructure({ optionsFlow: { callNotional: 800_000, putNotional: 200_000 }, verdict: "BUY" });
  assert.strictEqual(r.status, "CONFIRMS");
});
ok("bullish options flow + a real AVOID_LONG verdict -> CONTRADICTS, not a blind bullish tag", () => {
  const r = checkOptionsConfirmsStructure({ optionsFlow: { callNotional: 900_000, putNotional: 100_000 }, verdict: "AVOID_LONG" });
  assert.strictEqual(r.status, "CONTRADICTS");
  assert.match(r.note, /AVOID_LONG/);
});
ok("bearish options flow + a real bullish verdict -> CONTRADICTS", () => {
  const r = checkOptionsConfirmsStructure({ optionsFlow: { callNotional: 100_000, putNotional: 900_000 }, verdict: "WATCH" });
  assert.strictEqual(r.status, "CONTRADICTS");
});
ok("near-balanced flow -> NEUTRAL, not forced either direction", () => {
  const r = checkOptionsConfirmsStructure({ optionsFlow: { callNotional: 510_000, putNotional: 490_000 }, verdict: "BUY" });
  assert.strictEqual(r.status, "NEUTRAL");
});

console.log("\nChecking computeOpportunity — the one standardized Opportunity Object, wraps the real pipeline end-to-end…");
ok("a genuinely strong, confirmed-breakout row produces an ACTIONABLE tier with a real BUY-family verdict", () => {
  const o = computeOpportunity({ symbol: "TEST", row: baseRow(), regime: REGIME, marketRegime: "RISK_ON" });
  assert.ok(o, "expected a real Opportunity Object, got null");
  assert.ok(["EARLY_BUY", "BUY"].includes(o.verdict), `expected a BUY-family verdict, got ${o.verdict}`);
  assert.strictEqual(o.tier, "ACTIONABLE");
  assert.ok(o.score > 0);
  assert.ok(Array.isArray(o.reasons) && o.reasons.length > 0, "real reasons[] must be surfaced, not dropped");
});
ok("no trackReport supplied -> honest null probability and null EV, never a fabricated number", () => {
  const o = computeOpportunity({ symbol: "TEST", row: baseRow(), regime: REGIME, marketRegime: "RISK_ON" });
  assert.strictEqual(o.probability, null);
  assert.strictEqual(o.expectedValue, null);
});
ok("a real critical red flag (e.g. bearish daily trend via Stage 4) forces AVOID_LONG -> INVALIDATED tier, regardless of a high raw score", () => {
  const row = baseRow({ stage: "Stage 4 - Declining", passCount: 2, breakoutConfirmed: false, higherLows: false });
  const o = computeOpportunity({ symbol: "TEST", row, regime: REGIME, marketRegime: "RISK_ON" });
  assert.strictEqual(o.verdict, "AVOID_LONG");
  assert.strictEqual(o.tier, "INVALIDATED");
});
ok("an extended (chase-blocked) but otherwise real setup lands in the EXTENDED tier, not silently merged into INVALIDATED", () => {
  const row = baseRow({ abovePivotPct: 6 }); // > cautionMax(5), <= extendedMax(8) -> EXTENDED band
  const o = computeOpportunity({ symbol: "TEST", row, regime: REGIME, marketRegime: "RISK_ON" });
  assert.strictEqual(o.tier, "EXTENDED");
});
ok("optionsFlow contradicting a real bullish verdict is surfaced as CONTRADICTS on the Opportunity Object, not silently dropped", () => {
  const o = computeOpportunity({
    symbol: "TEST", row: baseRow(), regime: REGIME, marketRegime: "RISK_ON",
    optionsFlow: { callNotional: 50_000, putNotional: 950_000 },
  });
  assert.strictEqual(o.options.status, "CONTRADICTS");
});
ok("regression (live prod bug, 2026-08-25, AMD): EV uses row.entry (the pivot-relative reference stop/target1 are actually computed from), never entryPlan.entryPrice's EARLY-stage current-price value — stop must never land above entry", () => {
  // Real shape confirmed live: price well below the pivot (pre-breakout,
  // EARLY stage), row.entry = the pivot (561.47), row.stop below it
  // (516.55) — entry-engine.js's EARLY branch sets entryPlan.entryPrice =
  // the CURRENT price (ev.price, ~475), which is BELOW row.stop. Using
  // that as the EV entry basis previously put "stop" above "entry" and
  // produced a nonsensical positive EV even at a 33% win rate.
  const row = baseRow({
    price: 475.7, entry: 561.47, pivot: 561.47, stop: 516.55, target2: 651.31,
    abovePivotPct: -14.9, breakoutConfirmed: false, extended: false, passCount: 6,
  });
  // Bucket key updated 2026-08-26 (real am-core-engine.js bug fix, "unify
  // the swing/entry-decision verdict"): computeCoreScore's entryQuality
  // sub-score used to silently default this row's real "not yet broken
  // out, no chase risk" antiChase band to the generic 2.25 fallback (a
  // band-name mismatch bug — see am-core-engine.js), landing this row's
  // real score at ~79. The fix correctly credits NOT_YET_BROKEN_OUT as
  // real evidence of a clean, non-extended setup, moving the accurate
  // score to 82 — bucket "80-100", not "60-79". Same real winRate/count,
  // just the honest bucket for this row's now-correct score.
  const trackReport = { horizons: { d20: { buckets: { "80-100": { winRate: 33, count: 27 } } } } };
  const o = computeOpportunity({ symbol: "AMD", row, regime: REGIME, marketRegime: "RISK_ON", trackReport });
  assert.ok(o, "expected a real Opportunity Object");
  assert.strictEqual(o.entry, 561.47, "entry must be the real pivot-relative reference (row.entry), not the current price");
  assert.ok(o.stop < o.entry, `stop must be below entry for a long setup, got stop=${o.stop} entry=${o.entry}`);
  assert.ok(o.expectedValue < 0, `a 33% win rate against a ~1R:1R symmetric target must be a NEGATIVE EV, got ${o.expectedValue}`);
});
console.log("\nChecking buildMarketFingerprint — pure bundling of already-real fields, honest null when absent…");
ok("real inputs produce a real, populated fingerprint across all 10 dimensions", () => {
  const fp = buildMarketFingerprint({
    regime: { label: "GREEN" }, sectorInfo: { rank: 1, of: 11 }, entryStage: "BREAKOUT",
    row: { rsRating: 92, volRatio: 1.8, dollarVolume: 400_000_000, price: 102, epsGrowth: 20 },
    vwap20: 95, riskPct: 5, optionsStatus: "CONFIRMS", entryScore: 80,
  });
  assert.strictEqual(fp.regime, "GREEN");
  assert.deepStrictEqual(fp.sector, { rank: 1, of: 11 });
  assert.strictEqual(fp.structure, "BREAKOUT");
  assert.strictEqual(fp.relativeStrength, 92);
  assert.strictEqual(fp.volume, 1.8);
  assert.strictEqual(fp.liquidity, 400_000_000);
  assert.deepStrictEqual(fp.vwap, { level: 95, above: true });
  assert.strictEqual(fp.volatility, 5);
  assert.strictEqual(fp.options, "CONFIRMS");
  assert.deepStrictEqual(fp.catalyst, { epsGrowthPct: 20 });
  assert.strictEqual(fp.entryQuality, 80);
});
ok("missing real inputs (no sector, no vwap) degrade to honest null, never fabricated", () => {
  const fp = buildMarketFingerprint({ regime: null, sectorInfo: null, entryStage: null, row: { rsRating: null, volRatio: null, dollarVolume: null, price: 102, epsGrowth: null }, vwap20: null, riskPct: null, optionsStatus: null, entryScore: null });
  assert.strictEqual(fp.regime, null);
  assert.strictEqual(fp.sector, null);
  assert.strictEqual(fp.vwap, null);
  assert.strictEqual(fp.catalyst, null);
});

console.log("\nChecking computeCounterfactualEv — real pivot EV vs real chase-at-live-price EV, WAIT/EXTENDED only…");
ok("ACTIONABLE/DEVELOPING tiers never get a counterfactual — the setup is already real and current", () => {
  assert.strictEqual(computeCounterfactualEv({ tier: "ACTIONABLE", probability: 60, entryPlan: { pivot: 100, stop: 92, target1: 116 }, livePrice: 97 }), null);
  assert.strictEqual(computeCounterfactualEv({ tier: "DEVELOPING", probability: 60, entryPlan: { pivot: 100, stop: 92, target1: 116 }, livePrice: 97 }), null);
});
ok("no real pivot -> honest null, never a fabricated hypothetical price", () => {
  assert.strictEqual(computeCounterfactualEv({ tier: "WAIT", probability: 60, entryPlan: { pivot: null, stop: 92, target1: 116 }, livePrice: 97 }), null);
});
ok("no real live price -> honest null too", () => {
  assert.strictEqual(computeCounterfactualEv({ tier: "WAIT", probability: 60, entryPlan: { pivot: 100, stop: 92, target1: 116 }, livePrice: null }), null);
});
ok("null probability (insufficient sample) -> honest null counterfactual too, never a guessed EV", () => {
  assert.strictEqual(computeCounterfactualEv({ tier: "WAIT", probability: null, entryPlan: { pivot: 100, stop: 92, target1: 116 }, livePrice: 97 }), null);
});
ok("regression (live prod bug, 2026-08-26, AMD): a live price BELOW the real stop is not a valid entry to chase — chaseExpectedValue stays honestly null instead of a fabricated-looking large positive number", () => {
  // Real shape confirmed live: WAIT-tier AMD, pivot $561.47, stop $516.55,
  // live price $479.18 — below the stop entirely (price hasn't reached
  // the pivot yet). Computing a "chase EV" at that price previously
  // produced a nonsensical +15.44%, since a below-stop entry mechanically
  // inflates gainPct/deflates lossPct in the formula despite describing
  // an invalid trade.
  const cf = computeCounterfactualEv({ tier: "WAIT", probability: 33, entryPlan: { pivot: 561.47, stop: 516.55, target1: 606.39 }, livePrice: 479.18 });
  assert.ok(cf, "expected a real counterfactual object (the pivot-EV half is still valid)");
  assert.ok(Number.isFinite(cf.expectedValue));
  assert.strictEqual(cf.chaseExpectedValue, null, "chasing below the real stop must never produce a number");
  assert.match(cf.note, /isn't a valid entry/);
});
ok("a real WAIT setup with a live price ABOVE the real stop gets a real pivot-EV vs a real chase-EV — two genuinely distinct numbers, not a redundant repeat of the same basis", () => {
  const cf = computeCounterfactualEv({ tier: "WAIT", probability: 65, entryPlan: { pivot: 100, stop: 92, target1: 116 }, livePrice: 97 });
  assert.ok(cf, "expected a real counterfactual object");
  assert.strictEqual(cf.hypotheticalEntry, 100);
  assert.ok(Number.isFinite(cf.expectedValue));
  assert.ok(Number.isFinite(cf.chaseExpectedValue));
  assert.notStrictEqual(cf.expectedValue, cf.chaseExpectedValue, "pivot EV and live-price chase EV must be computed at genuinely different real prices");
  assert.match(cf.note, /\$100/);
  assert.match(cf.note, /\$97/);
});

console.log("\nChecking computeOpportunity carries the real fingerprint + counterfactual fields end-to-end…");
ok("a real WAIT-tier opportunity (the AMD regression case) gets both a real fingerprint and a real counterfactual EV", () => {
  const row = baseRow({
    price: 475.7, entry: 561.47, pivot: 561.47, stop: 516.55, target2: 651.31,
    abovePivotPct: -14.9, breakoutConfirmed: false, extended: false, passCount: 6,
  });
  // Adding sectorInfo shifts the real coreScore into the 80-100 bucket
  // (82, confirmed) rather than the 60-79 bucket the plain AMD regression
  // case above lands in — the trackReport fixture must match whichever
  // bucket THIS row's real score actually falls into, or winProbFor
  // honestly (correctly) returns null for a bucket with no real sample.
  const trackReport = { horizons: { d20: { buckets: { "80-100": { winRate: 33, count: 27 } } } } };
  const o = computeOpportunity({ symbol: "AMD", row, regime: REGIME, marketRegime: "RISK_ON", trackReport, sectorInfo: { rank: 2, of: 11 } });
  assert.strictEqual(o.tier, "WAIT");
  assert.ok(o.fingerprint, "expected a real fingerprint object");
  assert.strictEqual(o.fingerprint.regime, "GREEN");
  assert.deepStrictEqual(o.fingerprint.sector, { rank: 2, of: 11 });
  assert.ok(o.counterfactual, "expected a real counterfactual object for a WAIT-tier opportunity");
  assert.strictEqual(o.counterfactual.hypotheticalEntry, 561.47);
});
ok("an ACTIONABLE-tier opportunity carries a real fingerprint but null counterfactual (already real/current)", () => {
  const o = computeOpportunity({ symbol: "TEST", row: baseRow(), regime: REGIME, marketRegime: "RISK_ON" });
  assert.strictEqual(o.tier, "ACTIONABLE");
  assert.ok(o.fingerprint);
  assert.strictEqual(o.counterfactual, null);
});

ok("a row with a scan error returns null, never a partial/garbage Opportunity Object", () => {
  assert.strictEqual(computeOpportunity({ symbol: "TEST", row: { error: "fetch failed" }, regime: REGIME, marketRegime: "RISK_ON" }), null);
});
ok("a missing row returns null", () => {
  assert.strictEqual(computeOpportunity({ symbol: "TEST", row: null, regime: REGIME, marketRegime: "RISK_ON" }), null);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("OPPORTUNITY-ENGINE TEST FAILED"); else console.log("OPPORTUNITY-ENGINE TEST OK");
