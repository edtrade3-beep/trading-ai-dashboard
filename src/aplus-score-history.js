// aplus-score-history.js — a forward-tracking log for the platform's own
// A+ Score. This does NOT backtest against history — it's a pure forward
// log: once a day, record today's real A+ Score + real price for every
// symbol in the real scan universe, then later compare a symbol's real
// CURRENT price against its real logged price from N days ago to see
// whether higher-scored names actually moved more. Honest by
// construction: a horizon with no snapshot that far back yet returns
// null, never guessed or backfilled from a reconstructed history.
const path = require("node:path");
const { ROOT, resolveProviderKeys } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "aplus-score-history.json");
const MAX_DAYS = 400; // comfortably covers a year+ of daily snapshots

const etDateStr = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

function loadHistory() {
  const data = readJsonSafe(STORE_PATH, { days: [] });
  return Array.isArray(data.days) ? data.days : [];
}

function saveHistory(days) {
  writeJsonAtomic(STORE_PATH, { days });
}

// Real snapshot: today's real regime + every real scanned symbol's real
// A+ Score and real price. One entry per calendar day (ET) — re-running
// the same day replaces rather than duplicates, same pattern as
// advisor-history-store.js.
async function logDailySnapshot() {
  const { SCAN_UNIVERSE } = require("./advisor-ai");
  const { screenTrendTemplate, fetchMarketQuotes } = require("./routes/market");
  const { computeRegime, computeAPlusScore } = require("./trade-planner-scoring");

  const macroRows = await fetchMarketQuotes(["SPY", "QQQ", "VIXY"], resolveProviderKeys(new URLSearchParams()));
  const regime = computeRegime(Array.isArray(macroRows) ? macroRows : []);

  const results = await screenTrendTemplate(SCAN_UNIVERSE);
  const scores = results
    .filter(r => !r.error && Number.isFinite(Number(r.price)) && Number(r.price) > 0)
    .map(r => ({ symbol: r.symbol, score: computeAPlusScore(r, regime).score, price: Number(r.price) }));

  const days = loadHistory();
  const today = etDateStr();
  const filtered = days.filter(d => d.date !== today);
  filtered.push({ date: today, regimeScore: regime.score, regimeLabel: regime.label, scores });
  filtered.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  saveHistory(filtered.slice(-MAX_DAYS));
  return { date: today, count: scores.length };
}

// Bucket a real score into the same 4 bands used elsewhere in this app's
// UI (80+/60-79/40-59/<40) for a real bucket-vs-forward-return read.
function bucketOf(score) {
  if (score >= 80) return "80-100";
  if (score >= 60) return "60-79";
  if (score >= 40) return "40-59";
  return "0-39";
}

// Closest real snapshot at or before `daysAgo` calendar days back — same
// "closest real entry, not an exact-N-days lookup" pattern already used by
// advisor-history-store.js (weekends/holidays leave real gaps in the log).
function snapshotDaysAgo(days, daysAgo) {
  const target = new Date();
  target.setDate(target.getDate() - daysAgo);
  const targetStr = etDateStr(target);
  let best = null;
  for (const d of days) {
    if (d.date <= targetStr) best = d;
    else break;
  }
  return best;
}

// Real forward-return report for one horizon: fetches TODAY's real prices
// for every symbol logged in that historical snapshot (never a stale
// price), computes each one's real forward % move, buckets by the score
// it had back then, and reports real average return + real win rate per
// bucket. Returns null if there's no real snapshot old enough yet.
async function forwardReturnsFor(daysAgo) {
  const days = loadHistory();
  const snap = snapshotDaysAgo(days, daysAgo);
  if (!snap || !snap.scores?.length) return null;

  const { fetchMarketQuotes } = require("./routes/market");
  const symbols = snap.scores.map(s => s.symbol);
  const currentRows = await fetchMarketQuotes(symbols, resolveProviderKeys(new URLSearchParams()));
  const priceNow = new Map((Array.isArray(currentRows) ? currentRows : [])
    .filter(r => Number.isFinite(Number(r.price)) && Number(r.price) > 0)
    .map(r => [r.symbol, Number(r.price)]));

  const buckets = { "80-100": [], "60-79": [], "40-59": [], "0-39": [] };
  for (const s of snap.scores) {
    const now = priceNow.get(s.symbol);
    if (!Number.isFinite(now) || !Number.isFinite(s.price) || s.price <= 0) continue;
    const fwdPct = (now / s.price - 1) * 100;
    buckets[bucketOf(s.score)].push(fwdPct);
  }

  const report = {};
  for (const [bucket, rets] of Object.entries(buckets)) {
    if (!rets.length) { report[bucket] = null; continue; }
    const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
    const winRate = Math.round((rets.filter(r => r > 0).length / rets.length) * 100);
    report[bucket] = { count: rets.length, avgReturnPct: Math.round(avg * 100) / 100, winRate };
  }
  return { asOfDate: snap.date, daysAgo, regimeScoreThen: snap.regimeScore, buckets: report };
}

async function buildForwardReturnReport() {
  const horizons = [5, 10, 20, 60];
  const results = {};
  for (const h of horizons) {
    try { results[`d${h}`] = await forwardReturnsFor(h); }
    catch { results[`d${h}`] = null; }
  }
  const days = loadHistory();
  return {
    trackingStartedAt: days.length ? days[0].date : null,
    daysTracked: days.length,
    horizons: results,
  };
}

module.exports = { logDailySnapshot, buildForwardReturnReport, loadHistory, snapshotDaysAgo, bucketOf, etDateStr };
