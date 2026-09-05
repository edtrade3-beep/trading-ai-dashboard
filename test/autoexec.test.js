// Real tests for src/routes/autoexec.js's crypto-pair exclusion, added by
// the Autopilot goal audit (2026-08-30). maybeAutoExecute() itself needs a
// real configured Tradier broker + real market hours to run past its first
// two guard clauses (both false in this test environment — no
// TRADIER_API_KEY set), so a call to it here would return null for the
// wrong reason and not actually exercise the crypto check. Testing the
// real, exported isCryptoPairSymbol directly instead — the same function
// maybeAutoExecute calls, not a hand-copied approximation of it.
// Same minimal style as risk-guardrails.test.js — no framework, no new dep.
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");
const { isCryptoPairSymbol, handleAutoExec, getAutoexecMode } = require("../src/routes/autoexec");
const { ROOT } = require("../src/config");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

console.log("Checking isCryptoPairSymbol — real broker-incompatible crypto pairs vs. real tradeable equities…");

ok("a real crypto pair (BTC-USD) is flagged", () => {
  assert.strictEqual(isCryptoPairSymbol("BTC-USD"), true);
});
ok("real crypto pairs are flagged case-insensitively", () => {
  assert.strictEqual(isCryptoPairSymbol("eth-usd"), true);
});
ok("a real equity/ETF that trades crypto-adjacent (COIN) is NOT flagged — it's a real, placeable equity order", () => {
  assert.strictEqual(isCryptoPairSymbol("COIN"), false);
});
ok("a real equity/ETF (IBIT) is NOT flagged for the same reason", () => {
  assert.strictEqual(isCryptoPairSymbol("IBIT"), false);
});
ok("a normal real stock symbol is NOT flagged", () => {
  assert.strictEqual(isCryptoPairSymbol("AAPL"), false);
});
ok("empty/missing input never throws, never flags", () => {
  assert.strictEqual(isCryptoPairSymbol(""), false);
  assert.strictEqual(isCryptoPairSymbol(undefined), false);
});

console.log("\nChecking Tradier autopilot/assistant mode retirement (Unified Autopilot merge, Stage 9)…");

const CONFIG_PATH = path.join(ROOT, "data", "autoexec-config.json");
let _configBackup = null;
function backupConfig() { try { _configBackup = fs.readFileSync(CONFIG_PATH, "utf8"); } catch { _configBackup = null; } }
function restoreConfig() { if (_configBackup != null) fs.writeFileSync(CONFIG_PATH, _configBackup); else { try { fs.unlinkSync(CONFIG_PATH); } catch {} } }

function fakeReq(bodyObj) {
  const chunks = [Buffer.from(JSON.stringify(bodyObj))];
  return { method: "POST", [Symbol.asyncIterator]: async function* () { for (const c of chunks) yield c; } };
}
function fakeRes() {
  const res = { statusCode: null, body: null };
  res.writeHead = (code) => { res.statusCode = code; };
  res.end = (body) => { res.body = body; };
  return res;
}
async function postConfig(bodyObj) {
  const res = fakeRes();
  await handleAutoExec(fakeReq(bodyObj), res, new URL("http://x/api/autoexec/config"));
  return { status: res.statusCode, json: JSON.parse(res.body) };
}

(async () => {
  backupConfig();
  try {
    ok("a config already on disk with mode:\"autopilot\" is downgraded to \"observer\" on read, not trusted as-is", () => {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify({ mode: "autopilot" }));
      assert.strictEqual(getAutoexecMode(), "observer");
    });

    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ mode: "off" }));
    await (async () => {
      try {
        const r = await postConfig({ mode: "autopilot" });
        assert.strictEqual(r.status, 400);
        assert.ok(/retired/i.test(r.json.error));
        passed++; console.log("  ✓ POST /api/autoexec/config refuses mode:\"autopilot\" with a real 400, never silently re-enables it");
      } catch (e) { console.error(`  ✗ POST /api/autoexec/config refuses mode:"autopilot"...\n    ${e.message}`); process.exitCode = 1; }
    })();

    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ mode: "off" }));
    await (async () => {
      try {
        const r = await postConfig({ mode: "assistant" });
        assert.strictEqual(r.status, 400);
        passed++; console.log("  ✓ POST /api/autoexec/config refuses mode:\"assistant\" the same way");
      } catch (e) { console.error(`  ✗ POST /api/autoexec/config refuses mode:"assistant"...\n    ${e.message}`); process.exitCode = 1; }
    })();

    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ mode: "off" }));
    await (async () => {
      try {
        const r = await postConfig({ mode: "observer" });
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.json.config.mode, "observer");
        passed++; console.log("  ✓ POST /api/autoexec/config still accepts \"observer\" — the one real automated mode left");
      } catch (e) { console.error(`  ✗ POST /api/autoexec/config still accepts "observer"...\n    ${e.message}`); process.exitCode = 1; }
    })();
  } finally {
    restoreConfig();
  }

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("AUTOEXEC TEST FAILED");
  else console.log("AUTOEXEC TEST OK");
})();
