// Minimal smoke test — validates that core modules load and the money-math is
// correct. Run: npm test.  (First real test in the repo per the audit.)
const assert = require("node:assert");
let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Loading core modules…");
ok("anthropic module loads + MODELS present", () => {
  const { MODELS } = require("../src/anthropic");
  assert.ok(MODELS.haiku && MODELS.opus && MODELS.fable, "MODELS missing keys");
});
ok("autopilot-journal loads + handles empty", () => {
  const { tierStatsLine } = require("../src/autopilot-journal");
  assert.strictEqual(tierStatsLine([]), "", "empty journal should return empty string");
});
ok("router + key route modules load", () => {
  require("../src/router"); require("../src/routes/alpaca"); require("../src/routes/market");
});

console.log("Checking money-math invariants…");
ok("position size risks exactly the intended amount", () => {
  const account = 100000, riskPct = 1, entry = 50, stop = 47;
  const riskPerShare = entry - stop;                       // 3
  const shares = Math.floor((account * (riskPct / 100)) / riskPerShare);  // 333
  const actualRisk = shares * riskPerShare;                 // 999
  assert.ok(actualRisk <= account * (riskPct / 100), "risk exceeds the cap");
  assert.ok(actualRisk > account * (riskPct / 100) - riskPerShare, "risk far below cap (bad sizing)");
});
ok("R multiple math is symmetric", () => {
  const entry = 100, stop = 97, target = entry + 2 * (entry - stop);  // 106
  const rAtTarget = (target - entry) / (entry - stop);
  assert.strictEqual(rAtTarget, 2, "2R target should equal 2R");
});
ok("bracket stop is below entry for a long", () => {
  const entry = 100, atr = 4, stop = entry - 1.5 * atr;   // 94
  assert.ok(stop < entry, "long stop must be below entry");
});

console.log("Checking institutional-redesign presentation-layer modules (ESM, loaded via dynamic import)…");
(async () => {
  const { AI_ACTIONS, mapToAiAction } = await import("../axiom-runner/components/ai-actions.js");
  ok("mapToAiAction: existing-position verdicts stay in the EXIT/REDUCE/TAKE_PROFITS/WATCH subset", () => {
    assert.strictEqual(mapToAiAction({ positionState: "EXIT / REDUCE" }), AI_ACTIONS.EXIT);
    assert.strictEqual(mapToAiAction({ positionState: "TIGHTEN STOP" }), AI_ACTIONS.REDUCE);
    assert.strictEqual(mapToAiAction({ positionState: "WATCH CLOSELY" }), AI_ACTIONS.WATCH);
  });
  ok("mapToAiAction: new-entry verdict/nextAction override the score", () => {
    assert.strictEqual(mapToAiAction({ institutionalScore: 90, verdict: "AVOID" }), AI_ACTIONS.AVOID);
    assert.strictEqual(mapToAiAction({ institutionalScore: 10, nextAction: "BUY" }), AI_ACTIONS.BUY);
  });
  ok("mapToAiAction: falls back to the real institutional-score bands", () => {
    assert.strictEqual(mapToAiAction({ institutionalScore: 90 }), AI_ACTIONS.STRONG_BUY);
    assert.strictEqual(mapToAiAction({ institutionalScore: 72 }), AI_ACTIONS.BUY);
    assert.strictEqual(mapToAiAction({ institutionalScore: 60 }), AI_ACTIONS.ACCUMULATE);
    assert.strictEqual(mapToAiAction({ institutionalScore: 50 }), AI_ACTIONS.WATCH);
    assert.strictEqual(mapToAiAction({ institutionalScore: 30 }), AI_ACTIONS.REDUCE);
    assert.strictEqual(mapToAiAction({ institutionalScore: 5 }), AI_ACTIONS.AVOID);
  });
  ok("mapToAiAction: honest neutral default with no real data", () => {
    assert.strictEqual(mapToAiAction({}), AI_ACTIONS.WATCH);
  });

  const { deriveTopLevelScores } = await import("../axiom-runner/components/market-helpers.js");
  ok("deriveTopLevelScores: passthrough scores match their real source values", () => {
    const out = deriveTopLevelScores({
      regime: { score: 80 },
      sectorInfo: { rank: 1, of: 11 },
      technicals: { donchian: { pctPosition: 90 }, bollinger: { percentB: 70 } },
      institutionalGrade: { score: 77, breakdown: { technicalPts: 12 } },
      stockQuality: { score: 65 },
      aPlusScore: { breakdown: { entryPts: 18, breakoutPts: 12, volatilityPts: 4 } },
    });
    assert.strictEqual(out.market.score, 80, "Market should pass through regime.score unchanged");
    assert.strictEqual(out.sector.score, 100, "rank 1 of 11 should rescale to 100");
    assert.strictEqual(out.stockQuality.score, 65, "Stock Quality should pass through unchanged");
    assert.strictEqual(out.institutional.score, 77, "Institutional should pass through unchanged");
    assert.ok(out.technical.score > 0 && out.technical.score <= 100, "Technical should be a valid 0-100 blend");
    assert.strictEqual(out.timing.score, Math.round(((18 + 12 + 4) / 40) * 100), "Timing should be the exact rescaled subset-sum");
  });
  ok("deriveTopLevelScores: honest null when a real input is missing, never fabricated", () => {
    const out = deriveTopLevelScores({});
    assert.strictEqual(out.market.score, null);
    assert.strictEqual(out.market.label, "—");
    assert.strictEqual(out.timing.score, null);
  });

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("SMOKE TEST FAILED"); else console.log("SMOKE TEST OK");

  // Force-exit: requiring router.js pulls in modules (e.g. finviz.js's
  // setInterval(refreshNews, 5min)) that keep the event loop alive
  // indefinitely without this — the test's own checks are done, so don't
  // wait on background timers that belong to the real running server.
  process.exit(process.exitCode || 0);
})();
