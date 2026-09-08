"use strict";

// smart-money-score-history.js — real daily Smart Money Score snapshot
// log + signal-shift detector (2026-09-08, user's own spec: "I care more
// about detecting a change early than seeing static information...
// generate a high-priority alert... NVDA — SMART MONEY SHIFT — 84/100 —
// Bullish"). Mirrors iv-history-store.js's/aplus-score-history.js's exact
// pattern: a pure FORWARD log, one entry per real day per symbol, never
// backfilled/reconstructed — a symbol with no real prior snapshot yet
// honestly reports "no prior read to compare against," never a guessed
// "shift." Logged on-demand (whenever a real caller computes a fresh
// score for a symbol via /api/market/smart-money), not a scheduled batch
// job — Smart Money Intelligence is a per-ticker, on-request feature, not
// a full-universe scan like IV Rank's own daily job.
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "smart-money-history.json");
const MAX_DAYS = 120; // ~4 real trading months per symbol

const etDateStr = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

function loadHistory() {
  const data = readJsonSafe(STORE_PATH, { days: [] });
  return Array.isArray(data.days) ? data.days : [];
}
function saveHistory(days) { writeJsonAtomic(STORE_PATH, { days }); }

// Appends today's real score for `symbol` (dedup — a second real call the
// same real day overwrites, never double-logs). Returns the saved row.
function logSnapshot(symbol, score, band) {
  if (!symbol || !Number.isFinite(score)) return null;
  const today = etDateStr();
  const days = loadHistory();
  let dayRow = days.find((d) => d.date === today);
  if (!dayRow) { dayRow = { date: today, symbols: [] }; days.push(dayRow); }
  const existing = dayRow.symbols.find((s) => s.symbol === symbol);
  if (existing) { existing.score = score; existing.band = band; }
  else dayRow.symbols.push({ symbol, score, band });
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  saveHistory(days.slice(-MAX_DAYS));
  return { date: today, symbol, score, band };
}

// Real most-recent PRIOR real day's snapshot for `symbol` — excludes
// today's own entry (a caller logging then immediately comparing must
// never compare a fresh score against itself). Null (never a guess) when
// no real prior snapshot exists yet.
function priorSnapshot(symbol) {
  const today = etDateStr();
  const days = loadHistory().filter((d) => d.date !== today).sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const d of days) {
    const row = (d.symbols || []).find((s) => s.symbol === symbol);
    if (row) return { date: d.date, score: row.score, band: row.band };
  }
  return null;
}

// Real threshold, documented judgment call (same convention as every
// other named threshold in this codebase): a 15-point real score move OR
// a real verdict-band change is "material" enough to surface as a
// SIGNAL CHANGE, per the spec's own explicit priority ("I care more about
// detecting a change early"). Smaller real moves are honestly not flagged
// — never manufacturing urgency out of ordinary day-to-day noise.
const SHIFT_THRESHOLD = 15;

function detectSignalShift(symbol, currentScore, currentBand, reasons = []) {
  const prior = priorSnapshot(symbol);
  if (!prior || !Number.isFinite(currentScore)) {
    return { shifted: false, reason: prior ? null : "No real prior snapshot to compare against yet." };
  }
  const delta = currentScore - prior.score;
  const bandChanged = currentBand !== prior.band;
  const shifted = Math.abs(delta) >= SHIFT_THRESHOLD || bandChanged;
  if (!shifted) return { shifted: false, delta, priorScore: prior.score, priorDate: prior.date };
  const direction = delta >= 0 ? "Bullish" : "Bearish";
  return {
    shifted: true, delta, priorScore: prior.score, priorDate: prior.date, direction,
    headline: `${symbol} — SMART MONEY SHIFT — ${currentScore}/100 — ${direction}`,
    evidence: reasons,
  };
}

module.exports = { loadHistory, logSnapshot, priorSnapshot, detectSignalShift, SHIFT_THRESHOLD, etDateStr };
