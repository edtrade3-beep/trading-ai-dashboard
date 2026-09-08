// Real tests for risk-gate-client.js's shouldStopTrading (2026-09-07,
// "3-Second AI Decision System" spec — Risk Engine override). ES module
// (no JSX, browser + Node dual-use), loaded here via dynamic import, same
// pattern as test/ai-actions.test.js. Run: node test/risk-gate-client.test.js
// (or npm test).
const assert = require("node:assert");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

(async () => {
  const { shouldStopTrading } = await import("../axiom-runner/components/risk-gate-client.js");

  console.log("Checking shouldStopTrading — real daily-loss-breaker override on NEW-ENTRY verdicts only…");

  ok("a real tripped daily-loss breaker blocks a new BUY_STOCK entry", () => {
    assert.strictEqual(shouldStopTrading("BUY_STOCK", true), true);
  });
  ok("blocks every real BUY_* structure (BUY_CALL, BUY_PUT, spreads), not just BUY_STOCK", () => {
    assert.strictEqual(shouldStopTrading("BUY_CALL", true), true);
    assert.strictEqual(shouldStopTrading("BUY_PUT", true), true);
    assert.strictEqual(shouldStopTrading("BUY_CALL_SPREAD", true), true);
    assert.strictEqual(shouldStopTrading("BUY_PUT_SPREAD", true), true);
  });

  ok("management/exit verdicts (EXIT/WAIT/NO_TRADE) are NEVER blocked — spec's own explicit carve-out", () => {
    assert.strictEqual(shouldStopTrading("EXIT", true), false);
    assert.strictEqual(shouldStopTrading("WAIT", true), false);
    assert.strictEqual(shouldStopTrading("NO_TRADE", true), false);
  });

  ok("a real healthy account (breaker not tripped) never blocks a new entry", () => {
    assert.strictEqual(shouldStopTrading("BUY_STOCK", false), false);
  });

  ok("honestly false on missing/undefined inputs, never throws", () => {
    assert.strictEqual(shouldStopTrading(null, true), false);
    assert.strictEqual(shouldStopTrading(undefined, true), false);
    assert.strictEqual(shouldStopTrading("BUY_STOCK", undefined), false);
    assert.strictEqual(shouldStopTrading("BUY_STOCK", null), false);
  });

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("RISK-GATE-CLIENT TEST FAILED");
  else console.log("RISK-GATE-CLIENT TEST OK");
})();
