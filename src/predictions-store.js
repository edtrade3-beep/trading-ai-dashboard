// predictions-store.js — the real ledger behind Command Center's "Track
// Record" section. Same atomic-write/readJsonSafe pattern every other flat
// store in this app uses (advisor-history-store.js, journal-store.js, etc).
// Every trade idea Command Center generates gets logged here once, then
// prediction-tracker.js grades it against real prices over time — this file
// only owns storage, not the grading logic.
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "predictions.json");
const MAX_ENTRIES = 500; // trimmed oldest-first once exceeded, closed entries first

function load() {
  const data = readJsonSafe(STORE_PATH, { predictions: [] });
  return Array.isArray(data.predictions) ? data.predictions : [];
}

function save(predictions) {
  writeJsonAtomic(STORE_PATH, { predictions });
}

// idea: { symbol, direction ("LONG"|"SHORT"), entry, stop, target1, target2,
//         confidence (0-100), holdingPeriodDays, generatedAt, source }
function logPrediction(idea) {
  const predictions = load();
  const entry = {
    // Date.now() alone collides when multiple ideas are logged in the same
    // tight loop (confirmed live: command-center-ai.js logs every bullish/
    // bearish card back-to-back, easily within the same millisecond) — a
    // random suffix guarantees uniqueness regardless of call timing.
    id: `${idea.symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    symbol: idea.symbol,
    direction: idea.direction,
    entry: idea.entry,
    stop: idea.stop,
    target1: idea.target1 ?? null,
    target2: idea.target2 ?? null,
    confidence: idea.confidence ?? null,
    holdingPeriodDays: idea.holdingPeriodDays ?? null,
    generatedAt: idea.generatedAt || new Date().toISOString(),
    // Which real feature generated this — lets Track Record be filtered
    // per-source (e.g. X Intel's direction-only calls vs Command Center's
    // real trend-screen setups) instead of one undifferentiated ledger.
    // Defaults to "command-center" since that was the only source before
    // this field existed.
    source: idea.source || "command-center",
    status: "open", // open | hit | stopped | expired
    resolvedAt: null,
    resolvedPrice: null,
  };
  predictions.push(entry);
  // Keep all open ones + the most recent closed ones, oldest closed trimmed first.
  const open = predictions.filter((p) => p.status === "open");
  const closed = predictions.filter((p) => p.status !== "open")
    .sort((a, b) => new Date(b.resolvedAt || 0) - new Date(a.resolvedAt || 0));
  const trimmed = [...open, ...closed].slice(0, MAX_ENTRIES);
  save(trimmed);
  return entry;
}

function getOpenPredictions() {
  return load().filter((p) => p.status === "open");
}

function resolvePrediction(id, status, resolvedPrice) {
  const predictions = load();
  const idx = predictions.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  predictions[idx] = {
    ...predictions[idx],
    status,
    resolvedPrice,
    resolvedAt: new Date().toISOString(),
  };
  save(predictions);
  return predictions[idx];
}

// Reverts a prediction back to "open" — for correcting a bad grade (e.g.
// prediction-tracker.js's real SHORT-semantics bug that mis-graded X Intel
// predictions as "hit" the moment they were logged, before the fix). Not a
// resolve — explicitly clears resolvedAt/resolvedPrice too, since "open"
// means genuinely not yet resolved.
function reopenPrediction(id) {
  const predictions = load();
  const idx = predictions.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  predictions[idx] = { ...predictions[idx], status: "open", resolvedAt: null, resolvedPrice: null };
  save(predictions);
  return predictions[idx];
}

// Correction for the exact bad-grade signature prediction-tracker.js's now-
// fixed SHORT-semantics bug produced: it graded 20 real X-Intel shorts as
// "hit" within an hour of generation, regardless of real price movement
// (see prediction-tracker.js's header comment for the full mechanism).
//
// NOT unconditional on source+direction+status alone — that was a real bug
// in this function itself, found 2026-07-23: this runs on every server
// restart (server.js), and prediction-tracker.js's CURRENT SHORT-grading
// logic is correct, so a reverted trade can legitimately earn a real "hit"
// later once actually re-graded (hourly). Reverting on status alone can't
// tell that legitimate hit apart from the original bad one — confirmed
// live: a real, correctly-earned hit got silently stripped back to "open"
// on a routine restart, with no bug in the grade itself, only in this
// migration re-running against it. Gated to the bug's own documented
// signature instead: resolvedAt implausibly close to generatedAt. Real
// price rarely closes a ±3% band that fast, so this still safely catches
// every genuine instance of the original bug while leaving real hits
// alone, and stays idempotent in the way the old comment assumed (a
// legitimately-resolved trade never matches this window, at any restart).
const MISGRADE_WINDOW_MS = 2 * 3600_000; // 2h — generous margin over the bug's documented "within an hour"
function revertMisgradedXIntelShorts() {
  const predictions = load();
  const bad = predictions.filter((p) => {
    if (p.source !== "x-intel" || p.direction !== "SHORT" || p.status !== "hit") return false;
    if (!p.resolvedAt || !p.generatedAt) return false; // no timing evidence — don't guess, leave it
    return new Date(p.resolvedAt).getTime() - new Date(p.generatedAt).getTime() < MISGRADE_WINDOW_MS;
  });
  for (const p of bad) reopenPrediction(p.id);
  return bad.length;
}

// Real, code-computed accuracy — hit rate among CLOSED predictions only
// (open ones haven't proven anything yet, so they're excluded from the
// rate but still shown separately as "in progress"). Pass `source` to
// scope to one feature's own ledger (e.g. "x-intel") instead of the
// combined total.
function getTrackRecord(source) {
  const predictions = source ? load().filter((p) => p.source === source) : load();
  const closed = predictions.filter((p) => p.status === "hit" || p.status === "stopped");
  const hits = closed.filter((p) => p.status === "hit").length;
  const open = predictions.filter((p) => p.status === "open");
  const expired = predictions.filter((p) => p.status === "expired");
  return {
    totalGenerated: predictions.length,
    openCount: open.length,
    closedCount: closed.length,
    expiredCount: expired.length,
    hitCount: hits,
    stoppedCount: closed.length - hits,
    hitRatePct: closed.length ? Math.round((hits / closed.length) * 1000) / 10 : null,
    recent: predictions
      .slice()
      .sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt))
      .slice(0, 20),
  };
}

module.exports = { logPrediction, getOpenPredictions, resolvePrediction, reopenPrediction, revertMisgradedXIntelShorts, getTrackRecord };
