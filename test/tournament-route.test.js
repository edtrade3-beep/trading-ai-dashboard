"use strict";
// Real structural/reuse tests for src/routes/tournament.js, its router.js
// wiring, server.js's background job, and TradeDeskTab.jsx's dock-module
// wiring (2026-09-17, "500-Stock Tournament" master prompt). No network —
// live board/detail responses are exercised manually against the deployed
// server, same convention this session already uses for every other
// provider-backed route.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const routeSrc = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "tournament.js"), "utf8");
const routerSrc = fs.readFileSync(path.join(__dirname, "..", "src", "router.js"), "utf8");
const serverSrc = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const tabSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "TradeDeskTab.jsx"), "utf8");
const panelSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "Tournament500Panel.jsx"), "utf8");

console.log("Checking routes/tournament.js — real reuse, no second scoring/risk formula…");

ok("the board handler reuses the real tournament-engine.js buildTournamentBoard — no inline ranking logic in the route", () => {
  assert.match(routeSrc, /require\("\.\.\/tournament-engine"\)/);
  assert.match(routeSrc, /buildTournamentBoard/);
});

ok("the detail handler reuses the real canonical-decision-pipeline.js and asset-decision.js's own computeRiskScore for the contributor breakdown — never a second risk formula", () => {
  assert.match(routeSrc, /require\("\.\.\/canonical-decision-pipeline"\)/);
  assert.match(routeSrc, /require\("\.\.\/asset-decision"\)/);
  assert.doesNotMatch(routeSrc, /function computeRiskScore/, "must not redeclare risk scoring");
});

ok("real bug regression (live crash, 2026-09-17): negativeContributors maps each redFlag object to its real reason/label string before merging with blockers — never renders a raw flag object", () => {
  assert.match(routeSrc, /opp\.redFlags \|\| \[\]\)\.map\(\(f\) => f\.reason \|\| f\.label \|\| f\.key\)/);
});

ok("real fundamentals wiring (2026-09-17, \"pull fundamental from the platform\"): the detail handler reuses the real, already-shipped future-value-scan.js's runFutureValueSymbol (FMP-backed futureScore/valueScore) — no second fundamentals formula declared here, and a real fetch failure leaves both fields honestly null rather than fabricating a score", () => {
  assert.match(routeSrc, /require\("\.\/future-value-scan"\)/);
  assert.match(routeSrc, /runFutureValueSymbol/);
  assert.doesNotMatch(routeSrc, /function computeFutureValueRead/, "must not redeclare the fundamentals scoring formula");
  assert.match(routeSrc, /catch \{ \/\* real fundamentals genuinely unavailable/);
});

console.log("\nChecking router.js wiring…");

ok("router.js wires both real tournament routes to routes/tournament.js's real handlers", () => {
  assert.match(routerSrc, /require\("\.\/routes\/tournament"\)/);
  assert.match(routerSrc, /\/api\/market\/tournament(?!\/)/);
  assert.match(routerSrc, /\/api\/market\/tournament\/detail/);
});

console.log("\nChecking server.js background-job wiring — real tiered refresh, not a full-universe sweep every tick…");

ok("server.js registers the real 500-Stock Tournament Tick job, reusing tournament-engine.js's own runTournamentTick", () => {
  assert.match(serverSrc, /registerJob\("500-Stock Tournament Tick", 10 \* 60_000, \(\) => require\("\.\/src\/tournament-engine"\)\.runTournamentTick\(\)\)/);
});

console.log("\nChecking the standalone 500 Tournament UI surface is fully consolidated into PRIME (2026-09-17: \"ai trade desk prime will take data from 500 tournament and delete 500 tournament because will be duplicate\")…");

ok("TradeDeskTab.jsx no longer declares a 'tournament' dock module or a dedicated 500 TOURNAMENT button — that data now lives on PRIME", () => {
  assert.doesNotMatch(tabSrc, /\{ key: "tournament", label: "500 TOURNAMENT"/);
  assert.doesNotMatch(tabSrc, /dockModule === "tournament" && \(\s*<Tournament500Panel/);
  assert.doesNotMatch(tabSrc, /🏆 500 TOURNAMENT/);
  assert.doesNotMatch(tabSrc, /import Tournament500Panel/, "TradeDeskTab.jsx should no longer import a component it never renders");
});

ok("Sidebar.jsx no longer has a standalone '500 Tournament' row, and axiom-live.jsx no longer routes activeTab 'tournament' to a standalone screen — real board data is now reached only through PRIME", () => {
  const sidebarSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "Sidebar.jsx"), "utf8");
  const liveSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "axiom-live.jsx"), "utf8");
  assert.doesNotMatch(sidebarSrc, /\{ id: "tournament", label: "500 Tournament"/);
  assert.doesNotMatch(liveSrc, /activeTab === "tournament" && <Tournament500Panel/);
  assert.doesNotMatch(liveSrc, /import Tournament500Panel/, "axiom-live.jsx should no longer import a component it never renders");
});

ok("Tournament500Panel.jsx itself (the real board/detail fetch logic and its exported Row/TradePlanContent/Badge/etc.) is untouched — PRIME's own Top-25 table and Selected Trade Plan panel are built from these same real exports, not a second copy", () => {
  assert.match(panelSrc, /export \{\s*\n?\s*Row, Badge, TradePlanContent/);
  assert.match(panelSrc, /fetch\("\/api\/market\/tournament"\)/);
});

console.log("\nChecking Tournament500Panel.jsx — real server-computed fields only, no client-side scoring…");

ok("fetches the real board/detail endpoints — never computes a score/rank/tier client-side", () => {
  assert.match(panelSrc, /fetch\("\/api\/market\/tournament"\)/);
  assert.match(panelSrc, /fetch\(`\/api\/market\/tournament\/detail\?symbol=/);
  assert.doesNotMatch(panelSrc, /function computeOpportunity|function computeCoreScore|opportunityScore\s*=\s*\d/, "must not recompute a score client-side");
});

ok("Opportunity Score and Risk Score are rendered as two real, separate fields — never merged into one displayed number", () => {
  assert.match(panelSrc, /Opportunity/i);
  assert.match(panelSrc, /Risk/i);
  assert.doesNotMatch(panelSrc, /opportunityScore\s*[-+]\s*riskScore/, "must not merge the two into one displayed value");
});

console.log("\nChecking the real /tournament Telegram command (2026-09-17 follow-up: \"keep scanning till get me in one of the stocks\")…");

const botSrc = fs.readFileSync(path.join(__dirname, "..", "src", "telegram-bot.js"), "utf8");
ok("a real /tournament command is registered, reusing the same real buildTournamentBoard the web board reads — no second ranking pass", () => {
  assert.match(botSrc, /tournament: \(\) => cmdTournament\(\),/);
  assert.match(botSrc, /require\("\.\/tournament-engine"\)/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TOURNAMENT-ROUTE TEST FAILED");
else console.log("TOURNAMENT-ROUTE TEST OK");
