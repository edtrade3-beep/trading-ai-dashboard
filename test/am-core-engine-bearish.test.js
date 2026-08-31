// Real tests for am-core-engine.js's computeBearishScore/
// classifyBearishVerdict — the short-side sibling of computeCoreScore/
// classifyCoreVerdict, added 2026-08-31 (explicit user request: "trade
// up and down options and stocks and crypto"). Same pure-function,
// synthetic-input, zero-network discipline as test/am-core-engine.test.js.
// Run: node test/am-core-engine-bearish.test.js (or npm test).
const assert = require("node:assert");
const { AM_CORE_SETUP, BEARISH_VERDICT_META, computeBearishScore, classifyBearishVerdict } = require("../src/am-core-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

// The mirror image of am-core-engine.test.js's own STRONG_INPUT — every
// real dimension flipped to what a genuinely strong SHORT setup wants.
const STRONG_BEARISH_INPUT = {
  passCount: 0, rsRating: 5, momentum: -0.3, volRatio: 1.8,
  regime: { score: 10, label: "RED" },
  riskPct: 4, epsGrowth: -15,
  optionsFlow: { callNotional: 200_000, putNotional: 800_000 },
  adx: { strength: "Strong", direction: "Bearish" },
  smc: { bos: { type: "BEAR_BOS" } },
  sectorInfo: { rank: 11, of: 11 },
  dollarVolume: 500_000_000,
};

console.log("Checking computeBearishScore — real inputs, polarity-flipped, honest degrade when absent…");

ok("a genuinely strong bearish setup across every real dimension scores high (>=85)", () => {
  const { score } = computeBearishScore(STRONG_BEARISH_INPUT);
  assert.ok(score >= 85, `expected >=85, got ${score}`);
});

ok("a genuinely bullish setup (bad for a short) scores much lower than the strong bearish one — not near-zero, since Volume/Liquidity/Setup-Quality are deliberately NOT flipped and still contribute their own real, directionless points", () => {
  const bullishInput = {
    passCount: 8, rsRating: 95, momentum: 0.3, volRatio: 1.8,
    regime: { score: 90, label: "GREEN" }, riskPct: 4, epsGrowth: 15,
    optionsFlow: { callNotional: 800_000, putNotional: 200_000 },
    adx: { strength: "Strong", direction: "Bullish" },
    smc: { bos: { type: "BULL_BOS" } },
    sectorInfo: { rank: 1, of: 11 }, dollarVolume: 500_000_000,
  };
  const { score } = computeBearishScore(bullishInput);
  const { score: strongBearishScore } = computeBearishScore(STRONG_BEARISH_INPUT);
  assert.ok(score <= 30, `expected <=30 (real directionless buckets still contribute), got ${score}`);
  assert.ok(score < strongBearishScore - 40, `expected a large real gap vs. the strong bearish score (${strongBearishScore}), got ${score}`);
});

ok("missing real inputs degrade to the disclosed neutral midpoint, never fabricated", () => {
  const { score, breakdown } = computeBearishScore({});
  assert.ok(score > 40 && score < 60, `expected a neutral-ish score, got ${score}`);
  assert.ok(Object.values(breakdown).every((v) => Number.isFinite(v)));
});

ok("Setup Quality is deliberately flat/neutral regardless of any real vcpScore input — no real distribution/breakdown-quality metric exists to invert", () => {
  const withHighVcp = computeBearishScore({ ...STRONG_BEARISH_INPUT, vcpScore: 95 });
  const withLowVcp = computeBearishScore({ ...STRONG_BEARISH_INPUT, vcpScore: 5 });
  const withNoVcp = computeBearishScore(STRONG_BEARISH_INPUT);
  assert.strictEqual(withHighVcp.breakdown.setupQuality, withLowVcp.breakdown.setupQuality);
  assert.strictEqual(withHighVcp.breakdown.setupQuality, withNoVcp.breakdown.setupQuality);
});

ok("Volume and Liquidity are NOT flipped — directionless, same formula as the long side for identical real inputs", () => {
  const { computeCoreScore } = require("../src/am-core-engine");
  const shared = { volRatio: 1.4, dollarVolume: 300_000_000 };
  const bearish = computeBearishScore(shared);
  const long = computeCoreScore(shared);
  assert.strictEqual(bearish.breakdown.volume, long.breakdown.volume);
  assert.strictEqual(bearish.breakdown.liquidity, long.breakdown.liquidity);
});

console.log("\nChecking classifyBearishVerdict — real gate cascade, gates inverted, then score ladder…");

const BASE = { score: 90, stage: "Stage 4 Decline", dailyBias: "BEARISH", hasRealEntry: true };

ok("input.direction === 'LONG' returns null — this function is short-side only", () => {
  assert.strictEqual(classifyBearishVerdict({ direction: "LONG" }), null);
});

ok("a real bullish structural break (BULL_BOS) invalidates the short regardless of score", () => {
  const r = classifyBearishVerdict({ ...BASE, smc: { bos: { type: "BULL_BOS" } } });
  assert.strictEqual(r.verdict, "AVOID_SHORT");
  assert.match(r.reason, /Bullish structural break/);
});

ok("a real bullish CHOCH also invalidates the short", () => {
  const r = classifyBearishVerdict({ ...BASE, smc: { choch: { type: "CHOCH_BULL" } } });
  assert.strictEqual(r.verdict, "AVOID_SHORT");
});

ok("DO_NOT_CHASE bearish extension blocks the short", () => {
  const r = classifyBearishVerdict({ ...BASE, bearishExtension: { band: "DO_NOT_CHASE" } });
  assert.strictEqual(r.verdict, "AVOID_SHORT");
  assert.match(r.reason, /too far below the breakdown/);
});

ok("EXTENDED bearish extension blocks the short too, not just the terminal band", () => {
  const r = classifyBearishVerdict({ ...BASE, bearishExtension: { band: "EXTENDED" } });
  assert.strictEqual(r.verdict, "AVOID_SHORT");
  assert.match(r.reason, /stretched below the breakdown/);
});

ok("no real stage data honestly blocks the short — never assumes a downtrend without real data", () => {
  const r = classifyBearishVerdict({ ...BASE, stage: undefined });
  assert.strictEqual(r.verdict, "AVOID_SHORT");
  assert.match(r.reason, /No real stage data/);
});

ok("a real Stage 2 uptrend is not a valid downtrend/breakdown stage for a short", () => {
  const r = classifyBearishVerdict({ ...BASE, stage: "Stage 2 Advance" });
  assert.strictEqual(r.verdict, "AVOID_SHORT");
  assert.match(r.reason, /not a valid downtrend\/breakdown stage/);
});

ok("real Stage 3 (distribution/topping) is a valid short stage, not just Stage 4", () => {
  const r = classifyBearishVerdict({ ...BASE, stage: "Stage 3 Distribution" });
  assert.notStrictEqual(r.verdict, "AVOID_SHORT");
});

ok("a real bullish daily bias invalidates the short", () => {
  const r = classifyBearishVerdict({ ...BASE, dailyBias: "BULLISH" });
  assert.strictEqual(r.verdict, "AVOID_SHORT");
  assert.match(r.reason, /Daily trend is bullish/);
});

ok("a real bearish entry score below the floor blocks a NEW short", () => {
  const r = classifyBearishVerdict({ ...BASE, entryScore: AM_CORE_SETUP.entryScoreFloor - 1 });
  assert.strictEqual(r.verdict, "AVOID_SHORT");
  assert.match(r.reason, /below the \d+ floor for a new short/);
});

ok("score >= aPlusThreshold with a real executable entry -> EARLY_SHORT", () => {
  const r = classifyBearishVerdict({ ...BASE, score: AM_CORE_SETUP.aPlusThreshold });
  assert.strictEqual(r.verdict, "EARLY_SHORT");
});

ok("score >= buyThreshold with a real executable entry -> SHORT", () => {
  const r = classifyBearishVerdict({ ...BASE, score: AM_CORE_SETUP.buyThreshold });
  assert.strictEqual(r.verdict, "SHORT");
});

ok("a qualifying score with NO real executable entry -> WATCH_SHORT, never a fabricated SHORT", () => {
  const r = classifyBearishVerdict({ ...BASE, score: AM_CORE_SETUP.buyThreshold, hasRealEntry: false });
  assert.strictEqual(r.verdict, "WATCH_SHORT");
});

ok("score in the watch band -> WATCH_SHORT", () => {
  const r = classifyBearishVerdict({ ...BASE, score: AM_CORE_SETUP.watchThreshold });
  assert.strictEqual(r.verdict, "WATCH_SHORT");
});

ok("score in the wait band -> WAIT_SHORT", () => {
  const r = classifyBearishVerdict({ ...BASE, score: AM_CORE_SETUP.waitThreshold });
  assert.strictEqual(r.verdict, "WAIT_SHORT");
});

ok("score below the wait floor -> AVOID_SHORT", () => {
  const r = classifyBearishVerdict({ ...BASE, score: AM_CORE_SETUP.waitThreshold - 1 });
  assert.strictEqual(r.verdict, "AVOID_SHORT");
});

ok("no real score at all -> honest AVOID_SHORT, never a guessed verdict", () => {
  const r = classifyBearishVerdict({ ...BASE, score: undefined });
  assert.strictEqual(r.verdict, "AVOID_SHORT");
  assert.match(r.reason, /Insufficient real data/);
});

console.log("\nChecking classifyBearishVerdict's position-management branch (hasPosition:true)…");

ok("HARD_EXIT -> EXIT", () => {
  const r = classifyBearishVerdict({ hasPosition: true, positionState: "HARD_EXIT", positionReason: "stop hit" });
  assert.deepStrictEqual(r, { verdict: "EXIT", reason: "stop hit" });
});
ok("EXIT -> EXIT", () => {
  const r = classifyBearishVerdict({ hasPosition: true, positionState: "EXIT" });
  assert.strictEqual(r.verdict, "EXIT");
});
ok("TAKE_PARTIAL -> TAKE_PROFIT", () => {
  const r = classifyBearishVerdict({ hasPosition: true, positionState: "TAKE_PARTIAL" });
  assert.strictEqual(r.verdict, "TAKE_PROFIT");
});
ok("TRAIL/WARNING/HOLD -> HOLD", () => {
  for (const s of ["TRAIL", "WARNING", "HOLD", "anything-else"]) {
    assert.strictEqual(classifyBearishVerdict({ hasPosition: true, positionState: s }).verdict, "HOLD");
  }
});

console.log("\nChecking BEARISH_VERDICT_META — a real display entry for every real verdict…");
ok("every verdict classifyBearishVerdict can return has a real meta entry", () => {
  const CORE_VERDICT_META = require("../src/am-core-engine").CORE_VERDICT_META;
  const allBearish = ["EARLY_SHORT", "SHORT", "WATCH_SHORT", "WAIT_SHORT", "AVOID_SHORT"];
  for (const v of allBearish) assert.ok(BEARISH_VERDICT_META[v], `missing meta for ${v}`);
  // EXIT/TAKE_PROFIT/HOLD are reused from the long side's own meta.
  for (const v of ["EXIT", "TAKE_PROFIT", "HOLD"]) assert.ok(CORE_VERDICT_META[v], `missing shared meta for ${v}`);
});

console.log(`\n${passed} checks passed.`);
console.log("AM-CORE-ENGINE-BEARISH TEST OK");
