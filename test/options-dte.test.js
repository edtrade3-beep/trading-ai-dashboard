"use strict";
// options-dte.test.js — real America/New_York calendar-date DTE
// calculation (2026-09-14, "Safe Options Expiration Selection" task).
// Confirms dteFromExpiry() uses real ET calendar dates, not UTC calendar
// boundaries — the earlier "Options Expiration/DTE Safety" audit found
// the prior UTC-boundary version could misread a real "tomorrow ET"
// expiry as DTE 0 whenever UTC had already rolled to the next calendar
// day while the US market was still on the prior ET date.
const assert = require("node:assert");
const { dteFromExpiry, etDateStr } = require("../src/options-math");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

// Real, deterministic system-clock override — same convention this
// session's other timing tests use (no hard-coded offset math; Intl
// resolves the real America/New_York calendar date for whatever instant
// Date.now() reports).
const RealDate = global.Date;
function withFakeNow(isoInstant, fn) {
  class FakeDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(isoInstant); else super(...args); }
    static now() { return new RealDate(isoInstant).getTime(); }
  }
  global.Date = FakeDate;
  try { fn(); } finally { global.Date = RealDate; }
}

console.log("Checking dteFromExpiry — real America/New_York calendar-date DTE…");

ok("TEST 1 — 8:36 PM ET (= 00:36 UTC the next day) with expiry the real next ET calendar day -> DTE 1, not 0", () => {
  // 2026-09-13 20:36 America/New_York (EDT, UTC-4) = 2026-09-14T00:36:00Z.
  withFakeNow("2026-09-14T00:36:00.000Z", () => {
    assert.strictEqual(etDateStr(), "2026-09-13", "real ET calendar date must still read the 13th even though UTC has rolled to the 14th");
    assert.strictEqual(dteFromExpiry("2026-09-14"), 1, "a real next-ET-day expiry must read DTE 1, not 0 — the exact bug this fix closes");
  });
});

ok("TEST 2 — normal ET daytime calculation remains correct (no UTC/ET boundary involved)", () => {
  // 2026-09-13 14:00 America/New_York (EDT) = 2026-09-13T18:00:00Z.
  withFakeNow("2026-09-13T18:00:00.000Z", () => {
    assert.strictEqual(etDateStr(), "2026-09-13");
    assert.strictEqual(dteFromExpiry("2026-09-13"), 0, "same real ET calendar day -> DTE 0");
    assert.strictEqual(dteFromExpiry("2026-09-20"), 7, "a real 7-real-calendar-day-out expiry reads DTE 7");
  });
});

ok("TEST 3 — DST-safe: winter (EST, UTC-5) boundary computed the same real way, no hard-coded offset", () => {
  // 2026-01-13 20:36 America/New_York (EST, UTC-5) = 2026-01-14T01:36:00Z.
  withFakeNow("2026-01-14T01:36:00.000Z", () => {
    assert.strictEqual(etDateStr(), "2026-01-13", "Intl resolves the real EST offset automatically — no manual -4/-5 branching in this code");
    assert.strictEqual(dteFromExpiry("2026-01-14"), 1);
  });
});

ok("real, non-boundary sanity check: a 26-real-calendar-day-out expiry (the exact value captured live for AMD/NVDA/TSLA/SPY) reads DTE 26", () => {
  withFakeNow("2026-09-13T18:00:00.000Z", () => {
    assert.strictEqual(dteFromExpiry("2026-10-09"), 26);
  });
});

ok("unparseable expiry -> honest null, never a guessed number", () => {
  assert.strictEqual(dteFromExpiry("not-a-real-date"), null);
});

ok("a real past expiry floors at 0, never a negative fabricated DTE", () => {
  withFakeNow("2026-09-13T18:00:00.000Z", () => {
    assert.strictEqual(dteFromExpiry("2020-01-01"), 0);
  });
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("OPTIONS-DTE TEST FAILED"); else console.log("OPTIONS-DTE TEST OK");
