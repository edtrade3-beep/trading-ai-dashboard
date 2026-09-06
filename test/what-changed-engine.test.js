// Real tests for the global What-Changed engine (src/what-changed-engine.js,
// src/what-changed-store.js) — platform-consolidation Part 7, 2026-09-06.
// Same minimal no-framework style as test/news-divergence.test.js. Store
// tests use the module's own real store (data/what-changed.json) via its
// own exported loadStore/saveStore, same snapshot-reset-restore discipline
// as test/opportunity-timeline-store.test.js.
"use strict";
const assert = require("node:assert");
const { buildGlobalSnapshot, diffGlobalSnapshots } = require("../src/what-changed-engine");
const { recordAndDiff, getLastWhatChanged, loadStore, saveStore } = require("../src/what-changed-store");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking buildGlobalSnapshot — real, honest snapshot assembly, never fabricated…");

ok("all-null inputs produce an honest all-null snapshot, never a fabricated read", () => {
  const s = buildGlobalSnapshot({});
  assert.strictEqual(s.regimeScore, null);
  assert.strictEqual(s.vix, null);
  assert.strictEqual(s.dataHealthStatus, null);
  assert.strictEqual(s.newsTrend, null);
  assert.deepStrictEqual(s.candidates, {});
});

ok("a real marketRegime populates regime/VIX fields", () => {
  const s = buildGlobalSnapshot({ marketRegime: { score: 62, regime: "RISK_ON", volatility: { level: 15.8, state: "NORMAL" } } });
  assert.strictEqual(s.regimeScore, 62);
  assert.strictEqual(s.regimeLabel, "RISK_ON");
  assert.strictEqual(s.vix, 15.8);
  assert.strictEqual(s.vixState, "NORMAL");
});

ok("dataHealth.canTrade:false reports BLOCKED, canTrade:true (or absent) reports OK", () => {
  assert.strictEqual(buildGlobalSnapshot({ dataHealth: { canTrade: false } }).dataHealthStatus, "BLOCKED");
  assert.strictEqual(buildGlobalSnapshot({ dataHealth: { canTrade: true } }).dataHealthStatus, "OK");
});

ok("tiers rows with a real verdict/stage are tracked as candidates; rows without either are skipped", () => {
  const tiers = {
    ACTIONABLE: [{ symbol: "DELL", assetDecision: { verdict: "BUY", opportunityStage: "CONFIRMED" } }],
    WAIT: [{ symbol: "TSLA", assetDecision: { verdict: "WAIT", opportunityStage: null } }, { symbol: "NOISE", assetDecision: {} }],
  };
  const s = buildGlobalSnapshot({ tiers });
  assert.deepStrictEqual(s.candidates.DELL, { verdict: "BUY", stage: "CONFIRMED" });
  assert.deepStrictEqual(s.candidates.TSLA, { verdict: "WAIT", stage: null });
  assert.ok(!("NOISE" in s.candidates));
});

ok("a real MARKET news aggregation with articles reports its trend; an ok read with zero articles is NO_MATERIAL_NEWS, not null", () => {
  const withNews = buildGlobalSnapshot({ newsAggregation: { ok: true, articleCount: 4, trend: "BULLISH", bullish: 3, bearish: 1 } });
  assert.strictEqual(withNews.newsTrend, "BULLISH");
  assert.strictEqual(withNews.newsBullish, 3);
  const noNews = buildGlobalSnapshot({ newsAggregation: { ok: true, articleCount: 0 } });
  assert.strictEqual(noNews.newsTrend, "NO_MATERIAL_NEWS");
  const degraded = buildGlobalSnapshot({ newsAggregation: { ok: false, reason: "DEGRADED" } });
  assert.strictEqual(degraded.newsTrend, null);
});

console.log("\nChecking diffGlobalSnapshots — real material-change diff, honest nulls, capped/sorted transitions…");

ok("missing prev or current is an honest null diff, never a fabricated comparison", () => {
  assert.strictEqual(diffGlobalSnapshots(null, { regimeScore: 50 }), null);
  assert.strictEqual(diffGlobalSnapshots({ regimeScore: 50 }, null), null);
});

ok("identical snapshots produce zero changes", () => {
  const s = buildGlobalSnapshot({ marketRegime: { score: 60, regime: "NEUTRAL", volatility: { level: 16, state: "NORMAL" } } });
  const d = diffGlobalSnapshots(s, s);
  assert.deepStrictEqual(d.changes, []);
  assert.strictEqual(d.hasChanges, false);
});

ok("a regime label flip is reported even with a small score move", () => {
  const prev = { regimeScore: 54, regimeLabel: "NEUTRAL", candidates: {} };
  const current = { regimeScore: 56, regimeLabel: "SELECTIVE_RISK_ON", candidates: {} };
  const d = diffGlobalSnapshots(prev, current);
  assert.ok(d.changes.some((c) => c.kind === "regime" && c.to.startsWith("SELECTIVE_RISK_ON")));
});

ok("a regime score move below the real threshold with the same label is NOT reported", () => {
  const prev = { regimeScore: 54, regimeLabel: "NEUTRAL", candidates: {} };
  const current = { regimeScore: 57, regimeLabel: "NEUTRAL", candidates: {} };
  const d = diffGlobalSnapshots(prev, current);
  assert.ok(!d.changes.some((c) => c.kind === "regime"));
});

