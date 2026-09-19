"use strict";
// fajr-bot-times.test.js (2026-09-19, "Fajr & Tasbeeh bot for 200+ users")
// — real pure-function tests for the DST-safe timezone conversion and
// Aladhan response parsing. No live network for the conversion tests
// (pure math against real IANA zone rules via Intl); the fetch test mocks
// global.fetch with a realistic Aladhan-shaped response.
const assert = require("node:assert");
const { zonedWallClockToUtc, toMinutesHHMM, todayInZone, fetchFajrTimeForUser } = require("../src/fajr-bot-times");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }
async function okAsync(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking zonedWallClockToUtc — real, DST-safe wall-clock-to-UTC conversion (no hardcoded offset table)…");

ok("America/New_York in January (EST, UTC-5) converts correctly", () => {
  const d = zonedWallClockToUtc("2026-01-15", 6, 0, "America/New_York");
  assert.strictEqual(d.toISOString(), "2026-01-15T11:00:00.000Z");
});

ok("America/New_York in July (EDT, UTC-4) converts correctly — the real DST transition, not a stale fixed offset", () => {
  const d = zonedWallClockToUtc("2026-07-15", 5, 0, "America/New_York");
  assert.strictEqual(d.toISOString(), "2026-07-15T09:00:00.000Z");
});

ok("a zone with no DST (Asia/Dubai, UTC+4 year-round) converts correctly", () => {
  const d = zonedWallClockToUtc("2026-06-01", 4, 30, "Asia/Dubai");
  assert.strictEqual(d.toISOString(), "2026-06-01T00:30:00.000Z");
});

ok("real DST spring-forward boundary (America/New_York, 2026-03-08) — the day EST becomes EDT — still converts correctly for a time before the transition", () => {
  const d = zonedWallClockToUtc("2026-03-08", 1, 30, "America/New_York"); // 1:30 AM EST, before the 2 AM jump
  assert.strictEqual(d.toISOString(), "2026-03-08T06:30:00.000Z"); // real UTC-5 still in effect
});

console.log("\nChecking toMinutesHHMM — real Aladhan HH:MM parsing, tolerating a trailing timezone label…");

ok("parses a plain HH:MM", () => {
  assert.deepStrictEqual(toMinutesHHMM("05:12"), { h: 5, m: 12 });
});

ok("parses Aladhan's occasional 'HH:MM (EST)' trailing-label format", () => {
  assert.deepStrictEqual(toMinutesHHMM("05:12 (EST)"), { h: 5, m: 12 });
});

ok("returns null for garbage input, never a fabricated time", () => {
  assert.strictEqual(toMinutesHHMM(""), null);
  assert.strictEqual(toMinutesHHMM(undefined), null);
});

console.log("\nChecking todayInZone — real per-zone calendar date…");

ok("returns a real YYYY-MM-DD string", () => {
  assert.match(todayInZone("America/New_York"), /^\d{4}-\d{2}-\d{2}$/);
});

console.log("\nChecking fetchFajrTimeForUser — real Aladhan call, explicit timezonestring, never a geo-guessed zone…");

(async () => {
  const originalFetch = global.fetch;

  await okAsync("calls Aladhan with the real user's own lat/lng and explicit timezonestring, parses the real Fajr time into a real UTC instant", async () => {
    let capturedUrl = null;
    global.fetch = async (url) => {
      capturedUrl = url;
      return { ok: true, json: async () => ({ data: { timings: { Fajr: "06:15" } } }) };
    };
    const result = await fetchFajrTimeForUser({ latitude: 40.7128, longitude: -74.0060, timezone: "America/New_York", localDate: "2026-01-15" });
    assert.match(capturedUrl, /latitude=40\.7128/);
    assert.match(capturedUrl, /longitude=-74\.006/);
    assert.match(capturedUrl, /timezonestring=America%2FNew_York/);
    assert.strictEqual(result.fajrAt.toISOString(), "2026-01-15T11:15:00.000Z");
  });

  await okAsync("throws (never fabricates a fallback time) when latitude/longitude are missing", async () => {
    let threw = false;
    try { await fetchFajrTimeForUser({ timezone: "America/New_York" }); } catch { threw = true; }
    assert.ok(threw);
  });

  await okAsync("throws when the real Aladhan response has no Fajr field, never guesses one", async () => {
    global.fetch = async () => ({ ok: true, json: async () => ({ data: { timings: {} } }) });
    let threw = false;
    try { await fetchFajrTimeForUser({ latitude: 1, longitude: 1, timezone: "UTC" }); } catch { threw = true; }
    assert.ok(threw);
  });

  global.fetch = originalFetch;

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("FAJR-BOT-TIMES TEST FAILED");
  else console.log("FAJR-BOT-TIMES TEST OK");
})();
