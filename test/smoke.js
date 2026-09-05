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
ok("theta: real time decay is always negative (never fabricated as value-gaining), honest null with no real inputs", () => {
  const { theta } = require("../src/options-math");
  const t = theta({ iv: 30, strike: 100, underlying: 100, dte: 30, isCall: true });
  assert.ok(t < 0, `theta must be negative (real value lost per day), got ${t}`);
  assert.strictEqual(theta({}), null);
});
ok("theta: shorter real DTE at the same strike/IV decays faster per day (theta magnitude grows near expiry)", () => {
  const { theta } = require("../src/options-math");
  const t30 = theta({ iv: 30, strike: 100, underlying: 100, dte: 30, isCall: true });
  const t5 = theta({ iv: 30, strike: 100, underlying: 100, dte: 5, isCall: true });
  assert.ok(Math.abs(t5) > Math.abs(t30), "a contract closer to real expiry should decay faster per day");
});
ok("breakEven: real long-call break-even is strike+premium; real long-put break-even is strike-premium", () => {
  const { breakEven } = require("../src/options-math");
  assert.strictEqual(breakEven({ strike: 100, premium: 3.5, isCall: true }), 103.5);
  assert.strictEqual(breakEven({ strike: 100, premium: 3.5, isCall: false }), 96.5);
  assert.strictEqual(breakEven({}), null, "honest null with no real inputs");
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
ok("scoreSentiment: real |score|>=3 threshold — News Engine Phase 12's market-moving filter", () => {
  const { scoreSentiment } = require("../src/routes/agent");
  // 4 real bull words -> score 4, |4|>=3 (mirrors the route's marketMoving derivation)
  const strong = scoreSentiment("Company beats and exceeds record growth with a strong rally and upgrade");
  assert.ok(strong.score >= 3, "a real multi-keyword bullish headline should score at least 3");
  const mild = scoreSentiment("Shares gain slightly on light trading");
  assert.ok(Math.abs(mild.score) < 3, "a single mild keyword must not be treated as market-moving");
});

console.log("Checking buildTradeSetup — canonical Cortex verdict must never be overridden by the legacy score/signal re-score (2026-09-02 fix)…");
ok("buildTradeSetup: a real canonical AVOID overrides a bullish legacy score/signal, not the other way around", () => {
  const { buildTradeSetup } = require("../src/routes/agent");
  // score/signal alone would normally read as a strong LONG (A+ LONG,
  // HIGH conviction) under the legacy fallback formula — but a real
  // canonical Cortex verdict of AVOID must win, proving the legacy
  // inputs are evidence only, never a competing final decision.
  const out = buildTradeSetup({
    ticker: "TEST", score: 90, signal: "LONG", signals: [], rsiVal: 65, macdBull: true,
    livePrice: 100, liveChg: 1.2, cortexVerdict: "AVOID", cortexReason: "Broken 4H structure.",
  });
  assert.strictEqual(out.bias, "NEUTRAL", "AVOID must map to NEUTRAL bias regardless of the bullish legacy score/signal");
  assert.ok(out.plan.includes("FINAL VERDICT: AVOID"), "plan text must show the canonical verdict, not a legacy-derived label");
  assert.ok(out.plan.includes("Cortex Verdict"), "plan text must disclose the verdict came from Cortex, not a re-derived score");
  assert.ok(!/A\+ LONG|FINAL VERDICT: LONG/.test(out.plan), "the legacy bullish label must never appear once a real canonical verdict is present");
});
ok("buildTradeSetup: with no canonical verdict supplied, the legacy fallback still runs (regression safety)", () => {
  const { buildTradeSetup } = require("../src/routes/agent");
  const out = buildTradeSetup({
    ticker: "TEST", score: 90, signal: "LONG", signals: [], rsiVal: 65, macdBull: true,
    livePrice: 100, liveChg: 1.2,
  });
  assert.strictEqual(out.bias, "LONG", "with no canonical context, the legacy score/signal formula should still resolve bias as before");
  assert.ok(!out.plan.includes("Cortex Verdict"), "must not claim a Cortex verdict when none was supplied");
});

console.log("Checking providers/alpaca-data.js — both real fetch() calls must be timeout-protected (2026-09-02 fix: a hang here, confirmed live on Render, blocked /api/market/trend-screen and /api/market/opportunities indefinitely since it's tried before the already-timeout-protected Yahoo fallback)…");
ok("fetchAlpacaBars and fetchAlpacaQuotes route through the local timeout wrapper, not a bare fetch()", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "providers", "alpaca-data.js"), "utf8");
  assert.match(src, /async function fetchWithTimeout\(/, "fetchWithTimeout helper must exist");
  assert.match(src, /new AbortController\(\)/);
  assert.doesNotMatch(src, /await fetch\(url, \{ headers \}\)/, "no remaining bare, un-timed-out fetch() call to data.alpaca.markets");
  const timeoutCalls = (src.match(/await fetchWithTimeout\(url, \{ headers \}\)/g) || []).length;
  assert.strictEqual(timeoutCalls, 2, "both fetchAlpacaBars and fetchAlpacaQuotes must use the timeout wrapper");
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

console.log("Checking computeGammaLabReads (Phase 7, Gamma Lab derived reads)…");
ok("computeGammaLabReads: honest unavailable when the underlying GEX itself is unavailable", () => {
  const { computeGammaLabReads } = require("../src/gamma-exposure");
  const out = computeGammaLabReads({ available: false, reason: "No real per-contract gamma available." }, 100);
  assert.strictEqual(out.available, false);
  assert.ok(out.reason.includes("gamma"));
});
ok("computeGammaLabReads: real Expected Pin/Magnet/Dealer Bias derived from real GEX output", () => {
  const { computeGammaExposure } = require("../src/gamma-exposure");
  const { computeGammaLabReads } = require("../src/gamma-exposure");
  const contracts = [
    { strike: 95, gamma: 0.02, openInterest: 100, type: "call" },
    { strike: 95, gamma: 0.03, openInterest: 50, type: "put" },
    { strike: 100, gamma: 0.05, openInterest: 200, type: "call" },
    { strike: 100, gamma: 0.05, openInterest: 200, type: "put" },
    { strike: 105, gamma: 0.02, openInterest: 50, type: "call" },
    { strike: 105, gamma: 0.05, openInterest: 300, type: "put" },
  ];
  const gex = computeGammaExposure(contracts, 100);
  const labReads = computeGammaLabReads(gex, 100);
  assert.strictEqual(labReads.available, true);
  assert.ok([95, 100, 105].includes(labReads.expectedPin), "Expected Pin must be a real strike from the real chain, not an arbitrary number");
  assert.strictEqual(labReads.expectedMagnet, gex.callWall, "underlying=100 is closer to the call wall (100) than the put wall (105) in this fixture");
  assert.strictEqual(labReads.dealerBias.sign, "negative", "this fixture's real net GEX is negative (confirmed -135000 by the Phase 2 GEX test)");
});

console.log("Checking options-math.js Phase 5 additions (EV, contract ranking, squeeze/crush/assignment risk)…");
ok("dteFromExpiry: real calendar-day math off a real expiry string", () => {
  const { dteFromExpiry } = require("../src/options-math");
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  const dte = dteFromExpiry(future);
  assert.ok(dte >= 9 && dte <= 10, "10 real days out should compute to ~10 DTE");
  assert.strictEqual(dteFromExpiry("not-a-date"), null);
});
ok("expectedValue: real POP × avgWin math, honest null with missing real inputs", () => {
  const { expectedValue } = require("../src/options-math");
  assert.strictEqual(expectedValue({ pop: 60, avgWinPct: 100, avgLossPct: 100 }), 20, "0.6*100 - 0.4*100 = 20");
  assert.strictEqual(expectedValue({}), null);
});
ok("rankContracts: sorts by real composite opportunity score, not strike order", () => {
  const { rankContracts } = require("../src/options-math");
  const contracts = [
    { strike: 100, delta: 0.15, bid: 0.5, ask: 0.9, openInterest: 20, volume: 5, expiry: new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10) },
    { strike: 105, delta: 0.55, bid: 2.4, ask: 2.5, openInterest: 8000, volume: 3000, expiry: new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10) },
  ];
  const ranked = rankContracts(contracts, { isCall: true, aiTradeScore: 70 });
  assert.strictEqual(ranked[0].strike, 105, "the real higher-POP, higher-liquidity contract should rank first despite the higher strike");
  assert.ok(ranked[0].rankScore > ranked[1].rankScore);
});
ok("gammaSqueezeProbability: honest null when GEX unavailable, real composite when available", () => {
  const { gammaSqueezeProbability } = require("../src/options-math");
  assert.strictEqual(gammaSqueezeProbability({ gammaExposure: { available: false } }), null);
  const score = gammaSqueezeProbability({ gammaExposure: { available: true, netGEX: -500000 }, shortFloatPct: 15, rvol: 2.5 });
  assert.ok(score > 50, "negative real GEX + real high short float + real high RVOL should score high");
});
ok("ivCrushRisk: only meaningful within the real 10-day earnings window", () => {
  const { ivCrushRisk } = require("../src/options-math");
  assert.strictEqual(ivCrushRisk({ daysToEarnings: 30, ivRank: 90 }), null, "outside the real 10-day window, honest null not a guess");
  assert.ok(ivCrushRisk({ daysToEarnings: 1, ivRank: 90 }) > ivCrushRisk({ daysToEarnings: 8, ivRank: 90 }), "closer to real earnings date should score higher");
});
ok("assignmentRisk: real ITM-proximity weighted more heavily near real expiry", () => {
  const { assignmentRisk } = require("../src/options-math");
  const near = assignmentRisk({ delta: 0.9, dte: 1 });
  const far = assignmentRisk({ delta: 0.9, dte: 60 });
  assert.ok(near > far, "same real delta closer to real expiry should score higher assignment risk");
  assert.strictEqual(assignmentRisk({}), null);
});

