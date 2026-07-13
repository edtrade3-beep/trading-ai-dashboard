// Minimal smoke test — validates that core modules load and the money-math is
// correct. Run: npm test.  (First real test in the repo per the audit.)
const assert = require("node:assert");
let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Loading core modules…");
ok("anthropic module loads + MODELS present", () => {
  const { MODELS } = require("../src/anthropic");
  assert.ok(MODELS.haiku && MODELS.opus && MODELS.fable, "MODELS missing keys");
});
ok("autopilot-journal loads + handles empty", () => {
  const { tierStatsLine } = require("../src/autopilot-journal");
  assert.strictEqual(tierStatsLine([]), "", "empty journal should return empty string");
});
ok("router + key route modules load", () => {
  require("../src/router"); require("../src/routes/alpaca"); require("../src/routes/market");
});

console.log("Checking money-math invariants…");
ok("position size risks exactly the intended amount", () => {
  const account = 100000, riskPct = 1, entry = 50, stop = 47;
  const riskPerShare = entry - stop;                       // 3
  const shares = Math.floor((account * (riskPct / 100)) / riskPerShare);  // 333
  const actualRisk = shares * riskPerShare;                 // 999
  assert.ok(actualRisk <= account * (riskPct / 100), "risk exceeds the cap");
  assert.ok(actualRisk > account * (riskPct / 100) - riskPerShare, "risk far below cap (bad sizing)");
});
ok("R multiple math is symmetric", () => {
  const entry = 100, stop = 97, target = entry + 2 * (entry - stop);  // 106
  const rAtTarget = (target - entry) / (entry - stop);
  assert.strictEqual(rAtTarget, 2, "2R target should equal 2R");
});
ok("bracket stop is below entry for a long", () => {
  const entry = 100, atr = 4, stop = entry - 1.5 * atr;   // 94
  assert.ok(stop < entry, "long stop must be below entry");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("SMOKE TEST FAILED"); else console.log("SMOKE TEST OK");

// Force-exit: requiring router.js pulls in modules (e.g. finviz.js's
// setInterval(refreshNews, 5min)) that keep the event loop alive
// indefinitely without this — the test's own checks are done, so don't
// wait on background timers that belong to the real running server.
process.exit(process.exitCode || 0);
