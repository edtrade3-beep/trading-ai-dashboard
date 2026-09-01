// Real client/server twin sync check (2026-09-01 platform audit,
// migration plan item #8). This codebase hand-maintains ~10 file pairs —
// a CommonJS server file under src/ and a hand-ported ES-module client
// twin under axiom-runner/components/, each carrying a "KEEP IN SYNC"
// comment — because the client can't `require()` CommonJS. Before this
// file, nothing actually verified the two sides stayed in sync; a real
// drift (am-core-engine.js's client twin stuck on 14pt weights while the
// server moved to 13pt) shipped and went unnoticed until this session's
// audit found it by hand. This test feeds the SAME real synthetic inputs
// to both the server (require) and client (dynamic import) versions of
// each pair's real exported functions and asserts identical outputs —
// wired into npm test so a future drift fails the suite instead of
// waiting for another manual audit.
//
// Client files are real ES modules — loaded via dynamic import() (works
// from a CommonJS test under plain Node, confirmed directly), which is
// why this whole file runs inside one async main() rather than the
// synchronous top-level style every other test file here uses.
"use strict";
const assert = require("node:assert");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

function sameOutput(name, serverResult, clientResult) {
  ok(name, () => assert.deepStrictEqual(clientResult, serverResult, "client twin's output diverged from the real server version for identical inputs"));
}

function makeAtrBars(n, base = 100, dailyRange = 2) {
  const bars = [];
  let price = base;
  for (let i = 0; i < n; i++) {
    price += (i % 2 === 0 ? 0.3 : -0.1);
    bars.push({ high: price + dailyRange / 2, low: price - dailyRange / 2, close: price });
  }
  return bars;
}
function btcBar(i, close, volume) { return { time: i * 86_400_000, open: close, high: close * 1.01, low: close * 0.99, close, volume: volume ?? 1000 }; }

