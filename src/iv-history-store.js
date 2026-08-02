// src/iv-history-store.js — real daily ATM IV snapshot log. Options
// platform redesign Phase 5. Mirrors aplus-score-history.js's exact
// pattern: a pure FORWARD log (one entry per real trading day, never
// backfilled/reconstructed) so IV Rank/Percentile can only ever be
// computed from real accumulated history — a symbol with no real history
// yet honestly reports "building," never a guessed number.
const path = require("node:path");
const { ROOT } = require("./config");
const { writeJsonAtomic, readJsonSafe } = require("./atomic-write");

const STORE_PATH = path.join(ROOT, "data", "iv-history.json");
const MAX_DAYS = 260; // ~1 real trading year
const MIN_DAYS = 10;  // lowest honest sample floor before showing any real IV Rank/Percentile

const etDateStr = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

function loadHistory() {
  const data = readJsonSafe(STORE_PATH, { days: [] });
  return Array.isArray(data.days) ? data.days : [];
}
function saveHistory(days) { writeJsonAtomic(STORE_PATH, { days }); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Real ATM IV for one symbol — a deliberately lightweight, separate real
// fetch from the full options-chain route (routes/market.js's
// /api/market/options), which returns an entire chain (up to 250
// contracts) when this only needs one real number. Prefers Polygon
// (POLYGON_API_KEY, real per-contract IV); falls back to Yahoo's chain
// (no greeks, but IV is present even there) when no key is configured.
// Honest null — never a guessed IV — when neither real source has data
// for this symbol today.
async function fetchAtmIv(symbol) {
  const polyKey = process.env.POLYGON_API_KEY || "";
  if (polyKey) {
    try {
      const snapRes = await fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${polyKey}`);
      const snapJson = snapRes.ok ? await snapRes.json().catch(() => ({})) : {};
      const underlying = Number(snapJson?.ticker?.lastTrade?.p || snapJson?.ticker?.day?.c || snapJson?.ticker?.prevDay?.c || 0);
      if (underlying > 0) {
        const chainRes = await fetch(`https://api.polygon.io/v3/snapshot/options/${symbol}?limit=250&sort=expiration_date&apiKey=${polyKey}`);
        if (chainRes.ok) {
          const chainJson = await chainRes.json().catch(() => ({}));
          const results = chainJson?.results || [];
          const nearestExpiry = [...new Set(results.map((r) => r.details?.expiration_date).filter(Boolean))].sort()[0];
          const sameExpiry = results.filter((r) => r.details?.expiration_date === nearestExpiry);
          let best = null, bestDist = Infinity;
          for (const r of sameExpiry) {
            const strike = Number(r.details?.strike_price);
            const iv = Number(r.implied_volatility);
            if (!Number.isFinite(strike) || !Number.isFinite(iv) || iv <= 0) continue;
            const dist = Math.abs(strike - underlying);
            if (dist < bestDist) { bestDist = dist; best = iv; }
          }
          if (best != null) return Math.round(best * 100 * 100) / 100; // real IV as a %, 2dp
        }
      }
    } catch { /* fall through to Yahoo */ }
  }
  try {
    const { fetchYahooOptionsChain } = require("./providers/yahoo");
    const chain = await fetchYahooOptionsChain(symbol, null);
    const underlying = Number(chain?.underlying) || 0;
    const calls = chain?.calls || [];
    if (!underlying || !calls.length) return null;
    let best = null, bestDist = Infinity;
    for (const c of calls) {
      const iv = Number(c.iv);
      if (!Number.isFinite(iv) || iv <= 0) continue;
      const dist = Math.abs(Number(c.strike) - underlying);
      if (dist < bestDist) { bestDist = dist; best = iv; }
    }
    return best;
  } catch {
    return null;
  }
}

// Real, rate-limit-aware daily batch. Polygon's free tier is 5 req/min
// (same constraint Phase 2's GEX route already documented) and this job
// makes 2 real requests per symbol on that path, so it runs strictly
// sequential with a real ~13s gap between symbols when a Polygon key is
// configured — a full ~100-symbol run honestly takes ~20-40 minutes in
// the background, not a shortcut around the real rate limit. The Yahoo
// fallback path (no comparably strict documented limit) runs with light
// concurrency, matching the pattern screenTrendTemplate already uses for
// its own Yahoo-sourced batch scans.
async function logDailySnapshot(symbols) {
  const { SCAN_UNIVERSE } = require("./advisor-ai");
  const universe = symbols && symbols.length ? symbols : SCAN_UNIVERSE;
  const usingPolygon = !!process.env.POLYGON_API_KEY;
  const results = [];

  if (usingPolygon) {
    for (const sym of universe) {
      const iv = await fetchAtmIv(sym).catch(() => null);
      if (iv != null) results.push({ symbol: sym, iv });
      await sleep(13_000);
    }
  } else {
    const CONCURRENCY = 6;
    let i = 0;
    async function worker() {
      while (i < universe.length) {
        const sym = universe[i++];
        const iv = await fetchAtmIv(sym).catch(() => null);
        if (iv != null) results.push({ symbol: sym, iv });
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }

  const days = loadHistory();
  const today = etDateStr();
  const filtered = days.filter((d) => d.date !== today);
  filtered.push({ date: today, symbols: results });
  filtered.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  saveHistory(filtered.slice(-MAX_DAYS));
  return { date: today, count: results.length, usingPolygon };
}

// Real IV Rank/Percentile for one symbol off the real accumulated
// history — honest "building" state, never a guess, until at least
// MIN_DAYS real snapshots exist for this symbol. IV Rank = where
// `currentIv` sits between the real historical min/max (0-100). IV
// Percentile = % of real historical days with a lower IV than today.
function ivRankFor(symbol, currentIv) {
  const days = loadHistory();
  const series = [];
  for (const d of days) {
    const row = (d.symbols || []).find((s) => s.symbol === symbol);
    if (row && Number.isFinite(row.iv)) series.push(row.iv);
  }
  const iv = Number.isFinite(currentIv) ? currentIv : series[series.length - 1];
  if (!Number.isFinite(iv) || series.length < MIN_DAYS) {
    return {
      available: false, daysCollected: series.length, daysNeeded: MIN_DAYS,
      reason: `IV Rank building — ${series.length}/${MIN_DAYS} trading days collected`,
    };
  }
  const min = Math.min(...series), max = Math.max(...series);
  const rank = max > min ? Math.round(((iv - min) / (max - min)) * 100) : 50;
  const below = series.filter((v) => v < iv).length;
  const percentile = Math.round((below / series.length) * 100);
  return { available: true, rank: Math.max(0, Math.min(100, rank)), percentile, daysCollected: series.length };
}

module.exports = { logDailySnapshot, loadHistory, fetchAtmIv, ivRankFor, etDateStr };
