// Real tests for src/autopilot-idempotency.js — the per-symbol async
// mutex protecting server-autopilot.js/lightbox-autopilot-execute.js's
// shared real Alpaca account from a same-symbol double-entry race.
// Unified Autopilot merge, Stage 5.
const assert = require("node:assert");
const { withSymbolLock, buildIdempotencyKey } = require("../src/autopilot-idempotency");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }
async function okAsync(name, fn) { try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("Checking withSymbolLock — real concurrent-call race simulation…");

async function run() {
  await okAsync("two concurrent calls for the SAME symbol never overlap — real serialization, not just a check-then-act race", async () => {
    let running = 0;
    let overlapped = false;
    const critical = async () => {
      running++;
      if (running > 1) overlapped = true;
      await sleep(20);
      running--;
    };
    await Promise.all([
      withSymbolLock("AAPL", critical),
      withSymbolLock("AAPL", critical),
      withSymbolLock("AAPL", critical),
    ]);
    assert.strictEqual(overlapped, false, "two calls for the same symbol ran at the same time — the mutex failed to serialize them");
  });

  await okAsync("two concurrent calls for DIFFERENT symbols run genuinely concurrently, never needlessly blocked", async () => {
    let concurrentPeak = 0;
    let running = 0;
    const critical = async () => {
      running++;
      concurrentPeak = Math.max(concurrentPeak, running);
      await sleep(20);
      running--;
    };
    await Promise.all([
      withSymbolLock("AAPL", critical),
      withSymbolLock("MSFT", critical),
      withSymbolLock("NVDA", critical),
    ]);
    assert.ok(concurrentPeak > 1, "different symbols were serialized when they should run concurrently");
  });

  await okAsync("a real thrown error in one locked call never wedges the lock for the next real call on the same symbol", async () => {
    await withSymbolLock("TSLA", async () => { throw new Error("simulated broker failure"); }).catch(() => {});
    let secondRan = false;
    await withSymbolLock("TSLA", async () => { secondRan = true; });
    assert.strictEqual(secondRan, true);
  });

  ok("buildIdempotencyKey produces a real, stable, source+symbol+date-scoped key", () => {
    const key = buildIdempotencyKey({ source: "server-autopilot", symbol: "aapl", dateET: "2026-09-04" });
    assert.strictEqual(key, "uap-server-autopilot-AAPL-2026-09-04");
  });

  ok("buildIdempotencyKey appends a real correlationId when given one", () => {
    const key = buildIdempotencyKey({ source: "lightbox", symbol: "MSFT", dateET: "2026-09-04", correlationId: "abc123" });
    assert.strictEqual(key, "uap-lightbox-MSFT-2026-09-04-abc123");
  });

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("AUTOPILOT-IDEMPOTENCY TEST FAILED");
  else console.log("AUTOPILOT-IDEMPOTENCY TEST OK");
}

run();
