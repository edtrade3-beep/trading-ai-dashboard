// Real tests for src/providers/yahoo.js's sessionForBar — the pure,
// timezone-correct (America/New_York, DST-aware via Intl) PRE/REGULAR/
// POST classifier added 2026-08-31 (explicit user request: "In chart add
// pre market and aftermarket"). Pure-function, synthetic-input,
// zero-network, same discipline as this session's other engine tests.
// Run: node test/yahoo-session.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { sessionForBar } = require("../src/providers/yahoo");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking sessionForBar — real America/New_York session boundaries (EDT, summer)…");
// 2026-08-31 is EDT (UTC-4) — real August date, no DST ambiguity.
ok("9:00 AM ET -> PRE", () => {
  assert.strictEqual(sessionForBar(Date.parse("2026-08-31T13:00:00Z")), "PRE");
});
ok("9:29 AM ET -> still PRE, just before the real regular-session open", () => {
  assert.strictEqual(sessionForBar(Date.parse("2026-08-31T13:29:00Z")), "PRE");
});
ok("9:30 AM ET -> REGULAR, the exact real regular-session open boundary", () => {
  assert.strictEqual(sessionForBar(Date.parse("2026-08-31T13:30:00Z")), "REGULAR");
});
ok("12:00 PM ET (midday) -> REGULAR", () => {
  assert.strictEqual(sessionForBar(Date.parse("2026-08-31T16:00:00Z")), "REGULAR");
});
ok("3:59 PM ET -> still REGULAR, just before the real close", () => {
  assert.strictEqual(sessionForBar(Date.parse("2026-08-31T19:59:00Z")), "REGULAR");
});
ok("4:00 PM ET -> POST, the exact real regular-session close boundary", () => {
  assert.strictEqual(sessionForBar(Date.parse("2026-08-31T20:00:00Z")), "POST");
});
ok("7:00 PM ET (real after-hours) -> POST", () => {
  assert.strictEqual(sessionForBar(Date.parse("2026-08-31T23:00:00Z")), "POST");
});

console.log("\nChecking sessionForBar — real DST handling (EST, winter)…");
// 2026-01-15 is EST (UTC-5) — confirms Intl's real timezone-aware
// conversion, not a hardcoded UTC offset that would silently break every
// winter session boundary by an hour.
ok("9:30 AM ET in EST (winter) -> REGULAR, same real wall-clock boundary as summer", () => {
  assert.strictEqual(sessionForBar(Date.parse("2026-01-15T14:30:00Z")), "REGULAR");
});
ok("4:00 PM ET in EST (winter) -> POST", () => {
  assert.strictEqual(sessionForBar(Date.parse("2026-01-15T21:00:00Z")), "POST");
});
ok("9:00 AM ET in EST (winter) -> PRE", () => {
  assert.strictEqual(sessionForBar(Date.parse("2026-01-15T14:00:00Z")), "PRE");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("YAHOO-SESSION TEST FAILED"); else console.log("YAHOO-SESSION TEST OK");
