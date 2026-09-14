"use strict";
// Real tests for src/portfolio-event-concentration.js — Priority 4
// platform-audit gap (2026-09-14): detects multiple held positions
// sharing the same real near-term event window, distinct from
// portfolio-correlation-calc.js's own price-correlation clustering.
// Pure-function, synthetic-input (real fetchQuoteBatch injected, zero
// network), same convention as test/trade-structure-selector.test.js.
// async run() wrapper matches test/autopilot-idempotency.test.js's own
// convention for CommonJS files with async assertions.
// Run: node test/portfolio-event-concentration.test.js (or npm test).
const assert = require("node:assert");
const {
  computePortfolioEventConcentration, classifyConcentration, recommendedAction, CLUSTER_WINDOW_DAYS,
} = require("../src/portfolio-event-concentration");

let passed = 0;
async function ok(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const NOW = Date.now();
const daysFromNow = (d) => Math.round((NOW + d * 86_400_000) / 1000); // real Yahoo-style unix-seconds timestamp

function fakeQuoteBatch(map) {
  // map: { SYMBOL: daysFromNowOrNull }
  return async (symbols) => symbols.map((s) => ({
    symbol: s,
    earningsTimestamp: map[s] != null ? daysFromNow(map[s]) : undefined,
  }));
}

async function run() {
  console.log("Checking computePortfolioEventConcentration — real calendar-event clustering…");

  await ok("empty real positions -> honest empty result, no fetch attempted", async () => {
    const r = await computePortfolioEventConcentration([], { fetchQuoteBatch: async () => { throw new Error("must not be called"); }, nowMs: NOW });
    assert.deepStrictEqual(r.clusters, []);
    assert.strictEqual(r.totalPortfolioValue, 0);
  });

  await ok("TEST — two real positions with earnings 2 real days apart, both within the window -> one real cluster", async () => {
    const positions = [{ symbol: "AAPL", marketValue: 10000 }, { symbol: "MSFT", marketValue: 5000 }, { symbol: "TSLA", marketValue: 20000 }];
    const r = await computePortfolioEventConcentration(positions, {
      fetchQuoteBatch: fakeQuoteBatch({ AAPL: 1, MSFT: 3, TSLA: null }),
      nowMs: NOW,
    });
    assert.strictEqual(r.clusters.length, 1);
    assert.deepStrictEqual(r.clusters[0].positions.sort(), ["AAPL", "MSFT"]);
    assert.strictEqual(r.clusters[0].exposureValue, 15000);
  });

  await ok("TEST — a real lone imminent earnings date (no other position nearby) is NOT a cluster", async () => {
    const positions = [{ symbol: "AAPL", marketValue: 10000 }, { symbol: "MSFT", marketValue: 5000 }];
    const r = await computePortfolioEventConcentration(positions, {
      fetchQuoteBatch: fakeQuoteBatch({ AAPL: 1, MSFT: null }),
      nowMs: NOW,
    });
    assert.strictEqual(r.clusters.length, 0);
  });

  await ok(`TEST — a real earnings date beyond the ${CLUSTER_WINDOW_DAYS}-day window is excluded entirely, never fabricated as "soon"`, async () => {
    const positions = [{ symbol: "AAPL", marketValue: 10000 }, { symbol: "MSFT", marketValue: 5000 }];
    const r = await computePortfolioEventConcentration(positions, {
      fetchQuoteBatch: fakeQuoteBatch({ AAPL: 1, MSFT: CLUSTER_WINDOW_DAYS + 5 }),
      nowMs: NOW,
    });
    assert.strictEqual(r.clusters.length, 0);
  });

  await ok("TEST — a real PAST earnings date (already reported) never counts toward a current concentration", async () => {
    const positions = [{ symbol: "AAPL", marketValue: 10000 }, { symbol: "MSFT", marketValue: 5000 }];
    const r = await computePortfolioEventConcentration(positions, {
      fetchQuoteBatch: fakeQuoteBatch({ AAPL: 1, MSFT: -2 }),
      nowMs: NOW,
    });
    assert.strictEqual(r.clusters.length, 0);
  });

  await ok("TEST — real HIGH concentration (4+ positions or >=30% exposure) recommends reducing new exposure, never auto-sells (no order/close call anywhere in this engine)", async () => {
    const positions = [
      { symbol: "A", marketValue: 25000 }, { symbol: "B", marketValue: 25000 },
      { symbol: "C", marketValue: 25000 }, { symbol: "D", marketValue: 25000 },
    ];
    const r = await computePortfolioEventConcentration(positions, {
      fetchQuoteBatch: fakeQuoteBatch({ A: 1, B: 2, C: 3, D: 4 }),
      nowMs: NOW,
    });
    assert.strictEqual(r.clusters.length, 1);
    assert.strictEqual(r.clusters[0].concentrationLevel, "HIGH");
    assert.strictEqual(r.clusters[0].newEntriesReduced, true);
    assert.strictEqual(r.clusters[0].newEntriesBlocked, false, "advisory only in this pass — never a real enforced block");
  });

  ok("TEST — real LOW concentration (2 positions, small exposure) is disclosed but not treated as a reason to act", () => {
    assert.strictEqual(classifyConcentration(5, 2), "LOW");
    assert.match(recommendedAction("LOW"), /No portfolio-level action needed/);
  });

  await ok("this engine never references any order-placing/closing function name — provably advisory-only", () => {
    const fs = require("node:fs");
    const src = fs.readFileSync(require.resolve("../src/portfolio-event-concentration"), "utf8");
    assert.doesNotMatch(src, /alpacaClose|alpacaPlace|placeOrder|closePosition/i);
  });

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("PORTFOLIO-EVENT-CONCENTRATION TEST FAILED"); else console.log("PORTFOLIO-EVENT-CONCENTRATION TEST OK");
}

run();
