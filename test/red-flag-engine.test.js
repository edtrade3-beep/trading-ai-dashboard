// Real tests for the Red Flag Engine (src/red-flag-engine.js, 2026-08-22,
// Master Build Spec §8-9 — "do NOT treat every red flag equally"). Pure
// function, synthetic-input, zero-network — same discipline as
// test/entry-engine.test.js. Run: node test/red-flag-engine.test.js (or
// npm test).
const assert = require("node:assert");
const { computeRedFlags, computeExitRedFlags } = require("../src/red-flag-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const CLEAN = {
  dailyBias: "BULLISH", swing4hState: "STRONG", rsRating: 75,
  volTrend1h: { direction: "up" }, vwap20: 100, price: 105,
  marketRegime: "RISK_ON", rr: 2.5, priceAction: {}, antiChase: { band: "NORMAL" },
  riskPct: 4, dollarVolume: 50_000_000,
};

console.log("Checking a clean, real setup triggers zero flags…");
ok("no critical, no regular flags on a genuinely strong setup", () => {
  const r = computeRedFlags(CLEAN);
  assert.strictEqual(r.count, 0);
  assert.strictEqual(r.criticalCount, 0);
  assert.deepStrictEqual(r.flags, []);
});

console.log("Checking each real critical flag fires on its own real trigger condition…");
ok("failed breakout -> critical", () => {
  const r = computeRedFlags({ ...CLEAN, priceAction: { failedBreakout: true } });
  assert.ok(r.criticalFlags.some((f) => f.key === "failedBreakout"));
});
ok("4H structure broken -> critical", () => {
  const r = computeRedFlags({ ...CLEAN, swing4hState: "BROKEN" });
  assert.ok(r.criticalFlags.some((f) => f.key === "structureBroken"));
});
ok("daily trend breakdown -> critical", () => {
  const r = computeRedFlags({ ...CLEAN, dailyBias: "BEARISH" });
  assert.ok(r.criticalFlags.some((f) => f.key === "dailyTrendBreakdown"));
});
ok("market regime deterioration -> critical", () => {
  const r = computeRedFlags({ ...CLEAN, marketRegime: "RISK_OFF" });
  assert.ok(r.criticalFlags.some((f) => f.key === "regimeDeterioration"));
});
ok("extreme extension (do not chase) -> critical", () => {
  const r = computeRedFlags({ ...CLEAN, antiChase: { band: "DO_NOT_CHASE", label: "12% above breakout" } });
  const f = r.criticalFlags.find((f) => f.key === "extremeExtension");
  assert.ok(f);
  assert.strictEqual(f.reason, "12% above breakout", "must reuse the real antiChase label, not a generic reason");
});
ok("unacceptable R:R -> critical, real R:R named in the reason", () => {
  const r = computeRedFlags({ ...CLEAN, rr: 1.1 });
  const f = r.criticalFlags.find((f) => f.key === "unacceptableRR");
  assert.ok(f);
  assert.match(f.reason, /1\.1/);
});
ok("unacceptable stop distance -> critical (>8%, matching the existing riskPct High convention)", () => {
  const r = computeRedFlags({ ...CLEAN, riskPct: 9.5 });
  assert.ok(r.criticalFlags.some((f) => f.key === "unacceptableStopDistance"));
});
ok("stop distance exactly at the 8% boundary is NOT flagged (only strictly above)", () => {
  const r = computeRedFlags({ ...CLEAN, riskPct: 8 });
  assert.ok(!r.criticalFlags.some((f) => f.key === "unacceptableStopDistance"));
});
ok("poor liquidity -> critical (<$5M/day)", () => {
  const r = computeRedFlags({ ...CLEAN, dollarVolume: 2_000_000 });
  assert.ok(r.criticalFlags.some((f) => f.key === "poorLiquidity"));
});

console.log("Checking regular (non-critical) flags…");
ok("weak volume -> regular, not critical", () => {
  const r = computeRedFlags({ ...CLEAN, volTrend1h: { direction: "down" } });
  const f = r.flags.find((f) => f.key === "weakVolume");
  assert.ok(f);
  assert.strictEqual(f.critical, false);
});
ok("falling RS -> regular, not critical", () => {
  const r = computeRedFlags({ ...CLEAN, rsRating: 45 });
  const f = r.flags.find((f) => f.key === "fallingRS");
  assert.ok(f);
  assert.strictEqual(f.critical, false);
});
ok("below VWAP -> regular, not critical", () => {
  const r = computeRedFlags({ ...CLEAN, price: 95, vwap20: 100 });
  const f = r.flags.find((f) => f.key === "belowVwap");
  assert.ok(f);
  assert.strictEqual(f.critical, false);
});

