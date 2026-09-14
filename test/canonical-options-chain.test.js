"use strict";
// canonical-options-chain.test.js — real structural + behavioral
// regression test for the Canonical Options Chain Service (2026-09-14,
// "Stage 1: Extract Canonical Options Chain Service" task).
// getCanonicalOptionsChain()/resolveCanonicalOptionsPermission() run
// inside routes/market.js's large request handler and aren't
// independently exported for direct unit invocation — same convention
// this session already used for the withOptions=1 expiry-selection block
// (test/options-expiry-selection.test.js) and the Options Authority Gate
// (test/options-authority-gate.test.js) — so structural checks confirm
// the exact acquisition/normalization/cache wiring via source inspection,
// while the calendar-gap DTE selection and the cached() dedup primitive
// (both pure, both already exported elsewhere) get real, non-mocked
// behavioral proof (async/await convention matches this repo's own
// okAsync pattern, e.g. test/autopilot-idempotency.test.js). No new
// mocking framework introduced, per this session's established convention.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }
async function okAsync(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const src = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "market.js"), "utf8");

const fnStart = src.indexOf("async function getCanonicalOptionsChain(symbol)");
const fnEnd = src.indexOf("// Options Authority Gate (2026-09-14", fnStart);
assert.ok(fnStart > 0 && fnEnd > fnStart, "getCanonicalOptionsChain not found");
const chainFn = src.slice(fnStart, fnEnd);

const permStart = src.indexOf("async function resolveCanonicalOptionsPermission(symbol)");
const permEnd = src.indexOf("// Direction Compatibility Filter", permStart);
assert.ok(permStart > 0 && permEnd > permStart, "resolveCanonicalOptionsPermission not found");
const permFn = src.slice(permStart, permEnd);

