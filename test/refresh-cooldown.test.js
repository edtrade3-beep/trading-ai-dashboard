// Real tests for src/refresh-cooldown.js (2026-09-01 platform audit) —
// the in-memory in-flight + minimum-interval lock guarding on-demand
// AI-refresh routes against a double-click or retry loop.
// Run: node test/refresh-cooldown.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { acquireRefreshLock } = require("../src/refresh-cooldown");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking acquireRefreshLock — real in-flight + interval gate…");

ok("a fresh real key is allowed through", () => {
  const lock = acquireRefreshLock("k-fresh", 15000);
  assert.strictEqual(lock.ok, true);
  assert.strictEqual(typeof lock.release, "function");
  lock.release();
});

ok("a second real call for the same key while the first is still in-flight is refused", () => {
  const first = acquireRefreshLock("k-inflight", 15000);
  assert.strictEqual(first.ok, true);
  const second = acquireRefreshLock("k-inflight", 15000);
  assert.strictEqual(second.ok, false);
  assert.ok(second.retryAfterMs > 0);
  first.release();
});

ok("after release, an immediate re-call within minIntervalMs is still refused (rapid re-click)", () => {
  const first = acquireRefreshLock("k-rapid", 15000);
  first.release();
  const second = acquireRefreshLock("k-rapid", 15000);
  assert.strictEqual(second.ok, false);
  assert.ok(second.retryAfterMs > 0 && second.retryAfterMs <= 15000);
});

ok("after release, a call with a real zero-length interval is allowed immediately", () => {
  const first = acquireRefreshLock("k-expired", 0);
  first.release();
  const second = acquireRefreshLock("k-expired", 0);
  assert.strictEqual(second.ok, true);
  second.release();
});

ok("two different real keys never block each other", () => {
  const a = acquireRefreshLock("k-a", 15000);
  const b = acquireRefreshLock("k-b", 15000);
  assert.strictEqual(a.ok, true);
  assert.strictEqual(b.ok, true);
  a.release(); b.release();
});

console.log(`\n${passed} checks passed.`);
console.log("REFRESH-COOLDOWN TEST OK");
