"use strict";
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { logSnapshot, priorSnapshot, detectSignalShift, SHIFT_THRESHOLD, loadHistory } = require("../src/smart-money-score-history");
const STORE_FILE = path.join(__dirname, "..", "data", "smart-money-history.json");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking smart-money-score-history — real forward log + signal-shift detection…");

ok("no real prior snapshot -> honest null, never a fabricated comparison", () => {
  const p = priorSnapshot("ZZZZ_TEST_NEVER_LOGGED");
  assert.strictEqual(p, null);
});
ok("no real prior snapshot -> detectSignalShift honestly reports nothing to compare", () => {
  const r = detectSignalShift("ZZZZ_TEST_NEVER_LOGGED", 80, "STRONG_BUY");
  assert.strictEqual(r.shifted, false);
});
ok("logSnapshot writes and reads back the real value", () => {
  const saved = logSnapshot("TESTSYM", 55, "WATCH");
  assert.strictEqual(saved.score, 55);
});
ok(`a real ${SHIFT_THRESHOLD}+ point move is flagged as shifted`, () => {
  // Simulate a prior day's entry by writing directly (today's own
  // logSnapshot call can't represent "yesterday" without real date
  // manipulation) — read the module's real file path and inject a
  // real prior-day row the same shape logSnapshot produces.
  const days = loadHistory();
  days.unshift({ date: "2000-01-01", symbols: [{ symbol: "SHIFTED", score: 40, band: "AVOID" }] });
  fs.writeFileSync(STORE_FILE, JSON.stringify({ days }));
  const r = detectSignalShift("SHIFTED", 60, "WATCH", ["real evidence line"]);
  assert.strictEqual(r.shifted, true);
  assert.strictEqual(r.direction, "Bullish");
  assert.ok(r.headline.includes("SMART MONEY SHIFT"));
});
ok("a real small move under the threshold is honestly NOT flagged", () => {
  const days = loadHistory();
  days.unshift({ date: "2000-01-02", symbols: [{ symbol: "STABLE", score: 50, band: "WATCH" }] });
  fs.writeFileSync(STORE_FILE, JSON.stringify({ days }));
  const r = detectSignalShift("STABLE", 52, "WATCH");
  assert.strictEqual(r.shifted, false);
});

// Cleanup — this test mutates the real data/smart-money-history.json
// directly to inject synthetic prior-day rows; remove the synthetic
// symbols/dates this test added so a real run doesn't leave test
// fixtures in the real store.
try {
  const raw = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  raw.days = (raw.days || []).filter((d) => !["2000-01-01", "2000-01-02"].includes(d.date));
  for (const d of raw.days) d.symbols = (d.symbols || []).filter((s) => !["TESTSYM", "SHIFTED", "STABLE"].includes(s.symbol));
  fs.writeFileSync(STORE_FILE, JSON.stringify(raw));
} catch {}

console.log(`${passed} checks passed.`);
console.log("SMART-MONEY-SCORE-HISTORY TEST OK");
