// x-intel-mentions-store.js — timestamped mention-count ledger per ticker/
// sector/theme. Feeds the X Intelligence Engine's Trend Velocity (Module 4)
// and Unusual Activity severity ladder (Module 8) — neither existed before:
// X Intel's existing "trending topics"/"most mentioned" stats were computed
// fresh from the last 150 feed items on every page load and thrown away,
// with no real historical baseline to compare today's volume against.
//
// Same atomic-write/readJsonSafe pattern as x-intel-store.js. Age-pruned
// (not entry-count-capped) at write time, since mention volume is bursty —
// a flat entry cap could silently drop today's real spike during a busy
// news day while keeping weeks-old noise.
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "x-intel-mentions.json");
const RETENTION_MS = 30 * 24 * 3600_000; // 30 days — enough for a real 7-day baseline plus slack

function load() {
  const data = readJsonSafe(STORE_PATH, { mentions: [] });
  return Array.isArray(data.mentions) ? data.mentions : [];
}

function save(mentions) {
  writeJsonAtomic(STORE_PATH, { mentions });
}

// Called once per real logged X Intel item (both the RSS and AI-search
// paths) for each real symbol/sector/theme it actually touched — never
// synthesized, always mirrors what was really extracted for that item.
function logMention({ symbol = null, sector = null, themes = [], source, category }) {
  const mentions = load();
  const cutoff = Date.now() - RETENTION_MS;
  const pruned = mentions.filter((m) => new Date(m.at).getTime() >= cutoff);
  pruned.push({ symbol, sector, themes, source, category, at: new Date().toISOString() });
  save(pruned);
}

// Real count of mentions for a symbol/sector/theme within a real time
// window — the building block both trend velocity and unusual activity
// need (today's rate vs. a real historical rate), not an estimate.
function countMentions({ symbol, sector, theme, sinceMs }) {
  const cutoff = Date.now() - sinceMs;
  return load().filter((m) => {
    if (new Date(m.at).getTime() < cutoff) return false;
    if (symbol && m.symbol !== symbol) return false;
    if (sector && m.sector !== sector) return false;
    if (theme && !(m.themes || []).includes(theme)) return false;
    return true;
  }).length;
}

// Real daily mention counts for the last N days for a symbol — the
// baseline computeUnusualActivity() compares today's rate against.
function dailyCounts(symbol, days = 7) {
  const mentions = load().filter((m) => m.symbol === symbol);
  const out = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    // Rolling 24h windows counting backward from now, not calendar-day
    // aligned (consistent with every other window in this file). i=0 is
    // "the most recent 24h ending now" — the last entry in the returned
    // array — not "now to 24h in the future," which would always be empty.
    const dayEnd = now - i * 24 * 3600_000;
    const dayStart = dayEnd - 24 * 3600_000;
    out.push(mentions.filter((m) => {
      const t = new Date(m.at).getTime();
      return t >= dayStart && t < dayEnd;
    }).length);
  }
  return out; // oldest -> newest
}

// Every distinct symbol with at least one real mention in the window —
// the real candidate universe for trend/velocity ranking (never a
// hardcoded/guessed list).
function distinctSymbols(sinceMs) {
  const cutoff = Date.now() - sinceMs;
  const set = new Set();
  for (const m of load()) {
    if (m.symbol && new Date(m.at).getTime() >= cutoff) set.add(m.symbol);
  }
  return [...set];
}

module.exports = { logMention, countMentions, dailyCounts, distinctSymbols };
