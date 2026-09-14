"use strict";
// options-authority-gate.test.js — real structural regression test for the
// Options Authority Gate (2026-09-14, "Lock Strategy Rank Behind Canonical
// Trade Authority" task). resolveCanonicalOptionsPermission() and
// filterByCanonicalDirection() run inside routes/market.js's large request
// handler and aren't independently exported for direct unit invocation —
// same convention this session already used for options-expiry-selection
// (test/options-expiry-selection.test.js) and the non-exported tiers-sort
// comparator (test/opportunity-sort-tiebreak.test.js) — so this confirms
// the exact wiring via source inspection. Real unit coverage for the
// underlying permission predicate (canonicalAllowsOptions) lives in
// test/trade-gps-verdict.test.js.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const src = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "market.js"), "utf8");

function blockFor(pathname, endMarker) {
  const start = src.indexOf(`pathname === "${pathname}"`);
  assert.ok(start > 0, `route ${pathname} not found`);
  const end = src.indexOf(endMarker, start);
  assert.ok(end > start, `end marker not found for ${pathname}`);
  return src.slice(start, end);
}

console.log("Checking the Options Authority Gate helpers exist and use the real canonical pipeline…");

ok("resolveCanonicalOptionsPermission uses the real canonical pipeline and the real canonicalAllowsOptions predicate — no re-derived permission rule", () => {
  assert.match(src, /async function resolveCanonicalOptionsPermission\(symbol\)/);
  assert.match(src, /const \{ computeCanonicalAssetDecision \} = require\("\.\.\/canonical-decision-pipeline"\);/);
  assert.match(src, /const \{ canonicalAllowsOptions \} = require\("\.\.\/trade-gps-verdict"\);/);
});

