// edge-decay-tracker.js — "is this signal still working?" (2026-08-27).
// Most retail scanners show a static score forever and never disclose
// whether it's still actually predictive. This app already has the one
// real ingredient that makes honest self-auditing possible:
// aplus-score-history.js's pure forward-return log, which produces a real
// win rate per A+ Score band. This file adds ONE more real thing: a daily
// snapshot of that report's own bucket values over time, so a later read
// can honestly compare "the real win rate today" vs "the real win rate
// ~90 real days ago" and flag genuine drift — never a fabricated trend,
// never guessed from too small a sample on either side.
//
// v1 scope, deliberate: tracks only the d20 (monthly) horizon's real
// score-bucket report — the single most regime-relevant window — not all
// 5 horizons or the separate Cortex Verdict track. A real, reviewable
// first cut, not an attempt to track everything at once.
"use strict";
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");
const { buildForwardReturnReport, bucketOf, etDateStr } = require("./aplus-score-history");
const { MIN_WIN_SAMPLE } = require("./institutional-scoring");

const DECAY_LOG_PATH = path.join(ROOT, "data", "edge-decay-log.json");
const MAX_SNAPSHOTS = 400; // same retention convention as aplus-score-history.js's MAX_DAYS

// A real, disclosed, CHOSEN threshold — not derived from any statistical
// test. Below this many real percentage points of drift, classified
// STABLE; a real win-rate drop of 8+ points is real enough at these
// sample sizes to call WEAKENING (and the mirror case STRENGTHENING).
// Adjustable later; documented here so the number is never a mystery.
const DECAY_THRESHOLD_PTS = 8;

const SCORE_BUCKET_KEYS = ["80-100", "60-79", "40-59", "0-39"];

function loadEdgeDecayLog() {
  const data = readJsonSafe(DECAY_LOG_PATH, { snapshots: [] });
  return Array.isArray(data.snapshots) ? data.snapshots : [];
}

function saveEdgeDecayLog(snapshots) {
  writeJsonAtomic(DECAY_LOG_PATH, { snapshots });
}

// Real snapshot of buildForwardReturnReport()'s own d20 score-bucket
// values for today — reuses that already-correct, already-tested report
// as-is, no new price-fetching. Re-running the same day replaces rather
// than duplicates, same pattern as aplus-score-history.js's own snapshot.
async function logEdgeSnapshot() {
  const report = await buildForwardReturnReport();
  const buckets = report?.horizons?.d20?.buckets || null;
  const today = etDateStr();
  const snapshots = loadEdgeDecayLog().filter((s) => s.date !== today);
  snapshots.push({ date: today, buckets });
  snapshots.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  saveEdgeDecayLog(snapshots.slice(-MAX_SNAPSHOTS));
  return { date: today, hasBuckets: !!buckets };
}

// Closest real snapshot at or before `daysAgo` calendar days back — same
// "closest real entry, not an exact-N-days lookup" pattern as
// aplus-score-history.js's snapshotDaysAgo (weekends/holidays leave real
// gaps in the log).
function findSnapshotNearDaysAgo(snapshots, daysAgo) {
  const target = new Date();
  target.setDate(target.getDate() - daysAgo);
  const targetStr = etDateStr(target);
  let best = null;
  for (const s of snapshots) {
    if (s.date <= targetStr) best = s;
    else break;
  }
  return best;
}

function classify(deltaPts) {
  if (deltaPts <= -DECAY_THRESHOLD_PTS) return "WEAKENING";
  if (deltaPts >= DECAY_THRESHOLD_PTS) return "STRENGTHENING";
  return "STABLE";
}

// Pure diff of two real snapshots' bucket values — extracted so it's
// directly unit-testable without touching the real log file. Each bucket
// only gets a real reading when BOTH sides clear the same real
// MIN_WIN_SAMPLE floor used everywhere else in this app — otherwise that
// bucket honestly reports null rather than a trend nobody could trust.
function diffSnapshots(recent, reference) {
  const buckets = {};
  for (const key of SCORE_BUCKET_KEYS) {
    const r = recent?.buckets?.[key];
    const ref = reference?.buckets?.[key];
    if (!r || !ref || r.count < MIN_WIN_SAMPLE || ref.count < MIN_WIN_SAMPLE) { buckets[key] = null; continue; }
    const deltaPts = r.winRate - ref.winRate;
    buckets[key] = {
      deltaPts,
      status: classify(deltaPts),
      recent: { winRate: r.winRate, count: r.count },
      reference: { winRate: ref.winRate, count: ref.count },
    };
  }
  return buckets;
}

// Real recent-vs-reference (~90 real days back) diff per score bucket.
// Honestly reports `available: false` when there's no real snapshot old
// enough yet to compare against (this app's own log is young — expect
// this for the first ~90 real trading days of the feature's life).
async function getEdgeDecayReport({ referenceDaysAgo = 90 } = {}) {
  const snapshots = loadEdgeDecayLog();
  if (!snapshots.length) return { available: false, reason: "no edge-decay snapshots logged yet" };

  const recent = snapshots[snapshots.length - 1];
  const reference = findSnapshotNearDaysAgo(snapshots, referenceDaysAgo);
  if (!reference || reference.date === recent.date) {
    return { available: false, reason: `need a real snapshot ${referenceDaysAgo}+ days old to compare against — not enough history tracked yet` };
  }

  return { available: true, recentDate: recent.date, referenceDate: reference.date, buckets: diffSnapshots(recent, reference) };
}

// Maps a real score to its bucket (reusing aplus-score-history.js's own
// bucketOf, never a re-derived copy) and returns that bucket's real decay
// entry, or null when the report isn't available or that bucket's sample
// is too small on either side.
function getEdgeDecayFor(score, decayReport) {
  if (!decayReport?.available || !Number.isFinite(score)) return null;
  return decayReport.buckets?.[bucketOf(score)] || null;
}

module.exports = {
  DECAY_THRESHOLD_PTS,
  logEdgeSnapshot,
  loadEdgeDecayLog,
  findSnapshotNearDaysAgo,
  diffSnapshots,
  getEdgeDecayReport,
  getEdgeDecayFor,
};
