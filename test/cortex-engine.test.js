// Real tests for cortex-engine.js's computeHeatRisk — previously ZERO test
// coverage (confirmed before writing this). Covers the 2026-08-26 "unify
// the swing/entry-decision verdict" bug fix: computeHeatRisk used to read
// ONLY the crude `row.extended` boolean flag, so it could disagree with
// am-core-engine.js's classifyCoreVerdict (which reads the real graduated
// computeAntiChase band) on the exact same stock at the exact same moment
// — the live case the user reported via screenshot. ES module (browser-
// only), loaded via dynamic import, same precedent as
// test/mobile-home-derived.js.
// Run: node test/cortex-engine.test.js (or npm test).
const assert = require("node:assert");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

(async () => {
  const { computeHeatRisk } = await import("../axiom-runner/components/cortex-engine.js");

  console.log("Checking computeHeatRisk — real antiChase-band-driven chase risk (regression, 2026-08-26)…");

  ok("a real EXTENDED band flags OVEREXTENDED_DO_NOT_CHASE even when the crude row.extended flag is false", () => {
    const r = computeHeatRisk({ extended: false }, {}, { band: "EXTENDED", label: "Extended — 6.2% above the breakout" });
    assert.strictEqual(r.state, "OVEREXTENDED_DO_NOT_CHASE");
  });

  ok("a real DO_NOT_CHASE band flags OVEREXTENDED_DO_NOT_CHASE even when the crude row.extended flag is false", () => {
    const r = computeHeatRisk({ extended: false }, {}, { band: "DO_NOT_CHASE", label: "Do not chase — 12% above the breakout" });
    assert.strictEqual(r.state, "OVEREXTENDED_DO_NOT_CHASE");
  });

  ok("regression: the exact reported live bug — a real NORMAL band must NOT flag overextended, even when the crude row.extended flag is (incorrectly/stale) true", () => {
    const r = computeHeatRisk({ extended: true }, { action: "ENTER_LONG" }, { band: "NORMAL", label: "Normal — 1.5% above the breakout" });
    assert.notStrictEqual(r.state, "OVEREXTENDED_DO_NOT_CHASE", "the real graduated band must take priority over the crude flat flag");
  });

  ok("a real CAUTION/NOT_YET_BROKEN_OUT band also does not flag overextended", () => {
    for (const band of ["CAUTION", "NOT_YET_BROKEN_OUT"]) {
      const r = computeHeatRisk({ extended: true }, { action: "ENTER_LONG" }, { band, label: band });
      assert.notStrictEqual(r.state, "OVEREXTENDED_DO_NOT_CHASE", `band ${band} must not flag overextended`);
    }
  });

  ok("no real antiChase band supplied -> honestly falls back to the crude row.extended flag (backward compatible)", () => {
    const flagged = computeHeatRisk({ extended: true }, {}, undefined);
    const clear = computeHeatRisk({ extended: false }, { action: "ENTER_LONG" }, undefined);
    assert.strictEqual(flagged.state, "OVEREXTENDED_DO_NOT_CHASE");
    assert.strictEqual(clear.state, "HEALTHY_STRENGTH");
  });

  ok("the real band's own label text is used in the reason when supplied, not a re-derived one", () => {
    const r = computeHeatRisk({ extended: false }, {}, { band: "EXTENDED", label: "Extended — 6.2% above the breakout" });
    assert.strictEqual(r.reason, "Extended — 6.2% above the breakout");
  });

  ok("CLIMACTIC_DANGER (real exhaustion signals) still takes priority over antiChase, unaffected by this fix", () => {
    const r = computeHeatRisk({ extended: false }, { reversal: { isTop: true, topScore: 8, sigs: [{ txt: "RSI divergence" }] } }, { band: "NORMAL" });
    assert.strictEqual(r.state, "CLIMACTIC_DANGER");
  });

  ok("real HEALTHY_STRENGTH still fires when nothing is extended and sniper says ENTER_LONG", () => {
    const r = computeHeatRisk({ extended: false }, { action: "ENTER_LONG" }, { band: "NORMAL" });
    assert.strictEqual(r.state, "HEALTHY_STRENGTH");
  });

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("CORTEX-ENGINE TEST FAILED"); else console.log("CORTEX-ENGINE TEST OK");
})();
