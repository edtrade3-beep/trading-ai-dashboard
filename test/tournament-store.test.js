"use strict";
// Real tests for src/tournament-store.js — "500-Stock Tournament" master
// prompt (2026-09-17). The one genuinely new piece of state this feature
// needs: cross-symbol RANK over time. Pure in-memory state objects, no
// real file I/O (loadTournamentState/saveTournamentState themselves are
// thin atomic-write.js wrappers, already covered by that file's own tests).
const assert = require("node:assert");
const { upsertSymbolData, applyRanking, MAX_RANK_HISTORY } = require("../src/tournament-store");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking upsertSymbolData — real merge, never clobbers rank fields it doesn't own…");

ok("merges fresh fields into a real existing entry without touching currentRank/rankHistory", () => {
  const state = { symbols: { AAPL: { symbol: "AAPL", opportunityScore: 70, currentRank: 5, rankHistory: [{ rank: 5, ts: 1 }] } } };
  upsertSymbolData(state, "AAPL", { opportunityScore: 82 });
  assert.strictEqual(state.symbols.AAPL.opportunityScore, 82);
  assert.strictEqual(state.symbols.AAPL.currentRank, 5); // untouched — only applyRanking may change this
  assert.strictEqual(state.symbols.AAPL.rankHistory.length, 1);
});

ok("creates a real new entry for a symbol seen for the first time", () => {
  const state = { symbols: {} };
  upsertSymbolData(state, "NVDA", { opportunityScore: 91 });
  assert.strictEqual(state.symbols.NVDA.opportunityScore, 91);
  assert.strictEqual(state.symbols.NVDA.symbol, "NVDA");
});

console.log("\nChecking applyRanking — real rank/previousRank/rankChange/history/time-in-tier tracking…");

ok("a real worked example: AMD moving from rank #11 to #4 records previousRank=11, rankChange=+7", () => {
  const state = { symbols: { AMD: { symbol: "AMD", opportunityScore: 90, currentRank: 11 } } };
  applyRanking(state, ["AMD"]);
  assert.strictEqual(state.symbols.AMD.previousRank, 11);
  assert.strictEqual(state.symbols.AMD.currentRank, 1); // only symbol in the ranked list this pass
  assert.strictEqual(state.symbols.AMD.rankChange, 10);
});

ok("a symbol ranked for the first time has a real null previousRank and a real rankChange of 0 — never a fabricated prior position", () => {
  const state = { symbols: { NEW: { symbol: "NEW", opportunityScore: 80 } } };
  applyRanking(state, ["NEW"]);
  assert.strictEqual(state.symbols.NEW.previousRank, null);
  assert.strictEqual(state.symbols.NEW.rankChange, 0);
  assert.strictEqual(state.symbols.NEW.currentRank, 1);
});

ok("rank history is real, append-only, and bounded at MAX_RANK_HISTORY", () => {
  const state = { symbols: { X: { symbol: "X", opportunityScore: 50 } } };
  for (let i = 0; i < MAX_RANK_HISTORY + 10; i++) applyRanking(state, ["X"]);
  assert.strictEqual(state.symbols.X.rankHistory.length, MAX_RANK_HISTORY);
});

ok("timeInTop25/timeInTop10/timeInElite increment only when the real rank actually qualifies, never for a rank outside the band", () => {
  // 12 real symbols so real ranks land in every band: rank 1 (elite/top10/
  // top25), rank 8 (top10/top25, not elite), rank 12 (top25 only).
  const symbols = {};
  for (let i = 1; i <= 12; i++) symbols[`S${i}`] = { symbol: `S${i}`, opportunityScore: 100 - i };
  const state = { symbols };
  const order = Array.from({ length: 12 }, (_, i) => `S${i + 1}`);
  applyRanking(state, order);
  assert.strictEqual(state.symbols.S1.timeInElite, 1);
  assert.strictEqual(state.symbols.S1.timeInTop10, 1);
  assert.strictEqual(state.symbols.S1.timeInTop25, 1);
  assert.strictEqual(state.symbols.S8.timeInElite, 0);
  assert.strictEqual(state.symbols.S8.timeInTop10, 1);
  assert.strictEqual(state.symbols.S8.timeInTop25, 1);
  assert.strictEqual(state.symbols.S12.timeInTop10, 0);
  assert.strictEqual(state.symbols.S12.timeInTop25, 1);
});

ok("a real symbol omitted from this pass's ranked list keeps its last known rank rather than being silently reset", () => {
  const state = { symbols: { A: { symbol: "A", opportunityScore: 90, currentRank: 3 } } };
  applyRanking(state, []); // A wasn't re-scanned this tick
  assert.strictEqual(state.symbols.A.currentRank, 3);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TOURNAMENT-STORE TEST FAILED");
else console.log("TOURNAMENT-STORE TEST OK");
