"use strict";
/**
 * fred.js
 * Real US 10Y Treasury yield (DGS10) — from FRED's public CSV endpoint.
 * No API key required, no paid tier, no rate limit concerns for a single
 * daily-updated series polled a few times per hour at most.
 *
 * FRED updates DGS10 once per business day; some dates come back blank
 * (holidays/pending revision) — the fetcher walks backward from the end
 * of the CSV to find the last two real (non-blank) observations rather
 * than trusting the final row.
 */

const CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10&cosd=";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // FRED updates ~once/day; 6h is plenty fresh

let cache = null; // { value, prevValue, changePct, date, fetchedAt }

function startDate(daysBack) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

function parseCsv(csv) {
  const rows = csv.trim().split("\n").slice(1) // drop header
    .map(line => {
      const [date, raw] = line.split(",");
      const value = Number(raw);
      return { date, value: Number.isFinite(value) ? value : null };
    })
    .filter(r => r.date);
  const real = rows.filter(r => r.value !== null);
  if (real.length === 0) throw new Error("No real DGS10 observations in CSV");
  const latest = real[real.length - 1];
  const prev = real.length > 1 ? real[real.length - 2] : null;
  return { latest, prev };
}

async function fetchUS10Y() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache;

  const res = await fetch(CSV_URL + startDate(30), {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);
  const csv = await res.text();
  const { latest, prev } = parseCsv(csv);

  const changePct = prev ? Number((((latest.value - prev.value) / prev.value) * 100).toFixed(2)) : null;
  cache = {
    value: latest.value,
    prevValue: prev ? prev.value : null,
    changePct,
    date: latest.date,
    fetchedAt: Date.now(),
  };
  return cache;
}

module.exports = { fetchUS10Y };
