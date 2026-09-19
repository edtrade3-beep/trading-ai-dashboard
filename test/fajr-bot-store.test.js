"use strict";
// fajr-bot-store.test.js (2026-09-19 hotfix — live incident: the whole
// app appeared stuck on a stale build after adding FAJR_BOT_TOKEN/etc.
// env vars). Real regression test locking in the fix: initFajrBotStore()
// must NEVER let a schema-setup failure propagate and crash the rest of
// the app — server.js's own boot chain treats a rejected promise from
// this step as fatal (process.exit(1)), which would take the entire,
// already-working trading platform down over a bug in this one new
// bolt-on feature, directly violating "keep the existing Render
// deployment working." No real network/DB here — mocks atomic-write.js's
// getPool()/isDbMode() to force a real failure path.
const assert = require("node:assert");
const fs = require("node:fs");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }
async function okAsync(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking initFajrBotStore — a real schema-setup failure must never crash the rest of the app…");

(async () => {
  await okAsync("a real pool.query rejection (any real Postgres error — bad SQL, permissions, connection drop) is caught, leaves isReady() false, and initFajrBotStore() itself still resolves (never rejects)", async () => {
    delete require.cache[require.resolve("../src/atomic-write")];
    delete require.cache[require.resolve("../src/fajr-bot-store")];
    const atomicWrite = require("../src/atomic-write");
    const originalGetPool = atomicWrite.getPool;
    const originalIsDbMode = atomicWrite.isDbMode;
    atomicWrite.getPool = () => ({ query: async () => { throw new Error("simulated real Postgres failure"); } });
    atomicWrite.isDbMode = () => true;

    const store = require("../src/fajr-bot-store");
    let rejected = false;
    try { await store.initFajrBotStore(); } catch { rejected = true; }
    assert.strictEqual(rejected, false, "initFajrBotStore() must resolve even when its own schema setup throws");
    assert.strictEqual(store.isReady(), false, "must honestly report not-ready after a real failure, never fake success");

    atomicWrite.getPool = originalGetPool;
    atomicWrite.isDbMode = originalIsDbMode;
  });

  await okAsync("a real successful schema setup does leave isReady() true", async () => {
    delete require.cache[require.resolve("../src/atomic-write")];
    delete require.cache[require.resolve("../src/fajr-bot-store")];
    const atomicWrite = require("../src/atomic-write");
    const queries = [];
    atomicWrite.getPool = () => ({ query: async (sql) => { queries.push(sql); return { rows: [] }; } });
    atomicWrite.isDbMode = () => true;

    const store = require("../src/fajr-bot-store");
    await store.initFajrBotStore();
    assert.strictEqual(store.isReady(), true);
    assert.ok(queries.length >= 5, "expected all 5 real CREATE TABLE statements to run");
  });

  console.log("\nChecking server.js's own boot chain — this step must never be allowed to reach the fatal process.exit(1) catch…");

  ok("server.js's initFajrBotStore() sits inside the SAME real .then() chain as the other real Postgres-backed stores, but the function itself (per the fix above) can never reject — so a real failure here can no longer trigger the chain's fatal process.exit(1)", () => {
    const src = fs.readFileSync(require.resolve("../server.js"), "utf8");
    assert.match(src, /\.then\(\(\) => initFajrBotStore\(\)\)/);
  });

  ok("initFajrBotStore's own real schema work is wrapped in try/catch, never left to reject the caller's promise", () => {
    const src = fs.readFileSync(require.resolve("../src/fajr-bot-store"), "utf8");
    const fnBody = src.slice(src.indexOf("async function initFajrBotStore"), src.indexOf("async function _createSchema"));
    assert.match(fnBody, /try\s*\{/);
    assert.match(fnBody, /catch\s*\(err\)\s*\{/);
  });

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("FAJR-BOT-STORE TEST FAILED");
  else console.log("FAJR-BOT-STORE TEST OK");
})();
