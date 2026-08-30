// Real tests for src/routes/autoexec.js's crypto-pair exclusion, added by
// the Autopilot goal audit (2026-08-30). maybeAutoExecute() itself needs a
// real configured Tradier broker + real market hours to run past its first
// two guard clauses (both false in this test environment — no
// TRADIER_API_KEY set), so a call to it here would return null for the
// wrong reason and not actually exercise the crypto check. Testing the
// real, exported isCryptoPairSymbol directly instead — the same function
// maybeAutoExecute calls, not a hand-copied approximation of it.
// Same minimal style as risk-guardrails.test.js — no framework, no new dep.
const assert = require("node:assert");
const { isCryptoPairSymbol } = require("../src/routes/autoexec");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking isCryptoPairSymbol — real broker-incompatible crypto pairs vs. real tradeable equities…");

ok("a real crypto pair (BTC-USD) is flagged", () => {
  assert.strictEqual(isCryptoPairSymbol("BTC-USD"), true);
});
ok("real crypto pairs are flagged case-insensitively", () => {
  assert.strictEqual(isCryptoPairSymbol("eth-usd"), true);
});
ok("a real equity/ETF that trades crypto-adjacent (COIN) is NOT flagged — it's a real, placeable equity order", () => {
  assert.strictEqual(isCryptoPairSymbol("COIN"), false);
});
ok("a real equity/ETF (IBIT) is NOT flagged for the same reason", () => {
  assert.strictEqual(isCryptoPairSymbol("IBIT"), false);
});
ok("a normal real stock symbol is NOT flagged", () => {
  assert.strictEqual(isCryptoPairSymbol("AAPL"), false);
});
ok("empty/missing input never throws, never flags", () => {
  assert.strictEqual(isCryptoPairSymbol(""), false);
  assert.strictEqual(isCryptoPairSymbol(undefined), false);
});

console.log(`\n${passed} checks passed.`);
console.log("AUTOEXEC TEST OK");
