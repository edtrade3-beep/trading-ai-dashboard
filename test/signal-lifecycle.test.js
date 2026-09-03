// Real tests for src/signal-lifecycle.js — Trade GPS's pre-entry state
// machine + signal expiration (2026-09-03 spec). Pure-function,
// synthetic-input, zero-network, same convention as the rest of this
// session's engine tests. Run: node test/signal-lifecycle.test.js (or
// npm test).
"use strict";
const assert = require("node:assert");
const path = require("node:path");
const { computeSignalState, SIGNAL_TTL_DEFAULTS_MS, PRE_ENTRY_STATES, getOrSetSignalCreatedAt } = require("../src/signal-lifecycle");
const { writeJsonAtomic, readJsonSafe } = require("../src/atomic-write");
const { ROOT } = require("../src/config");

// Same snapshot-reset-restore discipline as test/missed-opportunity-tracker.test.js
// — this module persists real per-symbol state to data/signal-created-at.json.
const CREATED_AT_PATH = path.join(ROOT, "data", "signal-created-at.json");
const originalCreatedAtStore = readJsonSafe(CREATED_AT_PATH, {});
writeJsonAtomic(CREATED_AT_PATH, {});

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const NOW = 1_800_000_000_000; // fixed real epoch ms for deterministic tests

