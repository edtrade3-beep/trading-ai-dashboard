// Real tests for watchlist-turn-alerts.js's classifyTurn (2026-08-23,
// Master Build Spec phase 8) — migrated off row.verdict
// (_buildTrendTemplate's own baked-in legacy verdict system, routes/
// market.js) onto the same real unified pipeline already established for
// 4 other alert files this session, reusing watchlist-setup-alerts.js's
// exported shouldAlert/ACTIONABLE_DECISIONS rather than duplicating them.
// Pure-function, synthetic-input, zero-network. Run: node
// test/watchlist-turn-alerts.test.js (or npm test).
const assert = require("node:assert");
const { classifyTurn } = require("../src/watchlist-turn-alerts");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking classifyTurn — buy and sell transitions off the real unified decision…");
ok("first-seen-per-symbol (no prior baseline) never fires — seeds silently", () => {
  assert.strictEqual(classifyTurn(null, "BUY", 0), null);
});
ok("a genuine transition into an actionable state, zero critical flags -> buy", () => {
  assert.strictEqual(classifyTurn("WAIT", "BUY", 0), "buy");
  assert.strictEqual(classifyTurn("AVOID", "A_PLUS_EARLY_BUY", 0), "buy");
});
ok("a real critical red flag suppresses the buy transition", () => {
  assert.strictEqual(classifyTurn("WAIT", "BUY", 1), null);
});
ok("already actionable -> no duplicate buy", () => {
  assert.strictEqual(classifyTurn("BUY", "PULLBACK_BUY", 0), null);
});
ok("dropping out of the actionable set to ANY non-actionable state -> sell (broader than watchlist-sniper-alerts.js's narrower GET_OUT_DECISIONS — this file's own original 'turned away from GO' semantic covers any drop)", () => {
  assert.strictEqual(classifyTurn("BUY", "WAIT", 0), "sell");
  assert.strictEqual(classifyTurn("BUY", "AVOID", 0), "sell");
  assert.strictEqual(classifyTurn("A_PLUS_EARLY_BUY", "EXTENDED", 0), "sell");
});
ok("never was actionable -> no sell (nothing was ever a live entry)", () => {
  assert.strictEqual(classifyTurn("WAIT", "AVOID", 0), null);
});
ok("staying actionable -> no sell", () => {
  assert.strictEqual(classifyTurn("BUY", "BUY", 0), null);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("WATCHLIST-TURN-ALERTS TEST FAILED"); else console.log("WATCHLIST-TURN-ALERTS TEST OK");
