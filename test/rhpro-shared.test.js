// Real tests for axiom-runner/components/rhpro-shared.jsx's
// stockQualityBreakdown — previously ZERO test coverage (confirmed before
// writing this). Covers the 2026-08-26 "Trade Desk Tier 3a" fix: Stage 4
// already zeroed its own stagePts sub-component, but the other 7
// dimensions could still add up to a moderately high overall score, and
// real anti-chase extension wasn't checked at all.
//
// This file has a real .jsx extension Node's ESM loader can't `import()`
// directly (unlike the plain .js ES-module twins test/cortex-engine.test.js
// and test/mobile-home-derived.test.js already import that way) — no JSX
// syntax is actually used by the function under test, only the file's own
// naming convention. Transpiled once via esbuild (already a real project
// dependency, the same tool build-client.js uses) into a sibling .mjs file
// so its real relative imports (./market-helpers.js, ./anti-chase.js)
// still resolve, then imported and cleaned up.
// Run: node test/rhpro-shared.test.js (or npm test).
"use strict";
const assert = require("node:assert");
const esbuild = require("esbuild");
const path = require("node:path");
const fs = require("node:fs");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

(async () => {
  const srcPath = path.join(__dirname, "../axiom-runner/components/rhpro-shared.jsx");
  const outPath = path.join(__dirname, "../axiom-runner/components/.rhpro-shared.test-transpiled.mjs");
  esbuild.buildSync({ entryPoints: [srcPath], outfile: outPath, format: "esm", bundle: false, loader: { ".jsx": "jsx" } });

  try {
    const { stockQualityBreakdown } = await import(`${outPath}?t=${Date.now()}`);

    const STRONG_ROW = { symbol: "TEST", passCount: 8, rsRating: 95, momentum: 0.3, stage: "Stage 2 — Confirmed", volRatio: 1.8, epsGrowth: 15, dollarVolume: 2e9, abovePivotPct: 1 };

    console.log("Checking stockQualityBreakdown — real inputs, honest degrade when absent…");
    ok("a genuinely strong, non-gated setup scores high (>=70)", () => {
      const r = stockQualityBreakdown(STRONG_ROW, null);
      assert.ok(r.score >= 70, `expected >=70, got ${r.score}`);
      assert.strictEqual(r.cautions.length, 0);
    });

    console.log("Checking stockQualityBreakdown — real Stage-4/anti-chase hard gate (regression, 2026-08-26)…");
    ok("Stage 4 downtrend caps the score to a real low ceiling even with the other 7 dimensions strong", () => {
      const r = stockQualityBreakdown({ ...STRONG_ROW, stage: "Stage 4 — Declining" }, null);
      assert.ok(r.score <= 20, `expected a capped score <=20, got ${r.score}`);
      assert.ok(r.cautions.some((c) => /stage 4/i.test(c)));
    });
    ok("real anti-chase EXTENDED/DO_NOT_CHASE also caps the score", () => {
      const r1 = stockQualityBreakdown({ ...STRONG_ROW, abovePivotPct: 6 }, null);
      assert.ok(r1.score <= 20, `expected a capped score <=20, got ${r1.score}`);
      const r2 = stockQualityBreakdown({ ...STRONG_ROW, abovePivotPct: 12 }, null);
      assert.ok(r2.score <= 20, `expected a capped score <=20, got ${r2.score}`);
    });
    ok("a normal (not extended, not Stage 4) row is never gated", () => {
      const r = stockQualityBreakdown(STRONG_ROW, null);
      assert.strictEqual(r.cautions.length, 0);
    });
    ok("no real abovePivotPct available never fabricates an anti-chase gate", () => {
      const { abovePivotPct, ...rest } = STRONG_ROW;
      const r = stockQualityBreakdown(rest, null);
      assert.strictEqual(r.cautions.length, 0);
    });
  } finally {
    fs.rmSync(outPath, { force: true });
  }

  console.log(`\n${passed} checks passed.`);
  if (process.exitCode) console.error("RHPRO-SHARED TEST FAILED"); else console.log("RHPRO-SHARED TEST OK");
})();