async function main() {
  const [
    amCoreClient, entryClient, redFlagClient, mtfClient, simpleClient,
    decisionPriorityClient, atrRiskClient, antiChaseClient, futureValueClient, btcHpcClient,
    cortexClient, marketHelpersClient,
  ] = await Promise.all([
    import("../axiom-runner/components/am-core-engine.js"),
    import("../axiom-runner/components/entry-engine.js"),
    import("../axiom-runner/components/red-flag-engine.js"),
    import("../axiom-runner/components/mtf-combiner.js"),
    import("../axiom-runner/components/simple-decision.js"),
    import("../axiom-runner/components/decision-priority.js"),
    import("../axiom-runner/components/atr-risk-engine.js"),
    import("../axiom-runner/components/anti-chase.js"),
    import("../axiom-runner/components/future-value-scoring.js"),
    import("../axiom-runner/components/btc-hpc-scan.js"),
    import("../axiom-runner/components/cortex-engine.js"),
    import("../axiom-runner/components/market-helpers.js"),
  ]);
  const amCoreServer = require("../src/am-core-engine");
  const entryServer = require("../src/entry-engine");
  const redFlagServer = require("../src/red-flag-engine");
  const mtfServer = require("../src/mtf-combiner");
  const simpleServer = require("../src/simple-decision");
  const decisionPriorityServer = require("../src/decision-priority");
  const atrRiskServer = require("../src/atr-risk-engine");
  const futureValueServer = require("../src/future-value-scoring");
  const btcHpcServer = require("../src/btc-hpc-scan");
  const cortexServer = require("../src/cortex-decision");
  const institutionalScoringServer = require("../src/institutional-scoring");
  const marketHelpersDecisionServer = require("../src/market-helpers-decision");

  console.log("Checking am-core-engine.js — computeCoreScore/classifyCoreVerdict…");
  const CORE_INPUT_RICH = {
    regime: { score: 78, label: "GREEN" }, passCount: 7, adx: { strength: "Strong", direction: "Bullish" },
    smc: { bos: { type: "BULL_BOS" } }, momentum: 0.25, volRatio: 1.8, rsRating: 88,
    sectorInfo: { rank: 2, of: 11 }, vcpScore: 82, riskPct: 5, antiChase: { band: "NORMAL" },
    epsGrowth: 15, optionsFlow: { callNotional: 700_000, putNotional: 300_000 }, dollarVolume: 500_000_000,
  };
  const CORE_INPUT_SPARSE = {};
  sameOutput("computeCoreScore: a rich, fully-populated real input scores identically on both sides",
    amCoreServer.computeCoreScore(CORE_INPUT_RICH), amCoreClient.computeCoreScore(CORE_INPUT_RICH));
  sameOutput("computeCoreScore: a sparse/empty input (every bucket degrades to its neutral default) scores identically on both sides",
    amCoreServer.computeCoreScore(CORE_INPUT_SPARSE), amCoreClient.computeCoreScore(CORE_INPUT_SPARSE));
  sameOutput("computeBearishScore: rich real input scores identically on both sides",
    amCoreServer.computeBearishScore(CORE_INPUT_RICH), amCoreClient.computeBearishScore(CORE_INPUT_RICH));

  const CLEAN_ENTRY_PLAN = { entryPrice: 100, stage: "BREAKOUT", doNotChaseZone: { band: "NORMAL" } };
  const CLEAN_RED_FLAGS = { criticalCount: 0, flags: [] };
  const VERDICT_CASES = [
    { score: 90, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS, stage: "Stage 2", dailyBias: "BULLISH", entryScore: 80 },
    { score: 95, entryPlan: { entryPrice: 100, doNotChaseZone: { band: "DO_NOT_CHASE" } }, redFlagResult: CLEAN_RED_FLAGS },
    { score: 88, stage: "Stage 4 — Downtrend", entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS },
    { score: 95, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS, reversalTopRisk: true },
    { score: 40, entryPlan: CLEAN_ENTRY_PLAN, redFlagResult: CLEAN_RED_FLAGS },
    { hasPosition: true, positionState: "TRAIL", positionReason: "real reason" },
  ];
  VERDICT_CASES.forEach((c, i) => {
    sameOutput(`classifyCoreVerdict: real case ${i + 1}/${VERDICT_CASES.length} matches on both sides`,
      amCoreServer.classifyCoreVerdict(c), amCoreClient.classifyCoreVerdict(c));
  });

  console.log("\nChecking entry-engine.js — computeEntryPlan…");
  const STRONG_EVIDENCE = {
    price: 175, pivot: 227, atr: 5, contractionLow: 170,
    dailyBias: "BULLISH", swing4hState: "STRONG",
    rsiTrend1h: { direction: "up", accelerating: true },
    adx: { direction: "Bullish", strength: "Strong" },
    rsRating: 75, volTrend1h: { direction: "up" },
    higherLows: true, tightening: true, vcpVerdict: "WATCHLIST",
    marketRegime: "RISK_ON", vwap20: 170, rr: 2.0,
    breakoutConfirmed: false, extended: false, priceAction: {},
  };
  const WEAK_EVIDENCE = {
    price: 175, pivot: 227, atr: 5, contractionLow: 160,
    dailyBias: "BEARISH", swing4hState: "BROKEN",
    rsiTrend1h: { direction: "down", accelerating: false },
    adx: { direction: "Bearish", strength: "Weak" },
    rsRating: 30, volTrend1h: { direction: "down" },
    higherLows: false, tightening: false, vcpVerdict: "INVALID VCP",
    marketRegime: "RISK_OFF", vwap20: 180, rr: 0.8,
    breakoutConfirmed: false, extended: false, priceAction: {},
  };
  sameOutput("computeEntryPlan: real strong evidence matches on both sides",
    entryServer.computeEntryPlan(STRONG_EVIDENCE), entryClient.computeEntryPlan(STRONG_EVIDENCE));
  sameOutput("computeEntryPlan: real weak/broken evidence matches on both sides",
    entryServer.computeEntryPlan(WEAK_EVIDENCE), entryClient.computeEntryPlan(WEAK_EVIDENCE));

  console.log("\nChecking red-flag-engine.js — computeRedFlags…");
  const RED_FLAG_CLEAN = {
    dailyBias: "BULLISH", swing4hState: "STRONG", rsRating: 75,
    volTrend1h: { direction: "up" }, vwap20: 100, price: 105,
    marketRegime: "RISK_ON", rr: 2.5, priceAction: {}, antiChase: { band: "NORMAL" },
    riskPct: 4, dollarVolume: 50_000_000,
  };
  sameOutput("computeRedFlags: a real clean setup matches on both sides",
    redFlagServer.computeRedFlags(RED_FLAG_CLEAN), redFlagClient.computeRedFlags(RED_FLAG_CLEAN));
  sameOutput("computeRedFlags: a real failed breakout matches on both sides",
    redFlagServer.computeRedFlags({ ...RED_FLAG_CLEAN, priceAction: { failedBreakout: true } }),
    redFlagClient.computeRedFlags({ ...RED_FLAG_CLEAN, priceAction: { failedBreakout: true } }));
  sameOutput("computeRedFlags: real broken 4H structure matches on both sides",
    redFlagServer.computeRedFlags({ ...RED_FLAG_CLEAN, swing4hState: "BROKEN" }),
    redFlagClient.computeRedFlags({ ...RED_FLAG_CLEAN, swing4hState: "BROKEN" }));

  console.log("\nChecking mtf-combiner.js — computeMtfAlignment…");
  const MTF_CASES = [
    {},
    { "1D": "BULLISH" },
    { "1D": "BULLISH", "4H": "STRONG", "1H": 80, "15M": "NOT_READY" },
    { "1D": "BEARISH", "4H": "BROKEN", "1H": 20, "15M": "CONFIRMED" },
  ];
  MTF_CASES.forEach((c, i) => {
    sameOutput(`computeMtfAlignment: real case ${i + 1}/${MTF_CASES.length} matches on both sides`,
      mtfServer.computeMtfAlignment(c), mtfClient.computeMtfAlignment(c));
  });

  console.log("\nChecking simple-decision.js — computeSimpleDecision (spec's own worked examples)…");
  const SIMPLE_CASES = [
    {
      dailyBias: "BULLISH", swing4hState: "BROKEN",
      early1h: { score: 15, rsiTrend: { direction: "down" } },
      entry15mStatus: "NOT_READY", rr: 2,
      entryPlan: { entryPrice: 216.90, pivot: 227.90, stop: 209.69, target1: 246.15, earlyEntryZone: [215.03, 218.77], doNotChaseZone: { band: "NORMAL" }, stage: "EARLY" },
    },
    {
      dailyBias: "BULLISH", swing4hState: "STRONG",
      early1h: { score: 65, rsiTrend: { direction: "up", accelerating: true } },
      entry15mStatus: "CONFIRMED", rr: 2,
      entryPlan: { entryPrice: 216.90, pivot: 227.90, stop: 209.69, target1: 246.15, earlyEntryZone: [215.03, 218.77], doNotChaseZone: { band: "NORMAL" }, stage: "EARLY" },
    },
  ];
  SIMPLE_CASES.forEach((c, i) => {
    sameOutput(`computeSimpleDecision: spec worked example ${i + 1}/${SIMPLE_CASES.length} matches on both sides`,
      simpleServer.computeSimpleDecision(c), simpleClient.computeSimpleDecision(c));
  });

  console.log("\nChecking decision-priority.js — sortByPriority…");
  const PRIORITY_FACTORS = [
    { key: "NEWS_CATALYST" }, { key: "MARKET_REGIME" }, { key: "TREND" }, { key: "UNKNOWN_KEY" },
  ];
  sameOutput("DECISION_PRIORITY_ORDER matches on both sides",
    decisionPriorityServer.DECISION_PRIORITY_ORDER, decisionPriorityClient.DECISION_PRIORITY_ORDER);
  sameOutput("sortByPriority: a real mixed factor list sorts identically on both sides",
    decisionPriorityServer.sortByPriority(PRIORITY_FACTORS), decisionPriorityClient.sortByPriority(PRIORITY_FACTORS));

  console.log("\nChecking atr-risk-engine.js — computeAtrRiskLevels, and anti-chase.js — computeAntiChase…");
  sameOutput("computeAtrRiskLevels: too-short real history matches on both sides",
    atrRiskServer.computeAtrRiskLevels(makeAtrBars(5), 100), atrRiskClient.computeAtrRiskLevels(makeAtrBars(5), 100));
  const RICH_BARS = makeAtrBars(30, 100, 2);
  sameOutput("computeAtrRiskLevels: real sufficient history matches on both sides",
    atrRiskServer.computeAtrRiskLevels(RICH_BARS, 105), atrRiskClient.computeAtrRiskLevels(RICH_BARS, 105));
  [0, 5, 10, 15].forEach((ext) => {
    sameOutput(`computeAntiChase: real extensionPct=${ext} matches on both sides`,
      atrRiskServer.computeAntiChase(ext), antiChaseClient.computeAntiChase(ext));
  });

  console.log("\nChecking future-value-scoring.js — computeFutureValueRead…");
  const FUNDAMENTALS_RICH = {
    profitMargin: 0.22, roe: 0.28, revenueGrowth: 0.24, epsGrowth: 0.30,
    debtToEquity: 0.4, currentRatio: 1.8, freeCashFlowMargin: 0.15,
    peRatio: 22, pegRatio: 0.9, priceToSales: 4.5, priceToBook: 6,
  };
  const price = 150;
  sameOutput("computeFutureValueRead: a real, rich fundamentals set matches on both sides",
    futureValueServer.computeFutureValueRead(FUNDAMENTALS_RICH, price), futureValueClient.computeFutureValueRead(FUNDAMENTALS_RICH, price));
  sameOutput("computeFutureValueRead: no real fundamentals on file -> honest null on both sides",
    futureValueServer.computeFutureValueRead(null, price), futureValueClient.computeFutureValueRead(null, price));

  console.log("\nChecking btc-hpc-scan.js — computeBtcRegime…");
  sameOutput("computeBtcRegime: HPC_MINER_UNIVERSE matches on both sides",
    btcHpcServer.HPC_MINER_UNIVERSE, btcHpcClient.HPC_MINER_UNIVERSE);
  sameOutput("computeBtcRegime: too-little real history matches on both sides",
    btcHpcServer.computeBtcRegime([btcBar(0, 100)]), btcHpcClient.computeBtcRegime([btcBar(0, 100)]));
  const BTC_UPTREND = Array.from({ length: 70 }, (_, i) => btcBar(i, 100 + i * 2));
  sameOutput("computeBtcRegime: a real sustained uptrend matches on both sides",
    btcHpcServer.computeBtcRegime(BTC_UPTREND), btcHpcClient.computeBtcRegime(BTC_UPTREND));

  console.log("\nChecking cortex-engine.js — computeHeatRisk/computeCortexVerdict (/goal Phase 5 audit, 2026-09-01 — no twin-sync coverage existed before this, which is how this pair silently drifted: the server twin was missing the antiChase-band param entirely until this same pass)…");
  const HEAT_CASES = [
    [{ extended: false }, {}, { band: "EXTENDED", label: "Extended — 6.2% above the breakout" }],
    [{ extended: true }, { action: "ENTER_LONG" }, { band: "NORMAL", label: "Normal" }],
    [{ extended: false }, { action: "ENTER_LONG" }, undefined],
    [{ extended: false }, { reversal: { isTop: true, topScore: 8, sigs: [{ txt: "RSI divergence" }] } }, { band: "NORMAL" }],
    [{ stage: "Stage 4 — Declining" }, {}, undefined],
  ];
  HEAT_CASES.forEach(([row, sniper, antiChase], i) => {
    sameOutput(`computeHeatRisk: real case ${i + 1}/${HEAT_CASES.length} matches on both sides`,
      cortexServer.computeHeatRisk(row, sniper, antiChase), cortexClient.computeHeatRisk(row, sniper, antiChase));
  });
  const CORTEX_VERDICT_CASES = [
    { sniper: { action: "ENTER_LONG" }, heat: { state: "HEALTHY_STRENGTH" }, aplusScore: 90 },
    { sniper: { action: "ENTER_LONG" }, heat: { state: "HEALTHY_STRENGTH" }, aplusScore: 90, criticalFlags: 1 },
    { sniper: { action: "ENTER_LONG" }, heat: { state: "HEALTHY_STRENGTH" }, aplusScore: 90, entryPlanStage: "STRUCTURE_BROKEN" },
    { sniper: { action: "ENTER_LONG" }, heat: { state: "HEALTHY_STRENGTH" }, aplusScore: 90, dailyBias: "BEARISH" },
    { sniper: {}, heat: { state: "CLIMACTIC_DANGER", reason: "exhaustion" }, aplusScore: 10 },
  ];
  CORTEX_VERDICT_CASES.forEach((c, i) => {
    sameOutput(`computeCortexVerdict: real case ${i + 1}/${CORTEX_VERDICT_CASES.length} matches on both sides`,
      cortexServer.computeCortexVerdict(c), cortexClient.computeCortexVerdict(c));
  });

  console.log("\nChecking computeInstitutionalGrade — 3 required-byte-identical copies (market-helpers.js client, institutional-scoring.js + market-helpers-decision.js server twins) — no twin-sync coverage existed before this, which is how market-helpers-decision.js silently drifted (missing the 2026-08-26 Stage-4/anti-chase gate entirely until this same pass)…");
  const GRADE_REGIME = { label: "GREEN", score: 78 };
  const GRADE_TECH = { adx: { adx: 35, strength: "Strong", direction: "Bullish", plusDI: 30, minusDI: 10 } };
  const GRADE_SECTOR = { rank: 2, of: 11 };
  const GRADE_CASES = [
    [{ passCount: 8, abovePivotPct: 1, epsGrowth: 15, stage: "Stage 2 — Confirmed", smc: { bos: { type: "BULL_BOS" } } }, GRADE_TECH, GRADE_REGIME, GRADE_SECTOR, null, 0],
    [{ passCount: 8, abovePivotPct: 1, epsGrowth: 15, stage: "Stage 4 — Declining", smc: { bos: { type: "BULL_BOS" } } }, GRADE_TECH, GRADE_REGIME, GRADE_SECTOR, null, 0],
    [{ passCount: 8, abovePivotPct: 12, epsGrowth: 15, stage: "Stage 2 — Confirmed" }, GRADE_TECH, GRADE_REGIME, GRADE_SECTOR, null, 0],
    [{ passCount: 8, abovePivotPct: 1, epsGrowth: 15, stage: "Stage 2 — Confirmed" }, GRADE_TECH, GRADE_REGIME, GRADE_SECTOR, null, 1],
    [{ passCount: 3, stage: "Stage 1" }, {}, GRADE_REGIME, null, null, 0],
  ];
  GRADE_CASES.forEach((args, i) => {
    const clientResult = marketHelpersClient.computeInstitutionalGrade(...args);
    sameOutput(`computeInstitutionalGrade: real case ${i + 1}/${GRADE_CASES.length} — institutional-scoring.js matches the client on both sides`,
      institutionalScoringServer.computeInstitutionalGrade(...args), clientResult);
    sameOutput(`computeInstitutionalGrade: real case ${i + 1}/${GRADE_CASES.length} — market-helpers-decision.js matches the client on both sides`,
      marketHelpersDecisionServer.computeInstitutionalGrade(...args), clientResult);
  });

  console.log(`\n${passed} checks passed.`);
  console.log("CLIENT-SERVER-TWIN-SYNC TEST OK");
}

main().catch((e) => {
  console.error("CLIENT-SERVER-TWIN-SYNC TEST FAILED TO RUN:", e.message, e.stack);
  process.exitCode = 1;
});
