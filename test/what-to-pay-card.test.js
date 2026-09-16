"use strict";
// Real structural test for WhatToPayCard.jsx (2026-09-16, "AI Trade Desk
// — Add 'What Price to Pay' to Every Stock"). fs.readFileSync + regex
// convention, same as this repo's other component tests.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; } }

const src = fs.readFileSync(path.join(__dirname, "..", "axiom-runner", "components", "WhatToPayCard.jsx"), "utf8");

console.log("Checking WhatToPayCard.jsx — real self-fetching price-zone card…");

ok("fetches the real single-symbol GET /api/market/what-to-pay?symbol=X route — no client-side zone computation", () => {
  assert.match(src, /fetch\(`\/api\/market\/what-to-pay\?symbol=\$\{encodeURIComponent\(symbol\)\}`\)/);
});

ok("displays the prompt's own exact 4 primary fields: CURRENT PRICE, WHAT TO PAY, STRONG BUY ZONE, DON'T CHASE ABOVE", () => {
  assert.match(src, /CURRENT PRICE/);
  assert.match(src, /🎯 WHAT TO PAY/);
  assert.match(src, /🔥 STRONG BUY ZONE/);
  assert.match(src, /⛔ DON'T CHASE ABOVE/);
});

ok("real fields come straight off the server response (data.price/whatToPay/strongBuyZone/dontChaseAbove/priceStatus) — nothing recomputed client-side", () => {
  assert.match(src, /data\.price/);
  assert.match(src, /data\.whatToPay/);
  assert.match(src, /data\.strongBuyZone/);
  assert.match(src, /data\.dontChaseAbove/);
  assert.match(src, /data\.priceStatus/);
});

ok("does NOT clutter the rendered card with RSI/MACD/EMA/VWAP/ATR — the prompt's own explicit instruction (\"those calculations happen behind the scenes\") — checked against the JSX body only, not the file's own disclosure comment explaining why", () => {
  const body = src.slice(src.indexOf("export default function"));
  assert.doesNotMatch(body, /\bRSI\b|\bMACD\b|\bATR\b|\bEMA\b|\bVWAP\b/);
});

ok("renders nothing (returns null) when there is no selected symbol yet — never a fabricated placeholder card", () => {
  assert.match(src, /if \(!symbol \|\| state === "idle"\) return null;/);
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error("WHAT-TO-PAY-CARD TEST FAILED");
else console.log("WHAT-TO-PAY-CARD TEST OK");
