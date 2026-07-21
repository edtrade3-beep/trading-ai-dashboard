// x-intel-store.js — historical database of X Intelligence Engine items.
// Same atomic-write/readJsonSafe pattern as every other flat store. Each
// item is a real, web_search-grounded statement attributed to a watched
// entity (see x-intel-ai.js) — never a fabricated post.
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "x-intel-items.json");
const MAX_ENTRIES = 1000;

function load() {
  const data = readJsonSafe(STORE_PATH, { items: [] });
  return Array.isArray(data.items) ? data.items : [];
}

function save(items) {
  writeJsonAtomic(STORE_PATH, { items });
}

function logItem(item) {
  const items = load();
  const entry = { id: `xi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...item };
  items.unshift(entry); // newest first
  save(items.slice(0, MAX_ENTRIES));
  return entry;
}

// Dedup key: normalized entity + first ~60 chars of the one-line summary.
// There's no real post ID to key on (no API), so a repeated real headline
// from the same entity within the cooldown window is treated as the same
// underlying statement re-surfacing in search, not a new item.
function normalizeKey(entityUsername, oneLine) {
  return `${String(entityUsername || "").toLowerCase()}::${String(oneLine || "").toLowerCase().slice(0, 60).replace(/\s+/g, " ").trim()}`;
}

function findRecentDuplicate(entityUsername, oneLine, windowMs) {
  const key = normalizeKey(entityUsername, oneLine);
  const cutoff = Date.now() - windowMs;
  return load().find((it) => normalizeKey(it.entityUsername, it.aiSummary?.oneLine) === key && new Date(it.capturedAt).getTime() >= cutoff);
}

function listItems({ symbol, entity, category, keyword, dateFrom, dateTo, limit = 100 } = {}) {
  let items = load();
  if (symbol) {
    const s = String(symbol).toUpperCase();
    items = items.filter((it) => (it.marketImpact || []).some((m) => String(m.symbol || "").toUpperCase() === s));
  }
  if (entity) {
    const e = String(entity).toLowerCase();
    items = items.filter((it) => String(it.entityUsername || "").toLowerCase().includes(e) || String(it.entityDisplayName || "").toLowerCase().includes(e));
  }
  if (category) items = items.filter((it) => it.category === category);
  if (keyword) {
    const k = String(keyword).toLowerCase();
    items = items.filter((it) =>
      String(it.text || "").toLowerCase().includes(k) ||
      String(it.aiSummary?.oneLine || "").toLowerCase().includes(k) ||
      String(it.aiSummary?.executive || "").toLowerCase().includes(k)
    );
  }
  if (dateFrom) items = items.filter((it) => it.capturedAt >= dateFrom);
  if (dateTo) items = items.filter((it) => it.capturedAt <= dateTo);
  return items.slice(0, Math.max(1, Math.min(500, Number(limit) || 100)));
}

function getRecent(n = 50) {
  return load().slice(0, n);
}

// One-time cleanup for a real bug: the RSS poller (x-intel-rss.js) briefly
// set capturedAt to the article's real publish date instead of the
// logging time, which broke findRecentDuplicate's 48h window for any
// article older than 48h (common — these feeds return weeks of history),
// causing the same real item to get re-logged on every poll. Removes
// exact (entityUsername + oneLine) duplicates among analysisSource:"rss"
// items, keeping the earliest-logged copy. Safe/idempotent — no-op once
// the duplicates are gone.
function dedupeRssItems() {
  const items = load();
  const seen = new Set();
  const deduped = [];
  // Oldest-logged-first so the kept copy is the original, not a repeat.
  const ordered = [...items].reverse();
  for (const it of ordered) {
    if (it.analysisSource !== "rss") { deduped.push(it); continue; }
    const key = `${String(it.entityUsername || "").toLowerCase()}::${String(it.aiSummary?.oneLine || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(it);
  }
  deduped.reverse(); // restore newest-first
  const removed = items.length - deduped.length;
  if (removed > 0) save(deduped);
  return removed;
}

module.exports = { logItem, listItems, getRecent, findRecentDuplicate, dedupeRssItems };
