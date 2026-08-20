// Real tests for the Staged Swing-Entry System (src/entry-engine.js,
// 2026-08-20) — the fix for the "entryPrice === pivot unconditionally"
// bug. Pure-function, synthetic-input, zero-network — same discipline as
// test/mtf-engine.test.js and test/backtest-engine.test.js. Covers the 8
// scenarios explicitly required: improving structure below pivot, weak
// structure below pivot, confirmed breakout, failed breakout, successful
// retest, extended breakout, missing timeframe data, conflicting
// timeframes. Run: node test/entry-engine.test.js (or npm test).
const assert = require("node:assert");
const {
  computeEntryPlan, computeEntryStage, computeEntryZones, computeQualifyingConditions,
} = require("../src/entry-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const STRONG_EVIDENCE = {
  price: 175, pivot: 227, atr: 5, contractionLow: 170,
  dailyBias: "BULLISH", swing4hState: "STRONG",
  rsiTrend1h: { direction: "up", accelerating: true },
  adx: { direction: "Bullish", strength: "Strong" },
  rsRating: 75, volTrend1h: { direction: "up" },
  higherLows: true, tightening: true, vcpVerdict: "WATCHLIST",
  marketRegime: "RISK_ON", vwap20: 170, rr: 2.0,
  breakoutConfirmed: false, extended: false, priceAction: {},
};

const WEAK_EVIDENCE = {
  price: 175, pivot: 227, atr: 5, contractionLow: 160,
  dailyBias: "BEARISH", swing4hState: "BROKEN",
  rsiTrend1h: { direction: "down", accelerating: false },
  adx: { direction: "Bearish", strength: "Weak" },
  rsRating: 30, volTrend1h: { direction: "down" },
  higherLows: false, tightening: false, vcpVerdict: "INVALID VCP",
  marketRegime: "RISK_OFF", vwap20: 180, rr: 0.8,
  breakoutConfirmed: false, extended: false, priceAction: {},
};

console.log("Checking computeQualifyingConditions…");
ok("all-known evidence: every real condition is counted, none fabricated", () => {
  const q = computeQualifyingConditions(STRONG_EVIDENCE);
  assert.strictEqual(q.total, 12, `expected all 12 real conditions to have data, got ${q.total}`);
  assert.strictEqual(q.count, 12, `expected all 12 to pass on strong evidence, got ${q.count}`);
});
ok("weak evidence: every real condition fails, none pass", () => {
  const q = computeQualifyingConditions(WEAK_EVIDENCE);
  assert.strictEqual(q.count, 0);
});
ok("missing data: unknown conditions are excluded from BOTH count and total, never counted as a fail", () => {
  const q = computeQualifyingConditions({ price: 175, dailyBias: "BULLISH", rsRating: 80 });
  assert.strictEqual(q.total, 2, `expected only dailyTrend+rsStrength to have real data, got total=${q.total}`);
  assert.strictEqual(q.count, 2);
});

console.log("Checking computeEntryZones…");
ok("real ATR-derived zones, not hardcoded percentages", () => {
  const z = computeEntryZones({ price: 175, pivot: 227, atr: 5, contractionLow: 170 });
  assert.deepStrictEqual(z.earlyEntryZone, [172.5, 177.5], "early zone must be price +/- 0.5*ATR");
  const confCenter = 175 + 0.6 * (227 - 175);
  assert.deepStrictEqual(z.confirmationEntryZone, [round2(confCenter - 2.5), round2(confCenter + 2.5)]);
  assert.deepStrictEqual(z.retestZone, [round2(227 - 0.75 * 5), round2(227 + 0.75 * 5)]);
});
ok("honest nulls when ATR/price/pivot aren't real numbers, never a fabricated placeholder zone", () => {
  const z = computeEntryZones({ price: 175, pivot: 227, atr: null, contractionLow: 170 });
  assert.strictEqual(z.earlyEntryZone, null);
  assert.strictEqual(z.invalidation, null);
});
function round2(n) { return Math.round(n * 100) / 100; }

console.log("Checking the 8 required scenarios (computeEntryPlan)…");

ok("1. Below pivot + improving structure -> EARLY, entryPrice = real current price (never the pivot)", () => {
  const plan = computeEntryPlan(STRONG_EVIDENCE);
  assert.strictEqual(plan.stage, "EARLY", `expected EARLY, got ${plan.stage}`);
  assert.strictEqual(plan.entryPrice, 175, "EARLY entry must be the real current price, not the pivot");
  assert.notStrictEqual(plan.entryPrice, plan.pivot, "CRITICAL: entryPrice must never silently equal pivot here");
  assert.ok(plan.sizingPct > 0 && plan.sizingPct <= 25, `expected a real starter-size allocation, got ${plan.sizingPct}`);
});

