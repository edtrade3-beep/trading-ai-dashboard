"use strict";
// trading-copilot-agent-features.test.js — structural regression checks for
// the 2026-09-11 Master Agent additions: auto-greet with a real report on
// first open per session, Web Speech API microphone input, and the
// deterministic-only /api/market/ai-copilot route (no Claude call at all,
// per explicit user request: "From now on use anthropic api only for
// story ai, remove anthropic from anything else" — scoped to the Master
// Agent chat specifically). Same fs.readFileSync + regex convention as
// test/lightbox-assist-panel.test.js — this is presentational/routing
// wiring, not pure logic worth extracting just to unit-test.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

const src = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "TradingCopilot.jsx"), "utf8");
const marketSrc = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "market.js"), "utf8");

// The ai-copilot route body, precisely bounded — NOT the rest of the file,
// which has its own unrelated `const key = (process.env.ANTHROPIC_API_KEY
// || "").trim();` lines for other real AI routes (smart-money-brief,
// cortex-followup, etc.) that must stay completely untouched. A search
// unbounded at the end previously produced a false pass here by matching
// one of those later, unrelated routes instead of proving anything about
// THIS one.
const routeStart = marketSrc.indexOf('pathname === "/api/market/ai-copilot"');
const routeEnd = marketSrc.indexOf('pathname === "/api/market/cortex-followup"');
assert.ok(routeStart > -1 && routeEnd > routeStart, "the ai-copilot route must exist and precede cortex-followup");
const routeSrc = marketSrc.slice(routeStart, routeEnd);

console.log("Checking TradingCopilot.jsx — Master Agent auto-greet on first open per session…");

ok("auto-greet uses sessionStorage (once per real browser session), never localStorage (which would only ever fire once, forever)", () => {
  assert.match(src, /sessionStorage\.getItem\("axiom_copilot_greeted"\)/);
  assert.match(src, /sessionStorage\.setItem\("axiom_copilot_greeted", "1"\)/);
});
ok("the auto-greet opens the panel and queues the real personalized \"مرحبا عدول\" greeting through the existing queuedQuery/send() path, not a separate ad-hoc call", () => {
  assert.match(src, /setOpen\(true\);/);
  assert.match(src, /setQueuedQuery\("مرحبا عدول"\);/);
});
ok("the auto-greet effect only runs once on mount (empty dependency array), never re-fires on every re-render", () => {
  const effectBlock = src.slice(src.indexOf("axiom_copilot_greeted") - 400, src.indexOf("axiom_copilot_greeted") + 800);
  assert.match(effectBlock, /\}, \[\]\);/);
});

console.log("\nChecking TradingCopilot.jsx — microphone input (Web Speech API)…");

ok("microphone support is feature-detected (SpeechRecognition or webkitSpeechRecognition), never assumed present", () => {
  assert.match(src, /window\.SpeechRecognition \|\| window\.webkitSpeechRecognition/);
  assert.match(src, /const micSupported = !!SpeechRecognitionCtor/);
});
ok("the mic button is only rendered when micSupported is true — never a dead control on browsers without it (e.g. Firefox)", () => {
  assert.match(src, /\{micSupported && \(/);
});
ok("a final speech transcript is sent through the real send() function — never a separate voice-only command path", () => {
  assert.match(src, /if \(finalText\) send\(finalText\);/);
});
ok("recognition is stopped on unmount, never left running after the component is gone", () => {
  assert.match(src, /useEffect\(\(\) => \(\) => recognitionRef\.current\?\.stop\(\), \[\]\);/);
});

console.log("\nChecking /api/market/ai-copilot — every real trigger, and zero remaining Anthropic call (explicit user request: \"remove anthropic from anything else\" outside Story AI)…");

ok("the ai-copilot route makes NO Anthropic call at all — no anthropicRequest invocation, no ANTHROPIC_API_KEY declaration/gate anywhere in its body (a comment explaining the history is fine — only real code is checked)", () => {
  assert.doesNotMatch(routeSrc, /anthropicRequest\(/);
  assert.doesNotMatch(routeSrc, /const key = \(process\.env\.ANTHROPIC_API_KEY/);
  assert.doesNotMatch(routeSrc, /if \(!key\)/);
});
ok("every real deterministic trigger exists inside the route: greeting, Morning Mode, Deep Scan, Market Narrative, Weather, prayer time", () => {
  assert.match(routeSrc, /ARABIC_GREETING_TRIGGER = \/مرحبا\\s\*عدول\//);
  assert.match(routeSrc, /if \(MORNING_TRIGGER\.test\(lastUserMsg\)\)/);
  assert.match(routeSrc, /DEEP_SCAN_TRIGGER = \/\\b\(deep scan/);
  assert.match(routeSrc, /NARRATIVE_TRIGGER = \/كيف\\s\*داير\\s\*السوق\//);
  assert.match(routeSrc, /WEATHER_TRIGGER = \/كيف\\s\*داير\\s\*الجو\//);
  assert.match(routeSrc, /answerPrayerTimeQuery\(lastUserMsg\)/);
});
ok("every trigger calls its own real engine module — never a Claude call standing in for one", () => {
  assert.match(routeSrc, /require\("\.\.\/morning-mode-engine"\)/);
  assert.match(routeSrc, /require\("\.\.\/deep-scan-engine"\)/);
  assert.match(routeSrc, /require\("\.\.\/market-narrative-engine"\)/);
  assert.match(routeSrc, /require\("\.\.\/weather-engine"\)/);
  assert.match(routeSrc, /require\("\.\.\/prayer-query-engine"\)/);
});
ok("a message matching none of the real triggers gets an honest, real capability list — never a fabricated or silently-degraded AI answer", () => {
  assert.match(routeSrc, /I don't have a real answer for that/);
});
ok("the Arabic greeting check runs before (and short-circuits) the general Morning Mode trigger", () => {
  const greetingCheckIdx = routeSrc.indexOf("if (ARABIC_GREETING_TRIGGER.test(lastUserMsg))");
  const morningTriggerIdx = routeSrc.indexOf("if (MORNING_TRIGGER.test(lastUserMsg))");
  assert.ok(greetingCheckIdx > -1 && morningTriggerIdx > -1 && greetingCheckIdx < morningTriggerIdx, "the Arabic greeting check must run before the general Morning Mode trigger");
});
ok("the general Morning Mode trigger no longer references the Arabic phrase (dead condition removed — the greeting always returns early above it now)", () => {
  assert.doesNotMatch(routeSrc, /MORNING_TRIGGER\.test\(lastUserMsg\) \|\| ARABIC_GREETING_TRIGGER/);
});
ok("AI_COPILOT_TOOLS (the Claude tool-loop schema) is fully removed, not left as dead weight (a comment mentioning its removal by name is fine — only a real declaration is checked)", () => {
  assert.doesNotMatch(marketSrc, /const AI_COPILOT_TOOLS/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TRADING-COPILOT-AGENT-FEATURES TEST FAILED");
else console.log("TRADING-COPILOT-AGENT-FEATURES TEST OK");
