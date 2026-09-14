"use strict";
// cortex-verdict-authority.test.js — real regression tripwire (2026-09-14
// platform-simplification audit, Phase 5/13 finding). cortex-decision.js's
// computeCortexVerdict() computes an independent verdict (AVOID/
// OVEREXTENDED/BUY ZONE/WATCH/WAIT — a different vocabulary than canonical
// FINAL_VERDICTS) from raw sniper/heat/aplusScore inputs, NOT from
// assetDecision.verdict. Tracing every reference confirmed it currently
// has ZERO real call sites anywhere in the codebase (aplus-score-
// history.js/telegram-bot.js explicitly disclose "deliberately never
// called here"; SmartScanTab.jsx migrated away from it; routes/agent.js
// has its own separate, also-unreachable fallback formula) - dead code,
// same "leave the file, drop the front door" retirement pattern this repo
// already uses elsewhere (e.g. execution-authority.js's TRADIER_AUTOEXEC).
//
// This is a real tripwire, not a correctness test for the function itself
// (that's test/cortex-engine.test.js's job, unchanged) — if a future
// caller reintroduces a real call to computeCortexVerdict(), or to
// routes/agent.js's own separate fallback-formula branch, this test fails
// and forces a conscious decision (migrate the caller to canonical
// assetDecision.verdict, same fix already proven twice in this exact
// codebase) rather than silently reintroducing a second live verdict
// authority. Source-inspection convention, same as
// test/options-authority-gate.test.js's own caller audit.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

function readAll(dir, ext) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith(ext)) out.push({ file: path.join(dir, f), src: fs.readFileSync(path.join(dir, f), "utf8") });
  }
  return out;
}

const srcFiles = readAll(path.join(__dirname, "..", "src"), ".js");
const componentFiles = readAll(path.join(__dirname, "..", "axiom-runner", "components"), ".jsx");

// Files allowed to CONTAIN the string "computeCortexVerdict(" — its own
// definition/export site and its own real unit test (which legitimately
// calls it directly to test its own math, not as a live decision path).
const DEFINITION_FILES = new Set(["cortex-decision.js"]);

console.log("Checking computeCortexVerdict() — real tripwire: zero live production call sites…");

ok("no file under src/ (other than cortex-decision.js's own definition) contains a real call to computeCortexVerdict(", () => {
  const offenders = srcFiles.filter(({ file, src }) => {
    const base = path.basename(file);
    if (DEFINITION_FILES.has(base)) return false;
    // A real call looks like `computeCortexVerdict(` immediately followed
    // by real invocation syntax — comments referencing the name (this
    // repo's own established disclosure convention) don't match a bare
    // `require(...).computeCortexVerdict(` or destructured-then-called
    // pattern used as an actual call.
    const callPattern = /computeCortexVerdict\s*\(\s*\{/;
    // Exclude lines that are clearly comments (start with // after trim,
    // per line) to avoid false positives from the disclosure comments
    // this repo already writes (e.g. "computeCortexVerdict is deliberately
    // never called here").
    const codeLines = src.split("\n").filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"));
    return callPattern.test(codeLines.join("\n"));
  });
  assert.deepStrictEqual(offenders.map((o) => path.basename(o.file)), [], "a new real call site to computeCortexVerdict() was found — trace it: does it need to read canonical assetDecision.verdict instead?");
});

ok("no .jsx component (other than the client-side twin's own definition) contains a real call to computeCortexVerdict(", () => {
  const offenders = componentFiles.filter(({ file, src }) => {
    const base = path.basename(file);
    if (base === "cortex-engine.js") return false; // not a .jsx anyway, defensive
    const callPattern = /computeCortexVerdict\s*\(\s*\{/;
    const codeLines = src.split("\n").filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"));
    return callPattern.test(codeLines.join("\n"));
  });
  assert.deepStrictEqual(offenders.map((o) => path.basename(o.file)), []);
});

ok("routes/agent.js's own separate fallback-scoring branch stays gated behind hasCortex — the one real caller (SmartScanTab.jsx) always supplies canonical-derived cortexVerdict, so the unreachable branch can't silently activate without a code change to this exact guard", () => {
  const agentSrc = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "agent.js"), "utf8");
  assert.match(agentSrc, /const hasCortex = typeof cortexVerdict === "string" && cortexVerdict\.length > 0;/);
  assert.match(agentSrc, /const bias = hasCortex \? \(CORTEX_TO_BIAS\[cortexVerdict\] \|\| "NEUTRAL"\)/);
});

ok("SmartScanTab.jsx's own cortexV — the value that ends up everywhere labeled \"Cortex Verdict\" — is still derived from the real canonical assetDecision.verdict, not re-computed independently", () => {
  const smartScanSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "SmartScanTab.jsx"), "utf8");
  assert.match(smartScanSrc, /const canonicalVerdict = trendRow\?\.assetDecision\?\.verdict \|\| null;/);
  assert.match(smartScanSrc, /const cortexV = canonicalVerdict \? \{/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("CORTEX-VERDICT-AUTHORITY TEST FAILED"); else console.log("CORTEX-VERDICT-AUTHORITY TEST OK");
