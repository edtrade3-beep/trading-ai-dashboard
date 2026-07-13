// Real tests for src/risk-guardrails.js — the shared safety module used by
// BOTH the Alpaca paper autopilot and the Tradier LIVE auto-executor. Calls
// the actual exported functions (not reimplemented formulas) so a real bug
// in the safety math fails this test, not just a hand-copied approximation
// of it. Same minimal style as test/smoke.js — no test framework, no new
// dependency. Run: node test/risk-guardrails.test.js (or npm test, which
// runs this alongside smoke.js).
const assert = require("node:assert");
const {
  checkAccountHealth, dailyLossBreakerTripped, openRiskPct,
  sectorCapExceeded, sizePositionByRisk, isMarketHoursET,
} = require("../src/risk-guardrails");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

// Runs fn() with the global Date's zero-arg constructor pinned to isoNow —
// isMarketHoursET() only ever calls `new Date()` (no args) and then
// `new Date(someString)` (re-parsing a toLocaleString result), so the
// string-arg path is left to delegate to the real Date unchanged.
function withFixedNow(isoNow, fn) {
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) return new RealDate(isoNow);
      return new RealDate(...args);
    }
    static now() { return new RealDate(isoNow).getTime(); }
  }
  global.Date = FixedDate;
  try { return fn(); } finally { global.Date = RealDate; }
}

