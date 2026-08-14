// alert-buffer.js — shared queue behind the morning digest (src/morning-
// digest.js). "Consolidate the scattered pings into one summary" (explicit
// user request, 2026-08-14): the 8 real "opportunity" alert jobs (watchlist
// turn/setup/greenlight/sniper, best-opportunities, bearish-setups,
// watchlist-institutional, vcp) already compute genuine state-transition
// events off real data — this module just changes their delivery from
// "send now" to "queue for the once-daily digest". Deliberately NOT used by
// position-reversal-alerts.js or paper-positions.js's reprice job: those
// two are about actual held capital ("early get-out" / "Exit Now"), and
// batching a real risk signal to a once-a-day digest would be a real safety
// regression, not just a UX tradeoff — they keep sending immediately.
"use strict";

const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "digest-buffer.json");

function pushDigestLines(category, header, lines) {
  if (!Array.isArray(lines) || !lines.length) return;
  const store = readJsonSafe(STORE_PATH, { items: [] });
  store.items.push({ category, header, lines, at: new Date().toISOString() });
  writeJsonAtomic(STORE_PATH, store);
}

// Reads and clears the buffer atomically-enough for this app's single-
// process model (same read-then-write pattern every *-alerts.js store
// already uses — no real concurrent-writer risk here).
function flushDigestBuffer() {
  const store = readJsonSafe(STORE_PATH, { items: [] });
  writeJsonAtomic(STORE_PATH, { items: [] });
  return store.items;
}

function peekDigestBuffer() {
  return readJsonSafe(STORE_PATH, { items: [] }).items;
}

module.exports = { pushDigestLines, flushDigestBuffer, peekDigestBuffer };
