"use strict";
// decision-store.js (axiom-runner/components/) is a browser ESM module,
// transpiled by esbuild into the client bundle the same way build-client.js
// does for the whole app — so this test loads it the same real way (esbuild
// transformSync to CJS) rather than re-implementing its logic in the test,
// keeping the same "test the real production module" discipline as
// test/client-server-twin-sync.test.js.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

function loadDecisionStore() {
  const src = fs.readFileSync(path.join(__dirname, "../axiom-runner/components/decision-store.js"), "utf8");
  const { code } = esbuild.transformSync(src, { format: "cjs", loader: "js" });
  const mod = { exports: {} };
  new Function("module", "exports", "require", code)(mod, mod.exports, require);
  return mod.exports;
}

function fakeTrendScreenResponse(symbol, overrides = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      results: [{
        symbol,
        assetDecision: { symbol, verdict: "BUY", opportunityStage: "ACTIONABLE", ...overrides.assetDecision },
        marketRegime: { regime: "NEUTRAL" },
        dataHealth: { status: "live", canTrade: true },
      }],
    }),
  };
}

let passed = 0;
async function ok(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { console.error(`  ✗ ${name}\n    ${err.stack || err.message}`); process.exitCode = 1; }
}

(async () => {
  console.log("Checking decision-store.js invariants…");
  const realDateNow = Date.now;

  await ok("simultaneous requests for the same symbol share one in-flight fetch", async () => {
    const { fetchDecision, _resetDecisionCacheForTests } = loadDecisionStore();
    _resetDecisionCacheForTests();
    let calls = 0;
    global.fetch = async (url) => { calls++; assert.ok(url.includes("AAPL")); return fakeTrendScreenResponse("AAPL"); };
    const [a, b] = await Promise.all([fetchDecision("aapl"), fetchDecision("AAPL")]);
    assert.strictEqual(calls, 1);
    assert.strictEqual(a.assetDecision.verdict, "BUY");
    assert.deepStrictEqual(a, b);
  });

  await ok("a settled value is reused inside the freshness window and refetched after it expires", async () => {
    const { fetchDecision, _resetDecisionCacheForTests } = loadDecisionStore();
    _resetDecisionCacheForTests();
    let calls = 0;
    let now = 1_000_000;
    Date.now = () => now;
    global.fetch = async () => { calls++; return fakeTrendScreenResponse("MSFT"); };

    await fetchDecision("MSFT");
    assert.strictEqual(calls, 1);

    now += 5_000; // still inside DECISION_TTL_MS and past DEDUP_WINDOW_MS
    await fetchDecision("MSFT");
    assert.strictEqual(calls, 1, "should reuse the fresh cached entry, not refetch");

    now += 40_000; // now past DECISION_TTL_MS
    await fetchDecision("MSFT");
    assert.strictEqual(calls, 2, "should refetch once the cached entry ages past the freshness window");
  });

  await ok("isDecisionStale reflects the freshness window honestly", async () => {
    const { fetchDecision, isDecisionStale, _resetDecisionCacheForTests } = loadDecisionStore();
    _resetDecisionCacheForTests();
    let now = 2_000_000;
    Date.now = () => now;
    global.fetch = async () => fakeTrendScreenResponse("NVDA");

    assert.strictEqual(isDecisionStale("NVDA"), false, "a symbol never fetched is not 'stale', it's simply unknown");
    await fetchDecision("NVDA");
    assert.strictEqual(isDecisionStale("NVDA"), false);
    now += 40_000;
    assert.strictEqual(isDecisionStale("NVDA"), true);
  });

  await ok("a fetch failure resolves to an honest error entry, never a fabricated decision", async () => {
    const { fetchDecision, _resetDecisionCacheForTests } = loadDecisionStore();
    _resetDecisionCacheForTests();
    global.fetch = async () => { throw new Error("network down"); };
    const entry = await fetchDecision("TSLA");
    assert.strictEqual(entry.assetDecision, null);
    assert.strictEqual(entry.loading, false);
    assert.ok(entry.error);
  });

  await ok("a real row with no assetDecision yet is an honest error state, not a silent null", async () => {
    const { fetchDecision, _resetDecisionCacheForTests } = loadDecisionStore();
    _resetDecisionCacheForTests();
    global.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({ results: [{ symbol: "NVDA", assetDecision: null }] }),
    });
    const entry = await fetchDecision("NVDA");
    assert.strictEqual(entry.assetDecision, null);
    assert.strictEqual(entry.loading, false);
    assert.ok(entry.error, "a row with no assetDecision must surface an error, matching CanonicalVerdictStrip's 'Decision unavailable: ...' state");
  });

  await ok("getCachedDecision returns an honest loading placeholder before any fetch resolves", async () => {
    const { getCachedDecision, _resetDecisionCacheForTests } = loadDecisionStore();
    _resetDecisionCacheForTests();
    const entry = getCachedDecision("GOOGL");
    assert.strictEqual(entry.loading, true);
    assert.strictEqual(entry.assetDecision, null);
  });

  Date.now = realDateNow;
  delete global.fetch;

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("DECISION-STORE TEST FAILED");
  else console.log("DECISION-STORE TEST OK");
})();