console.log("checkAccountHealth…");
ok("healthy account passes", () => {
  const r = checkAccountHealth({ equity: 10000, cash: 5000 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.reason, null);
});
ok("zero equity blocked", () => {
  const r = checkAccountHealth({ equity: 0, cash: 0 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "zero/negative equity");
});
ok("negative equity blocked", () => {
  assert.strictEqual(checkAccountHealth({ equity: -500, cash: 0 }).ok, false);
});
ok("margin debit (negative cash) blocked", () => {
  const r = checkAccountHealth({ equity: 10000, cash: -1 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "margin debit");
});
ok("below-minimum equity blocked (default $500 floor)", () => {
  const r = checkAccountHealth({ equity: 499, cash: 100 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "equity below minimum");
});
ok("exactly at the minimum equity floor passes", () => {
  assert.strictEqual(checkAccountHealth({ equity: 500, cash: 100 }).ok, true);
});
ok("custom minEquity respected", () => {
  assert.strictEqual(checkAccountHealth({ equity: 200, cash: 100, minEquity: 100 }).ok, true);
});
ok("tradingBlocked flag blocks even a healthy account", () => {
  const r = checkAccountHealth({ equity: 10000, cash: 5000, tradingBlocked: true });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "account restricted");
});
ok("accountBlocked flag blocks even a healthy account", () => {
  assert.strictEqual(checkAccountHealth({ equity: 10000, cash: 5000, accountBlocked: true }).ok, false);
});

console.log("dailyLossBreakerTripped…");
ok("no startOfDayEquity → never trips (guard clause)", () => {
  assert.strictEqual(dailyLossBreakerTripped({ equity: 9000, startOfDayEquity: 0, maxLossAbs: 200 }), false);
});
ok("abs loss under the cap does not trip", () => {
  assert.strictEqual(dailyLossBreakerTripped({ equity: 9850, startOfDayEquity: 10000, maxLossAbs: 200 }), false);
});
ok("abs loss exactly at the cap trips", () => {
  assert.strictEqual(dailyLossBreakerTripped({ equity: 9800, startOfDayEquity: 10000, maxLossAbs: 200 }), true);
});
ok("abs loss over the cap trips", () => {
  assert.strictEqual(dailyLossBreakerTripped({ equity: 9700, startOfDayEquity: 10000, maxLossAbs: 200 }), true);
});
ok("pct loss under the cap does not trip", () => {
  assert.strictEqual(dailyLossBreakerTripped({ equity: 9800, startOfDayEquity: 10000, maxLossPct: 3 }), false);
});
ok("pct loss exactly at the cap trips", () => {
  assert.strictEqual(dailyLossBreakerTripped({ equity: 9700, startOfDayEquity: 10000, maxLossPct: 3 }), true);
});
ok("a gain never trips the breaker", () => {
  assert.strictEqual(dailyLossBreakerTripped({ equity: 11000, startOfDayEquity: 10000, maxLossAbs: 200, maxLossPct: 3 }), false);
});

console.log("openRiskPct…");
ok("unknown/zero equity treated as fully maxed out (refuse new risk)", () => {
  assert.strictEqual(openRiskPct({ positions: [], equity: 0 }), 100);
});
ok("no positions → 0% open risk", () => {
  assert.strictEqual(openRiskPct({ positions: [], equity: 10000 }), 0);
});
ok("risk math matches qty × entry × assumedStopPct, summed over positions", () => {
  // 100 shares @ $50 entry, 5% assumed stop = $250 risk; equity $10,000 → 2.5%
  const pct = openRiskPct({ positions: [{ qty: 100, avgEntryPrice: 50 }], equity: 10000, assumedStopPct: 0.05 });
  assert.strictEqual(pct, 2.5);
});
ok("short positions (negative qty) count by absolute size", () => {
  const pct = openRiskPct({ positions: [{ qty: -100, avgEntryPrice: 50 }], equity: 10000, assumedStopPct: 0.05 });
  assert.strictEqual(pct, 2.5);
});

console.log("sectorCapExceeded…");
ok("under the cap does not exceed", () => {
  const positions = [{ symbol: "NVDA" }, { symbol: "AMD" }];
  assert.strictEqual(sectorCapExceeded({ positions, symbol: "AVGO", maxPerSector: 3 }), false);
});
ok("at the cap exceeds (>=)", () => {
  const positions = [{ symbol: "NVDA" }, { symbol: "AMD" }, { symbol: "AVGO" }]; // all "semi"
  assert.strictEqual(sectorCapExceeded({ positions, symbol: "MU", maxPerSector: 3 }), true);
});
ok("unmapped symbols fall into the same 'other' bucket", () => {
  const positions = [{ symbol: "ZZZZ1" }, { symbol: "ZZZZ2" }];
  assert.strictEqual(sectorCapExceeded({ positions, symbol: "ZZZZ3", maxPerSector: 2 }), true);
});

console.log("sizePositionByRisk…");
ok("invalid stop (entry <= stop) returns 0, doesn't fall back to blind sizing", () => {
  assert.strictEqual(sizePositionByRisk({ equity: 10000, riskPct: 1, entry: 50, stop: 50, availCash: 10000 }), 0);
  assert.strictEqual(sizePositionByRisk({ equity: 10000, riskPct: 1, entry: 50, stop: 55, availCash: 10000 }), 0);
});
ok("non-positive equity/entry/stop all return 0", () => {
  assert.strictEqual(sizePositionByRisk({ equity: 0, riskPct: 1, entry: 50, stop: 47, availCash: 10000 }), 0);
  assert.strictEqual(sizePositionByRisk({ equity: 10000, riskPct: 1, entry: 0, stop: 47, availCash: 10000 }), 0);
});
ok("normal sizing matches risk-per-share math", () => {
  // $10,000 equity, 1% risk = $100 to risk. Entry 50, stop 47 → $3/share risk → 33 shares.
  const qty = sizePositionByRisk({ equity: 10000, riskPct: 1, entry: 50, stop: 47, availCash: 100000, maxNamePct: 100 });
  assert.strictEqual(qty, 33);
});
ok("capped by available cash", () => {
  // Risk math alone would size 33 shares (~$1650), but only $500 cash available → floor(500/50)=10.
  const qty = sizePositionByRisk({ equity: 10000, riskPct: 1, entry: 50, stop: 47, availCash: 500, maxNamePct: 100 });
  assert.strictEqual(qty, 10);
});
ok("capped by maxNamePct of equity", () => {
  // Risk math alone would size 33 shares, but maxNamePct=1% of $10,000 = $100 max → floor(100/50)=2.
  const qty = sizePositionByRisk({ equity: 10000, riskPct: 1, entry: 50, stop: 47, availCash: 100000, maxNamePct: 1 });
  assert.strictEqual(qty, 2);
});
ok("never returns negative", () => {
  assert.ok(sizePositionByRisk({ equity: 10000, riskPct: 1, entry: 50, stop: 47, availCash: -100 }) >= 0);
});

console.log("isMarketHoursET…");
ok("9:35 AM ET open boundary is inside market hours (>=, inclusive)", () => {
  assert.strictEqual(withFixedNow("2026-07-15T13:35:00.000Z", isMarketHoursET), true); // Wed
});
ok("9:34 AM ET, one minute before open, is outside market hours", () => {
  assert.strictEqual(withFixedNow("2026-07-15T13:34:00.000Z", isMarketHoursET), false);
});
ok("3:55 PM ET close boundary is inside market hours (<=, inclusive)", () => {
  assert.strictEqual(withFixedNow("2026-07-15T19:55:00.000Z", isMarketHoursET), true);
});
ok("3:56 PM ET, one minute after close, is outside market hours", () => {
  assert.strictEqual(withFixedNow("2026-07-15T19:56:00.000Z", isMarketHoursET), false);
});
ok("weekend is always outside market hours regardless of time", () => {
  assert.strictEqual(withFixedNow("2026-07-18T13:35:00.000Z", isMarketHoursET), false); // Sat, same clock time as the open-boundary case
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("RISK-GUARDRAILS TEST FAILED"); else console.log("RISK-GUARDRAILS TEST OK");

// This file only requires risk-guardrails.js directly (no router.js, no
// lingering intervals) so this isn't strictly needed today, but force-exit
// anyway to match smoke.js and stay robust if that ever changes.
process.exit(process.exitCode || 0);
