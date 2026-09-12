"use strict";
// telegram-tasbeeh-render.test.js — real structural regression test
// (2026-09-12, live user report on a screenshot: "Make it bigger").
// Telegram's Bot API has no font-size control at all (that's the
// receiving app's own text-size setting) — bold (HTML parse_mode) is the
// real, honest closest lever available. Same fs.readFileSync + regex
// structural-check convention as the other telegram-bot.js test files —
// renderTasbeehText/cmdTasbeeh/handleCallbackQuery aren't exported (no
// other test coverage exists for this file), and a real network-
// dependent Telegram round-trip isn't a reasonable unit test.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

const src = fs.readFileSync(path.join(__dirname, "..", "src", "telegram-bot.js"), "utf8");

console.log("Checking telegram-bot.js Tasbeeh rendering — real HTML bold, sent with the matching parse_mode…");

ok("renderTasbeehText wraps the dhikr and count lines in real HTML bold tags", () => {
  const start = src.indexOf("function renderTasbeehText(state)");
  const end = src.indexOf("\n}", start);
  const block = src.slice(start, end);
  assert.match(block, /<b>📿 \$\{dhikr\.ar\}/);
  assert.match(block, /<b>Count: \$\{state\.count\}/);
});

ok("cmdTasbeeh sends the bold-formatted message with parseMode: \"HTML\" — bold text with no parse_mode would render as literal <b> tags", () => {
  const start = src.indexOf("async function cmdTasbeeh()");
  const end = src.indexOf("\n}", start);
  const block = src.slice(start, end);
  assert.match(block, /parseMode:\s*"HTML"/);
});

ok("the counter's own in-place edit after a button tap also passes parseMode: \"HTML\" — every real render of this message must use it, not just the first one", () => {
  const idx = src.indexOf("editMessage(chatId, messageId, renderTasbeehText(state), renderTasbeehKeyboard(), \"HTML\")");
  assert.ok(idx > -1, "the post-tap re-render must pass HTML parse_mode too");
});

ok("editMessage forwards a real parse_mode through to the actual Telegram API call when one is given", () => {
  const start = src.indexOf("async function editMessage(chatId, messageId, text, keyboard, parseMode)");
  assert.ok(start > -1, "editMessage must accept a real parseMode parameter");
  const end = src.indexOf("\n}", start);
  const block = src.slice(start, end);
  assert.match(block, /if \(parseMode\) body\.parse_mode = parseMode;/);
});

ok("reply forwards a real parse_mode through opts.parseMode to the actual Telegram API call when one is given", () => {
  const start = src.indexOf("async function reply(text, opts = {})");
  const end = src.indexOf("\n}", start);
  const block = src.slice(start, end);
  assert.match(block, /if \(opts\.parseMode\) body\.parse_mode = opts\.parseMode;/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("TELEGRAM-TASBEEH-RENDER TEST FAILED");
else console.log("TELEGRAM-TASBEEH-RENDER TEST OK");
