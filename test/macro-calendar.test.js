// Real tests for src/macro-calendar.js — Trade GPS's static, clearly
// labeled macro-event seed reader (2026-09-03 spec). No live provider
// exists in this repo; this must never fabricate a date. Run:
// node test/macro-calendar.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { getUpcomingMacroEvents, SEED_PATH } = require("../src/macro-calendar");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

// Snapshot-reset-restore pattern, matching test/signal-lifecycle.test.js's
// own convention for a real persisted file this test must not permanently
// mutate.
const original = fs.readFileSync(SEED_PATH, "utf8");
function writeSeed(events) {
  fs.writeFileSync(SEED_PATH, JSON.stringify({ _disclosure: "test fixture", events }, null, 2));
}
function restore() { fs.writeFileSync(SEED_PATH, original); }

try {
  console.log("Checking getUpcomingMacroEvents — real static seed, never fabricated…");

  ok("the shipped real seed starts empty -> zero fabricated events, ever", () => {
    restore();
    const parsed = JSON.parse(original);
    assert.deepStrictEqual(parsed.events, [], "the git-tracked seed must ship empty, not pre-populated with invented dates");
  });

  ok("an event inside the real window is returned", () => {
    const now = Date.parse("2026-09-10T12:00:00Z");
    writeSeed([{ type: "CPI", atMs: now + 3600_000, label: "CPI Release" }]);
    const r = getUpcomingMacroEvents({ nowMs: now, windowHours: 48 });
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].type, "CPI");
  });

  ok("an event outside the real window is excluded", () => {
    const now = Date.parse("2026-09-10T12:00:00Z");
    writeSeed([{ type: "FOMC", atMs: now + 200 * 3600_000, label: "FOMC Decision" }]);
    const r = getUpcomingMacroEvents({ nowMs: now, windowHours: 48 });
    assert.strictEqual(r.length, 0);
  });

  ok("a past real event is excluded, never returned as upcoming", () => {
    const now = Date.parse("2026-09-10T12:00:00Z");
    writeSeed([{ type: "CPI", atMs: now - 3600_000 }]);
    const r = getUpcomingMacroEvents({ nowMs: now, windowHours: 48 });
    assert.strictEqual(r.length, 0);
  });

  ok("an unrecognized type is dropped, never coerced", () => {
    const now = Date.parse("2026-09-10T12:00:00Z");
    writeSeed([{ type: "JOBS_REPORT", atMs: now + 3600_000 }]);
    const r = getUpcomingMacroEvents({ nowMs: now, windowHours: 48 });
    assert.strictEqual(r.length, 0);
  });

  ok("a non-finite atMs is dropped, never coerced", () => {
    const now = Date.parse("2026-09-10T12:00:00Z");
    writeSeed([{ type: "CPI", atMs: "soon" }]);
    const r = getUpcomingMacroEvents({ nowMs: now, windowHours: 48 });
    assert.strictEqual(r.length, 0);
  });

  ok("multiple real events are sorted ascending by real time", () => {
    const now = Date.parse("2026-09-10T12:00:00Z");
    writeSeed([
      { type: "FOMC", atMs: now + 40 * 3600_000, label: "Later" },
      { type: "CPI", atMs: now + 2 * 3600_000, label: "Sooner" },
    ]);
    const r = getUpcomingMacroEvents({ nowMs: now, windowHours: 48 });
    assert.strictEqual(r.length, 2);
    assert.strictEqual(r[0].label, "Sooner");
    assert.strictEqual(r[1].label, "Later");
  });

  ok("a real label defaults to the event type when missing", () => {
    const now = Date.parse("2026-09-10T12:00:00Z");
    writeSeed([{ type: "FED_SPEAKER", atMs: now + 3600_000 }]);
    const r = getUpcomingMacroEvents({ nowMs: now, windowHours: 48 });
    assert.strictEqual(r[0].label, "FED_SPEAKER");
  });

  ok("an unreadable/corrupt real seed fails closed to an empty list, never throws", () => {
    fs.writeFileSync(SEED_PATH, "{not valid json");
    const r = getUpcomingMacroEvents({ nowMs: Date.now(), windowHours: 48 });
    assert.deepStrictEqual(r, []);
  });
} finally {
  restore();
}

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("MACRO-CALENDAR TEST FAILED"); else console.log("MACRO-CALENDAR TEST OK");