console.log("Checking honest omission — missing real data never fabricates a flag…");
ok("no swing4hState, no priceAction, no antiChase, no rr, no riskPct/dollarVolume at all -> zero flags, not fabricated failures", () => {
  const r = computeRedFlags({ dailyBias: "BULLISH" });
  assert.strictEqual(r.count, 0, "absent real data must never be treated as a red flag");
});
ok("count/criticalCount are consistent with the real flags array on a mixed real case", () => {
  const r = computeRedFlags({ ...CLEAN, marketRegime: "RISK_OFF", rsRating: 40 });
  assert.strictEqual(r.count, 2);
  assert.strictEqual(r.criticalCount, 1);
  assert.strictEqual(r.criticalFlags.length, 1);
});

console.log("Checking computeExitRedFlags — the EXIT taxonomy (Master Build Spec §8-9, phase 3)…");
const CLEAN_EXIT = {
  swing4hState: "STRONG", higherLows: true, marketRegime: "RISK_ON",
  antiChase: { band: "NORMAL" }, priceAction: {}, vwap20: 100, price: 105,
  volTrend1h: { direction: "up" }, thesisInvalidated: false,
};
ok("a clean, real open-position context triggers zero exit flags", () => {
  const r = computeExitRedFlags(CLEAN_EXIT);
  assert.strictEqual(r.count, 0);
});
ok("loss of key support -> critical (exit-only signal, higherLows false)", () => {
  const r = computeExitRedFlags({ ...CLEAN_EXIT, higherLows: false });
  const f = r.criticalFlags.find((f) => f.key === "lossOfSupport");
  assert.ok(f);
});
ok("bearish structure change -> critical (same underlying signal as entry's structureBroken, relabeled)", () => {
  const r = computeExitRedFlags({ ...CLEAN_EXIT, swing4hState: "BROKEN" });
  const f = r.criticalFlags.find((f) => f.key === "bearishStructureChange");
  assert.ok(f);
  assert.ok(!r.flags.some((f) => f.key === "structureBroken"), "EXIT taxonomy must use its own relabeled key, not ENTRY's");
});
ok("thesis invalidation -> critical, fed by the caller's own already-computed position-decision-engine.js state, never recomputed here", () => {
  const r = computeExitRedFlags({ ...CLEAN_EXIT, thesisInvalidated: true });
  assert.ok(r.criticalFlags.some((f) => f.key === "thesisInvalidation"));
});
ok("loss of VWAP -> regular (relabeled from ENTRY's belowVwap)", () => {
  const r = computeExitRedFlags({ ...CLEAN_EXIT, price: 95, vwap20: 100 });
  const f = r.flags.find((f) => f.key === "lossOfVwap");
  assert.ok(f);
  assert.strictEqual(f.critical, false);
});
ok("volume reversal -> regular (relabeled from ENTRY's weakVolume)", () => {
  const r = computeExitRedFlags({ ...CLEAN_EXIT, volTrend1h: { direction: "down" } });
  const f = r.flags.find((f) => f.key === "volumeReversal");
  assert.ok(f);
  assert.strictEqual(f.critical, false);
});
ok("ENTRY-only flags (unacceptableRR/unacceptableStopDistance/poorLiquidity/dailyTrendBreakdown/fallingRS) never appear in the EXIT taxonomy, even with real triggering data supplied", () => {
  const r = computeExitRedFlags({ ...CLEAN_EXIT, rr: 0.5, riskPct: 20, dollarVolume: 1000, dailyBias: "BEARISH", rsRating: 10 });
  const keys = r.flags.map((f) => f.key);
  assert.ok(!keys.includes("unacceptableRR"));
  assert.ok(!keys.includes("unacceptableStopDistance"));
  assert.ok(!keys.includes("poorLiquidity"));
  assert.ok(!keys.includes("dailyTrendBreakdown"));
  assert.ok(!keys.includes("fallingRS"));
});
ok("honest omission still holds for the EXIT taxonomy — no real data, no fabricated flags", () => {
  const r = computeExitRedFlags({});
  assert.strictEqual(r.count, 0);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("RED-FLAG-ENGINE TEST FAILED"); else console.log("RED-FLAG-ENGINE TEST OK");
