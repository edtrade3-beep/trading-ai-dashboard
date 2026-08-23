"use strict";
/**
 * fred.js
 * Real macro series from FRED's public CSV endpoint — no API key, no paid
 * tier, no rate limit concerns for a handful of daily/weekly/monthly-
 * updated series polled a few times per hour at most.
 *
 * FRED updates most of these once per business day; some dates come back
 * blank (holidays/pending revision) — the fetcher walks backward from the
 * end of the CSV to find the last two real (non-blank) observations
 * rather than trusting the final row.
 *
 * Extended (Institutional Intelligence Phase 1, 2026-08-23) for the real
 * Macro Regime Engine (macro-engine.js): monthly series (CPI/PCE/
 * unemployment) need real year-over-year context, not just the prior
 * reading, so the 30-day CSV window this file started with isn't enough
 * history for them — startDays/yoy are now per-call options rather than a
 * hardcoded 30. Existing callers (fetchUS10Y/fetchUS2Y/fetchBrentOil) are
 * unchanged — same 30-day window, same return shape, zero risk to
 * MacroStatusStrip.jsx's existing real consumption of them.
 */

const SERIES = {
  US10Y:    "DGS10",
  US2Y:     "DGS2",
  BRENT_OIL: "DCOILBRENTEU",
  US30Y:    "DGS30",
  REAL_YIELD_10Y: "DFII10",
  YIELD_CURVE: "T10Y2Y",
  FED_FUNDS: "DFF",
  CPI: "CPIAUCSL",
  CORE_CPI: "CPILFESL",
  PCE: "PCEPI",
  CORE_PCE: "PCEPILFE",
  UNEMPLOYMENT: "UNRATE",
  JOBLESS_CLAIMS: "ICSA",
  HY_SPREAD: "BAMLH0A0HYM2",
  IG_SPREAD: "BAMLC0A0CM",
  LENDING_STANDARDS: "DRTSCILM",
  FED_BALANCE_SHEET: "WALCL",
  TGA_BALANCE: "WTREGEN",
  REVERSE_REPO: "RRPONTSYD",
  PAYROLLS: "PAYEMS",
  WAGES: "CES0500000003",
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // these update ~once/day; 6h is plenty fresh

const caches = {}; // cacheKey (seriesId+opts) -> { value, prevValue, changePct, yoyChangePct, date, fetchedAt }

function startDate(daysBack) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

function parseCsv(csv, seriesId) {
  const rows = csv.trim().split("\n").slice(1) // drop header
    .map(line => {
      const [date, raw] = line.split(",");
      const value = Number(raw);
      return { date, value: Number.isFinite(value) ? value : null };
    })
    .filter(r => r.date);
  const real = rows.filter(r => r.value !== null);
  if (real.length === 0) throw new Error(`No real ${seriesId} observations in CSV`);
  const latest = real[real.length - 1];
  const prev = real.length > 1 ? real[real.length - 2] : null;
  return { real, latest, prev };
}

// Real observation closest to 365 days before `latest.date`, off the same
// already-fetched CSV rows — no second request. Honest null (never a
// fabricated estimate) when there isn't yet a full year of real history.
function findYoyObservation(real, latestDate) {
  const target = new Date(latestDate);
  target.setDate(target.getDate() - 365);
  let best = null, bestDiff = Infinity;
  for (const r of real) {
    const diff = Math.abs(new Date(r.date).getTime() - target.getTime());
    if (diff < bestDiff) { bestDiff = diff; best = r; }
  }
  // Require the match to be within ~45 days of the real 365-day mark —
  // otherwise it's not a genuine YoY comparison, just the oldest row we have.
  return best && bestDiff <= 45 * 86_400_000 ? best : null;
}

async function fetchFredSeries(seriesId, opts = {}) {
  const startDays = opts.startDays || 30;
  const yoy = !!opts.yoy;
  const cacheKey = `${seriesId}:${startDays}:${yoy}`;
  const cached = caches[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;

  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}&cosd=${startDate(startDays)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`FRED HTTP ${res.status} for ${seriesId}`);
  const csv = await res.text();
  const { real, latest, prev } = parseCsv(csv, seriesId);

  const changePct = prev ? Number((((latest.value - prev.value) / prev.value) * 100).toFixed(2)) : null;
  const yoyObs = yoy ? findYoyObservation(real, latest.date) : null;
  const yoyChangePct = yoyObs ? Number((((latest.value - yoyObs.value) / yoyObs.value) * 100).toFixed(2)) : null;
  // Real trend over the FULL fetched window (oldest real observation vs
  // latest) — distinct from changePct's single-step day-over-day diff.
  // Matters for staircase series like Fed funds (DFF): the rate barely
  // moves day-to-day except right at an FOMC decision, so changePct is
  // "flat" almost always even during an active hiking/cutting cycle;
  // windowChangePct (e.g. over a real 90-day fetch window) actually
  // reflects the real recent policy direction.
  const first = real[0];
  const windowChangePct = (first && first !== latest && first.value)
    ? Number((((latest.value - first.value) / first.value) * 100).toFixed(2)) : null;
  const result = {
    value: latest.value,
    prevValue: prev ? prev.value : null,
    changePct,
    yoyChangePct,
    windowChangePct,
    windowStartValue: first ? first.value : null,
    windowStartDate: first ? first.date : null,
    date: latest.date,
    fetchedAt: Date.now(),
  };
  caches[cacheKey] = result;
  return result;
}

const fetchUS10Y    = () => fetchFredSeries(SERIES.US10Y);
const fetchUS2Y     = () => fetchFredSeries(SERIES.US2Y);
const fetchBrentOil = () => fetchFredSeries(SERIES.BRENT_OIL);
const fetchUS30Y        = () => fetchFredSeries(SERIES.US30Y);
const fetchRealYield10Y = () => fetchFredSeries(SERIES.REAL_YIELD_10Y);
const fetchYieldCurve   = () => fetchFredSeries(SERIES.YIELD_CURVE);
const fetchFedFunds     = () => fetchFredSeries(SERIES.FED_FUNDS, { startDays: 90 });
const fetchCPI          = () => fetchFredSeries(SERIES.CPI, { startDays: 400, yoy: true });
const fetchCoreCPI      = () => fetchFredSeries(SERIES.CORE_CPI, { startDays: 400, yoy: true });
const fetchPCE          = () => fetchFredSeries(SERIES.PCE, { startDays: 400, yoy: true });
const fetchCorePCE      = () => fetchFredSeries(SERIES.CORE_PCE, { startDays: 400, yoy: true });
const fetchUnemployment = () => fetchFredSeries(SERIES.UNEMPLOYMENT, { startDays: 400 });
const fetchJoblessClaims = () => fetchFredSeries(SERIES.JOBLESS_CLAIMS, { startDays: 60 });
// Institutional Intelligence Phase 2 (2026-08-23) — real credit series for
// treasury-credit-engine.js. startDays: 35 (not the 30-day default) gives
// a genuine ~30-day windowChangePct even across a weekend/holiday gap in
// the underlying daily series, matching the real "30D Change" read the
// user's own spec mocked up.
const fetchHySpread         = () => fetchFredSeries(SERIES.HY_SPREAD, { startDays: 35 });
const fetchIgSpread         = () => fetchFredSeries(SERIES.IG_SPREAD, { startDays: 35 });
const fetchLendingStandards = () => fetchFredSeries(SERIES.LENDING_STANDARDS, { startDays: 400 });
// Institutional Intelligence Phase 3 (2026-08-23) — real liquidity +
// employment series for liquidity-employment-engine.js. WALCL/WTREGEN are
// weekly (45d window = several real observations for a genuine trend);
// PAYEMS/CES0500000003 are monthly (100d/400d respectively, the latter
// for a real YoY wage read).
const fetchFedBalanceSheet = () => fetchFredSeries(SERIES.FED_BALANCE_SHEET, { startDays: 45 });
const fetchTgaBalance      = () => fetchFredSeries(SERIES.TGA_BALANCE, { startDays: 45 });
const fetchReverseRepo     = () => fetchFredSeries(SERIES.REVERSE_REPO, { startDays: 35 });
const fetchPayrolls        = () => fetchFredSeries(SERIES.PAYROLLS, { startDays: 100 });
const fetchWages           = () => fetchFredSeries(SERIES.WAGES, { startDays: 400, yoy: true });

module.exports = {
  fetchFredSeries, fetchUS10Y, fetchUS2Y, fetchBrentOil,
  fetchUS30Y, fetchRealYield10Y, fetchYieldCurve, fetchFedFunds,
  fetchCPI, fetchCoreCPI, fetchPCE, fetchCorePCE, fetchUnemployment, fetchJoblessClaims,
  fetchHySpread, fetchIgSpread, fetchLendingStandards,
  fetchFedBalanceSheet, fetchTgaBalance, fetchReverseRepo, fetchPayrolls, fetchWages,
};
