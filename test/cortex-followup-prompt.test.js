// Real tests for buildCortexFollowupSystemPrompt (src/routes/market.js) —
// Cortex Screen-Context Awareness, 2026-08-23. Factored out of the route
// handler specifically so this is testable without a real
// ANTHROPIC_API_KEY (the route itself short-circuits before this ever
// runs when the key is missing). Same minimal style as
// test/risk-guardrails.test.js — no framework, no new dependency.
"use strict";
const assert = require("node:assert");
const { buildCortexFollowupSystemPrompt } = require("../src/routes/market.js");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("buildCortexFollowupSystemPrompt…");

ok("no crash and no BROADER SCREEN CONTEXT section when every context field is absent (old client shape)", () => {
  const system = buildCortexFollowupSystemPrompt({ symbol: "ZZZ", price: 5 });
  assert.ok(!system.includes("BROADER SCREEN CONTEXT"), "must not fabricate a context section when nothing real was sent");
});

ok("real regime/portfolio/autopilot/news all render their real values, never fabricated", () => {
  const system = buildCortexFollowupSystemPrompt({
    symbol: "AAPL", price: 250.5, coreVerdict: "BUY", coreReason: "Strong trend",
    regime: { label: "GREEN", score: 85 },
    portfolio: { count: 2, totalUnrealizedPL: 345.67, heldSymbols: ["AAPL", "MSFT"], holdsAnalyzedSymbol: true,
      analyzedSymbolPosition: { qty: 10, avgEntry: 240, current: 250.5, unrealizedPL: 105, unrealizedPLpc: 4.375, side: "long" } },
    autopilot: { mode: "ASSIST", dailyTrades: 1, dailyPl: 0, readyCount: 2, recentActivity: ["Real ASSIST order placed"] },
    news: { articleCount: 3, trend: "BULLISH", latestHeadline: "AAPL beats earnings" },
  });
  assert.ok(system.includes("Market regime: GREEN (85/100)"));
  assert.ok(system.includes("2 open positions, total unrealized P/L $345.67"));
  assert.ok(system.includes("You hold AAPL: 10 sh @ avg $240"));
  assert.ok(system.includes("mode ASSIST, 1 real trade(s) today"));
  assert.ok(system.includes(`latest: "AAPL beats earnings"`));
});

ok("zero real open positions is stated honestly, not omitted (0 positions != no data)", () => {
  const system = buildCortexFollowupSystemPrompt({
    symbol: "XYZ", price: 10,
    portfolio: { count: 0, totalUnrealizedPL: 0, heldSymbols: [], holdsAnalyzedSymbol: false, analyzedSymbolPosition: null },
  });
  assert.ok(system.includes("0 open positions, total unrealized P/L $0"));
  assert.ok(system.includes("You do not currently hold XYZ."));
});

ok("a degraded/failed news fetch is disclosed, never silently dropped or fabricated as real data", () => {
  const system = buildCortexFollowupSystemPrompt({ symbol: "XYZ", price: 10, news: { degraded: true } });
  assert.ok(system.includes("Real news feed: unavailable right now (degraded)."));
  assert.ok(!system.includes("article(s)"), "must not fabricate an article count when the feed is degraded");
});

ok("a failed autopilot/news fetch (null) omits that section entirely, doesn't fabricate zeros", () => {
  const system = buildCortexFollowupSystemPrompt({ symbol: "XYZ", price: 10, regime: { label: "YELLOW", score: 60 }, autopilot: null, news: null });
  assert.ok(system.includes("Market regime: YELLOW"), "real fields still render");
  assert.ok(!system.includes("Autopilot"), "no autopilot line when the fetch failed");
  assert.ok(!system.includes("news"), "no news line when the fetch failed");
});

console.log(`\n${passed} checks passed.`);
console.log("CORTEX-FOLLOWUP-PROMPT TEST OK");
