// Real tests for watchlist-sniper-alerts.js's classifyTransition —
// migrated off computeSniperDecision (the old pre-unification verdict
// engine), then off classifyDeepScanDecision (One Engine Migration Phase
// 6, 2026-08-23) onto am-core-engine.js's classifyCoreVerdict, reusing
// watchlist-setup-alerts.js's exported buildEvFromRow/shouldAlert/
// ACTIONABLE_DECISIONS rather than duplicating them. Pure-function,
// synthetic-input, zero-network — same discipline as
// test/entry-engine.test.js. Run: node test/watchlist-sniper-alerts.test.js
// (or npm test).
const assert = require("node:assert");
const { classifyTransition } = require("../src/watchlist-sniper-alerts");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking the real BUY transition (reuses watchlist-setup-alerts.js's shouldAlert)…");
ok("first-seen-per-symbol (no prior baseline) never fires — seeds silently", () => {
  assert.strictEqual(classifyTransition(null, "BUY", 0), null);
});
ok("a genuine transition into an actionable state, zero critical flags -> buy", () => {
  assert.strictEqual(classifyTransition("WAIT", "BUY", 0), "buy");
  assert.strictEqual(classifyTransition("AVOID_LONG", "EARLY_BUY", 0), "buy");
  assert.strictEqual(classifyTransition("WATCH", "BUY", 0), "buy");
});
ok("a real critical red flag suppresses the buy transition even on a genuine actionable move", () => {
  assert.strictEqual(classifyTransition("WAIT", "BUY", 1), null);
});
ok("already in an actionable state -> no duplicate buy alert", () => {
  assert.strictEqual(classifyTransition("BUY", "BUY", 0), null);
  assert.strictEqual(classifyTransition("EARLY_BUY", "BUY", 0), null);
});
ok("staying non-actionable never fires a buy", () => {
  assert.strictEqual(classifyTransition("WAIT", "AVOID_LONG", 0), null);
});

console.log("Checking the real GET OUT transition…");
ok("was actionable, now AVOID_LONG -> exit", () => {
  assert.strictEqual(classifyTransition("BUY", "AVOID_LONG", 0), "exit");
  assert.strictEqual(classifyTransition("EARLY_BUY", "AVOID_LONG", 0), "exit");
});
ok("never was actionable -> moving to AVOID_LONG is NOT a real get-out (nothing was ever a live entry)", () => {
  assert.strictEqual(classifyTransition("WAIT", "AVOID_LONG", 0), null);
});
ok("was actionable, now WAIT (not a get-out state) -> no exit alert", () => {
  assert.strictEqual(classifyTransition("BUY", "WAIT", 0), null);
});
ok("staying actionable (BUY -> BUY) is never treated as a get-out", () => {
  assert.strictEqual(classifyTransition("BUY", "BUY", 0), null);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("WATCHLIST-SNIPER-ALERTS TEST FAILED"); else console.log("WATCHLIST-SNIPER-ALERTS TEST OK");
