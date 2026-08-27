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
  const { computeSniperDecision } = require("./sniper-decision");
  const { computeHeatRisk, computeCortexVerdict, computeTechnicalScore } = require("./cortex-decision");

  const macroRows = await fetchMarketQuotes(["SPY", "QQQ", "VIXY"], resolveProviderKeys(new URLSearchParams()));
  const regime = computeRegime(Array.isArray(macroRows) ? macroRows : []);

  const results = await screenTrendTemplate(SCAN_UNIVERSE);
  // Real per-symbol Cortex read (2026-08-13, explicit user follow-up to
  // "how accurate this setup" — logged alongside the existing A+ Score so
  // the same daily forward-return tracker below can start accumulating a
  // real track record for Cortex Verdict too, not just A+ Score. Same real
  // engines Cortex itself uses (computeSniperDecision, computeHeatRisk,
  // computeCortexVerdict, computeTechnicalScore) — not a re-derived guess.
  const scores = results
    .filter(r => !r.error && Number.isFinite(Number(r.price)) && Number(r.price) > 0)
    .map(r => {
      const aplus = computeAPlusScore(r, regime);
      const sniper = computeSniperDecision(r);
      const heat = computeHeatRisk(r, sniper);
      const verdict = computeCortexVerdict({ sniper, heat, aplusScore: aplus.score });
      return {
        symbol: r.symbol, score: aplus.score, price: Number(r.price),
        sniperAction: sniper.action, cortexVerdict: verdict.verdict,
        technicalScore: computeTechnicalScore(r, sniper),
      };
    });

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

// Real Cortex Verdict buckets (2026-08-13) — the 5 real states
// computeCortexVerdict returns (src/cortex-decision.js). Older snapshot
// entries (logged before this field existed) simply have no cortexVerdict
// key and are honestly skipped below, never guessed.
const CORTEX_VERDICT_BUCKETS = ["BUY ZONE", "WATCH", "WAIT", "OVEREXTENDED", "AVOID"];

// Shared core: fetches TODAY's real prices for every symbol logged in a
// historical snapshot (never a stale price), computes each one's real
// forward % move, buckets by whatever real dimension `keyOf` extracts
// (A+ Score band or Cortex Verdict), and reports real average return +
// real win rate per bucket. Returns null if there's no real snapshot old
// enough yet.
async function forwardReturnsCore(daysAgo, { bucketKeys, keyOf }) {
  const days = loadHistory();
  const snap = snapshotDaysAgo(days, daysAgo);
  if (!snap || !snap.scores?.length) return null;

  const { fetchMarketQuotes } = require("./routes/market");
  const symbols = snap.scores.map(s => s.symbol);
  const currentRows = await fetchMarketQuotes(symbols, resolveProviderKeys(new URLSearchParams()));
  const priceNow = new Map((Array.isArray(currentRows) ? currentRows : [])
    .filter(r => Number.isFinite(Number(r.price)) && Number(r.price) > 0)
    .map(r => [r.symbol, Number(r.price)]));

  const buckets = {};
  bucketKeys.forEach(k => { buckets[k] = []; });
  for (const s of snap.scores) {
    const now = priceNow.get(s.symbol);
    if (!Number.isFinite(now) || !Number.isFinite(s.price) || s.price <= 0) continue;
    const key = keyOf(s);
    if (!(key in buckets)) continue; // honest skip — legacy entry or unknown bucket, never guessed
    const fwdPct = (now / s.price - 1) * 100;
    buckets[key].push(fwdPct);
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

async function forwardReturnsFor(daysAgo) {
  return forwardReturnsCore(daysAgo, { bucketKeys: ["80-100", "60-79", "40-59", "0-39"], keyOf: (s) => bucketOf(s.score) });
}

async function forwardReturnsForVerdict(daysAgo) {
  return forwardReturnsCore(daysAgo, { bucketKeys: CORTEX_VERDICT_BUCKETS, keyOf: (s) => s.cortexVerdict });
}

async function buildForwardReturnReport() {
  const horizons = [5, 10, 20, 60, 252]; // 252 = real ~1 trading year
  const results = {};
  const verdictResults = {};
  for (const h of horizons) {
    try { results[`d${h}`] = await forwardReturnsFor(h); }
    catch { results[`d${h}`] = null; }
    try { verdictResults[`d${h}`] = await forwardReturnsForVerdict(h); }
    catch { verdictResults[`d${h}`] = null; }
  }
  const days = loadHistory();
  // Real "since when does cortexVerdict exist" marker — separate from
  // trackingStartedAt (the A+ Score log's real start date) since Cortex
  // Verdict tracking began later (2026-08-13) on the same file. Honest:
  // a UI showing this should say "Cortex track record since X", not
  // reuse the older A+ Score start date.
  const verdictDays = days.filter(d => (d.scores || []).some(s => s.cortexVerdict != null));
  return {
    trackingStartedAt: days.length ? days[0].date : null,
    daysTracked: days.length,
    horizons: results,
    cortexVerdict: {
      trackingStartedAt: verdictDays.length ? verdictDays[0].date : null,
      daysTracked: verdictDays.length,
      horizons: verdictResults,
    },
  };
}

// Real weekly/monthly/yearly prediction rate for a given A+ Score, read
// from an already-built buildForwardReturnReport() result. Reuses
// institutional-scoring.js's own MIN_WIN_SAMPLE floor (not a new invented
// threshold) — a bucket below that real sample size honestly returns
// null rather than a rate nobody could trust yet. The brand-new d252
// (yearly) horizon returns null for every score until the forward log
// has actually run 252+ real trading days.
function getPredictionRates(score, report) {
  const { MIN_WIN_SAMPLE } = require("./institutional-scoring");
  const bucket = bucketOf(score);
  const rateFor = (h) => {
    const b = report?.horizons?.[h]?.buckets?.[bucket];
    if (!b || b.count < MIN_WIN_SAMPLE) return null;
    return { count: b.count, avgReturnPct: b.avgReturnPct, winRate: b.winRate };
  };
  return { weekly: rateFor("d5"), monthly: rateFor("d20"), yearly: rateFor("d252") };
}

module.exports = { logDailySnapshot, buildForwardReturnReport, forwardReturnsForVerdict, loadHistory, snapshotDaysAgo, bucketOf, etDateStr, getPredictionRates };
