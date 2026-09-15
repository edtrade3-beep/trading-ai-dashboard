"use strict";
// Real structural test for PortfolioRiskCard.jsx's event-date-concentration
// section (2026-09-14, "wire concentration into the UI" — the button-gated
// panel surfacing src/portfolio-event-concentration.js's real clusters
// alongside the existing Correlation/Risk-Lab sections it was modeled on).
// .jsx source-inspection convention (fs.readFileSync + regex), same as the
// rest of this repo's component tests — no JSX runtime needed.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const src = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "PortfolioRiskCard.jsx"), "utf8");

console.log("Checking PortfolioRiskCard.jsx's event-date-concentration section…");

ok("fetches the real /api/ai-hub/portfolio-event-concentration route, button-gated like Correlation/Risk-Lab (no auto-poll)", () => {
  assert.match(src, /fetch\("\/api\/ai-hub\/portfolio-event-concentration"\)/);
  assert.match(src, /const runConcentrationCheck = \(\) => \{/);
});

ok("a HIGH cluster is visibly labeled as a real enforced block, not just another advisory metric", () => {
  assert.match(src, /c\.newEntriesBlocked && " — NEW ENTRIES BLOCKED"/);
});

ok("renders the real recommendedAction and eventDates fields the engine computes — no fabricated copy", () => {
  assert.match(src, /c\.recommendedAction/);
  assert.match(src, /c\.eventDates\.map/);
});

ok("an empty-clusters result reads as real reassurance, not a loading/error state", () => {
  assert.match(src, /No overlapping event risk/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("PORTFOLIO-RISK-CARD-CONCENTRATION TEST FAILED");
else console.log("PORTFOLIO-RISK-CARD-CONCENTRATION TEST OK");
