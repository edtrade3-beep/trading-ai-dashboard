// Real tests for src/trade-gps-verdict.js — Trade GPS's BUY STOCK/BUY
// CALL/BUY PUT/BUY CALL SPREAD/BUY PUT SPREAD/WAIT/EXIT/NO TRADE
// translation layer (2026-09-03 spec). Pure-function, synthetic-input,
// zero-network. Run: node test/trade-gps-verdict.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const { translateToTradeGpsVerdict, selectPrimaryAndBackups, TRADE_GPS_VERDICTS } = require("../src/trade-gps-verdict");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

function actionable(overrides = {}) {
  return {
    assetDecisionVerdict: "BUY",
    tradeStructure: { structure: "STOCK", reason: "real stock preferred" },
    tradeGpsScore: { score: 90, band: "PRIMARY" },
    trapShield: { blocked: false, warningLevel: "NONE" },
    signalState: "ENTER_NOW",
    dataHealth: { status: "HEALTHY" },
    ...overrides,
  };
}

console.log("Checking translateToTradeGpsVerdict — one real verdict + structure per candidate…");

ok("TRADE_GPS_VERDICTS matches the spec's exact 8-item vocabulary", () => {
  assert.deepStrictEqual([...TRADE_GPS_VERDICTS].sort(), ["BUY_CALL", "BUY_CALL_SPREAD", "BUY_PUT", "BUY_PUT_SPREAD", "BUY_STOCK", "EXIT", "NO_TRADE", "WAIT"]);
});

ok("actionable BUY + ENTER_NOW + STOCK structure -> BUY_STOCK", () => {
  const r = translateToTradeGpsVerdict(actionable());
  assert.strictEqual(r.verdict, "BUY_STOCK");
  assert.strictEqual(r.structure, "STOCK");
});

ok("actionable STRONG_BUY + ARMED + CALL structure -> BUY_CALL", () => {
  const r = translateToTradeGpsVerdict(actionable({ assetDecisionVerdict: "STRONG_BUY", signalState: "ARMED", tradeStructure: { structure: "CALL", reason: "naked call preferred" } }));
  assert.strictEqual(r.verdict, "BUY_CALL");
});

ok("CALL_SPREAD structure -> BUY_CALL_SPREAD", () => {
  const r = translateToTradeGpsVerdict(actionable({ tradeStructure: { structure: "CALL_SPREAD" } }));
  assert.strictEqual(r.verdict, "BUY_CALL_SPREAD");
});

ok("PUT_SPREAD structure -> BUY_PUT_SPREAD", () => {
  const r = translateToTradeGpsVerdict(actionable({ tradeStructure: { structure: "PUT_SPREAD" } }));
  assert.strictEqual(r.verdict, "BUY_PUT_SPREAD");
});

ok("PUT structure -> BUY_PUT", () => {
  const r = translateToTradeGpsVerdict(actionable({ tradeStructure: { structure: "PUT" } }));
  assert.strictEqual(r.verdict, "BUY_PUT");
});

ok("trapShield.blocked forces NO_TRADE regardless of an otherwise-actionable real setup", () => {
  const r = translateToTradeGpsVerdict(actionable({ trapShield: { blocked: true, message: "1 critical red flag" } }));
  assert.strictEqual(r.verdict, "NO_TRADE");
  assert.strictEqual(r.reasonOneLine, "1 critical red flag");
});

ok("tradeGpsScore.band REJECT forces NO_TRADE regardless of an otherwise-actionable real setup", () => {
  const r = translateToTradeGpsVerdict(actionable({ tradeGpsScore: { score: 60, band: "REJECT" } }));
  assert.strictEqual(r.verdict, "NO_TRADE");
});

ok("tradeGpsScore.band NO_TRADE (missing/contradictory real inputs) forces NO_TRADE", () => {
  const r = translateToTradeGpsVerdict(actionable({ tradeGpsScore: { score: null, band: "NO_TRADE" } }));
  assert.strictEqual(r.verdict, "NO_TRADE");
});