ok("2. Below pivot + weak structure -> NONE, no entry offered at all", () => {
  const plan = computeEntryPlan(WEAK_EVIDENCE);
  assert.strictEqual(plan.stage, "NONE", `expected NONE, got ${plan.stage}`);
  assert.strictEqual(plan.entryPrice, null);
  assert.strictEqual(plan.sizingPct, 0);
});

ok("3. Confirmed breakout -> BREAKOUT, entryPrice IS the pivot (the one case this is legitimate)", () => {
  const plan = computeEntryPlan({ ...STRONG_EVIDENCE, price: 228, breakoutConfirmed: true, extended: false });
  assert.strictEqual(plan.stage, "BREAKOUT");
  assert.strictEqual(plan.entryPrice, 227, "a real confirmed breakout is the one legitimate case entryPrice = pivot");
});

ok("4. Failed breakout -> FAILED_BREAKOUT, entryPrice null, ADD blocked regardless of breakoutConfirmed", () => {
  const plan = computeEntryPlan({ ...STRONG_EVIDENCE, price: 220, breakoutConfirmed: true, priceAction: { failedBreakout: true } });
  assert.strictEqual(plan.stage, "FAILED_BREAKOUT");
  assert.strictEqual(plan.entryPrice, null);
});

ok("5. Successful retest -> RETEST, entryPrice = real current price within the real retest zone", () => {
  const plan = computeEntryPlan({ ...STRONG_EVIDENCE, price: 226, breakoutConfirmed: false, priceAction: { retest: true, failedBreakout: false } });
  assert.strictEqual(plan.stage, "RETEST");
  assert.strictEqual(plan.entryPrice, 226);
  assert.ok(plan.retestZone[0] <= 226 && 226 <= plan.retestZone[1]);
});

ok("6. Extended breakout -> stays BREAKOUT stage but entryPrice null (anti-chase blocks it)", () => {
  const plan = computeEntryPlan({ ...STRONG_EVIDENCE, price: 250, breakoutConfirmed: true, extended: true });
  assert.strictEqual(plan.stage, "BREAKOUT");
  assert.strictEqual(plan.entryPrice, null, "an extended breakout must never hand back an executable entry price");
});

ok("7. Missing timeframe data -> honestly reflects a small denominator, never fabricates a pass/fail", () => {
  const plan = computeEntryPlan({ price: 175, pivot: 227, atr: 5, dailyBias: "BULLISH", rsRating: 80 });
  assert.strictEqual(plan.qualifying.total, 2, `expected only the 2 real available conditions counted, got ${plan.qualifying.total}`);
  assert.notStrictEqual(plan.stage, "CONFIRMATION", "2/2 available conditions passing must not be confused with real multi-timeframe confirmation");
});

ok("8. Conflicting timeframes -> a real mixed tally, resolves to FOUNDATION (not a false EARLY)", () => {
  const mixed = {
    // 3 real conditions pass (dailyTrend, momentum1h, volumeTrend), 7 real
    // conditions fail — a genuine higher-vs-lower-timeframe conflict
    // (daily bullish, 4H broken), not a clean strong/weak split.
    price: 175, pivot: 227, atr: 5, contractionLow: 170,
    dailyBias: "BULLISH", swing4hState: "BROKEN",
    rsiTrend1h: { direction: "up", accelerating: false },
    volTrend1h: { direction: "up" },
    rsRating: 40, higherLows: false, tightening: false, vcpVerdict: "INVALID VCP",
    marketRegime: "RISK_OFF", vwap20: 180,
    breakoutConfirmed: false, extended: false, priceAction: {},
  };
  const plan = computeEntryPlan(mixed);
  assert.ok(plan.qualifying.count < plan.qualifying.total, "a real conflict must show as a genuine partial tally");
  assert.strictEqual(plan.stage, "FOUNDATION", `expected FOUNDATION on real conflicting evidence, got ${plan.stage}`);
  assert.strictEqual(plan.entryPrice, null);
});

console.log("Checking pass-through fields (Risk Engine integration, not recomputed)…");
ok("stop/target1/target2/trailingStop and doNotChaseZone are passed through, never recomputed here", () => {
  const plan = computeEntryPlan({ ...STRONG_EVIDENCE, stop: 165, target1: 190, target2: 210, trailingStop: 168, antiChase: { band: "NORMAL", label: "Normal" } });
  assert.strictEqual(plan.stop, 165);
  assert.strictEqual(plan.target1, 190);
  assert.strictEqual(plan.target2, 210);
  assert.strictEqual(plan.trailingStop, 168);
  assert.strictEqual(plan.doNotChaseZone.band, "NORMAL");
});
ok("pivot's role is a breakoutTrigger reference, always present regardless of stage", () => {
  const plan = computeEntryPlan(WEAK_EVIDENCE);
  assert.strictEqual(plan.breakoutTrigger, 227, "the pivot must still be surfaced as a reference even when it's not the entry");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("ENTRY-ENGINE TEST FAILED"); else console.log("ENTRY-ENGINE TEST OK");
