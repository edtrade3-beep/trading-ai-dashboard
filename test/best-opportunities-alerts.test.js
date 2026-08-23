// Real tests for best-opportunities-alerts.js's qualifiesAsLeader
// (2026-08-23, Master Build Spec phase 8) — migrated off row.verdict/
// row.atBuyPoint (_buildTrendTemplate's own legacy verdict system) onto
// the unified pipeline, preserving the same real "leaders only, RS≥70"
// quality bar this alert has always deliberately applied on top of the
// decision itself. Pure-function, synthetic-input, zero-network. Run:
// node test/best-opportunities-alerts.test.js (or npm test).
const assert = require("node:assert");
const { qualifiesAsLeader } = require("../src/best-opportunities-alerts");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const LEADER = { entry: 100, stop: 95, passCount: 7, extended: false, rsRating: 80 };

console.log("Checking qualifiesAsLeader — the real, preserved 'leaders only' bar…");
ok("a genuine real leader (valid stop, passCount>=6, not extended, RS>=70) qualifies", () => {
  assert.strictEqual(qualifiesAsLeader(LEADER), true);
});
ok("RS below 70 does not qualify, even with everything else strong", () => {
  assert.strictEqual(qualifiesAsLeader({ ...LEADER, rsRating: 69 }), false);
});
ok("RS exactly at 70 qualifies (>=, inclusive)", () => {
  assert.strictEqual(qualifiesAsLeader({ ...LEADER, rsRating: 70 }), true);
});
ok("passCount below 6 does not qualify", () => {
  assert.strictEqual(qualifiesAsLeader({ ...LEADER, passCount: 5 }), false);
});
ok("extended does not qualify, even with a strong score otherwise", () => {
  assert.strictEqual(qualifiesAsLeader({ ...LEADER, extended: true }), false);
});
ok("invalid stop (entry <= stop) does not qualify", () => {
  assert.strictEqual(qualifiesAsLeader({ ...LEADER, entry: 90, stop: 95 }), false);
});
ok("missing/absent fields default to a real non-qualifying read, never fabricated", () => {
  assert.strictEqual(qualifiesAsLeader({}), false);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("BEST-OPPORTUNITIES-ALERTS TEST FAILED"); else console.log("BEST-OPPORTUNITIES-ALERTS TEST OK");
