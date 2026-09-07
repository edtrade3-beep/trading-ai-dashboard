"use strict";
const assert = require("node:assert");
const { classifyNarrative, NARRATIVE_META } = require("../src/narrative-engine");
const { recordNarrative, getCurrentNarrative, loadStore, saveStore } = require("../src/narrative-store");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

console.log("Checking classifyNarrative — real, disclosed macro-story classification…");

ok("elevated inflation + rising unemployment -> STAGFLATION_RISK, regardless of base regime", () => {
  const r = classifyNarrative({ macroRegime: "SELECTIVE_RISK_ON", factors: { corePceYoy: 3.8, unemploymentTrend: "rising" } });
  assert.strictEqual(r.narrative, "STAGFLATION_RISK");
  assert.ok(r.evidence.length > 0);
});

ok("credit deterioration only fires alongside independent regime corroboration (never credit alone)", () => {
  const withRegime = classifyNarrative({ macroRegime: "FINANCIAL_STRESS", factors: {}, creditStressed: true });
  assert.strictEqual(withRegime.narrative, "CREDIT_STRESS");
  const withoutCorroboration = classifyNarrative({ macroRegime: "SELECTIVE_RISK_ON", factors: {}, creditStressed: true });
  assert.notStrictEqual(withoutCorroboration.narrative, "CREDIT_STRESS");
});

ok("FINANCIAL_STRESS / RECESSION_RISK regimes -> HARD_LANDING", () => {
  assert.strictEqual(classifyNarrative({ macroRegime: "FINANCIAL_STRESS", factors: {} }).narrative, "HARD_LANDING");
  assert.strictEqual(classifyNarrative({ macroRegime: "RECESSION_RISK", factors: {} }).narrative, "HARD_LANDING");
});

ok("RISK_OFF regime -> RISK_OFF_DELEVERAGING", () => {
  assert.strictEqual(classifyNarrative({ macroRegime: "RISK_OFF", factors: {} }).narrative, "RISK_OFF_DELEVERAGING");
});

ok("LATE_CYCLE regime -> LATE_CYCLE_CAUTION", () => {
  assert.strictEqual(classifyNarrative({ macroRegime: "LATE_CYCLE", factors: {} }).narrative, "LATE_CYCLE_CAUTION");
});

ok("risk-on regime + elevated inflation -> REACCELERATION, never auto-bullish SOFT_LANDING", () => {
  const r = classifyNarrative({ macroRegime: "RISK_ON", factors: { corePceYoy: 3.5, fedFundsTrend: "flat" } });
  assert.strictEqual(r.narrative, "REACCELERATION");
});

ok("RECOVERY regime -> SOFT_LANDING", () => {
  assert.strictEqual(classifyNarrative({ macroRegime: "RECOVERY", factors: { fedFundsTrend: "falling", corePceYoy: 2.1 } }).narrative, "SOFT_LANDING");
});

ok("risk-on regime + falling inflation + non-rising fed funds -> SOFT_LANDING", () => {
  const r = classifyNarrative({ macroRegime: "SELECTIVE_RISK_ON", factors: { fedFundsTrend: "flat", corePceYoy: 2.3 } });
  assert.strictEqual(r.narrative, "SOFT_LANDING");
});

ok("RISK_ON regime with unknown inflation direction -> RISK_ON_EXPANSION (never fabricates a soft-landing claim)", () => {
  const r = classifyNarrative({ macroRegime: "RISK_ON", factors: {} });
  assert.strictEqual(r.narrative, "RISK_ON_EXPANSION");
});

ok("DISTRIBUTION (unmapped regime) -> honest MIXED_SIGNALS fallback, never crashes", () => {
  const r = classifyNarrative({ macroRegime: "DISTRIBUTION", factors: {} });
  assert.strictEqual(r.narrative, "MIXED_SIGNALS");
});

ok("missing macroRegime/factors entirely still returns a real, non-throwing classification", () => {
  const r = classifyNarrative({});
  assert.ok(typeof r.narrative === "string");
});

ok("NARRATIVE_META covers every real narrative classifyNarrative can return", () => {
  const possible = ["STAGFLATION_RISK", "CREDIT_STRESS", "HARD_LANDING", "RISK_OFF_DELEVERAGING", "LATE_CYCLE_CAUTION", "REACCELERATION", "SOFT_LANDING", "RISK_ON_EXPANSION", "MIXED_SIGNALS"];
  for (const p of possible) assert.ok(NARRATIVE_META[p]?.label, `missing NARRATIVE_META entry for ${p}`);
});

console.log("\nChecking narrative-store.js — real shift detection + persistence…");

// Real read/write against the module's own real store (data/narrative-
// history.json), same snapshot-reset-restore discipline as
// test/opportunity-timeline-store.test.js — never a mock, but the real
// original content is always restored, even if an assertion throws.
const originalNarrativeStore = loadStore();
saveStore({ current: null, since: null, evidence: [], history: [] });

try {
  ok("the first-ever classification is never reported as a shift", () => {
    const r = recordNarrative({ narrative: "SOFT_LANDING", evidence: ["x"] });
    assert.strictEqual(r.shifted, false);
    assert.strictEqual(r.narrative, "SOFT_LANDING");
  });

  ok("recording the SAME narrative again never reports a shift", () => {
    const r = recordNarrative({ narrative: "SOFT_LANDING", evidence: ["y"] });
    assert.strictEqual(r.shifted, false);
  });

  ok("a real change in the dominant label reports shifted:true with the real previous label", () => {
    const r = recordNarrative({ narrative: "REACCELERATION", evidence: ["y"] });
    assert.strictEqual(r.shifted, true);
    assert.strictEqual(r.previous, "SOFT_LANDING");
    assert.strictEqual(r.narrative, "REACCELERATION");
  });

  ok("a real shift is recorded into history with its own real since/until window", () => {
    const stored = loadStore();
    assert.strictEqual(stored.history.length, 1);
    assert.strictEqual(stored.history[0].narrative, "SOFT_LANDING");
    assert.ok(Number.isFinite(stored.history[0].since) && Number.isFinite(stored.history[0].until));
  });

  ok("getCurrentNarrative reflects the real latest recorded state without recomputing", () => {
    const current = getCurrentNarrative();
    assert.strictEqual(current.narrative, "REACCELERATION");
    assert.deepStrictEqual(current.evidence, ["y"]);
  });
} finally {
  saveStore(originalNarrativeStore);
}

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("NARRATIVE-ENGINE TEST FAILED");
else console.log("NARRATIVE-ENGINE TEST OK");
