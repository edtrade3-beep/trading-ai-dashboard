// Real tests for src/learning-engine.js — the rankings feedback loop both
// autopilot buy loops (server-autopilot.js, client AutoPilotEngine.jsx) read
// before opening new positions. Calls the actual exported computeLearningGates
// (which itself calls the real tierStats/sectorPerformance, not a reimplemented
// copy), with a fixture journal injected via the journalOverride param so no
// real file is touched. Same minimal style as test/risk-guardrails.test.js —
// no test framework, no new dependency. Run: node test/learning-engine.test.js
// (or npm test, which runs this alongside the others).
const assert = require("node:assert");
const { computeLearningGates, isAllowed, MIN_SAMPLE_TIER, MIN_SAMPLE_SECTOR, CUT_AVG_R, CUT_WIN_RATE } = require("../src/learning-engine");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

// Builds N real round-trip closed trades + their matching setup-tagged journal
// entries for one tier/sector, all at a fixed entry=100/stop=95 (risk=5/share)
// so pnl maps to a clean, predictable R (pnl ÷ (risk × qty)).
function buildTrades(n, { tier, sector, pnl, symbolPrefix = "SYM" }) {
  const trades = [], journal = [];
  for (let i = 0; i < n; i++) {
    const symbol = `${symbolPrefix}${i}`;
    const openedAt = new Date(2026, 0, 1 + i, 9).toISOString();
    const closedAt = new Date(2026, 0, 1 + i, 15).toISOString();
    trades.push({ symbol, side: "long", qty: 10, entry: 100, exit: 100 + pnl / 10, pnl, openedAt, closedAt });
    journal.push({ ts: new Date(openedAt).getTime(), symbol, tier, sector, entry: 100, stop: 95, qty: 10, side: "long" });
  }
  return { trades, journal };
}

console.log("computeLearningGates — tier gates…");
ok("below MIN_SAMPLE_TIER stays honest-open even with a losing edge", () => {
  const { trades, journal } = buildTrades(MIN_SAMPLE_TIER - 1, { tier: "X", sector: "Tech", pnl: -25 });
  const { tierGates } = computeLearningGates(trades, journal);
  assert.strictEqual(tierGates.X.allowed, true);
  assert.ok(tierGates.X.reason.includes("building sample"));
});
ok("real clear losing edge (avgR < CUT_AVG_R) at/above sample floor pauses the tier", () => {
  const { trades, journal } = buildTrades(MIN_SAMPLE_TIER, { tier: "X", sector: "Tech", pnl: -25 }); // R = -25/(5*10) = -0.5
  const { tierGates } = computeLearningGates(trades, journal);
  assert.strictEqual(tierGates.X.n, MIN_SAMPLE_TIER);
  assert.strictEqual(tierGates.X.avgR, -0.5);
  assert.ok(tierGates.X.avgR < CUT_AVG_R);
  assert.strictEqual(tierGates.X.allowed, false);
  assert.ok(tierGates.X.reason.includes("paused"));
});
ok("real breakeven edge at/above sample floor stays allowed (never cuts on noise)", () => {
  // Even count of alternating winners/losers so avgR nets to exactly 0 — a
  // real, sampled, non-losing edge.
  const n = MIN_SAMPLE_TIER % 2 === 0 ? MIN_SAMPLE_TIER : MIN_SAMPLE_TIER + 1;
  const trades = [], journal = [];
  for (let i = 0; i < n; i++) {
    const pnl = i % 2 === 0 ? 50 : -50; // R = +1.0 / -1.0 alternating → avg 0
    const { trades: t, journal: j } = buildTrades(1, { tier: "Y", sector: "Tech", pnl, symbolPrefix: `BE${i}` });
    trades.push(...t); journal.push(...j);
  }
  const { tierGates } = computeLearningGates(trades, journal);
  assert.strictEqual(tierGates.Y.n, n);
  assert.ok(tierGates.Y.n >= MIN_SAMPLE_TIER);
  assert.strictEqual(tierGates.Y.avgR, 0);
  assert.strictEqual(tierGates.Y.allowed, true);
});
ok("a real winning edge never gets boosted, only ever left allowed", () => {
  const { trades, journal } = buildTrades(MIN_SAMPLE_TIER, { tier: "Z", sector: "Tech", pnl: 100 }); // R = +2.0
  const { tierGates } = computeLearningGates(trades, journal);
  assert.strictEqual(tierGates.Z.allowed, true);
  assert.strictEqual(typeof tierGates.Z.allowed, "boolean"); // no separate "boosted" state exists
});
ok("isAllowed() treats a tier with no real sample yet as open", () => {
  assert.strictEqual(isAllowed(undefined), true);
  assert.strictEqual(isAllowed(null), true);
});

console.log("computeLearningGates — sector gates…");
ok("below MIN_SAMPLE_SECTOR excluded from real cutting even with 0% win rate", () => {
  const { trades, journal } = buildTrades(MIN_SAMPLE_SECTOR - 2, { tier: "A", sector: "Energy", pnl: -10, symbolPrefix: "EN" });
  const { sectorGates } = computeLearningGates(trades, journal);
  // sectorPerformance's own lower display floor (5) may or may not include this
  // bucket, but the live-gating floor (MIN_SAMPLE_SECTOR) must never pause it.
  if (sectorGates.Energy) assert.strictEqual(sectorGates.Energy.allowed, true);
});
ok("real clearly-losing sector win rate at/above sample floor pauses the sector", () => {
  const { trades, journal } = buildTrades(MIN_SAMPLE_SECTOR, { tier: "A", sector: "Energy", pnl: -10, symbolPrefix: "EN" });
  const { sectorGates } = computeLearningGates(trades, journal);
  assert.strictEqual(sectorGates.Energy.n, MIN_SAMPLE_SECTOR);
  assert.strictEqual(sectorGates.Energy.winRate, 0);
  assert.ok(sectorGates.Energy.winRate < CUT_WIN_RATE);
  assert.strictEqual(sectorGates.Energy.allowed, false);
});
ok("real healthy sector win rate at/above sample floor stays allowed", () => {
  const { trades, journal } = buildTrades(MIN_SAMPLE_SECTOR, { tier: "A", sector: "Healthcare", pnl: 20, symbolPrefix: "HC" });
  const { sectorGates } = computeLearningGates(trades, journal);
  assert.strictEqual(sectorGates.Healthcare.winRate, 100);
  assert.strictEqual(sectorGates.Healthcare.allowed, true);
});

console.log("computeLearningGates — untagged/empty input…");
ok("no closed trades yields no gates at all (nothing to honestly report)", () => {
  const { tierGates, sectorGates } = computeLearningGates([], []);
  assert.deepStrictEqual(tierGates, {});
  assert.deepStrictEqual(sectorGates, {});
});
ok("closed trades with no matching journal entry bucket honestly under '?' rather than crashing", () => {
  const trades = [{ symbol: "UNTAGGED", side: "long", qty: 5, entry: 50, exit: 55, pnl: 25, openedAt: "2026-01-01T09:00:00Z", closedAt: "2026-01-01T15:00:00Z" }];
  const { tierGates } = computeLearningGates(trades, []);
  assert.ok(tierGates["?"]);
  assert.strictEqual(tierGates["?"].n, 1);
});

console.log(`\n${passed} checks passed.`);
console.log("LEARNING-ENGINE TEST OK");
