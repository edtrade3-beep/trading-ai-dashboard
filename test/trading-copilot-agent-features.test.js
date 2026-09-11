"use strict";
// trading-copilot-agent-features.test.js — structural regression checks for
// the 2026-09-11 Master Agent UX additions ("I want master agent first
// thing when i open the platform also use microphone"): auto-greet with
// Morning Mode on first load per session, and Web Speech API microphone
// input. Same fs.readFileSync + regex convention as
// test/lightbox-assist-panel.test.js — this is presentational wiring in a
// component, not pure logic worth extracting just to unit-test.
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

console.log("\nChecking the personalized \"مرحبا عدول\" reply — real on every channel (web + Telegram), never the full Morning Mode dump for this specific phrase…");

ok("ARABIC_GREETING_TRIGGER is defined and real", () => {
  assert.match(marketSrc, /ARABIC_GREETING_TRIGGER = \/مرحبا\\s\*عدول\//);
});

console.log("\nChecking the ANTHROPIC_API_KEY gate moved past every deterministic trigger (explicit user request: \"I dont want to use anthropic api. Just use data from my platform for master agent\")…");

ok("the ANTHROPIC_API_KEY check happens after the Arabic greeting, Morning Mode, Deep Scan, and Market Narrative triggers — not before them", () => {
  const routeStart = marketSrc.indexOf('pathname === "/api/market/ai-copilot"');
  assert.ok(routeStart > -1, "the ai-copilot route must exist");
  const routeSrc = marketSrc.slice(routeStart);
  const keyCheckIdx = routeSrc.indexOf('const key = (process.env.ANTHROPIC_API_KEY || "").trim();\n    if (!key) return writeJson(res, 200, { ok: false, error: "ANTHROPIC_API_KEY not set" });');
  const greetingIdx = routeSrc.indexOf("if (ARABIC_GREETING_TRIGGER.test(lastUserMsg))");
  const morningIdx = routeSrc.indexOf("if (MORNING_TRIGGER.test(lastUserMsg))");
  const deepScanIdx = routeSrc.indexOf("if (DEEP_SCAN_TRIGGER.test(lastUserMsg))");
  const narrativeIdx = routeSrc.indexOf("if (NARRATIVE_TRIGGER.test(lastUserMsg))");
  assert.ok([greetingIdx, morningIdx, deepScanIdx, narrativeIdx, keyCheckIdx].every((i) => i > -1), "all four triggers and the key check must exist within the route");
  assert.ok([greetingIdx, morningIdx, deepScanIdx, narrativeIdx].every((i) => i < keyCheckIdx), "the ANTHROPIC_API_KEY gate must come after every deterministic trigger, not before");
});
ok("the Market Narrative trigger for \"كيف داير السوق\" exists and calls the real market-narrative-engine, never a Claude call", () => {
  assert.match(marketSrc, /NARRATIVE_TRIGGER = \/كيف\\s\*داير\\s\*السوق\//);
  assert.match(marketSrc, /require\("\.\.\/market-narrative-engine"\)/);
});

ok("the route always replies with the short personalized greeting for the Arabic phrase, checked before (and short-circuiting) the general Morning Mode trigger", () => {
  assert.match(marketSrc, /if \(ARABIC_GREETING_TRIGGER\.test\(lastUserMsg\)\) \{/);
  assert.match(marketSrc, /reply: "مرحبا بيك باش نخدمك"/);
  const greetingCheckIdx = marketSrc.indexOf("if (ARABIC_GREETING_TRIGGER.test(lastUserMsg))");
  const morningTriggerIdx = marketSrc.indexOf("if (MORNING_TRIGGER.test(lastUserMsg))");
  assert.ok(greetingCheckIdx > -1 && morningTriggerIdx > -1 && greetingCheckIdx < morningTriggerIdx, "the Arabic greeting check must run before the general Morning Mode trigger");
});
ok("the general Morning Mode trigger no longer references the Arabic phrase (dead condition removed — the greeting always returns early above it now)", () => {
  assert.doesNotMatch(marketSrc, /MORNING_TRIGGER\.test\(lastUserMsg\) \|\| ARABIC_GREETING_TRIGGER/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TRADING-COPILOT-AGENT-FEATURES TEST FAILED");
else console.log("TRADING-COPILOT-AGENT-FEATURES TEST OK");