console.log("Checking interpretFlowRow (Phase 6, Smart Options Flow interpretation)…");
ok("interpretFlowRow: real above-ask execution + very large size + unusual flag -> high confidence, A-tier rating", () => {
  const { interpretFlowRow } = require("../src/options-math");
  const out = interpretFlowRow({ symbol: "NVDA", side: "CALL", notional: 8_000_000, volume: 4000, openInterest: 1000, bid: 2.0, ask: 2.2, lastPrice: 2.25, unusual: true, tradeType: "SWEEP" });
  assert.strictEqual(out.sizeBucket, "Very Large");
  assert.strictEqual(out.execution, "Above Ask");
  assert.ok(out.confidence >= 80, "unanimous real bullish signals should score high confidence");
  assert.ok(["A+", "A"].includes(out.institutionalRating));
  assert.ok(out.institutionalLabel.includes("bullish"));
  assert.strictEqual(out.signedScore, out.confidence, "a real CALL should have a positive signed score");
});
ok("interpretFlowRow: honest 'Unavailable' execution with no real bid/ask, never a guess", () => {
  const { interpretFlowRow } = require("../src/options-math");
  const out = interpretFlowRow({ symbol: "AAPL", side: "PUT", notional: 100_000, volume: 50, openInterest: 40, lastPrice: 1.5 });
  assert.strictEqual(out.execution, "Unavailable");
  assert.strictEqual(out.likelyNewPosition, "Unknown", "no real day-over-day OI history exists — must never guess YES/NO");
});
ok("interpretFlowRow: selling calls at/below bid nets bearish (covered/naked call writing caps upside), label/summary/score must all agree", () => {
  const { interpretFlowRow } = require("../src/options-math");
  const out = interpretFlowRow({ symbol: "NVDA", side: "CALL", notional: 24_000_000, volume: 98000, openInterest: 10000, bid: 2.5, ask: 2.61, lastPrice: 2.52, unusual: true, tradeType: "DARKPOOL" });
  assert.strictEqual(out.execution, "At Bid");
  assert.ok(out.institutionalLabel.includes("bearish/neutral"), "selling calls is a real bearish/neutral options-theory stance (caps upside) — the label must reflect that real net direction, not the raw CALL side alone");
  assert.ok(out.summary.includes("bearish"), "summary must agree with the label's real net direction");
  assert.ok(out.signedScore < 0, "signedScore must agree with the same real net-bearish direction as the label/summary");
});
ok("interpretFlowRow: selling puts at/below bid nets bullish (cash-secured put writing bets price holds above strike)", () => {
  const { interpretFlowRow } = require("../src/options-math");
  const out = interpretFlowRow({ symbol: "SPY", side: "PUT", notional: 6_000_000, volume: 20000, openInterest: 5000, bid: 1.0, ask: 1.1, lastPrice: 1.02, unusual: true, tradeType: "BLOCK" });
  assert.strictEqual(out.execution, "At Bid");
  assert.ok(out.institutionalLabel.includes("bullish/neutral"));
  assert.ok(out.signedScore > 0);
});
ok("interpretFlowRow: the estimated fallback is softened, never reads as confidently as a real print", () => {
  const { interpretFlowRow } = require("../src/options-math");
  const out = interpretFlowRow({ symbol: "TSLA", side: "CALL", notional: 9_000_000, volume: 5000, openInterest: 100, unusual: true, tradeType: "BLOCK", estimated: true });
  assert.ok(out.confidence <= 40, "the estimated fallback must never claim high confidence, regardless of its own inflated notional/unusual flag");
  assert.ok(out.institutionalLabel.toLowerCase().includes("estimated"));
});

