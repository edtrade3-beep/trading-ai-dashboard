// Real tests for watchlist-sniper-alerts.js's classifyTransition (2026-08-23,
// Master Build Spec phase 7) — migrated off computeSniperDecision (the old
// pre-unification verdict engine) onto the same real unified pipeline
// Phase 5 already built and tested (classifyDeepScanDecision +
// computeRedFlags), reusing watchlist-setup-alerts.js's exported
// buildEvFromRow/shouldAlert/ACTIONABLE_DECISIONS rather than duplicating
// them. Pure-function, synthetic-input, zero-network — same discipline as
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
  assert.strictEqual(classifyTransition("EXTENDED", "A_PLUS_EARLY_BUY", 0), "buy");
  assert.strictEqual(classifyTransition("AVOID", "PULLBACK_BUY", 0), "buy");
});
ok("a real critical red flag suppresses the buy transition even on a genuine actionable move", () => {
  assert.strictEqual(classifyTransition("WAIT", "BUY", 1), null);
});
ok("already in an actionable state -> no duplicate buy alert", () => {
  assert.strictEqual(classifyTransition("BUY", "BUY", 0), null);
  assert.strictEqual(classifyTransition("PULLBACK_BUY", "A_PLUS_EARLY_BUY", 0), null);
});
ok("staying non-actionable never fires a buy", () => {
  assert.strictEqual(classifyTransition("WAIT", "AVOID", 0), null);
});

console.log("Checking the real GET OUT transition (new to this phase)…");
ok("was actionable, now AVOID -> exit", () => {
  assert.strictEqual(classifyTransition("BUY", "AVOID", 0), "exit");
  assert.strictEqual(classifyTransition("A_PLUS_EARLY_BUY", "AVOID", 0), "exit");
  assert.strictEqual(classifyTransition("PULLBACK_BUY", "AVOID", 0), "exit");
});
ok("was actionable, now EXTENDED (confirmed breakout but too far to chase) -> exit", () => {
  assert.strictEqual(classifyTransition("BUY", "EXTENDED", 0), "exit");
});
ok("never was actionable -> moving to AVOID/EXTENDED is NOT a real get-out (nothing was ever a live entry)", () => {
  assert.strictEqual(classifyTransition("WAIT", "AVOID", 0), null);
  assert.strictEqual(classifyTransition("WAIT", "EXTENDED", 0), null);
});
ok("was actionable, now WAIT (not a get-out state) -> no exit alert", () => {
  assert.strictEqual(classifyTransition("BUY", "WAIT", 0), null);
});
ok("staying actionable (BUY -> BUY) is never treated as a get-out", () => {
  assert.strictEqual(classifyTransition("BUY", "BUY", 0), null);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("WATCHLIST-SNIPER-ALERTS TEST FAILED"); else console.log("WATCHLIST-SNIPER-ALERTS TEST OK");
