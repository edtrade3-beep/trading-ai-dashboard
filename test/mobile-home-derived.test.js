// Real tests for mobile-home-derived.js (2026-08-23, mobile nav redesign)
// — the small, pure, disclosed Risk Level / Today's Focus derivations for
// the new Mobile Home Grid's summary cards. ES module (browser-only),
// loaded via dynamic import, same precedent as test/ai-actions.test.js.
// Run: node test/mobile-home-derived.test.js (or npm test).
const assert = require("node:assert");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

(async () => {
  const { deriveRiskLevel, deriveTodaysFocus } = await import("../axiom-runner/components/mobile-home-derived.js");

  console.log("Checking deriveRiskLevel…");
  ok("VIX < 15 -> LOW", () => {
    assert.strictEqual(deriveRiskLevel(13.2).label, "LOW");
  });
  ok("VIX 15-25 inclusive -> MODERATE", () => {
    assert.strictEqual(deriveRiskLevel(15).label, "MODERATE");
    assert.strictEqual(deriveRiskLevel(20).label, "MODERATE");
    assert.strictEqual(deriveRiskLevel(25).label, "MODERATE");
  });
  ok("VIX > 25 -> HIGH", () => {
    assert.strictEqual(deriveRiskLevel(26).label, "HIGH");
    assert.strictEqual(deriveRiskLevel(40).label, "HIGH");
  });
  ok("no real VIX data -> honest UNKNOWN, never a fabricated band", () => {
    assert.strictEqual(deriveRiskLevel(null).label, "UNKNOWN");
    assert.strictEqual(deriveRiskLevel(undefined).label, "UNKNOWN");
    assert.strictEqual(deriveRiskLevel(NaN).label, "UNKNOWN");
  });

  console.log("\nChecking deriveTodaysFocus…");
  ok("strong regime score + low VIX -> QUALITY SETUPS", () => {
    assert.strictEqual(deriveTodaysFocus({ score: 80, vixVal: 13 }).label, "QUALITY SETUPS");
  });
  ok("strong regime score but no real VIX data -> still QUALITY SETUPS (VIX honestly optional)", () => {
    assert.strictEqual(deriveTodaysFocus({ score: 80 }).label, "QUALITY SETUPS");
  });
  ok("strong regime score but elevated VIX -> not QUALITY SETUPS (falls to STAY SELECTIVE)", () => {
    assert.strictEqual(deriveTodaysFocus({ score: 80, vixVal: 25 }).label, "STAY SELECTIVE");
  });
  ok("weak regime score -> CAPITAL PRESERVATION regardless of VIX", () => {
    assert.strictEqual(deriveTodaysFocus({ score: 30, vixVal: 12 }).label, "CAPITAL PRESERVATION");
  });
  ok("mid regime score -> STAY SELECTIVE", () => {
    assert.strictEqual(deriveTodaysFocus({ score: 55, vixVal: 18 }).label, "STAY SELECTIVE");
  });
  ok("no real regime score at all -> honest default, never a guessed label", () => {
    assert.strictEqual(deriveTodaysFocus({}).label, "STAY SELECTIVE");
    assert.strictEqual(deriveTodaysFocus(null).label, "STAY SELECTIVE");
  });

  console.log(`\n${passed} checks passed.`);
  console.log("MOBILE-HOME-DERIVED TEST " + (process.exitCode ? "FAILED" : "OK"));
})();