ok("a VIX move at/above the real threshold is reported; below it is not", () => {
  const base = { candidates: {} };
  const big = diffGlobalSnapshots({ ...base, vix: 15.8 }, { ...base, vix: 17.0 });
  assert.ok(big.changes.some((c) => c.kind === "vix" && c.from === "15.8" && c.to === "17.0"));
  const small = diffGlobalSnapshots({ ...base, vix: 15.8 }, { ...base, vix: 16.3 });
  assert.ok(!small.changes.some((c) => c.kind === "vix"));
});

ok("a data-health status flip is reported", () => {
  const d = diffGlobalSnapshots({ dataHealthStatus: "OK", candidates: {} }, { dataHealthStatus: "BLOCKED", candidates: {} });
  assert.ok(d.changes.some((c) => c.kind === "dataHealth" && c.from === "OK" && c.to === "BLOCKED"));
});

ok("a news sentiment trend flip is reported", () => {
  const d = diffGlobalSnapshots({ newsTrend: "MIXED", candidates: {} }, { newsTrend: "BULLISH", candidates: {} });
  assert.ok(d.changes.some((c) => c.kind === "news" && c.to === "BULLISH"));
});

ok("a real candidate verdict transition on a symbol tracked in both snapshots is reported (DELL: WATCH -> READY style)", () => {
  const prev = { candidates: { DELL: { verdict: "WATCH", stage: "DEVELOPING" } } };
  const current = { candidates: { DELL: { verdict: "BUY", stage: "CONFIRMED" } } };
  const d = diffGlobalSnapshots(prev, current);
  assert.strictEqual(d.candidateTransitions.length, 1);
  assert.deepStrictEqual(d.candidateTransitions[0], { symbol: "DELL", from: "WATCH", to: "BUY", kind: "transition" });
});

ok("a symbol newly entering or leaving the tracked set is NOT reported as a transition — only real before/after changes on a tracked symbol are", () => {
  const prev = { candidates: { AAPL: { verdict: "BUY", stage: "CONFIRMED" } } };
  const current = { candidates: { AAPL: { verdict: "BUY", stage: "CONFIRMED" }, MSFT: { verdict: "WATCH", stage: "DEVELOPING" } } };
  const d = diffGlobalSnapshots(prev, current);
  assert.deepStrictEqual(d.candidateTransitions, []);
});

ok("candidate transitions are capped and upgrades (higher-actionable-rank `to`) sort first", () => {
  const prev = { candidates: {} };
  const current = { candidates: {} };
  const symbols = [];
  for (let i = 0; i < 15; i++) {
    const sym = `SYM${i}`;
    symbols.push(sym);
    prev.candidates[sym] = { verdict: "WATCH", stage: null };
    current.candidates[sym] = { verdict: i === 14 ? "STRONG_BUY" : "AVOID", stage: null };
  }
  const d = diffGlobalSnapshots(prev, current);
  assert.strictEqual(d.candidateTransitions.length, 12, "must stay capped at MAX_CANDIDATE_TRANSITIONS");
  assert.strictEqual(d.truncated, true);
  assert.strictEqual(d.candidateTransitions[0].to, "STRONG_BUY", "the one real upgrade must sort to the top even when capped");
});

console.log("\nChecking what-changed-store — real day-scoped persistence, honest nulls until real data exists…");

const originalStore = loadStore();
saveStore({ date: originalStore.date, openSnapshot: null, openAt: null, lastSnapshot: null, lastAt: null, lastResult: null });

try {
  ok("no real snapshot recorded yet -> getLastWhatChanged is an honest null", () => {
    assert.strictEqual(getLastWhatChanged(), null);
  });

  ok("the first real snapshot of the day sets the open baseline and has honest null diffs (nothing to compare against yet)", () => {
    const r = recordAndDiff({ regimeScore: 60, regimeLabel: "NEUTRAL", vix: 16, candidates: {} });
    assert.strictEqual(r.sinceOpen, null);
    assert.strictEqual(r.sinceLastRefresh, null);
    assert.ok(Number.isFinite(r.sinceOpenAt));
  });

  ok("a second real snapshot diffs against both the open baseline and the immediately-prior snapshot", () => {
    const r = recordAndDiff({ regimeScore: 60, regimeLabel: "RISK_ON", vix: 17.5, candidates: {} });
    assert.ok(r.sinceOpen && r.sinceOpen.changes.some((c) => c.kind === "regime"));
    assert.ok(r.sinceLastRefresh && r.sinceLastRefresh.changes.some((c) => c.kind === "vix"));
  });

  ok("getLastWhatChanged returns the persisted result of the most recent real call, without recomputing", () => {
    const stored = getLastWhatChanged();
    assert.ok(stored.sinceLastRefresh.changes.some((c) => c.kind === "vix"));
  });

  ok("a real day rollover discards the open baseline, so a new day starts with an honest fresh comparison", () => {
    const store = loadStore();
    saveStore({ ...store, date: "2020-01-01" });
    const r = recordAndDiff({ regimeScore: 60, regimeLabel: "NEUTRAL", vix: 16, candidates: {} });
    assert.strictEqual(r.sinceOpen, null, "yesterday's real open snapshot must not bleed into today's honest comparison");
  });
} finally {
  // Always restore the real store, even if an assertion above threw.
  saveStore(originalStore);
}

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("WHAT-CHANGED-ENGINE TEST FAILED");
else console.log("WHAT-CHANGED-ENGINE TEST OK");
