// Real tests for src/routes/monitor-extras.js's extractSessionMovers —
// the real session-aware pre/after-market mover filter (explicit user
// request, 2026-08-31: "i need the system to detect pre market mover
// aftermarket movers"). Pure-function, synthetic-input, zero-network.
"use strict";
const assert = require("node:assert");
const { extractSessionMovers } = require("../src/routes/monitor-extras");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const QUOTES = [
  { symbol: "AAPL", marketState: "PRE", preMarketChangePercent: 2.1, preMarketPrice: 320, regularMarketPrice: 313.5 },
  { symbol: "TSLA", marketState: "PRE", preMarketChangePercent: -0.2, preMarketPrice: 366, regularMarketPrice: 367 }, // below the 0.5% floor
  { symbol: "NVDA", marketState: "REGULAR", preMarketChangePercent: 3, preMarketPrice: 225, regularMarketPrice: 220 }, // real session doesn't match PRE
  { symbol: "GME", marketState: "POST", postMarketChangePercent: 5.5, postMarketPrice: 19.4, regularMarketPrice: 18.4 },
  { symbol: "AMD", marketState: "POSTPOST", postMarketChangePercent: -1.2, postMarketPrice: 150, regularMarketPrice: 151.8 },
  { symbol: "MSFT", marketState: "POST", postMarketChangePercent: undefined, postMarketPrice: 500, regularMarketPrice: 500 }, // no real % on file
];

console.log("Checking extractSessionMovers — real session-state filter, never fabricated…");
ok("PRE session keeps only real PRE/PREPRE rows clearing the real 0.5% floor", () => {
  const movers = extractSessionMovers(QUOTES, "PRE");
  assert.strictEqual(movers.length, 1);
  assert.strictEqual(movers[0].sym, "AAPL");
  assert.strictEqual(movers[0].chg, 2.1);
});
ok("POST session keeps only real POST/POSTPOST rows with a real finite %", () => {
  const movers = extractSessionMovers(QUOTES, "POST");
  assert.strictEqual(movers.length, 2);
  assert.deepStrictEqual(movers.map((m) => m.sym), ["GME", "AMD"]); // sorted by real |chg| desc
});
ok("a real REGULAR-session row never leaks into PRE or POST results", () => {
  const pre = extractSessionMovers(QUOTES, "PRE");
  const post = extractSessionMovers(QUOTES, "POST");
  assert.ok(!pre.some((m) => m.sym === "NVDA"));
  assert.ok(!post.some((m) => m.sym === "NVDA"));
});
ok("a row with no real % on file is honestly dropped, never fabricated as 0%", () => {
  const post = extractSessionMovers(QUOTES, "POST");
  assert.ok(!post.some((m) => m.sym === "MSFT"));
});
ok("real regularPrice is carried through for real context, not dropped", () => {
  const movers = extractSessionMovers(QUOTES, "PRE");
  assert.strictEqual(movers[0].regularPrice, 313.5);
});
ok("an unknown session string returns an honest empty list, never crashes", () => {
  assert.deepStrictEqual(extractSessionMovers(QUOTES, "BOGUS"), []);
});
ok("malformed/empty input returns an honest empty list", () => {
  assert.deepStrictEqual(extractSessionMovers([], "PRE"), []);
});
ok("results cap at 15 real movers, never unbounded", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ symbol: `S${i}`, marketState: "PRE", preMarketChangePercent: 1 + i * 0.01, preMarketPrice: 10, regularMarketPrice: 9.9 }));
  assert.strictEqual(extractSessionMovers(many, "PRE").length, 15);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("EXTENDED-HOURS-MOVERS TEST FAILED"); else console.log("EXTENDED-HOURS-MOVERS TEST OK");
