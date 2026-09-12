"use strict";
// telegram-bare-word-commands.test.js — real regression test for a live
// bug (2026-09-12, user report: "Weather is giving me macro data" / typing
// "date" ran a real stock deep-dive on the nonexistent ticker "DATE").
// Root cause: every new command-table word (weather/date/prayer/tasbeeh/
// etc.) also looks like a syntactically valid bare ticker to
// telegram-bot.js's dispatch(), so it was being swallowed by the
// bare-ticker branch before ever reaching the real command. Same
// fs.readFileSync + regex structural-check convention as
// trading-copilot-agent-features.test.js — dispatch()/BARE_WORD_COMMAND_
// ALIASES aren't exported (this file has no other test coverage), and a
// real network-dependent Telegram round-trip isn't a reasonable unit test.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

const src = fs.readFileSync(path.join(__dirname, "..", "src", "telegram-bot.js"), "utf8");
const marketSrc = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "market.js"), "utf8");

console.log("Checking telegram-bot.js dispatch() — real command-table words never mistaken for a bare ticker…");

ok("BARE_WORD_COMMAND_ALIASES exists and covers every real 2026-09-12 command-table word that could collide with the bare-ticker regex", () => {
  const start = src.indexOf("const BARE_WORD_COMMAND_ALIASES = {");
  assert.ok(start > -1, "BARE_WORD_COMMAND_ALIASES must exist");
  const end = src.indexOf("};", start);
  const block = src.slice(start, end);
  for (const key of ["salam", "weather", "date", "prayer", "prayertimes", "tasbeeh", "market"]) {
    assert.ok(new RegExp(`\\b${key}:`).test(block), `missing reserved word: ${key}`);
  }
});

ok("the reserved-word check runs BEFORE the bare-ticker regex in dispatch() — a real bug fix, not just a declaration", () => {
  const dispatchStart = src.indexOf("async function dispatch(text)");
  assert.ok(dispatchStart > -1, "dispatch() must exist");
  const dispatchSrc = src.slice(dispatchStart, dispatchStart + 2000);
  const reservedCheckIdx = dispatchSrc.indexOf("BARE_WORD_COMMAND_ALIASES");
  const tickerRegexIdx = dispatchSrc.indexOf("/^[A-Z][A-Z0-9.\\-]{0,8}$/");
  assert.ok(reservedCheckIdx > -1 && tickerRegexIdx > -1 && reservedCheckIdx < tickerRegexIdx, "the reserved-word alias check must run before the bare-ticker regex, or 'date'/'weather'/etc. get swallowed as a fake ticker again");
});

ok("salam maps to null (routed through the real Master Agent chat, not a direct COMMANDS handler) — every other reserved word maps to a real COMMANDS key it actually dispatches", () => {
  const start = src.indexOf("const BARE_WORD_COMMAND_ALIASES = {");
  const end = src.indexOf("};", start);
  const block = src.slice(start, end);
  assert.match(block, /salam:\s*null/);
  for (const [word, cmdKey] of [["weather", "weather"], ["date", "date"], ["prayer", "prayer"], ["tasbeeh", "tasbeeh"], ["market", "market"]]) {
    assert.match(block, new RegExp(`${word}:\\s*"${cmdKey}"`), `${word} must map to the real /${cmdKey} command`);
  }
});

console.log("\nChecking /api/market/ai-copilot — the same real command-table words also answered on the web chat, not just Telegram…");

ok("the web route recognizes the plain English words weather/date/prayer/prayer times/market/morning duaa/evening duaa, not just the Arabic phrases", () => {
  const routeStart = marketSrc.indexOf('pathname === "/api/market/ai-copilot"');
  const routeEnd = marketSrc.indexOf('pathname === "/api/market/cortex-followup"');
  const routeSrc = marketSrc.slice(routeStart, routeEnd);
  assert.match(routeSrc, /trimmedLower === "weather"/);
  assert.match(routeSrc, /trimmedLower === "prayer"/);
  assert.match(routeSrc, /trimmedLower === "prayer times"/);
  assert.match(routeSrc, /trimmedLower === "date"/);
  assert.match(routeSrc, /trimmedLower === "morning duaa"/);
  assert.match(routeSrc, /trimmedLower === "evening duaa"/);
  assert.match(routeSrc, /trimmedLower === "market"/);
});

ok("the English-word triggers call the same real engines as their Telegram/Arabic counterparts — never a second, independent implementation", () => {
  const routeStart = marketSrc.indexOf('pathname === "/api/market/ai-copilot"');
  const routeEnd = marketSrc.indexOf('pathname === "/api/market/cortex-followup"');
  const routeSrc = marketSrc.slice(routeStart, routeEnd);
  assert.match(routeSrc, /require\("\.\.\/prayer-times"\)/);
  assert.match(routeSrc, /require\("\.\.\/azkar-content"\)/);
  assert.match(routeSrc, /formatNextPrayerMessage/);
  assert.match(routeSrc, /formatScheduleMessage/);
  assert.match(routeSrc, /formatDateMessage/);
  assert.match(routeSrc, /formatMorningAzkar/);
  assert.match(routeSrc, /formatEveningAzkar/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TELEGRAM-BARE-WORD-COMMANDS TEST FAILED");
else console.log("TELEGRAM-BARE-WORD-COMMANDS TEST OK");