console.log("Checking iv-history-store.js Phase 5 honest-building-state…");
ok("ivRankFor: honest building state with no real accumulated history yet", () => {
  const { ivRankFor } = require("../src/iv-history-store");
  const out = ivRankFor("ZZZZ_NONEXISTENT_TEST_SYMBOL", 45);
  assert.strictEqual(out.available, false);
  assert.ok(out.reason.includes("building"), "must say it's honestly building, never fabricate a rank");
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
  ok("mapToAiAction: real ROTATE positionState maps to the new AI_ACTIONS.ROTATE entry (Green Light AI spec gap)", () => {
    assert.strictEqual(mapToAiAction({ positionState: "ROTATE" }), AI_ACTIONS.ROTATE);
    assert.strictEqual(mapToAiAction({ positionState: "rotate — replaced by a stronger candidate" }), AI_ACTIONS.ROTATE);
  });

  const { deriveTopLevelScores } = await import("../axiom-runner/components/market-helpers.js");
  ok("deriveTopLevelScores: passthrough scores match their real source values", () => {
    const out = deriveTopLevelScores({
      regime: { score: 80 },
      sectorInfo: { rank: 1, of: 11 },
      technicals: { donchian: { pctPosition: 90 }, bollinger: { percentB: 70 } },
      institutionalGrade: { score: 77, breakdown: { technicalPts: 12 } },
      stockQuality: { score: 65 },
      // entryPts/breakoutPts/vcpPts source maxes are 15/10/15 (2026-08-14,
      // VCP engine integration Phase 2 reweight — vcpPts replaced the old
      // volatilityPts/5 proxy with the real 0-100 VCP Setup Score scaled to
      // 15). Each rescales independently into the Timing score's own
      // 50/38/12 target split (deriveTopLevelScores' timingMax) — the two
      // scales aren't proportional to each other, so the expected value
      // below mirrors that same per-dimension rescale, not a shortcut sum.
      aPlusScore: { breakdown: { entryPts: 13, breakoutPts: 8, vcpPts: 12 } },
    });
    assert.strictEqual(out.market.score, 80, "Market should pass through regime.score unchanged");
    assert.strictEqual(out.sector.score, 100, "rank 1 of 11 should rescale to 100");
    assert.strictEqual(out.stockQuality.score, 65, "Stock Quality should pass through unchanged");
    assert.strictEqual(out.institutional.score, 77, "Institutional should pass through unchanged");
    assert.ok(out.technical.score > 0 && out.technical.score <= 100, "Technical should be a valid 0-100 blend");
    const expectedTiming = Math.round(13 / 15 * 50) + Math.round(8 / 10 * 38) + Math.round(12 / 15 * 12);
    assert.strictEqual(out.timing.score, expectedTiming, "Timing should be the exact rescaled subset-sum");
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

  const { computeReversalDetector, computeValuationVerdict } = await import("../axiom-runner/components/market-helpers.js");
  ok("computeReversalDetector: real bottom-cluster inputs (near 52w low, RSI oversold, climax sell volume) -> LIKELY/POSSIBLE BOTTOM", () => {
    const out = computeReversalDetector({
      price: 52, hi52: 100, lo52: 50, rsi: 25, rvol: 3.2, dayChangePct: -4, weekChangePct: -18, ma50: 70,
    });
    assert.ok(out.isBottom, "clustered real bottom signals must classify as bottom, not top/neutral");
    assert.ok(out.verdict.includes("BOTTOM"));
    assert.ok(out.verdict.includes("early get-in"), "verdict must speak the user's own words (early get-in/get-out)");
    assert.ok(out.sigs.some(s => s.txt.includes("Climax sell volume")), "must surface the real climax-exhaustion signal, not just the 52w/RSI ones");
  });
  ok("computeReversalDetector: real top-cluster inputs (near 52w high, RSI overbought, climax buy volume) -> LIKELY/POSSIBLE TOP", () => {
    const out = computeReversalDetector({
      price: 98, hi52: 100, lo52: 50, rsi: 78, rvol: 3.0, dayChangePct: 6, weekChangePct: 22, ma50: 80,
    });
    assert.ok(out.isTop);
    assert.ok(out.verdict.includes("TOP"));
    assert.ok(out.verdict.includes("early get-out"));
    assert.ok(out.sigs.some(s => s.txt.includes("Climax buy volume")));
  });
  ok("computeReversalDetector: mid-range real inputs -> MID RANGE, no fabricated signal", () => {
    const out = computeReversalDetector({ price: 75, hi52: 100, lo52: 50, rsi: 50, rvol: 1.0, dayChangePct: 0.2, weekChangePct: 1, ma50: 74 });
    assert.ok(out.isNeutral);
    assert.strictEqual(out.sigs.length, 0);
  });
  ok("computeReversalDetector: honest null with no real price", () => {
    assert.strictEqual(computeReversalDetector({}), null);
  });
  ok("computeValuationVerdict: real cheap P/E -> UNDERVALUED; real expensive P/E -> OVERVALUED; mid P/E -> FAIRLY VALUED", () => {
    assert.strictEqual(computeValuationVerdict({ pe: 12 }).label, "UNDERVALUED");
    assert.strictEqual(computeValuationVerdict({ pe: 65 }).label, "OVERVALUED");
    assert.strictEqual(computeValuationVerdict({ pe: 20 }).label, "FAIRLY VALUED");
  });
  ok("computeValuationVerdict: honest null with no real P/E or PEG, never a guessed verdict", () => {
    assert.strictEqual(computeValuationVerdict({}).label, null);
    assert.strictEqual(computeValuationVerdict(null).label, null);
  });

  console.log("Checking volatility-lab.js (Phase 8, Volatility Lab)…");
  ok("computeRealizedVol: real annualized stdev of daily log returns, honest null with too few real bars", () => {
    const { computeRealizedVol } = require("../src/volatility-lab");
    // 21 bars of a real steady +1%/day walk — the annualized vol of a
    // constant daily log return is 0 (zero variance), a real deterministic
    // check of the stdev math itself, not a magic-number fixture.
    const bars = [];
    let price = 100;
    for (let i = 0; i <= 20; i++) { bars.push({ close: price }); price *= 1.01; }
    const hv = computeRealizedVol(bars, 20);
    assert.ok(hv !== null && hv < 1, "a perfectly steady walk should read ~0% realized vol");
    assert.strictEqual(computeRealizedVol(bars, 60), null, "60d HV must be honest null with only 21 real bars, never estimated from less data");
  });
  ok("computeHvRv: independently-gated hv20/hv60/rv10, each null on its own when real history is short", () => {
    const { computeHvRv } = require("../src/volatility-lab");
    const bars = Array.from({ length: 25 }, (_, i) => ({ close: 100 + Math.sin(i) * 2 }));
    const out = computeHvRv(bars);
    assert.ok(out.hv20 !== null, "25 real bars should be enough for HV20");
    assert.strictEqual(out.hv60, null, "25 real bars is not enough for HV60 — must not be fabricated");
    assert.ok(out.rv10 !== null, "25 real bars should be enough for RV10");
  });
  ok("computeSkew: honest unavailable when no real per-contract delta present (Yahoo fallback chain)", () => {
    const { computeSkew } = require("../src/volatility-lab");
    const out = computeSkew([{ strike: 100, type: "call", delta: null, iv: 25 }, { strike: 100, type: "put", delta: null, iv: 28 }]);
    assert.strictEqual(out.available, false);
    assert.ok(out.reason.includes("delta"));
  });
  ok("computeSkew: real put-minus-call IV at the real contracts nearest 25-delta", () => {
    const { computeSkew } = require("../src/volatility-lab");
    const contracts = [
      { strike: 90, type: "put", delta: -0.10, iv: 22 },
      { strike: 95, type: "put", delta: -0.25, iv: 30 },
      { strike: 100, type: "call", delta: 0.50, iv: 24 },
      { strike: 105, type: "call", delta: 0.25, iv: 26 },
      { strike: 110, type: "call", delta: 0.10, iv: 20 },
    ];
    const out = computeSkew(contracts);
    assert.strictEqual(out.available, true);
    assert.strictEqual(out.putStrike, 95);
    assert.strictEqual(out.callStrike, 105);
    assert.strictEqual(out.skew, 4, "30 (put) - 26 (call) = 4, real put skew");
  });
  ok("computeTermStructure: honest unavailable with only one real expiry sampled", () => {
    const { computeTermStructure } = require("../src/volatility-lab");
    const out = computeTermStructure([{ strike: 100, expiry: "2026-09-18", dte: 30, type: "call", iv: 25 }], 100);
    assert.strictEqual(out.available, false);
  });
  ok("computeTermStructure: real contango/backwardation read off real ATM IV across real expiries", () => {
    const { computeTermStructure } = require("../src/volatility-lab");
    const contracts = [
      { strike: 100, expiry: "2026-09-01", dte: 14, type: "call", iv: 40 },
      { strike: 100, expiry: "2026-10-01", dte: 44, type: "call", iv: 25 },
    ];
    const out = computeTermStructure(contracts, 100);
    assert.strictEqual(out.available, true);
    assert.strictEqual(out.nearAtmIv, 40);
    assert.strictEqual(out.farAtmIv, 25);
    assert.ok(out.structure.includes("Backwardation"), "near-term IV (40) higher than far-term (25) is real backwardation");
  });
  ok("ivRankTrend: honest unavailable with fewer than 3 real daily snapshots", () => {
    const { ivRankTrend } = require("../src/volatility-lab");
    const out = ivRankTrend("AAPL", [{ symbols: [{ symbol: "AAPL", iv: 30 }] }]);
    assert.strictEqual(out.available, false);
  });
  ok("ivRankTrend: real rising/falling read off real recent IV snapshot history", () => {
    const { ivRankTrend } = require("../src/volatility-lab");
    const history = [
      { symbols: [{ symbol: "AAPL", iv: 20 }] },
      { symbols: [{ symbol: "AAPL", iv: 22 }] },
      { symbols: [{ symbol: "AAPL", iv: 30 }] },
    ];
    const out = ivRankTrend("AAPL", history);
    assert.strictEqual(out.available, true);
    assert.strictEqual(out.direction, "Rising", "20 -> 30 is a real +50% rise, well past the 10% threshold");
  });
  ok("volRecommendation: deterministic threshold table off real IV Rank, mirrors regimeStrategyHint's pattern", () => {
    const { volRecommendation } = require("../src/volatility-lab");
    assert.strictEqual(volRecommendation({ ivRank: 80 }), "Sell Premium");
    assert.strictEqual(volRecommendation({ ivRank: 15 }), "Buy Premium");
    assert.strictEqual(volRecommendation({ ivRank: 50 }), "Neutral / Avoid");
    assert.strictEqual(volRecommendation({}), "Insufficient Data");
  });

  console.log("Checking strategy-selector.js (Phase 9, AI Strategy Selector)…");
  ok("selectStrategy: trending bullish + low IV Rank -> Long Calls; + high IV Rank -> Bull Call Spread", () => {
    const { selectStrategy } = require("../src/strategy-selector");
    assert.strictEqual(selectStrategy({ bias: "Bullish", character: "Trending", ivRank: 20 }).strategy, "Long Calls");
    assert.strictEqual(selectStrategy({ bias: "Bullish", character: "Trending", ivRank: 75 }).strategy, "Bull Call Spread");
  });
  ok("selectStrategy: trending bearish + low IV Rank -> Long Puts; + high IV Rank -> Bear Put Spread", () => {
    const { selectStrategy } = require("../src/strategy-selector");
    assert.strictEqual(selectStrategy({ bias: "Bearish", character: "Trending", ivRank: 20 }).strategy, "Long Puts");
    assert.strictEqual(selectStrategy({ bias: "Bearish", character: "Trending", ivRank: 75 }).strategy, "Bear Put Spread");
  });
  ok("selectStrategy: range-bound + high IV Rank -> Iron Condor; + low IV Rank -> Avoid / Wait", () => {
    const { selectStrategy } = require("../src/strategy-selector");
    assert.strictEqual(selectStrategy({ bias: "Neutral", character: "Range", ivRank: 65 }).strategy, "Iron Condor");
    assert.strictEqual(selectStrategy({ bias: "Neutral", character: "Range", ivRank: 20 }).strategy, "Avoid / Wait");
  });
  ok("selectStrategy: null IV Rank degrades to a directional-only pick, never guesses an IV regime", () => {
    const { selectStrategy } = require("../src/strategy-selector");
    assert.strictEqual(selectStrategy({ bias: "Bullish", character: "Trending", ivRank: null }).strategy, "Long Calls");
  });
  ok("selectStrategy: honest Wait for Confirmation for a real character with no defined rule (Volatile/Low Volatility)", () => {
    const { selectStrategy } = require("../src/strategy-selector");
    const out = selectStrategy({ bias: "Bullish", character: "Volatile", ivRank: 50 });
    assert.strictEqual(out.strategy, "Wait for Confirmation");
    assert.ok(out.reason.includes("Volatile"));
  });

  const callChain = [
    { strike: 95, expiry: "2026-09-18", contractSymbol: "C95", bid: 6.0, ask: 6.4, lastPrice: 6.2, delta: 0.62, pop: 58, liquidityScore: 80, rankScore: 70 },
    { strike: 100, expiry: "2026-09-18", contractSymbol: "C100", bid: 3.0, ask: 3.2, lastPrice: 3.1, delta: 0.48, pop: 50, liquidityScore: 85, rankScore: 75 },
    { strike: 105, expiry: "2026-09-18", contractSymbol: "C105", bid: 1.2, ask: 1.4, lastPrice: 1.3, delta: 0.30, pop: 32, liquidityScore: 60, rankScore: 55 },
    { strike: 110, expiry: "2026-09-18", contractSymbol: "C110", bid: 0.4, ask: 0.5, lastPrice: 0.45, delta: 0.14, pop: 15, liquidityScore: 45, rankScore: 30 },
    { strike: 115, expiry: "2026-09-18", contractSymbol: "C115", bid: 0.1, ask: 0.15, lastPrice: 0.12, delta: 0.05, pop: 8, liquidityScore: 50, rankScore: 20 },
  ];
  const putChain = [
    { strike: 85, expiry: "2026-09-18", contractSymbol: "P85", bid: 0.1, ask: 0.15, lastPrice: 0.12, delta: -0.05, pop: 8, liquidityScore: 50, rankScore: 20 },
    { strike: 90, expiry: "2026-09-18", contractSymbol: "P90", bid: 0.5, ask: 0.6, lastPrice: 0.55, delta: -0.15, pop: 16, liquidityScore: 55, rankScore: 32 },
    { strike: 95, expiry: "2026-09-18", contractSymbol: "P95", bid: 1.3, ask: 1.5, lastPrice: 1.4, delta: -0.30, pop: 33, liquidityScore: 60, rankScore: 55 },
    { strike: 100, expiry: "2026-09-18", contractSymbol: "P100", bid: 3.1, ask: 3.3, lastPrice: 3.2, delta: -0.50, pop: 51, liquidityScore: 85, rankScore: 74 },
  ];

  ok("buildLegs: Long Calls picks the real highest-rankScore call, honest gate below the liquidity floor", () => {
    const { buildLegs } = require("../src/strategy-selector");
    const out = buildLegs("Long Calls", { calls: callChain, puts: putChain, underlying: 100 });
    assert.strictEqual(out.available, true);
    assert.strictEqual(out.legs[0].strike, 100, "rankScore 75 (strike 100) beats rankScore 70 (strike 95)");
    assert.strictEqual(out.legs[0].action, "BUY");
  });
  ok("buildLegs: Bull Call Spread constructs a real 2-leg long+short with a real net debit", () => {
    const { buildLegs } = require("../src/strategy-selector");
    const out = buildLegs("Bull Call Spread", { calls: callChain, puts: putChain, underlying: 100 });
    assert.strictEqual(out.available, true);
    assert.strictEqual(out.legs.length, 2);
    assert.strictEqual(out.legs[0].action, "BUY");
    assert.strictEqual(out.legs[1].action, "SELL");
    assert.ok(out.legs[1].strike > out.legs[0].strike, "short leg must be further OTM than the long leg");
    assert.ok(out.netDebit > 0, "a bull call spread's real net debit must be positive");
  });
  ok("buildLegs: Iron Condor constructs a real 4-leg structure with a real net credit", () => {
    const { buildLegs } = require("../src/strategy-selector");
    const out = buildLegs("Iron Condor", { calls: callChain, puts: putChain, underlying: 100 });
    assert.strictEqual(out.available, true);
    assert.strictEqual(out.legs.length, 4);
    assert.strictEqual(out.legs.filter(l => l.action === "SELL").length, 2);
    assert.strictEqual(out.legs.filter(l => l.action === "BUY").length, 2);
  });
  ok("buildLegs: honest unavailable when a real leg's liquidity is below the fill-reasonably floor", () => {
    const { buildLegs, MIN_LIQUIDITY } = require("../src/strategy-selector");
    const thinChain = [
      { strike: 100, expiry: "2026-09-18", contractSymbol: "C100", bid: 3.0, ask: 3.2, lastPrice: 3.1, delta: 0.48, pop: 50, liquidityScore: 85, rankScore: 75 },
      // Only real OTM candidate is illiquid (liquidityScore 20 < MIN_LIQUIDITY) — must gate, not silently trade it.
      { strike: 105, expiry: "2026-09-18", contractSymbol: "C105", bid: 1.2, ask: 1.4, lastPrice: 1.3, delta: 0.30, pop: 32, liquidityScore: 20, rankScore: 55 },
    ];
    const out = buildLegs("Bull Call Spread", { calls: thinChain, puts: putChain, underlying: 100 });
    assert.strictEqual(out.available, false);
    assert.ok(out.reason.includes("liquidity"));
    assert.ok(MIN_LIQUIDITY > 20, "fixture's illiquid leg must actually be below the real floor");
  });
  ok("buildLegs: honest unavailable with no real underlying price", () => {
    const { buildLegs } = require("../src/strategy-selector");
    const out = buildLegs("Long Calls", { calls: callChain, puts: putChain, underlying: 0 });
    assert.strictEqual(out.available, false);
  });

  console.log("Checking checklist-engine.js (Phase 10, Trade Checklist)…");
  const { computeChecklist } = await import("../axiom-runner/components/checklist-engine.js");
  const uptrendBars = Array.from({ length: 210 }, (_, i) => ({
    time: i, high: 105 + i * 0.05, low: 95 + i * 0.05, close: 100 + i * 0.05, volume: 1_000_000,
  }));
  ok("computeChecklist: unanimous real bullish inputs pass every dot, A+ grade", () => {
    const out = computeChecklist({
      bars: uptrendBars, price: 120, rvol: 2.0,
      newsSentiment: { score: 2, bulls: 5, bears: 1 },
      darkPool: { prints: [{ value: 3_000_000 }] },
      optionsFlow: { callNotional: 6_000_000, putNotional: 2_000_000 },
      gammaExposure: { available: true, netGEX: 150_000 },
      smc: { bos: { type: "BULL_BOS", label: "Bullish break of structure" } },
    });
    assert.strictEqual(out.total, 11, "all 11 checks should be real/gated-in with this fixture's complete real inputs");
    assert.strictEqual(out.passCount, 11);
    assert.strictEqual(out.grade, "A+");
  });
  ok("computeChecklist: unanimous real bearish/negative inputs fail every dot, Avoid grade", () => {
    const downtrendBars = Array.from({ length: 210 }, (_, i) => ({
      time: i, high: 205 - i * 0.05, low: 195 - i * 0.05, close: 200 - i * 0.05, volume: 1_000_000,
    }));
    const out = computeChecklist({
      bars: downtrendBars, price: 50, rvol: 0.5,
      newsSentiment: { score: -3, bulls: 1, bears: 6 },
      darkPool: { prints: [{ value: 100_000 }] },
      optionsFlow: { callNotional: 1_000_000, putNotional: 5_000_000 },
      gammaExposure: { available: true, netGEX: -80_000 },
      smc: { bos: { type: "BEAR_BOS", label: "Bearish break of structure" } },
    });
    assert.strictEqual(out.passCount, 0);
    assert.strictEqual(out.grade, "Avoid");
  });
  ok("computeChecklist: honest null (not fabricated pass/fail) per-dot when real data is missing", () => {
    const out = computeChecklist({ bars: uptrendBars.slice(-5), price: 120 });
    const rvolDot = out.dots.find(d => d.label.includes("RVOL"));
    assert.strictEqual(rvolDot.pass, null, "no real rvol provided — must be null, never guessed true/false");
    const gammaDot = out.dots.find(d => d.label.includes("Gamma"));
    assert.strictEqual(gammaDot.pass, null, "no real gammaExposure provided — must be null");
    assert.ok(out.total < 11, "null dots must be excluded from the real pass/total count");
  });
  ok("computeChecklist: dark pool activity reuses the exact real $500K threshold, not a new invented one", () => {
    const below = computeChecklist({ bars: uptrendBars, price: 120, darkPool: { prints: [{ value: 400_000 }] } });
    const above = computeChecklist({ bars: uptrendBars, price: 120, darkPool: { prints: [{ value: 600_000 }] } });
    assert.strictEqual(below.dots.find(d => d.label.includes("Dark Pool")).pass, false);
    assert.strictEqual(above.dots.find(d => d.label.includes("Dark Pool")).pass, true);
  });
  ok("computeChecklist: call flow reuses the real >50% call-notional-ratio convention", () => {
    const out = computeChecklist({ bars: uptrendBars, price: 120, optionsFlow: { callNotional: 3_000_000, putNotional: 7_000_000 } });
    assert.strictEqual(out.dots.find(d => d.label.includes("Call Flow")).pass, false, "30% call-side notional is bearish-skewed flow, not bullish");
  });

  console.log("Checking position-manager-engine.js (Phase 11, AI Exit Engine)…");
  ok("computePositionPnl: real premium×100×contracts math, honest null with no real current premium", () => {
    const { computePositionPnl } = require("../src/position-manager-engine");
    const out = computePositionPnl({ entryPremium: 5, currentPremium: 8, qty: 2 });
    assert.strictEqual(out.pnl, 600, "(8-5)*100*2 = 600");
    assert.strictEqual(out.pnlPct, 60);
    assert.strictEqual(computePositionPnl({ entryPremium: 5, currentPremium: null, qty: 1 }).pnl, null);
  });
  ok("computeExitSignals: real profit + far expiry + no earnings nearby -> Hold", () => {
    const { computeExitSignals } = require("../src/position-manager-engine");
    const future = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
    const out = computeExitSignals({ entryPremium: 5, currentPremium: 8, qty: 1, expiry: future }, { ivRank: 40, daysToEarnings: 60, delta: 0.5 });
    assert.strictEqual(out.recommendation, "Hold");
    assert.strictEqual(out.ivCrushRisk, null, "60 real days to earnings is outside the 10-day IV crush window — honest null, not a guess");
  });
  ok("computeExitSignals: real large loss + near expiry -> Exit Now, with real reasons", () => {
    const { computeExitSignals } = require("../src/position-manager-engine");
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const out = computeExitSignals({ entryPremium: 10, currentPremium: 4, qty: 1, expiry: soon }, {});
    assert.strictEqual(out.recommendation, "Exit Now");
    assert.strictEqual(out.timeDecayWarning, true);
    assert.ok(out.reasons.length >= 2, "both the real P/L and real time-decay reasons should be recorded");
  });

  console.log("Checking paper-positions-store.js (Phase 11, Position Manager)…");
  {
    const store = require("../src/paper-positions-store");
    ok("openPosition/closePosition: real CRUD lifecycle, never fabricates a premium", () => {
      const pos = store.openPosition({ symbol: "test_aapl", type: "call", strike: 300, expiry: "2026-12-18", entryPremium: 5, entryUnderlying: 295, qty: 1 });
      assert.strictEqual(pos.status, "open");
      assert.strictEqual(pos.currentPremium, 5, "current premium starts equal to the real entry premium, never a guessed different number");
      assert.ok(store.listOpenPositions().some(p => p.id === pos.id));

      const repriced = store.updatePositionPricing(pos.id, { currentPremium: 7.5 });
      assert.strictEqual(repriced.currentPremium, 7.5);

      const closed = store.closePosition(pos.id, { exitPremium: 8, exitReason: "target-hit" });
      assert.strictEqual(closed.status, "closed");
      assert.strictEqual(closed.exitPremium, 8);
      assert.ok(!store.listOpenPositions().some(p => p.id === pos.id), "closed position must leave the open list");
      assert.ok(store.listClosedPositions().some(p => p.id === pos.id));

      // Test hygiene — leave the real on-disk store exactly as found.
      const remaining = store.loadPositions().filter(p => p.id !== pos.id);
      const { writeJsonAtomic } = require("../src/atomic-write");
      const path = require("node:path");
      const { ROOT } = require("../src/config");
      writeJsonAtomic(path.join(ROOT, "data", "paper-positions.json"), { positions: remaining, updatedAt: new Date().toISOString() });
    });
  }

  console.log("Checking portfolio-rotation-engine.js (Green Light AI gap — Portfolio Rotation)…");
  const { findWeakestPosition, evaluateRotation } = await import("../axiom-runner/components/portfolio-rotation-engine.js");
  ok("findWeakestPosition: real minimum-quality open position, honest null on empty input", () => {
    assert.strictEqual(findWeakestPosition([]), null);
    assert.strictEqual(findWeakestPosition(null), null);
    const out = findWeakestPosition([{ symbol: "AAPL", quality: 80 }, { symbol: "TSLA", quality: 55 }, { symbol: "NVDA", quality: 92 }]);
    assert.strictEqual(out.symbol, "TSLA");
  });
  ok("evaluateRotation: rotates only when the real quality improvement clears the documented threshold", () => {
    const open = [{ symbol: "AAPL", quality: 80 }, { symbol: "TSLA", quality: 55 }];
    const marginal = evaluateRotation(open, { symbol: "NVDA", quality: 65 }); // 65-55=10 < default 15
    assert.strictEqual(marginal, null, "a 10-point improvement must not trigger rotation under the default 15-point threshold");
    const real = evaluateRotation(open, { symbol: "NVDA", quality: 90 }); // 90-55=35 >= 15
    assert.ok(real);
    assert.strictEqual(real.close.symbol, "TSLA", "must always target the real weakest open position, never an arbitrary one");
    assert.strictEqual(real.open.symbol, "NVDA");
    assert.strictEqual(real.improvement, 35);
  });
  ok("evaluateRotation: honest null with no open positions or no real candidate quality", () => {
    assert.strictEqual(evaluateRotation([], { symbol: "NVDA", quality: 90 }), null);
    assert.strictEqual(evaluateRotation([{ symbol: "AAPL", quality: 50 }], null), null);
    assert.strictEqual(evaluateRotation([{ symbol: "AAPL", quality: 50 }], { symbol: "NVDA", quality: NaN }), null);
  });
  ok("evaluateRotation: real custom minImprovement threshold is respected", () => {
    const open = [{ symbol: "AAPL", quality: 80 }];
    assert.strictEqual(evaluateRotation(open, { symbol: "NVDA", quality: 85 }, { minImprovement: 3 })?.close.symbol, "AAPL");
    assert.strictEqual(evaluateRotation(open, { symbol: "NVDA", quality: 85 }, { minImprovement: 10 }), null);
  });

  console.log("Checking risk-composite.js (Phase 13, Risk Engine composite / Portfolio AI)…");
  const { computeCompositeRiskScore, aggregatePortfolioGreeks } = await import("../axiom-runner/components/risk-composite.js");
  ok("computeCompositeRiskScore: honest null with zero real dimensions available", () => {
    const out = computeCompositeRiskScore({});
    assert.strictEqual(out.score, null);
    assert.strictEqual(out.dimensionsUsed, 0);
  });
  ok("computeCompositeRiskScore: single real dimension (open risk only) still produces a real weighted score", () => {
    const out = computeCompositeRiskScore({ riskSnapshot: { openRiskPct: 0, topPositionPct: null } });
    assert.strictEqual(out.dimensionsUsed, 1);
    assert.strictEqual(out.score, 100, "0% open risk against the 6% cap is a perfect real safety score");
    assert.strictEqual(out.label, "Low Risk");
  });
  ok("computeCompositeRiskScore: real blend across all 5 dimensions when every real input is present", () => {
    const out = computeCompositeRiskScore({
      riskSnapshot: { openRiskPct: 3, topPositionPct: 20 },
      riskLab: { totalValue: 10000, var95: 400 },
      correlation: { clusters: [{ a: "AAPL", b: "MSFT", correlation: 0.8 }] },
      marketRiskScore: 30,
    });
    assert.strictEqual(out.dimensionsUsed, 5);
    assert.ok(out.score > 0 && out.score < 100);
  });
  ok("computeCompositeRiskScore: high real open-risk% + concentration correctly drags the score into a lower band", () => {
    const out = computeCompositeRiskScore({ riskSnapshot: { openRiskPct: 6, topPositionPct: 40 } });
    assert.strictEqual(out.score, 0);
    assert.strictEqual(out.label, "High Risk");
  });
  ok("aggregatePortfolioGreeks: honest unavailable with no open positions", () => {
    assert.strictEqual(aggregatePortfolioGreeks([]).available, false);
    assert.strictEqual(aggregatePortfolioGreeks(null).available, false);
  });
  ok("aggregatePortfolioGreeks: honest unavailable when no open position has real Greeks yet", () => {
    const out = aggregatePortfolioGreeks([{ symbol: "AAPL", qty: 1, greeks: null }, { symbol: "TSLA", qty: 1, greeks: { delta: null, gamma: null, theta: null, vega: null } }]);
    assert.strictEqual(out.available, false);
  });
  ok("aggregatePortfolioGreeks: real qty×100-weighted sum across open positions with real Greeks", () => {
    const out = aggregatePortfolioGreeks([
      { symbol: "AAPL", qty: 2, greeks: { delta: 0.5, gamma: 0.02, theta: -0.1, vega: 0.15 } },
      { symbol: "TSLA", qty: 1, greeks: { delta: -0.3, gamma: 0.01, theta: -0.05, vega: 0.1 } },
    ]);
    assert.strictEqual(out.available, true);
    assert.strictEqual(out.positionsWithGreeks, 2);
    assert.strictEqual(out.netDelta, 2 * 0.5 * 100 + 1 * -0.3 * 100);
    assert.strictEqual(out.netTheta, 2 * -0.1 * 100 + 1 * -0.05 * 100);
  });
  ok("aggregatePortfolioGreeks: real partial-availability skip — a position missing one Greek doesn't zero out the others' real sum", () => {
    const out = aggregatePortfolioGreeks([{ symbol: "AAPL", qty: 1, greeks: { delta: 0.4, gamma: null, theta: null, vega: null } }]);
    assert.strictEqual(out.available, true);
    assert.strictEqual(out.netDelta, 40);
    assert.strictEqual(out.netGamma, null);
  });

  console.log("Checking watchlist-institutional-alerts.js (Phase 14, Gamma Breakout + Volume Spike)…");
  const { gammaFlipSide, volumeSpikeTriggered } = require("../src/watchlist-institutional-alerts");
  ok("gammaFlipSide: real above/below read off price vs the real gamma flip point", () => {
    assert.strictEqual(gammaFlipSide(105, 100), "above");
    assert.strictEqual(gammaFlipSide(95, 100), "below");
    assert.strictEqual(gammaFlipSide(100, 100), "above", "exactly at the flip point counts as above (>=), a documented tie-break not a guess");
  });
  ok("gammaFlipSide: honest null when either real input isn't a finite number", () => {
    assert.strictEqual(gammaFlipSide(null, 100), null);
    assert.strictEqual(gammaFlipSide(105, NaN), null);
    assert.strictEqual(gammaFlipSide(105, undefined), null);
  });
  ok("volumeSpikeTriggered: real edge-trigger only fires crossing INTO a spike, not while already elevated", () => {
    assert.strictEqual(volumeSpikeTriggered(1.5, 3.5), true, "real prior 1.5x -> real current 3.5x crosses the 3.0x band");
    assert.strictEqual(volumeSpikeTriggered(3.2, 3.5), false, "already above threshold last check — not a new crossing");
    assert.strictEqual(volumeSpikeTriggered(1.5, 2.0), false, "current still below threshold");
  });
  ok("volumeSpikeTriggered: honest false with no real prior baseline (first-ever check seeds silently)", () => {
    assert.strictEqual(volumeSpikeTriggered(undefined, 5.0), false);
    assert.strictEqual(volumeSpikeTriggered(NaN, 5.0), false);
  });
  ok("volumeSpikeTriggered: real custom threshold is respected", () => {
    assert.strictEqual(volumeSpikeTriggered(1.0, 2.2, 2.0), true);
    assert.strictEqual(volumeSpikeTriggered(1.0, 1.8, 2.0), false);
  });

  console.log("Checking risk-lab-calc.js computePortfolioPerformance (open-portfolio Sharpe/Sortino/MaxDD)…");
  const { computePortfolioPerformance } = require("../src/risk-lab-calc");
  const mkBars = (closes) => closes.map((close) => ({ close }));
  ok("computePortfolioPerformance: honest null below the real 20-trading-day floor", () => {
    const shortBars = mkBars(Array.from({ length: 10 }, (_, i) => 100 + i));
    const out = computePortfolioPerformance([{ symbol: "AAPL", weight: 1 }], { AAPL: shortBars });
    assert.strictEqual(out.sharpe, null);
    assert.strictEqual(out.sortino, null);
    assert.strictEqual(out.maxDrawdownPct, null);
  });
  ok("computePortfolioPerformance: honest null with no real bars for any holding", () => {
    const out = computePortfolioPerformance([{ symbol: "AAPL", weight: 1 }], {});
    assert.strictEqual(out.sharpe, null);
    assert.strictEqual(out.daysUsed, 0);
  });
  ok("computePortfolioPerformance: real positive Sharpe off a real steadily-rising 25-day series, zero real drawdown", () => {
    const closes = Array.from({ length: 26 }, (_, i) => 100 * Math.pow(1.01, i)); // steady +1%/day
    const out = computePortfolioPerformance([{ symbol: "AAPL", weight: 1 }], { AAPL: mkBars(closes) });
    assert.strictEqual(out.daysUsed, 25);
    assert.ok(out.sharpe > 0, "steady real gains produce a real positive Sharpe");
    assert.strictEqual(out.maxDrawdownPct, 0, "monotonic real gains never draw down");
  });
  ok("computePortfolioPerformance: real negative Sharpe + real nonzero drawdown off a steadily-falling series", () => {
    const closes = Array.from({ length: 26 }, (_, i) => 100 * Math.pow(0.99, i)); // steady -1%/day
    const out = computePortfolioPerformance([{ symbol: "AAPL", weight: 1 }], { AAPL: mkBars(closes) });
    assert.ok(out.sharpe < 0, "steady real losses produce a real negative Sharpe");
    assert.ok(out.maxDrawdownPct > 0, "steady real losses produce a real nonzero drawdown");
  });
  ok("computePortfolioPerformance: real $-weighted blend across 2 real holdings with different day-counts uses the shorter real overlap", () => {
    const risingCloses = Array.from({ length: 30 }, (_, i) => 100 * Math.pow(1.01, i));
    const shorterCloses = Array.from({ length: 22 }, (_, i) => 50 * Math.pow(1.005, i));
    const out = computePortfolioPerformance(
      [{ symbol: "AAPL", weight: 0.5 }, { symbol: "MSFT", weight: 0.5 }],
      { AAPL: mkBars(risingCloses), MSFT: mkBars(shorterCloses) }
    );
    assert.strictEqual(out.daysUsed, 21, "real overlap is bounded by MSFT's shorter real series");
    assert.ok(out.sharpe > 0);
  });

  console.log("Checking classifyEntryType (Green Light AI spec gap — 5 named Entry Engine types)…");
  const { classifyEntryType } = await import("../axiom-runner/components/market-helpers.js");
  ok("classifyEntryType: Ideal Entry requires a confirmed breakout AND a real high Trade Setup Score", () => {
    const row = { atBuyPoint: true, volConfirmed: true };
    assert.strictEqual(classifyEntryType(row, 85).type, "Ideal Entry");
    assert.strictEqual(classifyEntryType(row, 65).type, "Breakout Entry", "same real breakout, but below the high-conviction score bar — Breakout, not Ideal");
  });
  ok("classifyEntryType: Early Entry matches the real Pre-Pop condition (tightening, coiled within 5% below pivot)", () => {
    const row = { actionable: true, atBuyPoint: false, extended: false, tightening: true, abovePivotPct: -3 };
    assert.strictEqual(classifyEntryType(row).type, "Early Entry");
  });
  ok("classifyEntryType: Trend Entry matches the real Momentum condition (RS>=80, Stage 2)", () => {
    const row = { rsRating: 85, stage: "Stage 2 — Uptrend" };
    assert.strictEqual(classifyEntryType(row).type, "Trend Entry");
  });
  ok("classifyEntryType: Pullback Entry matches the real Pullback condition (actionable, not at buy point, not extended)", () => {
    const row = { actionable: true, atBuyPoint: false, extended: false, rsRating: 50, stage: "Stage 1" };
    assert.strictEqual(classifyEntryType(row).type, "Pullback Entry");
  });
  ok("classifyEntryType: honest null when no real entry-type condition is met", () => {
    const row = { actionable: false, atBuyPoint: false, extended: true };
    assert.strictEqual(classifyEntryType(row), null);
  });

  console.log("Checking computeInstitutionalSummary + computeBestInstitutionalZone (Smart Money page redesign)…");
  const { computeInstitutionalSummary, computeBestInstitutionalZone } = await import("../axiom-runner/components/market-helpers.js");
  ok("computeInstitutionalSummary: real bullish BOS + above-VWAP + trend-favors-continuation reads as 4 real plain-English lines", () => {
    const lines = computeInstitutionalSummary({
      price: 105,
      smc: { bos: { type: "BULL_BOS" }, choch: null, vwap20: 100, orderBlocks: [{ type: "BULL_OB" }, { type: "BULL_OB" }], liquidity: [{ price: 110, label: "Weekly High" }] },
      trend: { passCount: 7 },
    });
    assert.strictEqual(lines.length, 4);
    assert.ok(lines[0].includes("Bullish structure") && lines[0].includes("multiple real institutional support zones"));
    assert.ok(lines[1].includes("above the 20-day VWAP"));
    assert.ok(lines[2].includes("Liquidity rests above current price"));
    assert.ok(lines[3].includes("Trend favors continuation"));
  });
  ok("computeInstitutionalSummary: honest fallbacks when structure/VWAP/liquidity are all real-but-absent", () => {
    const lines = computeInstitutionalSummary({ price: 50, smc: { bos: null, choch: null, vwap20: null, orderBlocks: [], liquidity: [] }, trend: { passCount: 3 } });
    assert.ok(lines[0].includes("No clear real break-of-structure signal"));
    assert.ok(lines[1].includes("VWAP unavailable"));
    assert.ok(lines[2].includes("No real liquidity levels"));
    assert.ok(lines[3].includes("Trend is unfavorable"));
  });
  ok("computeInstitutionalSummary: honest empty array with no real data at all", () => {
    assert.deepStrictEqual(computeInstitutionalSummary(null), []);
  });
  ok("computeBestInstitutionalZone: nearest real bullish Order Block wins over a further bullish FVG", () => {
    const out = computeBestInstitutionalZone({
      price: 100,
      smc: {
        orderBlocks: [{ type: "BULL_OB", bot: 98, top: 99, mid: 98.5 }, { type: "BEAR_OB", bot: 120, top: 122, mid: 121 }],
        fvgs: [{ type: "BULL_FVG", bot: 80, top: 82, mid: 81 }],
        vwap20: 97, volumeProfile: { vpoc: 99.5 },
      },
      marketControl: "BUYERS",
      setup: { stop: 95, target2: 110, target3: 120 },
    });
    assert.strictEqual(out.source, "Order Block");
    assert.deepStrictEqual(out.zone, { bot: 98, top: 99 });
    assert.strictEqual(out.stop, 95);
    assert.strictEqual(out.target1, 110);
    assert.strictEqual(out.target2, 120, "Best Zone targets must reuse the exact same real Trade Plan numbers, never re-derive their own");
    const reasonMap = Object.fromEntries(out.reasons.map(r => [r.label, r.pass]));
    assert.strictEqual(reasonMap["Bullish order block nearby"], true);
    assert.strictEqual(reasonMap["Price above VWAP"], true);
    assert.strictEqual(reasonMap["Near volume point of control (VPOC)"], true);
    assert.strictEqual(reasonMap["Buyers in control"], true);
  });
  ok("computeBestInstitutionalZone: falls back to nearest real bullish FVG when no Order Block exists", () => {
    const out = computeBestInstitutionalZone({
      price: 100,
      smc: { orderBlocks: [], fvgs: [{ type: "BULL_FVG", bot: 96, top: 98, mid: 97 }], vwap20: 101, volumeProfile: { vpoc: 50 } },
      marketControl: "SELLERS",
      setup: { stop: 94, target2: 108, target3: 115 },
    });
    assert.strictEqual(out.source, "Fair Value Gap");
    assert.deepStrictEqual(out.zone, { bot: 96, top: 98 });
  });
  ok("computeBestInstitutionalZone: honest null zone when no real bullish OB or FVG exists nearby", () => {
    const out = computeBestInstitutionalZone({ price: 100, smc: { orderBlocks: [], fvgs: [], vwap20: null, volumeProfile: {} }, marketControl: "MIXED", setup: {} });
    assert.strictEqual(out.zone, null);
    assert.strictEqual(out.source, null);
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

  const { computeGreenLight } = await import("../axiom-runner/components/trading-utils.js");
  ok("computeGreenLight altSetup: real BOS breakout makes a RED (1/5) setup tradeable", () => {
    const q = { price: 100, volume: 1_000_000, changesPercentage: -1 };
    const scanRow = { ema21v: 0, ema9v: 0, macdBull: false, rsiVal: 0 };
    const trend = { stage: "Stage 1", smc: { bos: { type: "BULL_BOS" } }, higherLows: false };
    const gl = computeGreenLight(q, 0.5, scanRow, null, trend);
    assert.strictEqual(gl.passed, 1);
    assert.strictEqual(gl.signal, "RED");
    assert.strictEqual(gl.altSetup?.type, "BOS Breakout");
    assert.strictEqual(gl.tradeable, true);
  });
  ok("computeGreenLight altSetup: real RVOL breakout (5x + real +3% move) makes a non-GREEN setup tradeable", () => {
    const q = { price: 50, volume: 5_000_000, avgVolume: 1_000_000, changesPercentage: 3 };
    const scanRow = { ema21v: 0, ema9v: 0, macdBull: false, rsiVal: 0 };
    const gl = computeGreenLight(q, 0.2, scanRow, null, null);
    assert.notStrictEqual(gl.signal, "GREEN", "classic checklist alone must NOT already qualify this fixture — the alt path is what's under test");
    assert.strictEqual(gl.altSetup?.type, "RVOL Breakout");
    assert.strictEqual(gl.tradeable, true);
  });
  ok("computeGreenLight altSetup: an unsafe market blocks the alt path even with a real BOS breakout", () => {
    const q = { price: 100, volume: 1_000_000, changesPercentage: -1 };
    const scanRow = { ema21v: 0, ema9v: 0, macdBull: false, rsiVal: 0 };
    const trend = { stage: "Stage 1", smc: { bos: { type: "BULL_BOS" } }, higherLows: false };
    const gl = computeGreenLight(q, -1, scanRow, null, trend); // SPY -1% — market NOT safe
    assert.strictEqual(gl.altSetup, null);
    assert.strictEqual(gl.tradeable, false);
  });
  ok("computeGreenLight altSetup: a real GREEN (5/5) setup is tradeable via the classic path regardless", () => {
    const q = { price: 100, priceAvg50: 90, priceAvg200: 80, volume: 2_000_000, avgVolume: 1_000_000, changesPercentage: 1 };
    const scanRow = { ema21v: 98, ema9v: 99, macdBull: true, rsiVal: 55 };
    const gl = computeGreenLight(q, 0.2, scanRow, null, null);
    assert.strictEqual(gl.passed, 5);
    assert.strictEqual(gl.signal, "GREEN");
    assert.strictEqual(gl.tradeable, true);
  });

  // Parity check — src/greenlight-calc.js is a hand-ported server-side copy
  // of this same computeGreenLight (2026-08-03, real Telegram entry alert
  // needs it runnable outside the browser). Guards against silent drift: if
  // either copy's real math ever changes without updating the other, this
  // fails loudly instead of the server alert quietly disagreeing with what
  // GreenLightTab shows in the app.
  const { computeGreenLight: computeGreenLightServer } = require("../src/greenlight-calc.js");
  const PARITY_FIELDS = ["passed", "signal", "tradeable", "px", "chg", "stop", "t1", "t2", "bestEntry", "entryNote", "atEntry", "aScore", "grade", "qualifiesAPlus"];
  const assertParity = (label, q, spyChg, scanRow, regime, trend) => {
    ok(`greenlight-calc.js parity: ${label}`, () => {
      const client = computeGreenLight(q, spyChg, scanRow, regime, trend);
      const server = computeGreenLightServer(q, spyChg, scanRow, regime, trend);
      for (const f of PARITY_FIELDS) {
        assert.deepStrictEqual(server[f], client[f], `field "${f}" diverged — client=${JSON.stringify(client[f])} server=${JSON.stringify(server[f])}`);
      }
      assert.deepStrictEqual(server.altSetup?.type ?? null, client.altSetup?.type ?? null, "altSetup type diverged");
    });
  };
  assertParity(
    "wait-for-pullback row (CRWD-shaped: price above support, real trend data, no scanRow)",
    { price: 196.20, priceAvg50: 185, priceAvg200: 170, volume: 3_000_000, avgVolume: 2_500_000, changesPercentage: 2.80, dayHigh: 197, dayLow: 193, yearHigh: 210, yearLow: 140 },
    1.93, null, 78,
    { stage: "Stage 2 uptrend", pctFromHigh: -6.6, abovePivotPct: 1.5, pivot: 193.26, volRatio: 1.8, higherLows: true, smc: null }
  );
  assertParity(
    "real GREEN 5/5 setup with full scanRow (EMA/RSI/MACD present)",
    { price: 100, priceAvg50: 90, priceAvg200: 80, volume: 2_000_000, avgVolume: 1_000_000, changesPercentage: 1 },
    0.2, { ema21v: 98, ema9v: 99, macdBull: true, rsiVal: 55 }, null, null
  );
  assertParity(
    "real BOS-breakout alt setup, RED classic signal",
    { price: 100, volume: 1_000_000, changesPercentage: -1 },
    0.5, { ema21v: 0, ema9v: 0, macdBull: false, rsiVal: 0 }, null,
    { stage: "Stage 1", smc: { bos: { type: "BULL_BOS" } }, higherLows: false }
  );
  assertParity(
    "price already at support (real 'at support' entry, honest-null scanRow)",
    { price: 100, priceAvg50: 100.3, changesPercentage: 0.4 },
    0.1, null, 60,
    { stage: "Stage 2", pctFromHigh: -3, abovePivotPct: 0.2, pivot: 98, volRatio: 1.2 }
  );

  // Parity check — src/day-trade-calc.js is a hand-ported server-side copy
  // of this same computeDayTradeSignal (2026-08-06, real Telegram Day Trade
  // Mode GREEN-signal alert needs it runnable outside the browser). Same
  // drift guard as the greenlight parity checks above.
  const { computeDayTradeSignal } = await import("../axiom-runner/components/trading-utils.js");
  const { computeDayTradeSignal: computeDayTradeSignalServer } = require("../src/day-trade-calc.js");
  const DAYTRADE_PARITY_FIELDS = [
    "px", "chg", "passed", "signal", "tradeable", "bestEntry", "entryNote", "atEntry",
    "stop", "target", "rr", "rrPass", "quality", "grade", "qualifiesAPlus", "marketPass",
    "entryTriggerStatus", "direction", "signalReason",
  ];
  const assertDayTradeParity = (label, row, spyChg, extra) => {
    ok(`day-trade-calc.js parity: ${label}`, () => {
      const client = computeDayTradeSignal(row, spyChg, extra);
      const server = computeDayTradeSignalServer(row, spyChg, extra);
      for (const f of DAYTRADE_PARITY_FIELDS) {
        assert.deepStrictEqual(server[f], client[f], `field "${f}" diverged — client=${JSON.stringify(client[f])} server=${JSON.stringify(server[f])}`);
      }
    });
  };
  assertDayTradeParity(
    "real GREEN 5/5 breakout row (above VWAP, OR breakout, RVOL, bullish 15m EMA stack)",
    { symbol: "NVDA", price: 121.5, vwap: 119.8, rvol: 2.3, aboveVwap: true, orBreakout: true, orHigh: 120.9, bull15: true, closeStrong: true, chgPct: 2.1, score: 82 },
    0.3
  );
  assertDayTradeParity(
    "real RED row (below VWAP, no breakout, thin volume, market unsafe)",
    { symbol: "XYZ", price: 48.2, vwap: 49.1, rvol: 0.6, aboveVwap: false, orBreakout: false, orHigh: 49.5, bull15: false, closeStrong: false, chgPct: -1.4, score: 20 },
    -0.8
  );
  assertDayTradeParity(
    "borderline YELLOW row (3 of 5 checks pass)",
    { symbol: "ABC", price: 60.0, vwap: 59.5, rvol: 1.8, aboveVwap: true, orBreakout: false, orHigh: 60.4, bull15: true, closeStrong: true, chgPct: 0.4, score: 55 },
    0.1
  );

  // ── "Fix Light Box SHORT math" (2026-08-23, explicit user request) —
  // real bug found while scoping Autopilot ASSIST execution: stop/target/
  // bestEntry were always computed with long-only shape regardless of
  // `direction`, so a confirmed BEARISH/breakdown setup got a stop BELOW
  // price (doesn't protect against a rally) and a target ABOVE price (on
  // a setup that's supposed to fall). This fixture is a real, hand-
  // verified BEARISH-direction row (confirmed breakdown, below VWAP,
  // bearish RSI/ROC/MACD, weak relative strength) — locks in that stop is
  // now above price, target is below price, and rr/bestEntry/entryNote/
  // atEntry all flip to their breakdown-side meaning. Also a free client/
  // server drift check on the fix, same as every other case here.
  ok("direction-aware SHORT math: BEARISH setup gets a real short-shaped stop/target", () => {
    const row = {
      symbol: "TEST", price: 95, vwap: 100, rvol: 1.1, aboveVwap: false, orBreakout: false, orHigh: 101, orLow: 96,
      bull15: false, closeStrong: false, chgPct: -5, score: 20,
      ema9: 94, ema21: 97, ema50: 99, rsi15m: 25, roc15m: -3, macdHistogram15m: -0.8,
      priceAction: { higherHighs: false, higherLows: false, breakout: false, breakdown: true, retest: false, failedBreakout: null, failedBreakdown: false },
    };
    const extra = { qqqChg: 0.5, sectorChg: 0.3 };
    const r = computeDayTradeSignalServer(row, -1.0, extra);
    assert.strictEqual(r.direction, "BEARISH", "fixture must actually resolve to a real BEARISH setup");
    assert.ok(r.stop > r.px, `stop ($${r.stop}) must be ABOVE price ($${r.px}) for a real short — it protects against a rally`);
    assert.ok(r.target < r.px, `target ($${r.target}) must be BELOW price ($${r.px}) for a real short — that's the direction of profit`);
    assert.strictEqual(r.rr, 1.5, "risk:reward must still be the real 1.5R the long-side formula uses");
    assert.strictEqual(r.entryTriggerStatus, "CONFIRMED", "fixture must actually reach a real confirmed breakdown trigger");
    assert.strictEqual(r.entryNote, "at breakdown ✅", "entryNote must use breakdown language for a real short, not breakout");
  });
  assertDayTradeParity(
    "real BEARISH breakdown row (below VWAP, confirmed breakdown, weak RS)",
    { symbol: "TEST", price: 95, vwap: 100, rvol: 1.1, aboveVwap: false, orBreakout: false, orHigh: 101, orLow: 96,
      bull15: false, closeStrong: false, chgPct: -5, score: 20,
      ema9: 94, ema21: 97, ema50: 99, rsi15m: 25, roc15m: -3, macdHistogram15m: -0.8,
      priceAction: { higherHighs: false, higherLows: false, breakout: false, breakdown: true, retest: false, failedBreakout: null, failedBreakdown: false } },
    -1.0, { qqqChg: 0.5, sectorChg: 0.3 }
  );

  // ── "Fix Trading Signal Logic — A+ Score vs Entry Trigger" (2026-08-19) —
  // validation-table cases straight from the user's own spec: a high setup
  // score alone must never auto-BUY, a real confirmed trigger can BUY even
  // at a lower score, an invalidated/mixed/below-threshold setup must never
  // BUY regardless of score. Each row below is a real, hand-verified
  // computeDayTradeSignal() output (not a guessed shape) — see the probe
  // scripts run during development. assertDayTradeParity also gives each
  // case a free client/server drift check on top of the outcome assertion.
  const strongBullishRow = (overrides) => Object.assign({
    symbol: "TEST", price: 100, vwap: 98, rvol: 2.2, aboveVwap: true, orBreakout: true, orHigh: 99.5, orLow: 97,
    bull15: true, closeStrong: true, chgPct: 2.5, score: 80,
    ema9: 100.2, ema21: 99.5, ema50: 98, rsi15m: 65, roc15m: 1.5, macdHistogram15m: 0.4,
    priceAction: { higherHighs: true, higherLows: true, breakout: true, breakdown: false, retest: true, failedBreakout: false, failedBreakdown: null },
  }, overrides);

  const assertSignal = (label, row, spyChg, extra, expected) => {
    ok(`signal logic: ${label}`, () => {
      const result = computeDayTradeSignalServer(row, spyChg, extra);
      assert.strictEqual(result.signal, expected.signal, `signal — got ${result.signal}, quality=${result.quality}, trigger=${result.entryTriggerStatus}, direction=${result.direction}`);
      if (expected.entryTriggerStatus) assert.strictEqual(result.entryTriggerStatus, expected.entryTriggerStatus, "entryTriggerStatus");
      if (expected.direction) assert.strictEqual(result.direction, expected.direction, "direction");
      assert.ok(result.signalReason && result.signalReason.length > 0, "signalReason must always be a non-empty explanation");
    });
    assertDayTradeParity(`${label} (parity)`, row, spyChg, extra);
  };

  // 1. MA-style: real quality (61, GOOD), but no breakout/retest and thin
  //    volume — trigger is NOT_READY, so a high-ish score must NOT auto-BUY.
  assertSignal(
    "high quality but NOT_READY trigger never auto-BUYs",
    strongBullishRow({ symbol: "MA", orBreakout: false, aboveVwap: true, rvol: 0.75,
      priceAction: { higherHighs: true, higherLows: true, breakout: false, breakdown: false, retest: false, failedBreakout: false, failedBreakdown: null } }),
    0.2, undefined,
    { signal: "YELLOW", entryTriggerStatus: "NOT_READY", direction: "BULLISH" }
  );

  // 2. AMZN-style: moderate quality (73) but a real confirmed OR breakout —
  //    proves a lower score CAN still BUY with a genuine confirmed trigger.
  assertSignal(
    "moderate quality with CONFIRMED trigger can BUY",
    strongBullishRow({ symbol: "AMZN", rvol: 1.8, orBreakout: true, aboveVwap: true, score: 65 }),
    0.2, undefined,
    { signal: "GREEN", entryTriggerStatus: "CONFIRMED", direction: "BULLISH" }
  );

  // 3. Same confirmed-trigger row as #2, but with the configurable
  //    MIN_BUY_SCORE raised above its quality (73 < 80) — proves the
  //    threshold gate overrides a confirmed trigger, and that it's real
  //    and wired, not decorative.
  assertSignal(
    "CONFIRMED trigger still can't BUY below a raised MIN_BUY_SCORE",
    strongBullishRow({ symbol: "AMZN", rvol: 1.8, orBreakout: true, aboveVwap: true, score: 65 }),
    0.2, { minBuyScore: 80 },
    { signal: "RED", entryTriggerStatus: "CONFIRMED", direction: "BULLISH" }
  );

  // 4. A real breakout that failed (failedBreakout: true) — invalidated
  //    setups must never BUY regardless of how high the score is.
  assertSignal(
    "invalidated (failed breakout) setup never BUYs",
    strongBullishRow({ symbol: "INV", orBreakout: true, aboveVwap: true, rvol: 2,
      priceAction: { higherHighs: true, higherLows: false, breakout: false, breakdown: false, retest: false, failedBreakout: true, failedBreakdown: null } }),
    0.2, undefined,
    { signal: "RED", entryTriggerStatus: "INVALIDATED", direction: "BULLISH" }
  );

  // 5. Real retest in progress but no confirmed breakout yet — APPROACHING,
  //    a strong setup that's still waiting, not a BUY yet.
  assertSignal(
    "APPROACHING trigger waits, doesn't BUY",
    strongBullishRow({ symbol: "APP", orBreakout: false, aboveVwap: true, rvol: 1.0,
      priceAction: { higherHighs: true, higherLows: true, breakout: false, breakdown: false, retest: true, failedBreakout: false, failedBreakdown: null } }),
    0.2, undefined,
    { signal: "YELLOW", entryTriggerStatus: "APPROACHING", direction: "BULLISH" }
  );

  // 6. Genuinely mixed real signals (below VWAP, thin volume, weak 15m
  //    stack, but an OR breakout) — no clear directional edge, must WAIT.
  assertSignal(
    "MIXED direction always WAITs",
    strongBullishRow({ symbol: "MIX", orBreakout: true, aboveVwap: false, rvol: 0.5, bull15: false, closeStrong: false,
      rsi15m: 50, roc15m: -0.2, macdHistogram15m: -0.1,
      priceAction: { higherHighs: false, higherLows: true, breakout: true, breakdown: false, retest: false, failedBreakout: false, failedBreakdown: null } }),
    0.2, undefined,
    { signal: "YELLOW", direction: "MIXED" }
  );

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("SMOKE TEST FAILED"); else console.log("SMOKE TEST OK");

  // Force-exit: requiring router.js pulls in route modules, and a future
  // one could add a module-level setInterval (finviz.js used to, before
  // its unauthorized news-scrape was retired in the 2026-09-05 news-feed
  // consolidation) that would keep the event loop alive indefinitely
  // without this — the test's own checks are done, so don't wait on
  // background timers that belong to the real running server.
  process.exit(process.exitCode || 0);
})();
