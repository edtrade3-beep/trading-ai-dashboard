// Real tests for advisor-ai.js's buildRegimeDetail (2026-08-21, Unified
// Trading System phase 8) — a real, disclosed bug fix: computeRegime's
// real ORANGE label (score 40-54, between YELLOW and RED) had no branch
// in the GREEN/YELLOW/RED if/else chain here and silently fell into the
// "VIX unavailable" catch-all, returning the bare string "ORANGE" instead
// of a real descriptive state. Pure-function, synthetic-input,
// zero-network — same discipline as test/entry-engine.test.js. Run:
// node test/advisor-ai-regime.test.js (or npm test).
const assert = require("node:assert");
const { buildRegimeDetail } = require("../src/advisor-ai");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking buildRegimeDetail for all 4 real computeRegime labels…");

ok("GREEN + Low volatility -> Strong Bull — Low Volatility", () => {
  const d = buildRegimeDetail({ label: "GREEN", vixVal: 12, factors: [] });
  assert.strictEqual(d.state, "Strong Bull — Low Volatility");
});
ok("GREEN + Elevated/Panic volatility -> Bull — Volatility Divergence", () => {
  const d = buildRegimeDetail({ label: "GREEN", vixVal: 28, factors: [] });
  assert.strictEqual(d.state, "Bull — Volatility Divergence");
});
ok("YELLOW + Elevated/Panic volatility -> Choppy — Volatility Rising", () => {
  const d = buildRegimeDetail({ label: "YELLOW", vixVal: 28, factors: [] });
  assert.strictEqual(d.state, "Choppy — Volatility Rising");
});
ok("YELLOW, normal volatility -> Choppy / Transitional", () => {
  const d = buildRegimeDetail({ label: "YELLOW", vixVal: 18, factors: [] });
  assert.strictEqual(d.state, "Choppy / Transitional");
});

console.log("Checking the real fix — ORANGE now gets its own real descriptive state, never the bare label…");
ok("ORANGE + Elevated/Panic volatility -> Weakening — Volatility Rising (not the bare label 'ORANGE')", () => {
  const d = buildRegimeDetail({ label: "ORANGE", vixVal: 28, factors: [] });
  assert.strictEqual(d.state, "Weakening — Volatility Rising");
  assert.notStrictEqual(d.state, "ORANGE", "must never fall through to the bare label — that was the real bug");
});
ok("ORANGE, normal volatility -> Weakening / Caution (not the bare label 'ORANGE')", () => {
  const d = buildRegimeDetail({ label: "ORANGE", vixVal: 18, factors: [] });
  assert.strictEqual(d.state, "Weakening / Caution");
  assert.notStrictEqual(d.state, "ORANGE");
});

ok("RED + Panic volatility -> Bear — Panic/Capitulation", () => {
  const d = buildRegimeDetail({ label: "RED", vixVal: 35, factors: [] });
  assert.strictEqual(d.state, "Bear — Panic/Capitulation");
});
ok("RED + Elevated volatility -> Bear — Elevated Volatility", () => {
  const d = buildRegimeDetail({ label: "RED", vixVal: 27, factors: [] });
  assert.strictEqual(d.state, "Bear — Elevated Volatility");
});
ok("RED, normal/low volatility -> Bear — Orderly Decline", () => {
  const d = buildRegimeDetail({ label: "RED", vixVal: 18, factors: [] });
  assert.strictEqual(d.state, "Bear — Orderly Decline");
});

console.log("Checking the real 'VIX unavailable' fallback still works — now only for its actual real case…");
ok("no real vixVal at all -> classifyVolRegime(undefined) is honestly null, so a known label falls to its own plain branch (GREEN -> 'Bull'), not the catch-all", () => {
  const d = buildRegimeDetail({ label: "GREEN", vixVal: undefined, factors: [] });
  assert.strictEqual(d.state, "Bull");
});
ok("a genuinely unrecognized label falls back to the bare label — the catch-all's real, narrower job after this fix", () => {
  const d = buildRegimeDetail({ label: "SOME_FUTURE_LABEL", vixVal: 18, factors: [] });
  assert.strictEqual(d.state, "SOME_FUTURE_LABEL");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("ADVISOR-AI-REGIME TEST FAILED"); else console.log("ADVISOR-AI-REGIME TEST OK");
