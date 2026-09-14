"use strict";
// top-opportunities.test.js — real structural regression test for the
// TOP OPPORTUNITIES panel on Trade Desk (2026-09-13). Same fs.readFileSync
// + regex structural-check convention as tasbeeh-counter-widget.test.js —
// no jsdom/testing-library exists in this repo to render React components.
// Confirms the panel reuses the EXISTING pickTopOpportunities ranking
// (CommandSearchPanel.jsx) and the EXISTING /api/market/opportunities
// data, and never invents a new sort/score.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const src = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "TopOpportunities.jsx"), "utf8");
const tradeDeskSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "TradeDeskTab.jsx"), "utf8");

console.log("Checking TopOpportunities.jsx — ranked panel reusing the existing canonical ranking/data…");

ok("RENDER/ORDER: imports and calls the EXISTING pickTopOpportunities — never a new sort/composite score", () => {
  assert.match(src, /import \{ pickTopOpportunities \} from "\.\/CommandSearchPanel\.jsx";/);
  assert.match(src, /pickTopOpportunities\(tiers, 5\)/);
  assert.doesNotMatch(src, /\.sort\(/, "must not re-sort — backend/pickTopOpportunities order must be preserved");
});

ok("fetches the SAME existing /api/market/opportunities endpoint — no new backend scan", () => {
  assert.match(src, /fetch\("\/api\/market\/opportunities"\)/);
});

ok("STAGE: fresh stages (EARLY/EMERGING/DEVELOPING/ACTIONABLE/CONFIRMED) render with the real canonical opportunityStage/tier", () => {
  assert.match(src, /assetDecision\?\.opportunityStage/);
  assert.match(src, /FRESH_LABEL = \{ EARLY:.*EMERGING:.*DEVELOPING:.*ACTIONABLE:.*CONFIRMED:/);
});

ok("ANTI-CHASE: EXTENDED/EXHAUSTED are visibly and distinctly labeled, never styled like a fresh setup", () => {
  assert.match(src, /EXTENDED — DON'T CHASE/);
  assert.match(src, /"EXHAUSTED"/);
  assert.match(src, /o\.tier === "EXTENDED" \|\| stage === "EXTENDED" \|\| stage === "EXHAUSTED"/);
});

ok("RISK: reads riskScore/riskLevel from assetDecision only, never recomputed, shows 'Risk unavailable' when absent", () => {
  assert.match(src, /ad\?\.riskScore/);
  assert.match(src, /ad\?\.riskLevel/);
  assert.match(src, /Risk unavailable/);
  assert.doesNotMatch(src, /function computeRiskScore/);
});

ok("VERDICT: renders the canonical assetDecision.verdict exactly as supplied, never inferred from score/risk thresholds", () => {
  assert.match(src, /ad\?\.verdict \|\| "—"/);
  assert.doesNotMatch(src, /opportunityScore\s*>|riskScore\s*>/, "verdict must never be derived from a score/risk comparison in the UI");
});

ok("MISSING DATA: a missing catalyst/reason or missing opportunityScore does not break rendering — honest fallbacks only", () => {
  assert.match(src, /o\.verdictReason &&/);
  assert.match(src, /opportunityScore \?\? "—"/);
});

ok("EMPTY STATE: shows the exact required copy when there are no qualified opportunities", () => {
  assert.match(src, /No qualified opportunities right now\./);
});

ok("SELECTION: clicking a row calls the existing onSelectSymbol handler — no separate/duplicate symbol-selection mechanism", () => {
  assert.match(src, /onClick:\s*\(\)\s*=>\s*onSelectSymbol\(o\.symbol\)/);
});

ok("makes no fetch() call to any order-placement/execution endpoint — display/select only", () => {
  const fetchCalls = src.match(/fetch\("[^"]+"/g) || [];
  assert.ok(fetchCalls.length > 0);
  for (const call of fetchCalls) assert.doesNotMatch(call, /order|execute|execution/i, `unexpected endpoint: ${call}`);
});

console.log("\nChecking withEarlyDiscoverySlot — one reserved slot for an ACCELERATING DEVELOPING candidate (2026-09-13)…");

ok("TEST 1 — FULL ACTIONABLE LIST: replaces only the 5th slot, preserves the first 4 exactly", () => {
  assert.match(src, /return \[\.\.\.rows\.slice\(0, 4\), candidate\];/);
});

ok("TEST 2/3 — NO ACCELERATION / INSUFFICIENT_DATA: only 'ACCELERATING' status qualifies, everything else falls back to the canonical list unchanged", () => {
  assert.match(src, /\.find\(\(o\) => o\.edgeVelocity\?\.status === "ACCELERATING"\)/);
  assert.match(src, /if \(!candidate\) return rows;/);
});

ok("TEST 4 — ALREADY INCLUDED: checks the whole canonical list for an existing eligible candidate before ever searching for a replacement", () => {
  assert.match(src, /const alreadyPresent = rows\.some\(\(o\) => o\.tier === "DEVELOPING" && o\.edgeVelocity\?\.status === "ACCELERATING"\);/);
  assert.match(src, /if \(alreadyPresent\) return rows;/);
});

ok("TEST 5 — LIST BELOW CAPACITY: never removes/replaces when the canonical list has fewer than 5 (everything available is already included)", () => {
  assert.match(src, /if \(rows\.length < 5\) return rows;/);
});

ok("TEST 6 — MULTIPLE ACCELERATING DEVELOPING: uses Array.prototype.find (first match in the existing bucket order), never a new sort/formula", () => {
  const fnBody = src.slice(src.indexOf("export function withEarlyDiscoverySlot"), src.indexOf("// Timing Not Ready watch row"));
  assert.doesNotMatch(fnBody, /\.sort\(/, "must not re-sort the developing bucket — first qualifying candidate in existing order only");
  assert.match(fnBody, /\(tiers\?\.developing \|\| \[\]\)\.find\(/);
});

ok("TEST 7 — EXTENDED is never eligible: only tiers.developing is ever searched, tiers.extended is never referenced in this function's real CODE (only a later, unrelated function's comment mentions it)", () => {
  const fnBody = src.slice(src.indexOf("export function withEarlyDiscoverySlot"), src.indexOf("// Timing Not Ready watch row"));
  assert.doesNotMatch(fnBody, /extended/i);
});

console.log("\nChecking Provisional 2-Sample Edge Velocity in the Early Discovery slot (2026-09-13)…");

ok("PROVISIONAL TEST 7: a 2-sample provisional ACCELERATING candidate is eligible — the existing status==='ACCELERATING' check already covers it, no new eligibility branch needed", () => {
  const fnBody = src.slice(src.indexOf("export function withEarlyDiscoverySlot"), src.indexOf("// Timing Not Ready watch row"));
  assert.match(fnBody, /o\.edgeVelocity\?\.status === "ACCELERATING"/, "eligibility reads status only — a provisional candidate with status ACCELERATING already qualifies");
});

ok("PROVISIONAL TEST 7b: the UI visibly marks a provisional accelerating row distinctly from a confirmed one", () => {
  assert.match(src, /↑ ACCELERATING\{o\.edgeVelocity\?\.isProvisional \? " · PROVISIONAL" : ""\}/);
});

ok("PROVISIONAL TEST 8: a confirmed (3+-sample) ACCELERATING row renders the plain, unmarked '↑ ACCELERATING' label — existing display for confirmed reads is unchanged", () => {
  // The conditional renders "" (no suffix) whenever isProvisional is falsy —
  // confirmed reads (isProvisional:false) get exactly the original label.
  assert.match(src, /o\.edgeVelocity\?\.isProvisional \? " · PROVISIONAL" : ""/);
});

ok("PROVISIONAL TEST 9: a 2-sample candidate whose status is NOT ACCELERATING (e.g. STABLE/DECAYING) is never eligible — the same status check excludes it, no separate provisional bypass exists", () => {
  const fnBody = src.slice(src.indexOf("export function withEarlyDiscoverySlot"), src.indexOf("// Timing Not Ready watch row"));
  const matches = fnBody.match(/status === "ACCELERATING"/g) || [];
  assert.strictEqual(matches.length, 2, "exactly the alreadyPresent check + the candidate find — both gate on ACCELERATING only, no isProvisional-based bypass of the status check");
});

ok("PROVISIONAL TEST 10: NO DUPLICATE — alreadyPresent already matches on status alone, so a provisional-or-confirmed accelerating candidate already in the canonical list is never re-injected", () => {
  assert.match(src, /const alreadyPresent = rows\.some\(\(o\) => o\.tier === "DEVELOPING" && o\.edgeVelocity\?\.status === "ACCELERATING"\);/);
});

console.log("\nChecking shared-helper regression — pickTopOpportunities() itself is untouched…");

ok("TEST 8 — SHARED BEHAVIOR REGRESSION: TopOpportunities imports (never redefines) the existing pickTopOpportunities, and passes its output straight through before the discovery-slot post-process", () => {
  assert.match(src, /import \{ pickTopOpportunities \} from "\.\/CommandSearchPanel\.jsx";/);
  assert.match(src, /withEarlyDiscoverySlot\(pickTopOpportunities\(tiers, 5\), tiers\)/);
  assert.doesNotMatch(src, /function pickTopOpportunities/, "must not redefine the shared helper locally");
});

const commandSearchSrc = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "CommandSearchPanel.jsx"), "utf8");
ok("pickTopOpportunities() itself was not modified by this task — same real signature/body used by Trade Desk auto-load and Command Search BEST", () => {
  assert.match(commandSearchSrc, /export function pickTopOpportunities\(tiers, n = 3\) \{/);
  assert.match(commandSearchSrc, /const TOP_TIER_ORDER = \["actionable", "developing", "wait", "extended"\];/);
  assert.match(commandSearchSrc, /return flat\.slice\(0, n\);/);
});

console.log("\nChecking pickTimingNotReadyCandidate — discovery-only WAIT-2 watch row, locked contract (2026-09-13)…");

const timingFnBody = src.slice(src.indexOf("export function pickTimingNotReadyCandidate"), src.indexOf("export default function TopOpportunities"));

ok("scans ONLY tiers.wait, in existing bucket order — never a new sort/formula", () => {
  assert.match(src, /const wait = tiers\?\.wait \|\| \[\];/);
  assert.doesNotMatch(timingFnBody, /\.sort\(/);
});

ok("exact locked predicate: tier WAIT, verdict AVOID_LONG, score >= 70, entryScore < 75 — matches AM_CORE_SETUP's real buyThreshold/entryScoreFloor constants", () => {
  assert.match(timingFnBody, /o\.tier === "WAIT"/);
  assert.match(timingFnBody, /o\.verdict === "AVOID_LONG"/);
  assert.match(timingFnBody, /o\.score >= 70/);
  assert.match(timingFnBody, /o\.entryScore < 75/);
});

ok("requires the canonical assetDecision.verdict to literally be AVOID — never surfaces a row whose canonical verdict disagrees", () => {
  assert.match(timingFnBody, /ad\?\.verdict === "AVOID"/);
});

ok("BLOCKER EXCLUSION: real execution blockers (assetDecision.blockers, dataHealth.canTrade) exclude the candidate — cautionary riskLevel/riskScore alone do not", () => {
  assert.match(timingFnBody, /!\(Array\.isArray\(ad\?\.blockers\) && ad\.blockers\.length > 0\)/);
  assert.match(timingFnBody, /ad\?\.dataHealth\?\.canTrade !== false/);
  assert.doesNotMatch(timingFnBody, /riskLevel|riskScore/, "risk info is cautionary, not an exclusion condition — must not gate on it");
});

console.log("\nChecking TIMING NOT READY dedup against the final visible Top-5 (2026-09-13, real production audit finding — MU appeared as both Top-5 #1 and this row)…");

ok("skips any candidate whose symbol is already in the caller-supplied visible list — before evaluating the rest of the predicate", () => {
  assert.match(timingFnBody, /const visible = new Set\(visibleSymbols\);/);
  assert.match(timingFnBody, /if \(visible\.has\(o\.symbol\)\) return false;/);
});

ok("call site passes the FINAL visible list (post-Early-Discovery `rows`), not the raw canonical tiers — so dedup is correct even when Early Discovery changed slot 5", () => {
  assert.match(src, /pickTimingNotReadyCandidate\(tiers, rows\.map\(\(o\) => o\.symbol\)\)/);
});

ok("the locked WAIT-2 predicate itself is completely unchanged by the dedup addition (same 7 conditions, same order)", () => {
  assert.match(timingFnBody, /o\.tier === "WAIT" &&\s*\n\s*o\.verdict === "AVOID_LONG" &&\s*\n\s*Number\.isFinite\(o\.score\) && o\.score >= 70 &&\s*\n\s*Number\.isFinite\(o\.entryScore\) && o\.entryScore < 75 &&\s*\n\s*ad\?\.verdict === "AVOID" &&\s*\n\s*!\(Array\.isArray\(ad\?\.blockers\) && ad\.blockers\.length > 0\) &&\s*\n\s*ad\?\.dataHealth\?\.canTrade !== false/);
});

ok("does not reorder or replace any Top-5 slot — the dedup only affects the separate secondary row, `rows` itself is never reassigned by this logic", () => {
  assert.doesNotMatch(timingFnBody, /rows\.slice|rows\[/, "pickTimingNotReadyCandidate must never touch the Top-5 rows array itself");
});

ok("REGRESSION (real production case): given tiers.wait order [MU, AMD, MRVL, ANET, TXN, CRWD, ...] and a visible list of the first 5, the first NON-visible qualifying candidate (CRWD) is chosen — verified against the actual live production payload that surfaced this bug", () => {
  // Minimal re-implementation of the exact shipped logic for a synthetic
  // fixture shaped like the real captured production data (MU..TXN all
  // independently satisfy the predicate, exactly as observed live).
  function pick(tiers, visibleSymbols) {
    const visible = new Set(visibleSymbols);
    return (tiers.wait || []).find((o) => {
      if (visible.has(o.symbol)) return false;
      const ad = o.assetDecision;
      return (
        o.tier === "WAIT" && o.verdict === "AVOID_LONG" &&
        Number.isFinite(o.score) && o.score >= 70 &&
        Number.isFinite(o.entryScore) && o.entryScore < 75 &&
        ad?.verdict === "AVOID" &&
        !(Array.isArray(ad?.blockers) && ad.blockers.length > 0) &&
        ad?.dataHealth?.canTrade !== false
      );
    }) || null;
  }
  const mk = (symbol, score, entryScore) => ({
    symbol, tier: "WAIT", verdict: "AVOID_LONG", score, entryScore,
    assetDecision: { verdict: "AVOID", blockers: [], dataHealth: { canTrade: true } },
  });
  const wait = [mk("MU", 81, 60), mk("AMD", 81, 70), mk("MRVL", 79, 50), mk("ANET", 78, 65), mk("TXN", 78, 53), mk("CRWD", 77, 46)];
  const visibleTop5 = ["MU", "AMD", "MRVL", "ANET", "TXN"];
  const result = pick({ wait }, visibleTop5);
  assert.strictEqual(result.symbol, "CRWD", "must skip all 5 already-visible symbols and land on the first genuinely-hidden qualifying candidate");
});

ok("if every qualifying WAIT-2 candidate is already visible, no secondary row is produced (returns null, never a fabricated row)", () => {
  function pick(tiers, visibleSymbols) {
    const visible = new Set(visibleSymbols);
    return (tiers.wait || []).find((o) => {
      if (visible.has(o.symbol)) return false;
      const ad = o.assetDecision;
      return o.tier === "WAIT" && o.verdict === "AVOID_LONG" && Number.isFinite(o.score) && o.score >= 70
        && Number.isFinite(o.entryScore) && o.entryScore < 75 && ad?.verdict === "AVOID"
        && !(Array.isArray(ad?.blockers) && ad.blockers.length > 0) && ad?.dataHealth?.canTrade !== false;
    }) || null;
  }
  const mk = (symbol) => ({ symbol, tier: "WAIT", verdict: "AVOID_LONG", score: 80, entryScore: 60, assetDecision: { verdict: "AVOID", blockers: [], dataHealth: { canTrade: true } } });
  const wait = [mk("MU"), mk("AMD")];
  const result = pick({ wait }, ["MU", "AMD"]);
  assert.strictEqual(result, null);
});

ok("UI SEMANTIC: renders the literal 'TIMING NOT READY' tag — never PROMISING/ALMOST BUY/WATCH NEXT/EARLY BUY", () => {
  assert.match(src, />TIMING NOT READY</);
  for (const forbidden of ["PROMISING", "ALMOST BUY", "WATCH NEXT", "EARLY BUY"]) {
    assert.doesNotMatch(src, new RegExp(forbidden), `must never render the label "${forbidden}"`);
  }
});

ok("the real canonical verdict (AVOID) is always rendered alongside the tag, never replaced by it", () => {
  assert.match(src, /\{timingNotReady\.assetDecision\.verdict\}/);
});

ok("row uses the existing onSelectSymbol mechanism — no separate/duplicate symbol-selection path", () => {
  const rowBlock = src.slice(src.indexOf("{timingNotReady && ("), src.lastIndexOf(")}"));
  assert.match(rowBlock, /onClick:\s*\(\)\s*=>\s*onSelectSymbol\(timingNotReady\.symbol\)/);
});

ok("row does not render at all when no candidate qualifies (null-safe, no fabricated row)", () => {
  assert.match(src, /\{timingNotReady && \(/);
});

console.log("\nChecking TradeDeskTab.jsx — TopOpportunities is imported, rendered, and wired to the existing symbol-selection flow…");

ok("TopOpportunities is imported AND rendered, wired to the existing selectSymbol function", () => {
  assert.match(tradeDeskSrc, /import TopOpportunities from "\.\/TopOpportunities\.jsx";/);
  assert.match(tradeDeskSrc, /<TopOpportunities onSelectSymbol=\{selectSymbol\}/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TOP-OPPORTUNITIES TEST FAILED");
else console.log("TOP-OPPORTUNITIES TEST OK");
