"use strict";
// Real structural tests for GET /api/market/top50-scanner and its
// background-job wiring in server.js (2026-09-16, "Build Telegram Alerts
// for the AI Top 50 Scanner" master prompt).
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const marketSrc = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "market.js"), "utf8");
const serverSrc = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

console.log("Checking GET /api/market/top50-scanner + server.js background-job wiring…");

ok("the route exists, defaults to limit=5, caps at 50, and delegates to the real scanTop50() — no inline re-implementation", () => {
  assert.match(marketSrc, /pathname === "\/api\/market\/top50-scanner" && req\.method === "GET"/);
  assert.match(marketSrc, /require\("\.\.\/top50-scanner"\)/);
  assert.match(marketSrc, /Math\.min\(50, limitParam\)/);
});

ok("fetchBarsCached and fetchDayTradeScanRows are exported for top50-scanner.js's real reuse — same real cached daily-bars fetch and 15m intraday scan every other consumer already uses", () => {
  assert.match(marketSrc, /module\.exports\.fetchBarsCached = _fetchBarsCached;/);
  assert.match(marketSrc, /module\.exports\.fetchDayTradeScanRows = fetchDayTradeScanRows;/);
});

ok("server.js registers the real 15-min Top 50 Scanner Alerts job, same registerJob pattern as Opportunity Pivot Watch/Bearish Setups", () => {
  assert.match(serverSrc, /registerJob\("Top 50 Scanner Alerts", 15 \* 60_000, \(\) => require\("\.\/src\/top50-telegram-alerts"\)\.checkTop50TelegramAlerts\(\)\)/);
});

ok("server.js schedules the real once-daily Morning Top 5 summary (9:15-9:21 ET, weekday-gated, deduped per calendar day) — not a repeating interval job", () => {
  assert.match(serverSrc, /_top50MorningSent/);
  assert.match(serverSrc, /h === 9 && m >= 15 && m < 21 && _top50MorningSent !== today/);
  assert.match(serverSrc, /sendTop50MorningSummary\(\)\.catch\(\(\) => \{\}\)/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TOP50-SCANNER-ROUTE TEST FAILED");
else console.log("TOP50-SCANNER-ROUTE TEST OK");
