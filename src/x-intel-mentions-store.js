// x-intel-mentions-store.js — timestamped mention-count ledger per ticker/
// sector/theme. Feeds the X Intelligence Engine's Trend Velocity (Module 4)
// and Unusual Activity severity ladder (Module 8) — neither existed before:
// X Intel's existing "trending topics"/"most mentioned" stats were computed
// fresh from the last 150 feed items on every page load and thrown away,
// with no real historical baseline to compare today's volume against.
//
// Same atomic-write/readJsonSafe pattern as x-intel-store.js. Age-pruned
// at write time (not entry-count-capped as the PRIMARY bound), since
// mention volume is bursty — a flat entry cap could silently drop today's
// real spike during a busy news day while keeping weeks-old noise.
//
// MAX_ENTRIES below is a pure safety backstop, added 2026-08-15 after a
// real production OOM crash (V8 heap allocation failure, confirmed via
// Render's crash log) — this store had NO upper bound at all before now,
// and with Postgres backing, its entire array is both fully loaded/cloned
// on every single logMention() call AND held permanently resident in the
// in-memory KV cache for the process's whole lifetime. 30-day age-pruning
// alone doesn't protect against a genuinely runaway logging rate (a bug
// elsewhere calling this far more than intended). 50,000 is generous
// enough to never trip during any realistic single busy day.
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "x-intel-mentions.json");
const RETENTION_MS = 30 * 24 * 3600_000; // 30 days — enough for a real 7-day baseline plus slack
const MAX_ENTRIES = 50_000; // safety backstop only — age-pruning above is the real, intended bound

function load() {
  const data = readJsonSafe(STORE_PATH, { mentions: [] });
  const mentions = Array.isArray(data.mentions) ? data.mentions : [];
  // Cap enforced on read too (not just on write) — self-corrects an
  // already-oversized store the moment the process boots, without waiting
  // for the next logMention() call.
  return mentions.length > MAX_ENTRIES ? mentions.slice(mentions.length - MAX_ENTRIES) : mentions;
}

function save(mentions) {
  writeJsonAtomic(STORE_PATH, { mentions });
}

// Called once per real logged X Intel item (both the RSS and real X API
// paths) for each real symbol/sector/theme it actually touched — never
// synthesized, always mirrors what was really extracted for that item.
function logMention({ symbol = null, sector = null, themes = [], source, category }) {
  const mentions = load();
  const cutoff = Date.now() - RETENTION_MS;
  let pruned = mentions.filter((m) => new Date(m.at).getTime() >= cutoff);
  pruned.push({ symbol, sector, themes, source, category, at: new Date().toISOString() });
  // Hard cap, oldest-first drop — only ever engages if age-pruning above
  // somehow wasn't enough (runaway logging rate), never in normal use.
  if (pruned.length > MAX_ENTRIES) pruned = pruned.slice(pruned.length - MAX_ENTRIES);
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
