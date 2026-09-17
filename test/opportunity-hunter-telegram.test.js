"use strict";
// Real structural tests for the AI Opportunity Hunter's Telegram commands
// (2026-09-16 master prompt, Stocks Phase 1) and server.js's background-
// job wiring.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const botSrc = fs.readFileSync(path.join(__dirname, "..", "src", "telegram-bot.js"), "utf8");
const serverSrc = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

console.log("Checking /opportunities, /why, /changes, /watch, /lowrisk — real commands, real reuse…");

ok("all 5 real commands are registered in the COMMANDS router", () => {
  assert.match(botSrc, /opportunities: \(\) => cmdOpportunities\(\),/);
  assert.match(botSrc, /why:\s+\(a\) => cmdWhy\(a\),/);
  assert.match(botSrc, /changes:\s+\(\) => cmdOhChanges\(\),/);
  assert.match(botSrc, /lowrisk:\s+\(\) => cmdLowRisk\(\),/);
  assert.match(botSrc, /watch:\s+async \(a\) => \{ const sym = /);
});

ok("every new command calls the real src/opportunity-hunter.js scanOpportunities() — no second scan/scoring declared inline in telegram-bot.js", () => {
  const start = botSrc.indexOf("async function cmdOpportunities()");
  const end = botSrc.indexOf("async function cmdDeals(args)");
  const block = botSrc.slice(start, end);
  const requireCount = (block.match(/require\("\.\/opportunity-hunter"\)/g) || []).length;
  assert.ok(requireCount >= 3, `expected the real opportunity-hunter module required in cmdOpportunities/cmdWhy/cmdOhChanges/cmdLowRisk, found ${requireCount} references`);
});

ok("/watch reuses the real existing /wl add handler (same real watchlist store) — not a second watch-list implementation", () => {
  assert.match(botSrc, /return COMMANDS\.wl\(\["add", sym\]\);/);
});

ok("/changes reads the real persisted opportunity-hunter-alerts.js state file — no second snapshot store declared for this command", () => {
  assert.match(botSrc, /require\("\.\/opportunity-hunter-alerts"\)/);
  assert.match(botSrc, /readJsonSafe\(STORE_PATH, \{\}\)/);
});

console.log("\nChecking server.js background-job wiring…");

ok("server.js registers the real 15-min Opportunity Hunter Alerts job, same registerJob pattern as every other alert job", () => {
  assert.match(serverSrc, /registerJob\("Opportunity Hunter Alerts", 15 \* 60_000, \(\) => require\("\.\/src\/opportunity-hunter-alerts"\)\.checkOpportunityHunterAlerts\(\)\)/);
});

ok("server.js schedules the real hourly Opportunity Digest (2026-09-16, \"I want opportunities come to me not search for it\") at 6 real fixed hours, reusing the same real sendOpportunityDigest — no second scan/scoring declared inline in server.js", () => {
  assert.match(serverSrc, /for \(const dh of \[10, 11, 12, 13, 14, 15\]\)/);
  assert.match(serverSrc, /require\("\.\/src\/opportunity-hunter-alerts"\)\.sendOpportunityDigest\(\)/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("OPPORTUNITY-HUNTER-TELEGRAM TEST FAILED");
else console.log("OPPORTUNITY-HUNTER-TELEGRAM TEST OK");
