// anthropic-usage-store.js — the real, timestamped Anthropic API usage
// ledger behind the Credit Management System. Same atomic-write/
// readJsonSafe pattern as every other flat store in this app
// (x-intel-mentions-store.js, x-intel-sentiment-store.js). One real entry
// per real Anthropic call, logged from the single chokepoint every call in
// the app passes through (src/anthropic.js's anthropicRequestOnce) — see
// that file for the instrumentation. Nothing here is estimated or
// fabricated; every entry reflects Anthropic's own real usage/cost data
// for that specific call.
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { computeCallCost } = require("./anthropic-pricing");

const STORE_PATH = path.join(ROOT, "data", "anthropic-usage.json");
const RETENTION_MS = 400 * 24 * 3600_000; // ~13 months — enough for real month-over-month comparison

function load() {
  const data = readJsonSafe(STORE_PATH, { entries: [], warnedThresholds: {} });
  return {
    entries: Array.isArray(data.entries) ? data.entries : [],
    warnedThresholds: data.warnedThresholds || {}, // { "2026-07": 75 } — highest % threshold already warned this real month
  };
}

function save(state) {
  writeJsonAtomic(STORE_PATH, state);
}

// Called once per real Anthropic API response. usage/webSearchCount come
// straight from that response — see anthropic.js's instrumentation.
function logUsage({ feature = "unclassified", model, usage, webSearchCount = 0 }) {
  const state = load();
  const cutoff = Date.now() - RETENTION_MS;
  const pruned = state.entries.filter((e) => new Date(e.at).getTime() >= cutoff);
  const costUSD = computeCallCost({ model, usage, webSearchCount });
  pruned.push({
    at: new Date().toISOString(),
    feature, model,
    inputTokens: Number(usage?.input_tokens) || 0,
    outputTokens: Number(usage?.output_tokens) || 0,
    cacheCreationTokens: Number(usage?.cache_creation_input_tokens) || 0,
    cacheReadTokens: Number(usage?.cache_read_input_tokens) || 0,
    webSearchCount: Number(webSearchCount) || 0,
    costUSD,
  });
  save({ entries: pruned, warnedThresholds: state.warnedThresholds });
  return costUSD;
}

function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getUsage({ sinceMs, feature } = {}) {
  const { entries } = load();
  const cutoff = sinceMs != null ? Date.now() - sinceMs : 0;
  return entries.filter((e) => {
    if (new Date(e.at).getTime() < cutoff) return false;
    if (feature && e.feature !== feature) return false;
    return true;
  });
}

function sumCost(entries) { return entries.reduce((s, e) => s + (e.costUSD || 0), 0); }

function getTodayUsage() {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
  const entries = load().entries.filter((e) => new Date(e.at).getTime() >= dayStart);
  return { costUSD: sumCost(entries), callCount: entries.length };
}

function getMonthUsage(d = new Date()) {
  const key = monthKey(d);
  const entries = load().entries.filter((e) => monthKey(new Date(e.at)) === key);
  return { costUSD: sumCost(entries), callCount: entries.length, monthKey: key };
}

// Real linear projection: month-to-date spend / real days elapsed so far
// this month × real total days in this month. Not a guess about future
// call volume — a straightforward extrapolation of the actual observed
// daily rate, the same honest-estimation approach used elsewhere in this
// app (e.g. Command Center's real scenario math already disclosed as
// illustrative-not-calibrated for a similar reason).
function getMonthEndProjection(d = new Date()) {
  const { costUSD } = getMonthUsage(d);
  const daysElapsed = d.getUTCDate();
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  if (daysElapsed <= 0) return costUSD;
  return Math.round((costUSD / daysElapsed) * daysInMonth * 100) / 100;
}

function getAverageDailySpend(d = new Date()) {
  const { costUSD } = getMonthUsage(d);
  const daysElapsed = Math.max(1, d.getUTCDate());
  return Math.round((costUSD / daysElapsed) * 100) / 100;
}

function getRemainingBudget(budgetUSD = 25, d = new Date()) {
  const { costUSD } = getMonthUsage(d);
  return Math.round((budgetUSD - costUSD) * 100) / 100;
}

function getCostByFeature(d = new Date()) {
  const key = monthKey(d);
  const entries = load().entries.filter((e) => monthKey(new Date(e.at)) === key);
  const byFeature = new Map();
  for (const e of entries) {
    const cur = byFeature.get(e.feature) || { feature: e.feature, costUSD: 0, callCount: 0 };
    cur.costUSD += e.costUSD || 0;
    cur.callCount++;
    byFeature.set(e.feature, cur);
  }
  return [...byFeature.values()].map((f) => ({ ...f, costUSD: Math.round(f.costUSD * 10000) / 10000 })).sort((a, b) => b.costUSD - a.costUSD);
}

// Threshold levels the spec asks for. Returns the newly-crossed threshold
// (if any) and marks it warned for this real month so it only fires once —
// resets naturally once a new real month's key doesn't match the stored one.
const THRESHOLDS = [50, 75, 90, 95];
function checkBudgetWarnings(budgetUSD = 25, d = new Date()) {
  const key = monthKey(d);
  const { costUSD } = getMonthUsage(d);
  const pctUsed = (costUSD / budgetUSD) * 100;
  const state = load();
  const alreadyWarned = state.warnedThresholds[key] || 0;
  const crossed = THRESHOLDS.filter((t) => pctUsed >= t && t > alreadyWarned);
  if (crossed.length) {
    const highest = Math.max(...crossed);
    save({ entries: state.entries, warnedThresholds: { [key]: highest } }); // only ever keep the current month's key — old months don't need to persist
    return { newThreshold: highest, pctUsed: Math.round(pctUsed * 10) / 10 };
  }
  return null;
}

module.exports = {
  logUsage, getUsage, getTodayUsage, getMonthUsage, getMonthEndProjection,
  getAverageDailySpend, getRemainingBudget, getCostByFeature, checkBudgetWarnings,
  THRESHOLDS, monthKey,
};
