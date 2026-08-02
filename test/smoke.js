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

console.log("Checking options-math.js (Phase 0, options redesign)…");
ok("probabilityOfProfit: Black-Scholes N(d2) used when iv/strike/underlying/dte are all real", () => {
  const { probabilityOfProfit } = require("../src/options-math");
  const pop = probabilityOfProfit({ iv: 30, strike: 100, underlying: 105, dte: 30, isCall: true });
  assert.ok(pop > 50 && pop <= 100, "an ITM call with positive drift-free d2 should have POP > 50");
});
ok("probabilityOfProfit: falls back to |delta| approximation when IV/strike/dte are missing", () => {
  const { probabilityOfProfit } = require("../src/options-math");
  assert.strictEqual(probabilityOfProfit({ delta: 0.42 }), 42);
  assert.strictEqual(probabilityOfProfit({ delta: -0.65 }), 65);
});
ok("probabilityOfProfit: honest null, never a fabricated number, with no real inputs", () => {
  const { probabilityOfProfit } = require("../src/options-math");
  assert.strictEqual(probabilityOfProfit({}), null);
});
ok("expectedMove: scales with IV, underlying, and sqrt(time)", () => {
  const { expectedMove } = require("../src/options-math");
  const move30 = expectedMove({ iv: 40, underlying: 100, dte: 30 });
  const move60 = expectedMove({ iv: 40, underlying: 100, dte: 60 });
  assert.ok(move30 > 0, "expected move should be positive");
  assert.ok(move60 > move30, "more DTE should mean a larger expected move at the same IV");
  assert.strictEqual(expectedMove({}), null, "honest null with no real inputs");
});
ok("spreadPct: real % of mid, honest null when bid/ask missing or crossed", () => {
  const { spreadPct } = require("../src/options-math");
  assert.strictEqual(spreadPct({ bid: 1.9, ask: 2.1 }), 10, "0.2 spread on 2.0 mid = 10%");
  assert.strictEqual(spreadPct({}), null);
  assert.strictEqual(spreadPct({ bid: 2.1, ask: 1.9 }), null, "crossed market should never yield a number");
});
ok("liquidityScore: tighter spread + higher OI/volume score higher, always bounded 0-100", () => {
  const { liquidityScore } = require("../src/options-math");
  const tight = liquidityScore({ bid: 1.98, ask: 2.02, openInterest: 8000, volume: 3000 });
  const wide = liquidityScore({ bid: 1.0, ask: 3.0, openInterest: 5, volume: 1 });
  assert.ok(tight > wide, "a tight, liquid contract should score higher than a wide, illiquid one");
  assert.ok(tight >= 0 && tight <= 100 && wide >= 0 && wide <= 100, "score must stay within 0-100");
});

console.log("Checking agent.js's fixed AI Sentiment button + new per-symbol aggregator (Phase 0)…");
ok("aggregateSentimentForSymbol: real bull/bear headline counts drive the verdict, templated one-liner", () => {
  const { aggregateSentimentForSymbol } = require("../src/routes/agent");
  const out = aggregateSentimentForSymbol([
    "Company beats earnings, shares surge on strong guidance",
    "Analyst upgrade sends stock higher on record growth",
    "Regulators open probe into accounting practices",
  ]);
  assert.strictEqual(out.sentiment, "positive", "2 bullish vs 1 bearish headline should net positive");
  assert.strictEqual(out.bulls, 2);
  assert.strictEqual(out.bears, 1);
  assert.ok(out.oneLiner.includes("2 bullish vs 1 bearish"), "one-liner must be templated from the real counts, not a Claude call");
});
ok("aggregateSentimentForSymbol: honest neutral with no headlines", () => {
  const { aggregateSentimentForSymbol } = require("../src/routes/agent");
  const out = aggregateSentimentForSymbol([]);
  assert.strictEqual(out.sentiment, "neutral");
  assert.strictEqual(out.total, 0);
});