ok("resolveCanonicalOptionsPermission acquires its real Trade GPS chain via the shared getCanonicalOptionsChain service (2026-09-14 Stage 1 extraction) — never Strategy Rank's own fetchRankedChainForStrategy", () => {
  const fnStart = src.indexOf("async function resolveCanonicalOptionsPermission(symbol)");
  const fnEnd = src.indexOf("function filterByCanonicalDirection", fnStart);
  const fn = src.slice(fnStart, fnEnd);
  assert.match(fn, /const chain = await getCanonicalOptionsChain\(symbol\);/);
  assert.doesNotMatch(fn, /fetchYahooOptionsChain\(/, "chain acquisition must no longer be duplicated inline here — it now lives only in getCanonicalOptionsChain");
  assert.doesNotMatch(fn, /fetchRankedChainForStrategy\(/, "must not call Strategy Rank's own chain fetch to answer the permission question");
});

ok("getCanonicalOptionsChain itself is the one real place fetchYahooOptionsChain is called for canonical permission purposes, and it stays separate from Strategy Rank's own fetch", () => {
  const fnStart = src.indexOf("async function getCanonicalOptionsChain(symbol)");
  const fnEnd = src.indexOf("// Options Authority Gate (2026-09-14", fnStart);
  const fn = src.slice(fnStart, fnEnd);
  assert.match(fn, /fetchYahooOptionsChain\(symbol, null\)/);
  assert.doesNotMatch(fn, /fetchRankedChainForStrategy\(/);
});

ok("resolveCanonicalOptionsPermission is cached per symbol (avoids re-running the full pipeline on every panel render)", () => {
  const fnStart = src.indexOf("async function resolveCanonicalOptionsPermission(symbol)");
  const fnEnd = src.indexOf("function filterByCanonicalDirection", fnStart);
  const fn = src.slice(fnStart, fnEnd);
  assert.match(fn, /cached\(`options-permission:\$\{symbol\}`/);
});

ok("filterByCanonicalDirection reuses strategy-ranking.js's own real, already-exported STRUCTURE_BIAS — never a second bias rule", () => {
  const fnStart = src.indexOf("function filterByCanonicalDirection");
  const fnEnd = src.indexOf("async function fetchRankedChainForStrategy", fnStart);
  const fn = src.slice(fnStart, fnEnd);
  assert.match(fn, /const \{ STRUCTURE_BIAS \} = require\("\.\.\/strategy-ranking"\);/);
});

ok("filterByCanonicalDirection only removes the strictly OPPOSING bias — Range/Iron Condor and same-bias structures are left alone", () => {
  const fnStart = src.indexOf("function filterByCanonicalDirection");
  const fnEnd = src.indexOf("async function fetchRankedChainForStrategy", fnStart);
  const fn = src.slice(fnStart, fnEnd);
  assert.match(fn, /STRUCTURE_BIAS\[s\.strategy\] !== opposing/);
});

console.log("\nChecking route coverage — all 4 actionable Strategy Rank routes obey the same authority, no bypass…");

const ROUTES = [
  { path: "/api/market/strategy", end: "  // Options Strategy Ranking Engine" },
  { path: "/api/market/strategy-rank", end: "  // GET /api/market/best-options-now" },
  { path: "/api/market/best-options-now", end: "  // GET /api/market/robinhood-ticket" },
  { path: "/api/market/robinhood-ticket", end: "\n  if (pathname ===" },
];

for (const { path: routePath, end } of ROUTES) {
  ok(`${routePath} calls resolveCanonicalOptionsPermission`, () => {
    const block = blockFor(routePath, end);
    assert.match(block, /resolveCanonicalOptionsPermission\(symbol\)/);
  });

  ok(`${routePath} checks permission.allowed BEFORE calling fetchRankedChainForStrategy — no bypass (Part 9: no wasted fetch for a blocked symbol)`, () => {
    const block = blockFor(routePath, end);
    const permissionIdx = block.indexOf("resolveCanonicalOptionsPermission(symbol)");
    const fetchIdx = block.indexOf("fetchRankedChainForStrategy(symbol");
    assert.ok(permissionIdx > -1 && fetchIdx > -1, "both calls must be present in this route");
    assert.ok(permissionIdx < fetchIdx, "permission must be resolved before the real Strategy Rank chain fetch");
  });

  ok(`${routePath} returns early (no actionable option) when permission.allowed is false`, () => {
    const block = blockFor(routePath, end);
    assert.match(block, /if \(!permission\.allowed\)/);
  });
}

ok("/api/market/strategy-rank and /api/market/best-options-now and /api/market/robinhood-ticket all apply filterByCanonicalDirection to their ranked results", () => {
  const rankRoute = blockFor("/api/market/strategy-rank", "  // GET /api/market/best-options-now");
  const bestNowRoute = blockFor("/api/market/best-options-now", "  // GET /api/market/robinhood-ticket");
  const ticketRoute = blockFor("/api/market/robinhood-ticket", "\n  if (pathname ===");
  for (const block of [rankRoute, bestNowRoute, ticketRoute]) {
    assert.match(block, /filterByCanonicalDirection\(ranked, permission\.structure\)/);
  }
});

ok("/api/market/strategy (single deterministic pick, no ranked[] array) checks direction compatibility against the SAME real strategy-ranking.js STRUCTURE_BIAS map, not a re-declared rule", () => {
  const block = blockFor("/api/market/strategy", "  // Options Strategy Ranking Engine");
  assert.match(block, /const \{ STRUCTURE_BIAS: __strategyBias \} = require\("\.\.\/strategy-ranking"\);/);
  assert.match(block, /__strategyBias\[pick\.strategy\] !== canonicalBias/);
});

console.log("\nChecking /api/market/smart-money-intel — the discovered bypass (2026-09-14, \"Close Smart-Money Options Authority Bypass\") is now protected…");

const SMI_END = "  // GET /api/market/dividends?tickers=AAPL,MSFT";

ok("smart-money-intel calls resolveCanonicalOptionsPermission BEFORE its Strategy Rank chain fetch — no bypass", () => {
  const block = blockFor("/api/market/smart-money-intel", SMI_END);
  const permissionIdx = block.indexOf("resolveCanonicalOptionsPermission(symbol)");
  const fetchIdx = block.indexOf("fetchRankedChainForStrategy(symbol");
  assert.ok(permissionIdx > -1 && fetchIdx > -1, "both calls must be present in this route");
  assert.ok(permissionIdx < fetchIdx, "permission must be resolved before the real Strategy Rank chain fetch");
});

ok("smart-money-intel neutralizes ONLY bestOptionsStructure when blocked — never the whole response", () => {
  const block = blockFor("/api/market/smart-money-intel", SMI_END);
  assert.match(block, /if \(!permission\.allowed\) \{\s*bestOptionsStructure = \{ available: false, reason: permission\.reason \};/);
});

ok("smart-money-intel applies filterByCanonicalDirection to its ranked results — same reused helper, not a new rule", () => {
  const block = blockFor("/api/market/smart-money-intel", SMI_END);
  assert.match(block, /filterByCanonicalDirection\(ranked, permission\.structure\)/);
});

console.log("\nCaller audit — every real production call of fetchRankedChainForStrategy is gated, no silent new bypass…");

ok("CALLER AUDIT: exactly 5 real call sites (smart-money-intel + the 4 Strategy Rank routes), every one preceded by a real permission check", () => {
  const callSites = [...src.matchAll(/fetchRankedChainForStrategy\(symbol/g)]
    .map((m) => m.index)
    .filter((idx) => !src.slice(Math.max(0, idx - 30), idx).endsWith("async function "));
  assert.strictEqual(callSites.length, 5, "expected exactly 5 real call sites — a different count means a caller was added/removed without this audit being updated");
  for (const idx of callSites) {
    const before = src.slice(Math.max(0, idx - 4000), idx);
    assert.match(before, /resolveCanonicalOptionsPermission\(symbol\)/, `call site at index ${idx} has no permission check within range — possible new bypass`);
  }
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("OPTIONS-AUTHORITY-GATE TEST FAILED"); else console.log("OPTIONS-AUTHORITY-GATE TEST OK");
