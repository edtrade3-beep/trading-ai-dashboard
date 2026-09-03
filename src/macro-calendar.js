"use strict";
// Trade GPS Stage 5 (2026-09-03) — macro-event awareness for the Trap
// Shield. No live economic-calendar provider exists anywhere in this repo
// (confirmed: fred.js only serves already-published historical series;
// routes/fed.js only fetches the FOMC's most recent PAST statement text —
// neither discloses forward-looking meeting/release dates). Rather than
// fabricate plausible-sounding future dates, this reads a static, clearly
// labeled, git-tracked seed file (data/macro-calendar-seed.json) that
// ships empty and must be populated by hand from federalreserve.gov
// (FOMC) / bls.gov (CPI) — an honest empty real read beats an invented
// one, same discipline as every other "N/A dropped, never guessed" engine
// in this codebase.
const fs = require("fs");
const path = require("path");

const SEED_PATH = path.join(__dirname, "macro-calendar-seed.json");
const VALID_TYPES = new Set(["CPI", "FOMC", "FED_SPEAKER"]);

function loadSeed() {
  try {
    const raw = fs.readFileSync(SEED_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.events) ? parsed.events : [];
  } catch {
    return [];
  }
}

// Real events only — an unrecognized type or a non-finite timestamp is
// dropped, never guessed or coerced.
function getUpcomingMacroEvents({ nowMs = Date.now(), windowHours = 48 } = {}) {
  const windowMs = Number(windowHours) * 60 * 60 * 1000;
  if (!Number.isFinite(nowMs) || !Number.isFinite(windowMs) || windowMs <= 0) return [];
  return loadSeed()
    .filter((e) => e && VALID_TYPES.has(e.type) && Number.isFinite(Number(e.atMs)))
    .map((e) => ({ type: e.type, atMs: Number(e.atMs), label: e.label || e.type }))
    .filter((e) => e.atMs >= nowMs && e.atMs <= nowMs + windowMs)
    .sort((a, b) => a.atMs - b.atMs);
}

module.exports = { getUpcomingMacroEvents, VALID_TYPES, SEED_PATH };
