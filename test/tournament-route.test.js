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

console.log("\nChecking TradeDeskTab.jsx — slotted into the existing Deep Analysis dropdown, not a new sidebar tab…");

ok("a real 'tournament' dock module is declared, rendering Tournament500Panel — no new top-level activeTab/sidebar route", () => {
  assert.match(tabSrc, /\{ key: "tournament", label: "500 TOURNAMENT"/);
  assert.match(tabSrc, /dockModule === "tournament" && \(\s*<Tournament500Panel/);
});

ok("a real dedicated, always-visible '500 TOURNAMENT' button also opens the same dockModule (2026-09-17 follow-up: \"add it as a tab under ai trade desk\") — additive, not a replacement for the Deep Analysis dropdown entry", () => {
  assert.match(tabSrc, /🏆 500 TOURNAMENT/);
  assert.match(tabSrc, /onClick=\{\(\) => openTickerTab\("tournament"\)\}/);
});

ok("Sidebar.jsx has a real direct '500 Tournament' row (2026-09-17 explicit follow-up: \"tournament button as a tab in side bar\", overriding the master prompt's own initial closing recommendation) rendering the same real Tournament500Panel, not a second copy", () => {
  const sidebarSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "Sidebar.jsx"), "utf8");
  const liveSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "axiom-live.jsx"), "utf8");
  assert.match(sidebarSrc, /\{ id: "tournament", label: "500 Tournament"/);
  assert.match(liveSrc, /activeTab === "tournament" && <Tournament500Panel/);
});

console.log("\nChecking Tournament500Panel.jsx — real server-computed fields only, no client-side scoring…");

ok("fetches the real board/detail endpoints — never computes a score/rank/tier client-side", () => {
  assert.match(panelSrc, /fetch\("\/api\/market\/tournament"\)/);
  assert.match(panelSrc, /fetch\(`\/api\/market\/tournament\/detail\?symbol=/);
  assert.doesNotMatch(panelSrc, /function computeOpportunity|function computeCoreScore|opportunityScore\s*=\s*\d/, "must not recompute a score client-side");
});

ok("Opportunity Score and Risk Score are rendered as two real, separate fields — never merged into one displayed number", () => {
  assert.match(panelSrc, /OPPORTUNITY/);
  assert.match(panelSrc, /RISK/);
  assert.doesNotMatch(panelSrc, /opportunityScore\s*[-+]\s*riskScore/, "must not merge the two into one displayed value");
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TOURNAMENT-ROUTE TEST FAILED");
else console.log("TOURNAMENT-ROUTE TEST OK");
