// Real tests for final-trade-gate.js (Final Trade Validation Engine,
// 2026-08-23) — the shared display/policy overlay that maps
// computeSimpleDecision's (Workspace) and classifyDeepScanDecision's
// (Scanner) real, separate vocabularies onto ONE canonical 6-state
// display: BUY/EARLY_WATCH/WAIT_FOR_BREAKOUT/HOLD/AVOID/EXIT. ES module
// (browser-only, no CommonJS twin needed — both real consumers this
// phase are client components), loaded via dynamic import, same
// precedent as test/ai-actions.test.js. Run: node test/final-trade-gate.test.js
// (or npm test).
const assert = require("node:assert");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

(async () => {
  const { FINAL_GATE_META, classifyFinalTradeGate, buildWhyNotBuy } = await import("../axiom-runner/components/final-trade-gate.js");

  console.log("Checking source: \"simple\" (Workspace / computeSimpleDecision)…");
  ok("START_SMALL/ADD -> BUY", () => {
    assert.strictEqual(classifyFinalTradeGate({ source: "simple", decision: "START_SMALL" }).state, "BUY");
    assert.strictEqual(classifyFinalTradeGate({ source: "simple", decision: "ADD" }).state, "BUY");
  });
  ok("AVOID -> AVOID (the real gate this whole engine exists to expose)", () => {
    const g = classifyFinalTradeGate({ source: "simple", decision: "AVOID", why: "Stage 4 downtrend — not a valid long setup." });
    assert.strictEqual(g.state, "AVOID");
    assert.strictEqual(g.icon, "🔴");
  });
  ok("HOLD -> HOLD", () => {
    assert.strictEqual(classifyFinalTradeGate({ source: "simple", decision: "HOLD" }).state, "HOLD");
  });
  ok("EXIT -> EXIT, with its own distinct violet (not AVOID's red)", () => {
    const g = classifyFinalTradeGate({ source: "simple", decision: "EXIT" });
    assert.strictEqual(g.state, "EXIT");
    assert.strictEqual(g.icon, "🟣");
    assert.notStrictEqual(g.color, FINAL_GATE_META.AVOID.color);
  });
  ok("WAIT with a real entry zone already computed (not BLOCKED) -> WAIT_FOR_BREAKOUT", () => {
    const g = classifyFinalTradeGate({ source: "simple", decision: "WAIT", why: "Need: 1H setup to improve.", entryZone: "$215.03–$218.77" });
    assert.strictEqual(g.state, "WAIT_FOR_BREAKOUT");
  });
  ok("WAIT naming 15M confirmation -> WAIT_FOR_BREAKOUT", () => {
    const g = classifyFinalTradeGate({ source: "simple", decision: "WAIT", why: "Need: 15M confirmation.", entryZone: "BLOCKED" });
    assert.strictEqual(g.state, "WAIT_FOR_BREAKOUT");
  });
  ok("WAIT with everything still developing, entry zone BLOCKED -> EARLY_WATCH", () => {
    const g = classifyFinalTradeGate({ source: "simple", decision: "WAIT", why: "Need: 1H setup to improve.", entryZone: "BLOCKED" });
    assert.strictEqual(g.state, "EARLY_WATCH");
  });
  ok("REDUCE has no honest equivalent in the 6 -> null, caller keeps its own real label (disclosed exception)", () => {
    assert.strictEqual(classifyFinalTradeGate({ source: "simple", decision: "REDUCE" }), null);
  });
  ok("unrecognized/absent decision -> null, never a guessed state", () => {
    assert.strictEqual(classifyFinalTradeGate({ source: "simple", decision: "NOT_A_STATE" }), null);
    assert.strictEqual(classifyFinalTradeGate({ source: "simple" }), null);
  });

  console.log("\nChecking source: \"deepscan\" (Scanner / classifyDeepScanDecision) — new hard gates classifyDeepScanDecision itself doesn't see…");
  ok("a bullish base decision (BUY/A_PLUS_EARLY_BUY/PULLBACK_BUY) maps to BUY when no new gate fires", () => {
    assert.strictEqual(classifyFinalTradeGate({ source: "deepscan", decision: "BUY" }).state, "BUY");
    assert.strictEqual(classifyFinalTradeGate({ source: "deepscan", decision: "A_PLUS_EARLY_BUY" }).state, "BUY");
    assert.strictEqual(classifyFinalTradeGate({ source: "deepscan", decision: "PULLBACK_BUY" }).state, "BUY");
  });
  ok("EXTENDED -> WAIT_FOR_BREAKOUT (confirmed but don't chase — literally waiting for a better entry)", () => {
    assert.strictEqual(classifyFinalTradeGate({ source: "deepscan", decision: "EXTENDED" }).state, "WAIT_FOR_BREAKOUT");
  });
  ok("WAIT -> EARLY_WATCH", () => {
    assert.strictEqual(classifyFinalTradeGate({ source: "deepscan", decision: "WAIT" }).state, "EARLY_WATCH");
  });
  ok("classifyDeepScanDecision's own AVOID passes through as AVOID", () => {
    assert.strictEqual(classifyFinalTradeGate({ source: "deepscan", decision: "AVOID" }).state, "AVOID");
  });
  ok("Stage 4 overrides a bullish base decision -> AVOID (the literal \"high score != buy\" case, now real for the Scanner too)", () => {
    const g = classifyFinalTradeGate({ source: "deepscan", decision: "A_PLUS_EARLY_BUY", stage: "Stage 4 — Downtrend" });
    assert.strictEqual(g.state, "AVOID");
  });
  ok("Entry Score below 75 overrides a bullish base decision -> AVOID (Setup Quality=90, Entry Quality=40 -> AVOID)", () => {
    const g = classifyFinalTradeGate({ source: "deepscan", decision: "BUY", entryScore: 40 });
    assert.strictEqual(g.state, "AVOID");
  });
  ok("a critical red flag overrides a bullish base decision -> AVOID", () => {
    const g = classifyFinalTradeGate({ source: "deepscan", decision: "BUY", criticalFlagCount: 1 });
    assert.strictEqual(g.state, "AVOID");
  });
  ok("Entry Score exactly at 75 does not block (>=, inclusive)", () => {
    const g = classifyFinalTradeGate({ source: "deepscan", decision: "BUY", entryScore: 75 });
    assert.strictEqual(g.state, "BUY");
  });
  ok("no stage/entryScore/criticalFlagCount supplied at all -> honest no-op, base decision passes through unchanged", () => {
    assert.strictEqual(classifyFinalTradeGate({ source: "deepscan", decision: "BUY" }).state, "BUY");
  });

  console.log("\nChecking buildWhyNotBuy…");
  ok("source \"simple\" reuses real redFlags labels when present, never re-derives them", () => {
    const reasons = buildWhyNotBuy({ source: "simple", redFlags: [{ label: "Daily Trend Breakdown" }, { label: "Risk/Reward Unacceptable" }] });
    assert.deepStrictEqual(reasons, ["Daily Trend Breakdown", "Risk/Reward Unacceptable"]);
  });
  ok("source \"simple\" falls back to the real why string when no redFlags array is present", () => {
    assert.deepStrictEqual(buildWhyNotBuy({ source: "simple", why: "Stage 4 downtrend — not a valid long setup." }), ["Stage 4 downtrend — not a valid long setup."]);
  });
  ok("source \"deepscan\" assembles reasons from the real new-gate inputs plus the base reason", () => {
    const reasons = buildWhyNotBuy({ source: "deepscan", stage: "Stage 4 — Downtrend", entryScore: 35, criticalFlagCount: 1, reason: "Breakout failed." });
    assert.ok(reasons.some((r) => /critical red flag/i.test(r)));
    assert.ok(reasons.some((r) => /Stage 4/.test(r)));
    assert.ok(reasons.some((r) => /Entry Score 35/.test(r)));
    assert.ok(reasons.includes("Breakout failed."));
  });
  ok("no real inputs at all -> an empty array, never a fabricated reason", () => {
    assert.deepStrictEqual(buildWhyNotBuy({ source: "deepscan" }), []);
    assert.deepStrictEqual(buildWhyNotBuy({ source: "simple" }), []);
  });

  console.log(`\n${passed} checks passed.`);
  console.log("FINAL-TRADE-GATE TEST " + (process.exitCode ? "FAILED" : "OK"));
})();
