"use strict";
// deep-scan-engine.test.js — Master Agent v1.1, Deep Scan ("I want agent
// to give me detail deep scan of what happening" — full market-wide scan,
// per the user's own explicit scoping choice). Covers renderDeepScanText
// only — buildDeepScan itself does real internal HTTP fetches against a
// running server, same convention as morning-mode-engine.js's own
// buildMorningMode (exercised live, not unit-tested).
const assert = require("node:assert");
const { renderDeepScanText } = require("../src/deep-scan-engine");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

const emptyDealership = { hotLeadCount: 0, todaysAppointmentCount: 0, staleLeadCount: 0, hotLeads: [], todaysAppointments: [] };
const okPlatform = { ok: true, activeMutators: ["SERVER_AUTOPILOT"], issues: [] };

console.log("Checking renderDeepScanText — real, honest, never-fabricated market-wide detail…");

ok("a real scan failure renders the honest error and nothing else fabricated", () => {
  const text = renderDeepScanText({ error: "Real opportunity scan is unavailable right now." });
  assert.ok(text.includes("Real opportunity scan is unavailable right now."));
  assert.ok(!text.includes("MARKET REGIME"));
});

ok("full regime detail (reasons/blockers/factors/volatility) is all surfaced, not condensed away", () => {
  const d = {
    error: null,
    marketRegime: { regime: "RISK_ON", score: 80, confidence: 90, reasons: ["SPY up"], blockers: [], factors: [{ label: "SPY up", pass: true }, { label: "VIX < 20", pass: false }], volatility: { level: 14.2, state: "LOW" } },
    dataHealth: { status: "HEALTHY", score: 100, warnings: [] },
    tierCounts: { actionable: 3, developing: 5, wait: 10, extended: 1, invalidated: 0 },
    opportunities: [],
    portfolio: null, dealership: emptyDealership, platform: okPlatform,
  };
  const text = renderDeepScanText(d);
  assert.ok(text.includes("RISK_ON"));
  assert.ok(text.includes("SPY up ✓"));
  assert.ok(text.includes("VIX < 20 ✗"));
  assert.ok(text.includes("14.2"));
  assert.ok(text.includes("actionable 3"));
});

ok("every real candidate is listed with entry/stop/target/R:R, not just the single best one", () => {
  const d = {
    error: null, marketRegime: null, dataHealth: null, tierCounts: {},
    opportunities: [
      { symbol: "NVDA", opportunityTier: "actionable", opportunityScore: 92, verdict: "STRONG_BUY", entry: 100, stop: 95, targets: [110], riskReward: 2, confidence: "HIGH", reasons: ["strong RS"], blockers: [] },
      { symbol: "AMD", opportunityTier: "developing", opportunityScore: 71, verdict: "WATCH", entry: null, stop: null, targets: [], riskReward: null, confidence: null, reasons: [], blockers: ["below buy zone"] },
    ],
    portfolio: null, dealership: emptyDealership, platform: okPlatform,
  };
  const text = renderDeepScanText(d);
  assert.ok(text.includes("1. ✅ NVDA — STRONG_BUY"));
  assert.ok(text.includes("Entry 100"));
  assert.ok(text.includes("2. · AMD — WATCH"));
  assert.ok(text.includes("Blocked by: below buy zone"));
});

ok("real portfolio risk state is surfaced when available, omitted (not fabricated) when not", () => {
  const withPortfolio = renderDeepScanText({ error: null, marketRegime: null, dataHealth: null, tierCounts: {}, opportunities: [], portfolio: { openRiskPct: 3, dailyBreakerTripped: false, positionCount: 2 }, dealership: emptyDealership, platform: okPlatform });
  assert.ok(withPortfolio.includes("open risk 3%"));
  const withoutPortfolio = renderDeepScanText({ error: null, marketRegime: null, dataHealth: null, tierCounts: {}, opportunities: [], portfolio: null, dealership: emptyDealership, platform: okPlatform });
  assert.ok(!withoutPortfolio.includes("PORTFOLIO:"));
});

ok("platform issues are surfaced honestly, active mutators always listed", () => {
  const text = renderDeepScanText({ error: null, marketRegime: null, dataHealth: null, tierCounts: {}, opportunities: [], portfolio: null, dealership: emptyDealership, platform: { ok: false, activeMutators: ["ADOL22_AUTOPILOT2"], issues: ["Scanner universe is stale."] } });
  assert.ok(text.includes("Scanner universe is stale."));
  assert.ok(text.includes("ADOL22_AUTOPILOT2"));
});

console.log(`\n${passed} checks passed.`);
if (!process.exitCode) console.log("DEEP-SCAN-ENGINE TEST OK");