async function run() {
  console.log("Checking getCanonicalOptionsChain — acquisition/expiry-selection/normalization only, no new policy…");

  ok("TEST 1 — reuses the nearest chain when it already clears MIN_ENTRY_DTE (chain defaults to nearest, only reassigned inside the too-short branch) — no unconditional second fetch", () => {
    assert.match(chainFn, /let chain = nearest;\s*\n\s*if \(!\(Number\.isFinite\(nearestDte\) && nearestDte >= MIN_ENTRY_DTE\)\) \{/);
  });

  ok("TEST 2 — when nearest is too short, picks the first REAL qualifying expiry via .find() over the real expiryDates array, then fetches exactly that expiry", () => {
    assert.match(chainFn, /const qualifying = \(nearest\.expiryDates \|\| \[\]\)\.find\(\(d\) => \{/);
    assert.match(chainFn, /fetchYahooOptionsChain\(symbol, qualifying\)/);
  });

  ok("TEST 4 — no qualifying expiry -> available:false via empty(), no short-expiry fallback assignment afterward", () => {
    assert.match(chainFn, /if \(!qualifying\) \{\s*\n\s*return empty\(`No real expiry clears the \$\{MIN_ENTRY_DTE\}-day minimum\.`/);
  });

  ok("TEST 5 — provider failure (nearest fetch itself fails) -> available:false, and this function never touches row/assetDecision — options failure cannot corrupt the stock thesis by construction", () => {
    assert.match(chainFn, /const nearest = await fetchYahooOptionsChain\(symbol, null\)\.catch\(\(\) => null\);\s*\n\s*if \(!nearest\) return empty\("Real options chain fetch failed\."\);/);
    assert.doesNotMatch(chainFn, /\brow\b|assetDecision|computeCanonicalAssetDecision/, "chain acquisition must stay isolated from the canonical verdict pipeline");
  });

  ok("TEST 6 — both sides always normalized and combined: calls AND puts, never one without the other", () => {
    assert.match(chainFn, /const calls = \(chain\.calls \|\| \[\]\)\.map\(toContract\(true\)\);/);
    assert.match(chainFn, /const puts = \(chain\.puts \|\| \[\]\)\.map\(toContract\(false\)\);/);
    assert.match(chainFn, /const contracts = \[\.\.\.calls, \.\.\.puts\];/);
  });

  ok("TEST 7 — no direction filter: the function takes only (symbol), never a direction/isCall parameter, and never filters by isCall itself", () => {
    assert.match(src, /async function getCanonicalOptionsChain\(symbol\) \{/);
    assert.doesNotMatch(chainFn, /\.filter\(\(?c\)? => c\.isCall/, "getCanonicalOptionsChain itself must never direction-filter — that stays in selectTradeStructure");
  });

  ok("TEST 8 — normalization preserves only real available fields, never fabricates delta/gamma/theta/vega", () => {
    assert.match(chainFn, /const toContract = \(isCall\) => \(r\) => \(\{\s*\n\s*isCall, strike: r\.strike, bid: r\.bid \|\| null, ask: r\.ask \|\| null,\s*\n\s*lastPrice: r\.lastPrice \|\| null, iv: r\.iv \|\| null,\s*\n\s*openInterest: r\.openInterest, volume: r\.volume,\s*\n\s*expiry: r\.expiry, quoteAgeMinutes: 0,\s*\n\s*\}\);/);
    assert.doesNotMatch(chainFn, /delta|gamma|theta|vega/i, "must not fabricate greeks that Yahoo's real chain doesn't provide");
  });

  ok("TEST 9a — cached per symbol under its own dedicated key, same TTL convention as the rest of this options subsystem", () => {
    assert.match(chainFn, /cached\(`canonical-options-chain:\$\{symbol\}`, 5 \* 60_000, async \(\) => \{/);
  });

  await okAsync("TEST 9b (real, non-mocked) — cached()'s underlying dedup primitive: two concurrent calls for the same key reuse one in-flight resolution, never a second real call", async () => {
    const { cached } = require("../src/utils");
    let calls = 0;
    const key = `test-dedup-${Date.now()}-${Math.random()}`;
    const fn = async () => { calls++; return "real-result"; };
    const [a, b] = await Promise.all([cached(key, 60_000, fn), cached(key, 60_000, fn)]);
    assert.strictEqual(calls, 1, "concurrent requests for the same key must share one real acquisition, not trigger two");
    assert.strictEqual(a, "real-result");
    assert.strictEqual(b, "real-result");
  });

  console.log("\nChecking calendar-gap expiry selection — real, deterministic, no assumed-date construction (TEST 3)…");

  ok("TEST 3 — with real expiries at +18/+26/+33 ET calendar days (no exact 21), the SAME production predicate (dteFromExpiry(d) >= MIN_ENTRY_DTE via .find()) picks +26, never a constructed/assumed date", () => {
    const { dteFromExpiry, etDateStr } = require("../src/options-math");
    const { MIN_ENTRY_DTE } = require("../src/trade-structure-selector");
    const todayEt = new Date(`${etDateStr()}T00:00:00Z`);
    const dayStr = (n) => new Date(todayEt.getTime() + n * 86_400_000).toISOString().slice(0, 10);
    const expiryDates = [dayStr(18), dayStr(26), dayStr(33)]; // real calendar gap, no exact 21-day expiry
    const qualifying = expiryDates.find((d) => {
      const dte = dteFromExpiry(d);
      return Number.isFinite(dte) && dte >= MIN_ENTRY_DTE;
    });
    assert.strictEqual(qualifying, dayStr(26), "must pick the first REAL expiry clearing the floor (26), never interpolate/assume a weekly date");
    assert.strictEqual(dteFromExpiry(qualifying), 26);
  });

  console.log("\nChecking resolveCanonicalOptionsPermission — now consumes the shared chain service, verdict logic unchanged (TEST 10)…");

  ok("resolveCanonicalOptionsPermission calls getCanonicalOptionsChain instead of re-implementing chain acquisition inline", () => {
    assert.match(permFn, /const chain = await getCanonicalOptionsChain\(symbol\);/);
    assert.doesNotMatch(permFn, /fetchYahooOptionsChain\(/, "chain acquisition must no longer be duplicated inline here");
  });

  ok("resolveCanonicalOptionsPermission still builds optionChain as calls+puts and feeds computeCanonicalAssetDecision identically to before — no verdict/risk logic changed", () => {
    assert.match(permFn, /optionChain = \[\.\.\.\(chain\.calls \|\| \[\]\), \.\.\.\(chain\.puts \|\| \[\]\)\];/);
    assert.match(permFn, /computeCanonicalAssetDecision\(\{ symbol, row, macroQuotes: macroData, optionChain, ivRank, nowMs: Date\.now\(\), marketHours: false \}\)/);
    assert.match(permFn, /allowed: canonicalAllowsOptions\(tradeGpsVerdict\)/);
  });

  // UPDATE (2026-09-14, Stage 2 "Make Strategy Rank Consume Canonical
  // Options Chain"): at Stage 1 time this checked that Strategy Rank's
  // own independent fetch/DTE logic was STILL untouched (in-scope
  // boundary discipline for Stage 1 only). Stage 2 has now intentionally
  // migrated fetchRankedChainForStrategy onto getCanonicalOptionsChain —
  // real coverage for that migration (shared cache, both-sides
  // preservation, fail-closed behavior, ranking-regression) lives in
  // test/options-authority-gate.test.js and the existing
  // strategy-ranking/strategy-explain suites, which exercise the
  // now-shared chain end to end.
  console.log("\nChecking fetchRankedChainForStrategy now consumes the shared chain service (Stage 2, no independent provider authority left)…");

  ok("fetchRankedChainForStrategy no longer has its own independent fetch/DTE logic (realDte/Polygon branch) — it now calls getCanonicalOptionsChain", () => {
    const fetchStart = src.indexOf("async function fetchRankedChainForStrategy(symbol)");
    assert.ok(fetchStart > 0);
    const fetchFnEnd = src.indexOf("\n  if (pathname ===", fetchStart);
    const fetchFn = src.slice(fetchStart, fetchFnEnd);
    assert.doesNotMatch(fetchFn, /const realDte = /, "Strategy Rank's own separate DTE formula must be gone after Stage 2");
    assert.doesNotMatch(fetchFn, /fetchYahooOptionsChain\(|polygon\.io/i, "Strategy Rank must no longer independently fetch a provider chain after Stage 2");
    assert.match(fetchFn, /const chain = await getCanonicalOptionsChain\(symbol\);/);
  });

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("CANONICAL-OPTIONS-CHAIN TEST FAILED"); else console.log("CANONICAL-OPTIONS-CHAIN TEST OK");
}

run();
