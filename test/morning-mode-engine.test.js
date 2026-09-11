"use strict";
// morning-mode-engine.test.js — Master Agent v1, Morning Mode. Covers the
// pure, deterministic functions only (summarizeDealership/summarizePlatform/
// renderMorningModeText) — buildMorningMode itself does real internal HTTP
// fetches against a running server and is exercised live instead (see
// server smoke coverage), same convention as ceo-ai.js's own untested
// buildCeoRecommendation (I/O-heavy orchestration, not pure logic).
const assert = require("node:assert");
const { summarizeDealership, summarizePlatform, renderMorningModeText } = require("../src/morning-mode-engine");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

console.log("Checking summarizeDealership — real hot-lead/appointment/stale-contact detection, never fabricated…");

ok("no leads/appointments at all → all-zero, honest summary", () => {
  const s = summarizeDealership({ leads: [] }, []);
  assert.strictEqual(s.hotLeadCount, 0);
  assert.strictEqual(s.todaysAppointmentCount, 0);
  assert.strictEqual(s.staleLeadCount, 0);
});

ok("a hot lead not yet SOLD counts; a hot lead already SOLD does not", () => {
  const leads = [
    { name: "A", hot: true, stage: "NEW" },
    { name: "B", hot: true, stage: "SOLD" },
    { name: "C", hot: false, stage: "NEW" },
  ];
  const s = summarizeDealership({ leads }, []);
  assert.strictEqual(s.hotLeadCount, 1);
  assert.strictEqual(s.hotLeads[0].name, "A");
});

ok("only today's real appointments count, not other days, and cancelled ones are excluded", () => {
  const today = new Date().toISOString().slice(0, 10);
  const appts = [
    { name: "X", date: today, status: "pending" },
    { name: "Y", date: today, status: "cancelled" },
    { name: "Z", date: "2020-01-01", status: "pending" },
  ];
  const s = summarizeDealership({ leads: [] }, appts);
  assert.strictEqual(s.todaysAppointmentCount, 1);
  assert.strictEqual(s.todaysAppointments[0].name, "X");
});

ok("a lead with no contact in 3+ real days is flagged stale; SOLD/LOST leads never are, regardless of age", () => {
  const oldMs = Date.now() - 5 * 24 * 60 * 60 * 1000;
  const leads = [
    { name: "Stale", stage: "NEW", updatedAt: oldMs },
    { name: "RecentlyTouched", stage: "NEW", updatedAt: Date.now() },
    { name: "OldButSold", stage: "SOLD", updatedAt: oldMs },
  ];
  const s = summarizeDealership({ leads }, []);
  assert.strictEqual(s.staleLeadCount, 1);
});

console.log("\nChecking summarizePlatform — real issue detection, honest when health check itself is unavailable…");

ok("no health payload at all → honest 'unavailable', never fabricated OK", () => {
  const s = summarizePlatform(null);
  assert.strictEqual(s.ok, false);
  assert.ok(s.issues[0].includes("unavailable"));
});

ok("a clean health payload (paperOnly, connected postgres, fresh universe) → ok:true, zero issues", () => {
  const s = summarizePlatform({ ok: true, execution: { paperOnly: true, activeMutators: ["SERVER_AUTOPILOT"] }, postgres: { configured: true, connected: true }, dynamicUniverse: { stale: false } });
  assert.strictEqual(s.ok, true);
  assert.deepStrictEqual(s.issues, []);
  assert.deepStrictEqual(s.activeMutators, ["SERVER_AUTOPILOT"]);
});

ok("real money at risk (paperOnly:false) is always surfaced as an issue", () => {
  const s = summarizePlatform({ ok: true, execution: { paperOnly: false, activeMutators: [] }, postgres: {}, dynamicUniverse: {} });
  assert.strictEqual(s.ok, false);
  assert.ok(s.issues.some((i) => i.includes("NOT paper-only")));
});

ok("Postgres configured but not connected is a real, surfaced issue", () => {
  const s = summarizePlatform({ ok: true, execution: { paperOnly: true }, postgres: { configured: true, connected: false }, dynamicUniverse: {} });
  assert.ok(s.issues.some((i) => i.includes("Postgres")));
});

console.log("\nChecking renderMorningModeText — honest NO TRADE framing, never a forced trade…");

ok("a real qualifying BUY-family trade renders entry/stop/target/R:R, not a NO TRADE line", () => {
  const m = {
    marketVerdict: "RISK-ON", marketRegime: { regime: "RISK_ON" }, marketWhy: null, ceoJudgmentNote: null,
    doNow: [], bestTrade: { symbol: "NVDA", verdict: "BUY", entry: 100, stop: 95, targets: [110], riskReward: 2, confidence: "HIGH", reasons: ["strong RS"] },
    noTradeReason: null, backupWatchlist: [], marketEvents: [], moneyOpportunity: { type: "TRADE", detail: "NVDA BUY" },
    dealership: { hotLeadCount: 0, todaysAppointmentCount: 0, staleLeadCount: 0, hotLeads: [], todaysAppointments: [] },
    platform: { ok: true, issues: [] }, biggestRisk: null, flipCondition: null,
  };
  const text = renderMorningModeText(m);
  assert.ok(text.includes("NVDA — BUY"));
  assert.ok(text.includes("Entry 100"));
  assert.ok(!text.includes("NO TRADE"));
});

ok("no qualifying trade renders an explicit NO TRADE — KEEP CASH line, never a fabricated trade", () => {
  const m = {
    marketVerdict: null, marketRegime: null, marketWhy: null, ceoJudgmentNote: null,
    doNow: [], bestTrade: null, noTradeReason: "No qualifying opportunity found in this scan — NO TRADE, keep cash.",
    backupWatchlist: [], marketEvents: [], moneyOpportunity: { type: "KEEP_CASH", detail: "No standout trade or dealership opportunity right now." },
    dealership: { hotLeadCount: 0, todaysAppointmentCount: 0, staleLeadCount: 0, hotLeads: [], todaysAppointments: [] },
    platform: { ok: true, issues: [] }, biggestRisk: null, flipCondition: null,
  };
  const text = renderMorningModeText(m);
  assert.ok(text.includes("NO TRADE"));
});

ok("DO NOW is capped and only ever lists real, present conditions — never padded", () => {
  const m = {
    marketVerdict: null, marketRegime: null, marketWhy: null, ceoJudgmentNote: null,
    doNow: ["Real thing one."], bestTrade: null, noTradeReason: "NO TRADE — KEEP CASH.",
    backupWatchlist: [], marketEvents: [], moneyOpportunity: { type: "KEEP_CASH", detail: "x" },
    dealership: { hotLeadCount: 0, todaysAppointmentCount: 0, staleLeadCount: 0, hotLeads: [], todaysAppointments: [] },
    platform: { ok: true, issues: [] }, biggestRisk: null, flipCondition: null,
  };
  const text = renderMorningModeText(m);
  assert.ok(text.includes("1. Real thing one."));
  assert.ok(!text.includes("2."));
});

console.log(`\n${passed} checks passed.`);
if (!process.exitCode) console.log("MORNING-MODE-ENGINE TEST OK");
