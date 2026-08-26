// Real tests for opportunity-pivot-alerts.js's justBecameActionable
// (2026-08-26, "system watch them for me") — pure-function, synthetic-
// input, zero-network. Run: node test/opportunity-pivot-alerts.test.js
// (or npm test).
const assert = require("node:assert");
const { justBecameActionable } = require("../src/opportunity-pivot-alerts");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking justBecameActionable — the real WAIT/DEVELOPING/EXTENDED -> ACTIONABLE transition check…");
ok("a real WAIT -> ACTIONABLE transition fires", () => {
  assert.strictEqual(justBecameActionable("WAIT", "ACTIONABLE"), true);
});
ok("a real DEVELOPING -> ACTIONABLE transition fires", () => {
  assert.strictEqual(justBecameActionable("DEVELOPING", "ACTIONABLE"), true);
});
ok("a real EXTENDED -> ACTIONABLE transition fires", () => {
  assert.strictEqual(justBecameActionable("EXTENDED", "ACTIONABLE"), true);
});
ok("already ACTIONABLE last time does not re-fire (not new information)", () => {
  assert.strictEqual(justBecameActionable("ACTIONABLE", "ACTIONABLE"), false);
});
ok("staying WAIT does not fire", () => {
  assert.strictEqual(justBecameActionable("WAIT", "WAIT"), false);
});
ok("dropping out of ACTIONABLE does not fire (this alert is entry-timing, not exit)", () => {
  assert.strictEqual(justBecameActionable("ACTIONABLE", "WAIT"), false);
});
ok("first-seen-ever (lastTier null) never fires, even if already ACTIONABLE — no real 'before' state to compare, avoids an alert flood on first deploy", () => {
  assert.strictEqual(justBecameActionable(null, "ACTIONABLE"), false);
});
ok("first-seen-ever landing in WAIT obviously does not fire either", () => {
  assert.strictEqual(justBecameActionable(null, "WAIT"), false);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("OPPORTUNITY-PIVOT-ALERTS TEST FAILED"); else console.log("OPPORTUNITY-PIVOT-ALERTS TEST OK");
