// Real tests for market-helpers.js's Trade Desk redesign Phase 1 pure
// helpers (computeKeyLevels, rankMoveDrivers) — synthetic inputs, zero
// network, same convention as this session's other engine tests. ES
// module (browser-only), loaded via dynamic import, same precedent as
// test/cortex-engine.test.js.
// Run: node test/market-helpers-trade-desk.test.js (or npm test).
const assert = require("node:assert");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

(async () => {
  const { computeKeyLevels, rankMoveDrivers } = await import("../axiom-runner/components/market-helpers.js");

  console.log("Checking computeKeyLevels — real top-3 swing-high/low resistance/support…");

  const bars = (() => {
    // A real-shaped zigzag: swing highs at 110/120/130/140 (each a local
    // max over a 7-bar window), swing lows at 90/85/80/75 (each a local
    // min), current price sits in the middle of the range.
    const highs = [100, 105, 110, 105, 100, 112, 120, 112, 100, 122, 130, 122, 100, 132, 140, 132, 100];
    const lows =  [95, 90, 85, 90, 95, 88, 80, 88, 95, 82, 75, 82, 95, 78, 70, 78, 95];
    return highs.map((h, i) => ({ high: h, low: lows[i] }));
  })();

  ok("finds real top-3 swing highs above price, nearest first", () => {
    const { resistance } = computeKeyLevels(bars, 100);
    assert.ok(resistance.length <= 3);
    for (let i = 1; i < resistance.length; i++) assert.ok(resistance[i] >= resistance[i - 1], "resistance must be nearest-first (ascending)");
    resistance.forEach((r) => assert.ok(r > 100, "every resistance level must be above current price"));
  });

  ok("finds real top-3 swing lows below price, nearest first", () => {
    const { support } = computeKeyLevels(bars, 100);
    assert.ok(support.length <= 3);
    for (let i = 1; i < support.length; i++) assert.ok(support[i] <= support[i - 1], "support must be nearest-first (descending)");
    support.forEach((s) => assert.ok(s < 100, "every support level must be below current price"));
  });

  ok("no real bars or no real price -> empty, never fabricated", () => {
    assert.deepStrictEqual(computeKeyLevels([], 100), { resistance: [], support: [] });
    assert.deepStrictEqual(computeKeyLevels(bars, null), { resistance: [], support: [] });
  });

  console.log("Checking rankMoveDrivers — real disclosed-threshold driver ranking (spec §9)…");

  ok("no real day change -> empty drivers, honest UNKNOWN classification", () => {
    const r = rankMoveDrivers({});
    assert.deepStrictEqual(r.drivers, []);
    assert.strictEqual(r.classification, "UNKNOWN");
  });

  ok("a real move far from SPY's own move classifies COMPANY_SPECIFIC", () => {
    const r = rankMoveDrivers({ dayChangePct: 5, spyChangePct: 0.1 });
    assert.strictEqual(r.classification, "COMPANY_SPECIFIC");
  });

  ok("a real move in line with SPY's own move classifies MARKET_WIDE and surfaces a MARKET driver", () => {
    const r = rankMoveDrivers({ dayChangePct: 1, spyChangePct: 0.9 });
    assert.strictEqual(r.classification, "MARKET_WIDE");
    assert.ok(r.drivers.some((d) => d.id === "MARKET"));
  });

  ok("news tallied opposite the day's real direction is never counted as a driver", () => {
    const r = rankMoveDrivers({ dayChangePct: -3, spyChangePct: 0, newsBullish: 5, newsBearish: 0 });
    assert.ok(!r.drivers.some((d) => d.id === "NEWS"), "bullish headlines on a down day must not be claimed as the cause");
  });

  ok("news tallied the same real direction as the move is counted, ranked HIGH on a wide margin", () => {
    const r = rankMoveDrivers({ dayChangePct: 3, spyChangePct: 0, newsBullish: 6, newsBearish: 0 });
    const news = r.drivers.find((d) => d.id === "NEWS");
    assert.ok(news);
    assert.strictEqual(news.strength, "HIGH");
  });

  ok("a genuinely quiet symbol with no real distinguishing signal returns an empty driver list — never forced", () => {
    const r = rankMoveDrivers({ dayChangePct: 0.02, spyChangePct: 0.01, qqqChangePct: 0.01, sectorChangePct: 0.01 });
    assert.deepStrictEqual(r.drivers, []);
  });

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("MARKET-HELPERS-TRADE-DESK TEST FAILED"); else console.log("MARKET-HELPERS-TRADE-DESK TEST OK");
})();