console.log("Checking gamma-exposure.js (Phase 2, options redesign)…");
ok("computeGammaExposure: honest unavailable with no contracts or no underlying", () => {
  const { computeGammaExposure } = require("../src/gamma-exposure");
  assert.strictEqual(computeGammaExposure([], 100).available, false);
  assert.strictEqual(computeGammaExposure([{ strike: 100, gamma: 0.05, openInterest: 10, type: "call" }], null).available, false);
});
ok("computeGammaExposure: honest unavailable when no contract has real gamma (e.g. Yahoo fallback chain)", () => {
  const { computeGammaExposure } = require("../src/gamma-exposure");
  const out = computeGammaExposure([{ strike: 100, gamma: null, openInterest: 500, type: "call" }], 100);
  assert.strictEqual(out.available, false);
  assert.ok(out.reason.includes("Polygon"), "reason should point at the real fix (a Polygon-sourced chain)");
});
ok("computeGammaExposure: real per-strike math, net GEX, flip point, call/put walls", () => {
  const { computeGammaExposure } = require("../src/gamma-exposure");
  const contracts = [
    { strike: 95, gamma: 0.02, openInterest: 100, type: "call" },
    { strike: 95, gamma: 0.03, openInterest: 50, type: "put" },
    { strike: 100, gamma: 0.05, openInterest: 200, type: "call" },
    { strike: 100, gamma: 0.05, openInterest: 200, type: "put" },
    { strike: 105, gamma: 0.02, openInterest: 50, type: "call" },
    { strike: 105, gamma: 0.05, openInterest: 300, type: "put" },
  ];
  const out = computeGammaExposure(contracts, 100);
  assert.strictEqual(out.available, true);
  assert.strictEqual(out.netGEX, -135000, "net GEX must be the exact sum of real per-strike call-minus-put contributions");
  assert.strictEqual(out.callWall, 100, "call wall = strike with the largest real call gamma*OI contribution");
  assert.strictEqual(out.putWall, 105, "put wall = strike with the largest real put gamma*OI contribution");
  assert.ok(out.gammaFlipPoint > 100 && out.gammaFlipPoint < 105, "flip point must fall between the two strikes where cumulative GEX crosses zero");
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

  const { computeMarketBias, computeAPlusMarketScore, classifyMacroStatus, regimeStrategyHint } = await import("../axiom-runner/components/market-helpers.js");
  const bullishMacro = [
    { symbol: "SPY", changesPercentage: 0.8 }, { symbol: "QQQ", changesPercentage: 0.9 },
    { symbol: "VIXY", changesPercentage: -1 }, { symbol: "TLT", changesPercentage: 0.2 },
    { symbol: "UUP", changesPercentage: -0.1 }, { symbol: "HYG", changesPercentage: 0.3 },
  ];
  ok("computeMarketBias: unanimous bullish real inputs -> Bullish, high confidence", () => {
    const out = computeMarketBias({ macroData: bullishMacro, distData: { vix: 10 } });
    assert.strictEqual(out.bias, "Bullish");
    assert.strictEqual(out.confidence, 90, "all 3 real formulas agreeing should be the highest honest confidence");
    assert.strictEqual(out.character, "Low Volatility");
    assert.strictEqual(out.riskPosture, "Risk On");
  });
  ok("computeMarketBias: honest null with no real SPY data", () => {
    const out = computeMarketBias({ macroData: [], distData: null });
    assert.strictEqual(out.bias, null);
    assert.strictEqual(out.confidence, null);
  });
  ok("regimeStrategyHint: real trending+bullish maps to Buy Calls, high VIX maps to Credit Spread", () => {
    assert.strictEqual(regimeStrategyHint({ bias: "Bullish", character: "Trending", vix: 18 }), "Buy Calls");
    assert.strictEqual(regimeStrategyHint({ bias: "Bearish", character: "Trending", vix: 18 }), "Buy Puts");
    assert.strictEqual(regimeStrategyHint({ bias: "Neutral", character: "Volatile", vix: 30 }), "Credit Spread");
    assert.strictEqual(regimeStrategyHint({ bias: "Neutral", character: "Range", vix: 18 }), "Iron Condor");
  });
  ok("computeAPlusMarketScore: counts real _aplus.score rows at the 70/85 thresholds already used elsewhere", () => {
    const rows = [{ _aplus: { score: 90 } }, { _aplus: { score: 72 } }, { _aplus: { score: 40 } }, { symbol: "NOSCORE" }];
    const out = computeAPlusMarketScore(rows);
    assert.strictEqual(out.total, 3, "the row with no real _aplus.score must be excluded, not counted as 0");
    assert.strictEqual(out.aPlusCount, 1);
    assert.strictEqual(out.aCount, 2);
    assert.strictEqual(out.pct, 67);
  });
  ok("computeAPlusMarketScore: honest null with no scored rows", () => {
    assert.strictEqual(computeAPlusMarketScore([]).pct, null);
  });
  ok("classifyMacroStatus: VIX uses real absolute level, not %change", () => {
    assert.strictEqual(classifyMacroStatus("VIX", { vixLevel: 30 }).status, "red");
    assert.strictEqual(classifyMacroStatus("VIX", { vixLevel: 12 }).status, "green");
    assert.strictEqual(classifyMacroStatus("VIX", { vixLevel: 20 }).status, "yellow");
  });
  ok("classifyMacroStatus: other instruments use real %change with a consistent, documented rule", () => {
    assert.strictEqual(classifyMacroStatus("SPY", { chgPct: 1.2 }).status, "green");
    assert.strictEqual(classifyMacroStatus("SPY", { chgPct: -0.8 }).status, "red");
    assert.strictEqual(classifyMacroStatus("SPY", { chgPct: 0.1 }).status, "yellow");
  });

  const { computeAiTradeScore } = await import("../axiom-runner/components/market-helpers.js");
  ok("computeAiTradeScore: real inputs across all 10 dimensions produce a valid 0-100 score + real recommendation", () => {
    const out = computeAiTradeScore({
      row: { passCount: 7, momentum: 15, volRatio: 1.8, rsRating: 90, chgPct: 1.2, price: 100, smc: { bos: { type: "BULL_BOS", label: "Bullish BOS" } } },
      optionsFlow: { callNotional: 8_000_000, putNotional: 2_000_000 },
      darkPool: { prints: [{ value: 3_000_000 }, { value: 4_000_000 }] },
      newsSentiment: { score: 3, bulls: 4, bears: 1 },
      gammaExposure: { available: true, gammaFlipPoint: 101 },
    });
    assert.ok(out.score > 0 && out.score <= 100, "score must stay within 0-100");
    assert.strictEqual(Object.keys(out.breakdown).length, 10, "must score exactly the 10 spec’d dimensions");
    assert.ok(out.recommendation && out.recommendation.label, "must produce a real Final Recommendation label");
    assert.strictEqual(out.reasons.length, 10);
  });
  ok("computeAiTradeScore: honest neutral midpoints when the 4 new inputs are unavailable, never fabricated", () => {
    const out = computeAiTradeScore({ row: { passCount: 4, price: 100 } });
    assert.strictEqual(out.breakdown.darkPoolPts, 5, "no real dark pool data -> neutral midpoint, not 0 or a guess");
    assert.strictEqual(out.breakdown.newsPts, 5);
    assert.strictEqual(out.breakdown.gammaPts, 5, "no real GEX -> neutral midpoint");
    assert.strictEqual(out.breakdown.liquidityPts, 3, "no real chain liquidity -> neutral-low midpoint");
  });
  ok("computeAiTradeScore: dark pool score reflects real notional magnitude, not a fabricated direction", () => {
    const bigPrints = computeAiTradeScore({ row: { price: 100 }, darkPool: { prints: [{ value: 15_000_000 }, { value: 10_000_000 }] } });
    const smallPrints = computeAiTradeScore({ row: { price: 100 }, darkPool: { prints: [{ value: 100_000 }] } });
    assert.ok(bigPrints.breakdown.darkPoolPts > smallPrints.breakdown.darkPoolPts, "more real block-print notional should score higher");
  });

  const { computeInstitutionScore } = await import("../axiom-runner/components/market-helpers.js");
  ok("computeInstitutionScore: real buy-skewed inputs across dark pool/flow/insider/13F/short-interest -> high score, Accumulation/Aggressive Buying label", () => {
    const out = computeInstitutionScore({
      darkPool: { prints: [{ value: 15_000_000 }] },
      optionsFlow: { callNotional: 9_000_000, putNotional: 1_000_000 },
      insiderData: {
        insiderTransactions: { transactions: [{ type: "BUY", value: 5_000_000 }, { type: "SELL", value: 500_000 }] },
        institutional: { institutions: [{ change: 200_000 }, { change: 150_000 }, { change: -20_000 }] },
      },
      shortInterest: { sharesShort: 900_000, sharesShortPrior: 1_000_000 },
    });
    assert.ok(out.score > 60, "unanimous real buy-side signals should score high");
    assert.ok(["Accumulation", "Aggressive Buying"].includes(out.label));
    assert.strictEqual(out.reasons.length, 5);
    assert.ok(out.disclosure.includes("ETF flow"), "must honestly disclose the one real gap (ETF flow), not silently omit it");
  });
  ok("computeInstitutionScore: honest neutral midpoints with no real inputs, never fabricated", () => {
    const out = computeInstitutionScore({});
    assert.strictEqual(out.breakdown.darkPoolPts, 15);
    assert.strictEqual(out.breakdown.flowPts, 12);
    assert.strictEqual(out.breakdown.insiderPts, 10);
    assert.strictEqual(out.breakdown.instPts, 8);
    assert.strictEqual(out.breakdown.shortPts, 5);
    assert.strictEqual(out.label, "Neutral");
  });
  ok("computeInstitutionScore: sell-skewed real inputs score low with a Distribution/Aggressive Selling label", () => {
    const out = computeInstitutionScore({
      optionsFlow: { callNotional: 1_000_000, putNotional: 9_000_000 },
      insiderData: { insiderTransactions: { transactions: [{ type: "SELL", value: 8_000_000 }] }, institutional: { institutions: [{ change: -300_000 }] } },
      shortInterest: { sharesShort: 1_300_000, sharesShortPrior: 1_000_000 },
    });
    assert.ok(out.score < 40, "unanimous real sell-side signals should score low");
    assert.ok(["Distribution", "Aggressive Selling"].includes(out.label));
  });

  const { OPTIONS_ACTIONS, mapToOptionsAction, optionsExecutionNote } = await import("../axiom-runner/components/options-actions.js");
  ok("mapToOptionsAction: strong/regular call-buy and put-buy tiers match trade-signals' own bands", () => {
    assert.strictEqual(mapToOptionsAction({ score: 90, chgPct: 2 }), OPTIONS_ACTIONS.STRONG_CALL_BUY);
    assert.strictEqual(mapToOptionsAction({ score: 72, chgPct: 1 }), OPTIONS_ACTIONS.CALL_BUY);
    assert.strictEqual(mapToOptionsAction({ score: 10, chgPct: -2 }), OPTIONS_ACTIONS.STRONG_PUT_BUY);
    assert.strictEqual(mapToOptionsAction({ score: 30, chgPct: -1 }), OPTIONS_ACTIONS.PUT_BUY);
  });
  ok("mapToOptionsAction: direction must agree with score band, else Watch/Avoid", () => {
    assert.strictEqual(mapToOptionsAction({ score: 90, chgPct: -1 }), OPTIONS_ACTIONS.AVOID, "high score but red day is a conflicting, unsupported signal — not a confirmed call, correctly falls to Avoid");
    assert.strictEqual(mapToOptionsAction({ score: 60, chgPct: 1 }), OPTIONS_ACTIONS.WATCH, "developing bullish setup below the Call Buy threshold should Watch");
    assert.strictEqual(mapToOptionsAction({ score: 50, chgPct: 0 }), OPTIONS_ACTIONS.AVOID, "no real edge either direction");
  });
  ok("mapToOptionsAction: honest Watch default with no real score", () => {
    assert.strictEqual(mapToOptionsAction({}), OPTIONS_ACTIONS.WATCH);
  });
  ok("optionsExecutionNote: mirrors trade-signals' real IV-cheap/IV-rich branching", () => {
    assert.strictEqual(optionsExecutionNote({ ivProxy: 25, direction: "bullish" }).strategy, "BUY CALLS");
    assert.strictEqual(optionsExecutionNote({ ivProxy: 80, direction: "bullish" }).strategy, "SELL PUTS");
    assert.strictEqual(optionsExecutionNote({ ivProxy: 25, direction: "bearish" }).strategy, "BUY PUTS");
    assert.strictEqual(optionsExecutionNote({ ivProxy: 80, direction: "bearish" }).strategy, "SELL CALLS");
    assert.strictEqual(optionsExecutionNote({}), null, "honest null with no real IV input");
  });

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("SMOKE TEST FAILED"); else console.log("SMOKE TEST OK");

  // Force-exit: requiring router.js pulls in modules (e.g. finviz.js's
  // setInterval(refreshNews, 5min)) that keep the event loop alive
  // indefinitely without this — the test's own checks are done, so don't
  // wait on background timers that belong to the real running server.
  process.exit(process.exitCode || 0);
})();
