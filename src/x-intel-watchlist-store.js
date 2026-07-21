// x-intel-watchlist-store.js — watched-entity list for the X Intelligence
// Engine. Same atomic-write/readJsonSafe pattern as every other flat store
// in this app. Seeded once with the user's exact default watchlist; after
// that, real user edits (add/remove/update) persist normally.
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "x-intel-watchlist.json");

const CATEGORIES = ["Politics", "CEOs", "FederalReserve", "Companies", "FinancialNews", "HedgeFunds", "Crypto", "Custom"];

// importanceScore: how market-moving a statement from this entity tends to
// be (drives the >=90 "high-priority account" Telegram-alert condition).
// reliabilityScore: how much to trust unverified/rumor-stage claims
// attributed to it (news orgs high, individuals more variable). Both are
// starting points, not measured — editable by the user like any other
// watchlist field.
const DEFAULT_WATCHLIST = [
  { username: "realDonaldTrump", displayName: "Donald Trump", category: "Politics", importanceScore: 98, reliabilityScore: 70 },
  { username: "elonmusk", displayName: "Elon Musk", category: "CEOs", importanceScore: 95, reliabilityScore: 65 },
  { username: "jensenhuang", displayName: "Jensen Huang", category: "CEOs", importanceScore: 85, reliabilityScore: 85 },
  { username: "NVIDIA", displayName: "NVIDIA", category: "Companies", importanceScore: 85, reliabilityScore: 90 },
  { username: "AMD", displayName: "AMD", category: "Companies", importanceScore: 78, reliabilityScore: 90 },
  { username: "Apple", displayName: "Apple", category: "Companies", importanceScore: 88, reliabilityScore: 90 },
  { username: "Microsoft", displayName: "Microsoft", category: "Companies", importanceScore: 85, reliabilityScore: 90 },
  { username: "OpenAI", displayName: "OpenAI", category: "Companies", importanceScore: 90, reliabilityScore: 85 },
  { username: "federalreserve", displayName: "Federal Reserve", category: "FederalReserve", importanceScore: 99, reliabilityScore: 98 },
  { username: "Reuters", displayName: "Reuters", category: "FinancialNews", importanceScore: 75, reliabilityScore: 95 },
  { username: "Bloomberg", displayName: "Bloomberg", category: "FinancialNews", importanceScore: 78, reliabilityScore: 93 },
  { username: "CNBC", displayName: "CNBC", category: "FinancialNews", importanceScore: 72, reliabilityScore: 88 },
  { username: "WSJ", displayName: "Wall Street Journal", category: "FinancialNews", importanceScore: 76, reliabilityScore: 94 },
  { username: "FinancialTimes", displayName: "Financial Times", category: "FinancialNews", importanceScore: 74, reliabilityScore: 94 },
  { username: "SECGov", displayName: "SEC", category: "FederalReserve", importanceScore: 92, reliabilityScore: 97 },
  { username: "WhiteHouse", displayName: "White House", category: "Politics", importanceScore: 96, reliabilityScore: 85 },
];

function seedDefaults() {
  const now = new Date().toISOString();
  return DEFAULT_WATCHLIST.map((w, i) => ({
    id: `seed-${i}`,
    username: w.username,
    displayName: w.displayName,
    category: w.category,
    importanceScore: w.importanceScore,
    reliabilityScore: w.reliabilityScore,
    lastSeenPost: null,
    lastChecked: null,
    status: "active",
    createdAt: now,
  }));
}

function load() {
  const data = readJsonSafe(STORE_PATH, null);
  if (data && Array.isArray(data.watchlist)) return data.watchlist;
  const seeded = seedDefaults();
  save(seeded);
  return seeded;
}

function save(watchlist) {
  writeJsonAtomic(STORE_PATH, { watchlist });
}

function list() {
  return load();
}

function add({ username, displayName, category, importanceScore, reliabilityScore }) {
  const watchlist = load();
  if (watchlist.some((w) => w.username.toLowerCase() === String(username || "").toLowerCase())) {
    throw new Error(`${username} is already on the watchlist`);
  }
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    username: String(username || "").trim(),
    displayName: String(displayName || username || "").trim(),
    category: CATEGORIES.includes(category) ? category : "Custom",
    importanceScore: Number.isFinite(Number(importanceScore)) ? Math.max(0, Math.min(100, Number(importanceScore))) : 50,
    reliabilityScore: Number.isFinite(Number(reliabilityScore)) ? Math.max(0, Math.min(100, Number(reliabilityScore))) : 50,
    lastSeenPost: null,
    lastChecked: null,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  watchlist.push(entry);
  save(watchlist);
  return entry;
}

function remove(id) {
  const watchlist = load();
  const filtered = watchlist.filter((w) => w.id !== id);
  save(filtered);
  return filtered.length !== watchlist.length;
}

function update(id, patch) {
  const watchlist = load();
  const idx = watchlist.findIndex((w) => w.id === id);
  if (idx === -1) return null;
  const allowed = ["displayName", "category", "importanceScore", "reliabilityScore", "status", "lastSeenPost", "lastChecked"];
  for (const k of allowed) {
    if (patch[k] !== undefined) watchlist[idx][k] = patch[k];
  }
  save(watchlist);
  return watchlist[idx];
}

module.exports = { list, add, remove, update, CATEGORIES };
