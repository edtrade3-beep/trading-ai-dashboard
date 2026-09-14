"use strict";
// options-expiry-selection.test.js — real structural regression test for
// the canonical Trade GPS expiry-selection block in routes/market.js's
// withOptions=1 handler (2026-09-14, "Safe Options Expiration Selection"
// task). That block runs inside a large async route handler with real
// provider fetches and isn't independently exported for direct unit
// invocation — same convention this session already used for the
// non-exported tiers-sort comparator (test/opportunity-sort-tiebreak.test.js)
// — so this confirms the exact selection logic via source inspection.
// Real unit coverage for the underlying DTE math lives in
// options-dte.test.js; real unit coverage for the eligibility backstop
// lives in trade-structure-selector.test.js. This file only confirms the
// fetch-orchestration shape: at most one extra real provider call, real
// fail-closed behavior, no competing DTE formula introduced here.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const src = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "market.js"), "utf8");
const block = src.slice(src.indexOf("const chains = await Promise.all(symbols.map(async (sym) => {"), src.indexOf("optionChainBySymbol = new Map(symbols.map((sym, i) => {"));

console.log("Checking routes/market.js's withOptions=1 expiry-selection block…");

ok("uses the canonical dteFromExpiry from options-math.js — no locally re-implemented DTE formula in this block", () => {
  assert.match(src, /const \{ dteFromExpiry \} = require\("\.\.\/options-math"\);/);
  assert.doesNotMatch(block, /Date\.now\(\)|getUTCFullYear|getUTCMonth/, "must not hand-roll a second DTE calculation here");
});

ok("uses the canonical MIN_ENTRY_DTE from trade-structure-selector.js — no re-declared/hard-coded 21 in this block", () => {
  assert.match(src, /const \{ MIN_ENTRY_DTE \} = require\("\.\.\/trade-structure-selector"\);/);
  assert.doesNotMatch(block, /= 21\b/, "the floor value must come from the imported constant, not a second literal 21");
});

ok("TEST 14 — reuses the nearest fetch when it already clears the floor, no unnecessary second provider call", () => {
  assert.match(block, /if \(Number\.isFinite\(nearestDte\) && nearestDte >= MIN_ENTRY_DTE\) return nearest;/);
});

ok("TEST 15 — at most ONE additional real fetch, only for the first real qualifying expiry", () => {
  const fetchCalls = (block.match(/fetchYahooOptionsChain\(/g) || []).length;
  assert.strictEqual(fetchCalls, 2, "exactly 2 call sites: the initial nearest fetch and the single conditional later-expiry fetch — never a loop over multiple expiries");
  assert.doesNotMatch(block, /for\s*\(|\.map\(.*fetchYahooOptionsChain.*fetchYahooOptionsChain/, "must not fetch multiple expirations in a loop");
});

ok("PART 6 — never builds a multi-expiry chain (no concatenation of contracts across expiries)", () => {
  assert.doesNotMatch(block, /\.concat\(|\.calls\.push|puts\.push/);
});

ok("TEST 16/17/18 — FAIL CLOSED: no qualifying expiry (or the later fetch failing) produces an honestly empty chain, never a shorter-DTE fallback or fabricated contract", () => {
  assert.match(block, /if \(!qualifying\) return \{ \.\.\.nearest, calls: \[\], puts: \[\] \};/);
  assert.match(block, /return later \|\| \{ \.\.\.nearest, calls: \[\], puts: \[\] \};/);
  assert.doesNotMatch(block, /return nearest;\s*\}\);\s*\}\)\);/, "must not silently fall back to the too-short nearest chain on failure");
});

ok("selection reads the real expiryDates array in its existing bucket order — .find() picks the first qualifying date, never a new sort", () => {
  assert.match(block, /\(nearest\.expiryDates \|\| \[\]\)\.find\(/);
  assert.doesNotMatch(block, /expiryDates.*\.sort\(/);
});

console.log("\nChecking scope — Strategy Rank path and every other DO-NOT-TOUCH file are untouched…");

ok("the separate, pre-existing Strategy Rank chain fetcher (fetchRankedChainForStrategy) is untouched — still uses its own local realDte, not the canonical dteFromExpiry (known, disclosed, out-of-scope duplication)", () => {
  assert.match(src, /const realDte = \(dateStr\) => Math\.round\(\(Date\.parse\(dateStr\) - Date\.now\(\)\) \/ 86_400_000\);/, "confirms this pre-existing separate formula still exists unmodified");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("OPTIONS-EXPIRY-SELECTION TEST FAILED"); else console.log("OPTIONS-EXPIRY-SELECTION TEST OK");
