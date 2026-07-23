// x-api-usage-store.js — real, timestamped X API usage ledger. Mirrors
// anthropic-usage-store.js's exact architecture (same atomic-write
// pattern, same aggregate functions), pointed at the X API's real
// pay-per-use pricing ($0.005/real post read) instead of Anthropic's
// per-token pricing. A SEPARATE budget line from the Anthropic Credit
// Management System — that system stays fully intact for every other AI
// feature in this app (Command Center, Advisor AI, CEO AI, etc.); X
// Intelligence Engine no longer contributes to it at all once Anthropic
// is removed from this feature, and gets its own real tracker here
// instead.
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "x-api-usage.json");
const RETENTION_MS = 400 * 24 * 3600_000; // ~13 months, same retention as the Anthropic ledger
const COST_PER_READ = 0.005; // X's real, published pay-per-use rate
// Real hard monthly cap — user explicitly lowered this from the original
// $25 to $10 to try the X API path at smaller real spend first (2026-07).
// Single source of truth: every function below defaults to this instead
// of a scattered literal.
const X_API_BUDGET_USD = 10;

function load() {
  const data = readJsonSafe(STORE_PATH, { entries: [], warnedThresholds: {} });
  return {
    entries: Array.isArray(data.entries) ? data.entries : [],
    warnedThresholds: data.warnedThresholds || {},
  };
}
function save(state) { writeJsonAtomic(STORE_PATH, state); }

// Called once per real X API read (a tweet-timeline fetch or a user-ID
// lookup) — reads is the real count of posts/lookups that call actually
// consumed, never estimated.
function logReads({ feature = "x-intel", reads = 1 }) {
  const state = load();
  const cutoff = Date.now() - RETENTION_MS;
  const pruned = state.entries.filter((e) => new Date(e.at).getTime() >= cutoff);
  const costUSD = Math.round(reads * COST_PER_READ * 1_000_000) / 1_000_000;
  pruned.push({ at: new Date().toISOString(), feature, reads, costUSD });
  save({ entries: pruned, warnedThresholds: state.warnedThresholds });
  return costUSD;
}

function monthKey(d = new Date()) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; }
function sumField(entries, field) { return entries.reduce((s, e) => s + (e[field] || 0), 0); }

function getTodayUsage() {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
  const entries = load().entries.filter((e) => new Date(e.at).getTime() >= dayStart);
  return { costUSD: sumField(entries, "costUSD"), reads: sumField(entries, "reads"), callCount: entries.length };
}

function getMonthUsage(d = new Date()) {
  const key = monthKey(d);
  const entries = load().entries.filter((e) => monthKey(new Date(e.at)) === key);
  return { costUSD: sumField(entries, "costUSD"), reads: sumField(entries, "reads"), callCount: entries.length, monthKey: key };
}

function getMonthEndProjection(d = new Date()) {
  const { costUSD } = getMonthUsage(d);
  const daysElapsed = d.getUTCDate();
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  if (daysElapsed <= 0) return costUSD;
  return Math.round((costUSD / daysElapsed) * daysInMonth * 100) / 100;
}

function getRemainingBudget(budgetUSD = X_API_BUDGET_USD, d = new Date()) {
  const { costUSD } = getMonthUsage(d);
  return Math.round((budgetUSD - costUSD) * 100) / 100;
}

function getRemainingReads(budgetUSD = X_API_BUDGET_USD, d = new Date()) {
  return Math.max(0, Math.floor(getRemainingBudget(budgetUSD, d) / COST_PER_READ));
}

const THRESHOLDS = [50, 75, 90, 95];
function checkBudgetWarnings(budgetUSD = X_API_BUDGET_USD, d = new Date()) {
  const key = monthKey(d);
  const { costUSD } = getMonthUsage(d);
  const pctUsed = (costUSD / budgetUSD) * 100;
  const state = load();
  const alreadyWarned = state.warnedThresholds[key] || 0;
  const crossed = THRESHOLDS.filter((t) => pctUsed >= t && t > alreadyWarned);
  if (crossed.length) {
    const highest = Math.max(...crossed);
    save({ entries: state.entries, warnedThresholds: { [key]: highest } });
    return { newThreshold: highest, pctUsed: Math.round(pctUsed * 10) / 10 };
  }
  return null;
}

module.exports = {
  logReads, getTodayUsage, getMonthUsage, getMonthEndProjection,
  getRemainingBudget, getRemainingReads, checkBudgetWarnings, THRESHOLDS, COST_PER_READ, monthKey,
  X_API_BUDGET_USD,
};
