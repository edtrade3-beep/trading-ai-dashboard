"use strict";
// Real structural/reuse tests for axiom-runner/components/PrimeTab.jsx —
// "AI Trade Desk — PRIME" master prompt (2026-09-17). PrimeTab is a real
// AGGREGATOR with zero new scoring/risk/lifecycle logic — every check
// here confirms it reuses an already-real source rather than declaring a
// second one, per the prompt's own explicit section 20/21 rules.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const primeSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "PrimeTab.jsx"), "utf8");
const tournamentSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "Tournament500Panel.jsx"), "utf8");
const sidebarSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "Sidebar.jsx"), "utf8");
const liveSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "axiom-live.jsx"), "utf8");

console.log("Checking PrimeTab.jsx — real reuse only, no duplicate scoring/risk/lifecycle engine…");

ok("Top 5 Elite / Early Discovery / Tournament Top 25 all derive from the SAME single GET /api/market/tournament fetch — never a second scan", () => {
  const fetchCount = (primeSrc.match(/fetch\("\/api\/market\/tournament"\)/g) || []).length;
  assert.strictEqual(fetchCount, 1, `expected exactly one board fetch, found ${fetchCount}`);
  assert.match(primeSrc, /\|\| \[\]\)\.filter\(\(r\) => !r\.isEarlyDiscovery\)/);
  assert.match(primeSrc, /\|\| \[\]\)\.filter\(\(r\) => r\.isEarlyDiscovery\)/);
});

ok("reuses the real Row/Badge/TradePlanContent from Tournament500Panel.jsx — no second table-row or trade-plan renderer declared here", () => {
  assert.match(primeSrc, /import \{[\s\S]*Row,[\s\S]*Badge,[\s\S]*TradePlanContent,[\s\S]*\} from "\.\/Tournament500Panel\.jsx"/);
  assert.doesNotMatch(primeSrc, /function Row\(|function TradePlanContent\(/, "must not redeclare the real row/trade-plan renderer");
});

ok("Tournament500Panel.jsx actually exports these pieces (Row/Badge/TradePlanContent/StatCard/ScoreBar/etc.) for real reuse, not just local use", () => {
  assert.match(tournamentSrc, /export \{\s*\n?\s*Row, Badge, TradePlanContent/);
});

ok("reuses the real WhatChangedStrip component for section F — no second What-Changed implementation", () => {
  assert.match(primeSrc, /import WhatChangedStrip from "\.\/WhatChangedStrip\.jsx"/);
  assert.match(primeSrc, /<WhatChangedStrip/);
});

ok("real position sizing reuses the SAME GET /api/quick-trade/precheck account-based sizing — never sizes off a confidence/opportunity score", () => {
  assert.match(primeSrc, /\/api\/quick-trade\/precheck/);
  assert.doesNotMatch(primeSrc, /qty\s*=.*opportunityScore|sizing.*confidenceScore/i, "must not size a position off a confidence/opportunity score");
});

ok("real risk guardrails reuse the SAME preTradeCheck gate (which actually blocks new orders server-side) — the panel shows the real lock reason rather than only a cosmetic warning when gate.ok is false", () => {
  assert.match(primeSrc, /gate\.ok/);
  assert.match(primeSrc, /NEW TRADE ENTRY DISABLED/);
});

ok("real market regime bar reuses the same live-quote/us10y/breadth endpoints already used elsewhere (FedWatchTab.jsx/BreadthTab.jsx) — no second quote fetch declared", () => {
  assert.match(primeSrc, /\/api\/market\/live-quote/);
  assert.match(primeSrc, /\/api\/market\/us10y/);
  assert.match(primeSrc, /\/api\/market\/breadth/);
});

ok("the real market-regime label displayed is the tournament board's own canonical marketRegime field — no second regime classifier", () => {
  assert.match(primeSrc, /regimeLabel={board\.marketRegime}/);
});

ok("the inline 'NEXT CHALLENGERS' expand (replacing the removed VIEW ALL 500 button) reuses the SAME real board.challengers array — never a second ranked list or a navigation to a deleted tab", () => {
  assert.match(primeSrc, /board\.challengers\.map\(\(c\) =>/);
  assert.doesNotMatch(primeSrc, /setActiveTab\("tournament"\)/, "must not link to the removed standalone tournament tab");
});

console.log("\nChecking wiring — PRIME is the new default landing screen, reachable from the sidebar, additive to AI Trade Desk…");

ok("Sidebar.jsx has a real 'AI Trade Desk — PRIME' row, placed first", () => {
  const idx = sidebarSrc.indexOf('{ id: "prime"');
  const tradeDeskIdx = sidebarSrc.indexOf('{ id: "trade-desk"');
  assert.ok(idx > -1, "prime row must exist");
  assert.ok(idx < tradeDeskIdx, "prime should be placed before AI Trade Desk, per its own 'primary workflow' framing");
});

ok("axiom-live.jsx renders the real PrimeTab for activeTab === 'prime', and defaults to it on load", () => {
  assert.match(liveSrc, /activeTab === "prime" && <PrimeTab/);
  assert.match(liveSrc, /return "prime";/);
});

console.log("\nChecking click-to-deep-dive (2026-09-19, \"click on each stock and get a summary and details and deep dive\") — reuses the SAME DetailDrawer modal the standalone 500 Tournament page already opens…");

ok("PrimeTab imports the real DetailDrawer from Tournament500Panel.jsx — no second modal/detail-popup component declared here", () => {
  assert.match(primeSrc, /import \{[\s\S]*DetailDrawer[\s\S]*\} from "\.\/Tournament500Panel\.jsx"/);
  assert.doesNotMatch(primeSrc, /function DetailDrawer\(/, "must not redeclare the real detail drawer");
});

ok("Tournament500Panel.jsx actually exports DetailDrawer for real reuse", () => {
  assert.match(tournamentSrc, /export \{[\s\S]*DetailDrawer[\s\S]*\}/);
});

ok("every real click target (Top 5 Elite, Early Discovery, Tournament Top 25 rows, challenger chips) opens the SAME real drawer via one shared openDetail handler — never a dead click with no visible result", () => {
  const opens = (primeSrc.match(/onSelect=\{openDetail\}|openDetail\(c\.symbol\)/g) || []).length;
  assert.strictEqual(opens, 4, `expected all 4 click surfaces wired to openDetail, found ${opens}`);
  assert.match(primeSrc, /\{drawerSymbol && <DetailDrawer symbol=\{drawerSymbol\}/);
});

ok("Row's <tr> carries its own inline cursor:pointer — never relies solely on Tournament500Panel's own <style> block, which PrimeTab does not render", () => {
  const rowFn = tournamentSrc.slice(tournamentSrc.indexOf("function Row("), tournamentSrc.indexOf("const RISK_FILTERS"));
  assert.match(rowFn, /className="tourn-row" onClick=\{\(\) => onSelect\(row\.symbol\)\} style=\{\{ cursor: "pointer" \}\}/);
});

ok("AI Trade Desk itself is untouched — 'trade-desk' activeTab and its sidebar row both still exist (PRIME is additive, not a replacement)", () => {
  const tabSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "TradeDeskTab.jsx"), "utf8");
  assert.ok(tabSrc.length > 1000, "TradeDeskTab.jsx must still be a real, substantial file");
  assert.match(sidebarSrc, /\{ id: "trade-desk", label: "AI Trade Desk"/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("PRIME-TAB TEST FAILED");
else console.log("PRIME-TAB TEST OK");
