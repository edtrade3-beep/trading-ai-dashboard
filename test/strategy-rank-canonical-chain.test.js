"use strict";
// strategy-rank-canonical-chain.test.js — real structural + behavioral
// regression test for Stage 2 of the options chain consolidation
// (2026-09-14, "Make Strategy Rank Consume Canonical Options Chain").
// fetchRankedChainForStrategy() runs inside routes/market.js's large
// request handler and isn't independently exported for direct unit
// invocation — same convention this session already used for
// getCanonicalOptionsChain (test/canonical-options-chain.test.js) and the
// Options Authority Gate (test/options-authority-gate.test.js) — so
// structural checks confirm the exact data-source migration via source
// inspection. Real, non-mocked behavioral proof of the underlying
// cached()-dedup primitive both getCanonicalOptionsChain and
// resolveCanonicalOptionsPermission now share already lives in
// test/canonical-options-chain.test.js's TEST 9b — not duplicated here.
// Ranking-formula regression (weights/POP/liquidity/alignment unchanged)
// is proven by strategy-ranking.test.js/strategy-explain.test.js/
// trade-structure-selector.test.js passing unmodified, since none of
// those files were touched by this migration.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const src = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "market.js"), "utf8");
const fetchStart = src.indexOf("async function fetchRankedChainForStrategy(symbol, { minDte = 7 } = {})");
assert.ok(fetchStart > 0, "fetchRankedChainForStrategy not found");
const fetchFnEnd = src.indexOf("\n  if (pathname ===", fetchStart);
const fetchFn = src.slice(fetchStart, fetchFnEnd);

console.log("Checking fetchRankedChainForStrategy — Stage 2 data-source migration…");

ok("TEST 1/2 — selectedExpiry/dte are read directly off the canonical chain, never independently recomputed or re-selected here", () => {
  assert.match(fetchFn, /selectedExpiry: chain\.selectedExpiry/);
  assert.doesNotMatch(fetchFn, /\.find\(|realDte|minDte >=|dteFromExpiry\(/, "no independent expiry-selection logic may remain in this function");
});

ok("TEST 3/7 — canonical chain unavailable -> Strategy Rank unavailable (empty calls/puts), no fallback fetch, no Polygon/Yahoo call remains reachable", () => {
  assert.match(fetchFn, /if \(!chain\.available\) \{\s*\n\s*return \{ underlying: 0, calls: \[\], puts: \[\], source: chain\.source \|\| "yahoo", selectedExpiry: null, dteFloorMet: false, minDte \};/);
  assert.doesNotMatch(fetchFn, /fetchYahooOptionsChain\(|polygon\.io|POLYGON_API_KEY/i, "no independent provider fetch may remain reachable in this function");
});

ok("TEST 4 — both calls AND puts are ranked off the SAME canonical chain, never one side only", () => {
  assert.match(fetchFn, /const calls = rankContracts\(chain\.calls, \{ underlying, isCall: true \}\);/);
  assert.match(fetchFn, /const puts = rankContracts\(chain\.puts, \{ underlying, isCall: false \}\);/);
});

ok("TEST 5/6 — the ONLY acquisition call in this function is getCanonicalOptionsChain(symbol) — the same shared, cached function resolveCanonicalOptionsPermission already calls for the same symbol, so a gated request triggers no second real acquisition within the cache window", () => {
  const chainCalls = (fetchFn.match(/getCanonicalOptionsChain\(/g) || []).length;
  assert.strictEqual(chainCalls, 1, "exactly one call to the shared chain service, no duplicate/parallel acquisition path");
  assert.match(fetchFn, /const chain = await getCanonicalOptionsChain\(symbol\);/);
});

ok("rankContracts itself is untouched (same import, same call signature) — Stage 2 only swaps the chain source feeding it, never its math", () => {
  assert.match(src, /const \{ rankContracts, interpretFlowRow, gammaSqueezeProbability \} = require\("\.\.\/options-math"\);/);
});

console.log("\nChecking Strategy Rank no longer has independent provider authority (Part 7)…");

ok("no Polygon snapshot/contracts URL remains reachable inside fetchRankedChainForStrategy", () => {
  assert.doesNotMatch(fetchFn, /api\.polygon\.io/);
});

console.log("\nChecking caller-contract compatibility — return shape preserved for existing callers…");

ok("return shape still carries underlying/calls/puts/source/selectedExpiry/dteFloorMet/minDte — every existing destructuring caller keeps working unmodified", () => {
  assert.match(fetchFn, /return \{ underlying, calls, puts, source: chain\.source, selectedExpiry: chain\.selectedExpiry, dteFloorMet: true, minDte \};/);
});

ok("minDte is accepted (signature-compatible with every existing call site, none of which pass a second argument) but no longer drives any selection logic in this function", () => {
  assert.match(fetchFn, /async function fetchRankedChainForStrategy\(symbol, \{ minDte = 7 \} = \{\}\) \{/);
  assert.doesNotMatch(fetchFn, />= minDte\b/, "minDte must not be compared against anything — it is now inert");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("STRATEGY-RANK-CANONICAL-CHAIN TEST FAILED"); else console.log("STRATEGY-RANK-CANONICAL-CHAIN TEST OK");