try {

console.log("Checking computeSignalState — the full pre-entry state-transition table…");
ok("no real qualifying setup (tier WAIT) -> SCANNING", () => {
  const r = computeSignalState({ tier: "WAIT", nowMs: NOW });
  assert.strictEqual(r.state, "SCANNING");
});
ok("null/DORMANT opportunityStage with no tier -> SCANNING, never a fabricated state", () => {
  const r = computeSignalState({ nowMs: NOW });
  assert.strictEqual(r.state, "SCANNING");
});
ok("tier DEVELOPING -> SETUP_FORMING", () => {
  const r = computeSignalState({ tier: "DEVELOPING", nowMs: NOW });
  assert.strictEqual(r.state, "SETUP_FORMING");
});
ok("opportunityStage EMERGING (no tier) -> SETUP_FORMING", () => {
  const r = computeSignalState({ opportunityStage: "EMERGING", nowMs: NOW });
  assert.strictEqual(r.state, "SETUP_FORMING");
});
ok("tier ACTIONABLE with a real reference entry but no executableEntry yet -> ARMED, waiting for the real trigger", () => {
  const r = computeSignalState({ tier: "ACTIONABLE", entry: 100, executableEntry: null, nowMs: NOW });
  assert.strictEqual(r.state, "ARMED");
});
ok("tier ACTIONABLE with a real executableEntry -> ENTER_NOW", () => {
  const r = computeSignalState({ tier: "ACTIONABLE", entry: 100, executableEntry: 100.5, nowMs: NOW });
  assert.strictEqual(r.state, "ENTER_NOW");
});
ok("tier INVALIDATED -> CANCELLED regardless of any other field", () => {
  const r = computeSignalState({ tier: "INVALIDATED", executableEntry: 100, nowMs: NOW });
  assert.strictEqual(r.state, "CANCELLED");
});
ok("tier EXTENDED -> CANCELLED (do-not-chase discipline, not an actionable state)", () => {
  const r = computeSignalState({ tier: "EXTENDED", nowMs: NOW });
  assert.strictEqual(r.state, "CANCELLED");
});
ok("entryStage FAILED_BREAKOUT -> CANCELLED even with an ACTIONABLE tier", () => {
  const r = computeSignalState({ tier: "ACTIONABLE", entryStage: "FAILED_BREAKOUT", entry: 100, nowMs: NOW });
  assert.strictEqual(r.state, "CANCELLED");
});
ok("entryStage STRUCTURE_BROKEN -> CANCELLED", () => {
  const r = computeSignalState({ tier: "ACTIONABLE", entryStage: "STRUCTURE_BROKEN", entry: 100, nowMs: NOW });
  assert.strictEqual(r.state, "CANCELLED");
});

console.log("\nChecking real price breaching the real invalidation level — any pre-entry state must go CANCELLED…");
ok("ARMED + current price at/through invalidation -> CANCELLED", () => {
  const r = computeSignalState({ tier: "ACTIONABLE", entry: 100, invalidation: 95, currentPrice: 94.5, nowMs: NOW });
  assert.strictEqual(r.state, "CANCELLED");
  assert.match(r.reason, /invalidation/);
});
ok("ENTER_NOW + current price at/through invalidation -> CANCELLED, invalidation always wins", () => {
  const r = computeSignalState({ tier: "ACTIONABLE", entry: 100, executableEntry: 100.2, invalidation: 95, currentPrice: 95, nowMs: NOW });
  assert.strictEqual(r.state, "CANCELLED");
});
ok("price above invalidation -> not cancelled on that basis", () => {
  const r = computeSignalState({ tier: "ACTIONABLE", entry: 100, executableEntry: 100.2, invalidation: 95, currentPrice: 99, nowMs: NOW });
  assert.strictEqual(r.state, "ENTER_NOW");
});

console.log("\nChecking signal expiration (TTL) — an expired signal can never remain actionable…");
ok("createdAtMs + ttlMs in the future -> not expired, real state unaffected", () => {
  const r = computeSignalState({ tier: "ACTIONABLE", entry: 100, executableEntry: 100.5, createdAtMs: NOW - 1000, ttlMs: 60_000, nowMs: NOW });
  assert.strictEqual(r.expired, false);
  assert.strictEqual(r.state, "ENTER_NOW");
});
ok("nowMs past createdAtMs+ttlMs -> expired AND forced to CANCELLED even with a live executableEntry", () => {
  const r = computeSignalState({ tier: "ACTIONABLE", entry: 100, executableEntry: 100.5, createdAtMs: NOW - 120_000, ttlMs: 60_000, nowMs: NOW });
  assert.strictEqual(r.expired, true);
  assert.strictEqual(r.state, "CANCELLED");
  assert.match(r.reason, /expired/);
});
ok("exact boundary: nowMs === createdAtMs+ttlMs counts as expired", () => {
  const r = computeSignalState({ tier: "ACTIONABLE", entry: 100, createdAtMs: NOW - 60_000, ttlMs: 60_000, nowMs: NOW });
  assert.strictEqual(r.expired, true);
});
ok("no createdAtMs/ttlMs supplied -> honestly not expired (never fabricates a TTL), state derives normally", () => {
  const r = computeSignalState({ tier: "WAIT", nowMs: NOW });
  assert.strictEqual(r.expired, false);
  assert.strictEqual(r.expiresAtMs, null);
});
ok("SIGNAL_TTL_DEFAULTS_MS: real disclosed defaults, option TTL shorter than stock TTL", () => {
  assert.strictEqual(SIGNAL_TTL_DEFAULTS_MS.STOCK, 30 * 60_000);
  assert.strictEqual(SIGNAL_TTL_DEFAULTS_MS.OPTION, 5 * 60_000);
  assert.ok(SIGNAL_TTL_DEFAULTS_MS.OPTION < SIGNAL_TTL_DEFAULTS_MS.STOCK);
});

console.log("\nChecking honest-null discipline…");
ok("explicitly invalid nowMs (null) -> null state, never a fabricated default (nowMs itself defaults to Date.now() when genuinely omitted, which is correct — this tests the honest-null guard for a real invalid value, not simple omission)", () => {
  const r = computeSignalState({ tier: "WAIT", nowMs: null });
  assert.strictEqual(r.state, null);
});
ok("nowMs genuinely omitted -> defaults to the real current time, state derives normally (not treated as missing data)", () => {
  const r = computeSignalState({ tier: "WAIT" });
  assert.strictEqual(r.state, "SCANNING");
});
ok("PRE_ENTRY_STATES contains exactly the spec's 5 pre-entry states", () => {
  assert.deepStrictEqual([...PRE_ENTRY_STATES].sort(), ["ARMED", "CANCELLED", "ENTER_NOW", "SCANNING", "SETUP_FORMING"]);
});

console.log("\nChecking getOrSetSignalCreatedAt — real persisted first-seen tracking…");
ok("a genuinely new symbol+state gets a real fresh createdAt of nowMs", () => {
  const t = getOrSetSignalCreatedAt("ZTEST1", "ARMED", NOW);
  assert.strictEqual(t, NOW);
});
ok("the same symbol+state observed again later keeps the ORIGINAL real createdAt, not the new call time", () => {
  getOrSetSignalCreatedAt("ZTEST2", "ARMED", NOW);
  const t2 = getOrSetSignalCreatedAt("ZTEST2", "ARMED", NOW + 60_000);
  assert.strictEqual(t2, NOW);
});
ok("the SAME symbol moving to a DIFFERENT real state resets its own createdAt — a fresh state gets a fresh TTL window", () => {
  getOrSetSignalCreatedAt("ZTEST3", "SETUP_FORMING", NOW);
  const t2 = getOrSetSignalCreatedAt("ZTEST3", "ARMED", NOW + 60_000);
  assert.strictEqual(t2, NOW + 60_000);
});
ok("missing symbol or state -> honest null, never a fabricated timestamp", () => {
  assert.strictEqual(getOrSetSignalCreatedAt(null, "ARMED", NOW), null);
  assert.strictEqual(getOrSetSignalCreatedAt("ZTEST4", null, NOW), null);
});
ok("persists to disk — a fresh read of the real store shows the same real value", () => {
  getOrSetSignalCreatedAt("ZTEST5", "ENTER_NOW", NOW);
  const stored = readJsonSafe(CREATED_AT_PATH, {});
  assert.strictEqual(stored.ZTEST5?.createdAtMs, NOW);
  assert.strictEqual(stored.ZTEST5?.state, "ENTER_NOW");
});

} finally {
  writeJsonAtomic(CREATED_AT_PATH, originalCreatedAtStore);
}

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("SIGNAL-LIFECYCLE TEST FAILED"); else console.log("SIGNAL-LIFECYCLE TEST OK");
