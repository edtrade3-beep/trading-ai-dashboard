"use strict";
// missed-opportunity-tracker.js — real forward-outcome tracking for
// candidates Autopilot 2.0 detected but did NOT enter (Autopilot goal
// spec, 2026-08-30: "Log detected, rejected, entered, missed, failed, and
// profitable opportunities... record why they were missed and what
// happened afterward. Use this feedback to improve the existing engine,
// not create another engine").
//
// Same "log now, compare to real future price later" pattern already
// proven by aplus-score-history.js/edge-decay-tracker.js/
// mtf-outcome-tracker.js — observability only. This file does NOT feed
// back into am-core-engine.js's scoring or autopilot2-engine.js's entry
// decision; it is a report a human (or a future, deliberately-scoped
// auto-tuning pass) reads, exactly the same non-negotiable this
// codebase's other outcome trackers already follow. Recording a missed
// opportunity here can never itself cause a trade.
const path = require("node:path");
const { ROOT, resolveProviderKeys } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const LOG_PATH = path.join(ROOT, "data", "missed-opportunity-log.json");
const MAX_RECORDS = 2000; // real retention cap, same spirit as the other trackers' MAX_SNAPSHOTS/MAX_DAYS

function etDateStr(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}

function loadLog() {
  const data = readJsonSafe(LOG_PATH, { records: [] });
  return Array.isArray(data.records) ? data.records : [];
}
function saveLog(records) {
  writeJsonAtomic(LOG_PATH, { records: records.slice(-MAX_RECORDS) });
}

// Real, disclosed classification of tryEnter()'s own free-text reject
// reasons (autopilot2-engine.js) into a small set of real categories —
// parsed from the exact prefixes that function actually returns today.
// Anything that doesn't match a known prefix honestly falls to OTHER
// rather than being force-fit or silently dropped.
function categorizeRejectReason(reason) {
  const r = String(reason || "");
  if (r === "already held") return "ALREADY_HELD";
  if (r.startsWith("max open positions")) return "MAX_POSITIONS";
  if (r.startsWith("sector concentration cap")) return "SECTOR_CAP";
  if (r.startsWith("portfolio open-risk ceiling")) return "RISK_CEILING";
  if (r.includes("sized to 0")) return "SIZING_ZERO";
  if (r.includes("NO_TRADE") || r.startsWith("no real")) return "NO_TRADE_EXPRESSION";
  return "OTHER";
}

// Called from autopilot2-engine.js's tryEnter() reject path (and, in the
// future, any other real candidate-evaluation point that wants to record
// a real miss) — real symbol/price/verdict/score/reason at the real
// moment of the decision, nothing fabricated or backfilled.
function recordMissed({ symbol, reason, price, verdict, score, tier, expectedValue, source }) {
  if (!symbol || !Number.isFinite(price) || price <= 0) return null; // no real price -> can't forward-track, don't log a record we can never resolve
  const records = loadLog();
  const entry = {
    symbol, price, reason: reason || null, category: categorizeRejectReason(reason),
    verdict: verdict || null, score: Number.isFinite(score) ? score : null, tier: tier || null,
    expectedValue: Number.isFinite(expectedValue) ? expectedValue : null,
    source: source || "autopilot2",
    date: etDateStr(), loggedAt: Date.now(),
  };
  records.push(entry);
  saveLog(records);
  return entry;
}

// Closest real record set at/after `daysAgo` calendar days back that's
// old enough to check now — records younger than daysAgo are excluded
// (nothing to compare against yet), same "honest, no early guess"
// discipline as every other tracker in this app.
function recordsAtLeastDaysOld(records, daysAgo) {
  const cutoff = Date.now() - daysAgo * 86400_000;
  return records.filter((r) => r.loggedAt <= cutoff);
}

// Real forward-outcome report: for every real missed-opportunity record
// at least `daysAgo` old, fetch today's real price for that symbol and
// compute the real % move since the moment it was passed on. Bucketed by
// real rejection category so the report can honestly answer "of the
// trades we skipped because of the sector cap, how many would have
// worked out?" — never a guessed or backfilled number; a symbol whose
// current price can't be fetched is honestly excluded, not zero-filled.
async function buildMissedOpportunityReport({ daysAgo = 5 } = {}) {
  const records = recordsAtLeastDaysOld(loadLog(), daysAgo);
  if (!records.length) return { available: false, reason: `no real missed-opportunity records at least ${daysAgo} real days old yet` };

  const { fetchMarketQuotes } = require("./routes/market");
  const symbols = [...new Set(records.map((r) => r.symbol))];
  const rows = await fetchMarketQuotes(symbols, resolveProviderKeys(new URLSearchParams())).catch(() => []);
  const priceNow = new Map((Array.isArray(rows) ? rows : [])
    .filter((r) => Number.isFinite(Number(r.price)) && Number(r.price) > 0)
    .map((r) => [r.symbol, Number(r.price)]));

  const byCategory = {};
  let resolvedCount = 0;
  for (const rec of records) {
    const now = priceNow.get(rec.symbol);
    if (!Number.isFinite(now)) continue; // honest skip — no real current price available, never fabricated
    resolvedCount++;
    const fwdPct = Math.round(((now / rec.price - 1) * 100) * 100) / 100;
    const cat = byCategory[rec.category] || (byCategory[rec.category] = { count: 0, wouldHaveGainedCount: 0, returns: [] });
    cat.count++;
    cat.returns.push(fwdPct);
    if (fwdPct > 0) cat.wouldHaveGainedCount++;
  }

  const categories = {};
  for (const [cat, data] of Object.entries(byCategory)) {
    const avg = data.returns.reduce((a, b) => a + b, 0) / data.returns.length;
    categories[cat] = {
      count: data.count,
      avgForwardReturnPct: Math.round(avg * 100) / 100,
      wouldHaveGainedRate: Math.round((data.wouldHaveGainedCount / data.count) * 100),
    };
  }

  return {
    available: true, daysAgo, totalRecordsChecked: records.length, resolvedCount,
    unresolvedCount: records.length - resolvedCount, categories,
  };
}

module.exports = {
  recordMissed, categorizeRejectReason, loadLog, buildMissedOpportunityReport, recordsAtLeastDaysOld,
};
