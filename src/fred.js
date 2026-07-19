"use strict";
/**
 * fred.js
 * Real macro series from FRED's public CSV endpoint — no API key, no paid
 * tier, no rate limit concerns for a handful of daily-updated series
 * polled a few times per hour at most.
 *
 * FRED updates most of these once per business day; some dates come back
 * blank (holidays/pending revision) — the fetcher walks backward from the
 * end of the CSV to find the last two real (non-blank) observations
 * rather than trusting the final row.
 */

const SERIES = {
  US10Y:    "DGS10",
  US2Y:     "DGS2",
  BRENT_OIL: "DCOILBRENTEU",
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // these update ~once/day; 6h is plenty fresh

const caches = {}; // seriesId -> { value, prevValue, changePct, date, fetchedAt }

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
  return { latest, prev };
}

async function fetchFredSeries(seriesId) {
  const cached = caches[seriesId];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;

  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}&cosd=${startDate(30)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`FRED HTTP ${res.status} for ${seriesId}`);
  const csv = await res.text();
  const { latest, prev } = parseCsv(csv, seriesId);

  const changePct = prev ? Number((((latest.value - prev.value) / prev.value) * 100).toFixed(2)) : null;
  const result = {
    value: latest.value,
    prevValue: prev ? prev.value : null,
    changePct,
    date: latest.date,
    fetchedAt: Date.now(),
  };
  caches[seriesId] = result;
  return result;
}

const fetchUS10Y    = () => fetchFredSeries(SERIES.US10Y);
const fetchUS2Y     = () => fetchFredSeries(SERIES.US2Y);
const fetchBrentOil = () => fetchFredSeries(SERIES.BRENT_OIL);

module.exports = { fetchFredSeries, fetchUS10Y, fetchUS2Y, fetchBrentOil };