ok("stale/blocked real dataHealth forces NO_TRADE even with a strong score", () => {
  const r = translateToTradeGpsVerdict(actionable({ dataHealth: { status: "BLOCKED" } }));
  assert.strictEqual(r.verdict, "NO_TRADE");
});

ok("real degraded dataHealth (not BLOCKED) does not force NO_TRADE on its own", () => {
  const r = translateToTradeGpsVerdict(actionable({ dataHealth: { status: "DEGRADED" } }));
  assert.strictEqual(r.verdict, "BUY_STOCK");
});

ok("assetDecisionVerdict EXIT -> EXIT, even with a real actionable score", () => {
  const r = translateToTradeGpsVerdict(actionable({ assetDecisionVerdict: "EXIT" }));
  assert.strictEqual(r.verdict, "EXIT");
});

ok("assetDecisionVerdict BUY but signalState SCANNING (not yet actionable) -> WAIT, never a fabricated entry", () => {
  const r = translateToTradeGpsVerdict(actionable({ signalState: "SCANNING" }));
  assert.strictEqual(r.verdict, "WAIT");
});

ok("assetDecisionVerdict WATCH -> WAIT", () => {
  const r = translateToTradeGpsVerdict(actionable({ assetDecisionVerdict: "WATCH" }));
  assert.strictEqual(r.verdict, "WAIT");
});

ok("actionable asset verdict + signal state, but tradeStructure NO_TRADE (e.g. no real symbol/price) -> NO_TRADE, never invents a structure", () => {
  const r = translateToTradeGpsVerdict(actionable({ tradeStructure: { structure: "NO_TRADE", reason: "missing real symbol/price" } }));
  assert.strictEqual(r.verdict, "NO_TRADE");
  assert.strictEqual(r.reasonOneLine, "missing real symbol/price");
});

ok("real score/band are always carried through unchanged, whatever the final verdict", () => {
  const r = translateToTradeGpsVerdict(actionable({ tradeGpsScore: { score: 88, band: "PRIMARY" } }));
  assert.strictEqual(r.score, 88);
  assert.strictEqual(r.band, "PRIMARY");
});

console.log("\nChecking selectPrimaryAndBackups — the spec's 1 primary + max 2 backups rule…");

ok("the highest real score becomes primary, next two become backups", () => {
  const candidates = [
    { symbol: "A", verdict: "BUY_STOCK", score: 80 },
    { symbol: "B", verdict: "BUY_CALL", score: 95 },
    { symbol: "C", verdict: "BUY_PUT", score: 88 },
    { symbol: "D", verdict: "BUY_STOCK", score: 76 },
  ];
  const r = selectPrimaryAndBackups(candidates);
  assert.strictEqual(r.primary.symbol, "B");
  assert.deepStrictEqual(r.backups.map((b) => b.symbol), ["C", "A"]);
});

ok("never more than 2 real backups, even with many real actionable candidates", () => {
  const candidates = Array.from({ length: 10 }, (_, i) => ({ symbol: `S${i}`, verdict: "BUY_STOCK", score: 100 - i }));
  const r = selectPrimaryAndBackups(candidates);
  assert.strictEqual(r.backups.length, 2);
});

ok("WAIT/EXIT/NO_TRADE candidates never become primary or backup", () => {
  const candidates = [
    { symbol: "A", verdict: "WAIT", score: 99 },
    { symbol: "B", verdict: "NO_TRADE", score: 99 },
    { symbol: "C", verdict: "EXIT", score: 99 },
    { symbol: "D", verdict: "BUY_STOCK", score: 50 },
  ];
  const r = selectPrimaryAndBackups(candidates);
  assert.strictEqual(r.primary.symbol, "D");
  assert.strictEqual(r.backups.length, 0);
});

ok("no real actionable candidates -> primary null, backups empty, never fabricated", () => {
  const r = selectPrimaryAndBackups([]);
  assert.strictEqual(r.primary, null);
  assert.deepStrictEqual(r.backups, []);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TRADE-GPS-VERDICT TEST FAILED"); else console.log("TRADE-GPS-VERDICT TEST OK");
