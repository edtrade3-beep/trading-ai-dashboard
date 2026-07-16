// In-memory rolling price history per symbol, used to compute REAL 5-minute
// and 30-minute momentum (delta5m/delta30m). Every quote provider path in
// src/routes/market.js previously hardcoded these to 0 — nothing anywhere
// in the app ever actually computed them, despite the Watchlist table
// having dedicated "5M"/"30M" columns for exactly this, and the composite
// scanner score (axiom-live.jsx) weighting them as 2 of its 4 inputs.
//
// Filled opportunistically, not by a dedicated poller: every quote response
// that passes through applyMomentum() below contributes a timestamped
// sample for its symbol, and since the client already polls quotes every
// ~3 minutes during normal use, real history accumulates naturally within
// a few refresh cycles — no new fetch schedule, no new API cost.
//
// Honest limitation: right after a server restart (or for a symbol nobody
// has requested recently) there's no history yet, so delta5m/delta30m come
// back `null` — shown as "no data yet" by the frontend, not a fabricated 0
// that would look like real, flat price action.

const HISTORY_WINDOW_MS = 40 * 60 * 1000; // keep 40 min of samples per symbol
const history = new Map(); // symbol -> [{price, ts}], oldest first

function recordSample(symbol, price, ts) {
  if (!symbol || !Number.isFinite(price) || price <= 0) return;
  const key = String(symbol).toUpperCase();
  let arr = history.get(key);
  if (!arr) { arr = []; history.set(key, arr); }
  arr.push({ price, ts });
  const cutoff = ts - HISTORY_WINDOW_MS;
  while (arr.length && arr[0].ts < cutoff) arr.shift();
}

// Closest sample at-or-before targetTs, rejected if it's staler than
// toleranceMs past that target — the ~3-minute poll interval means an
// exact "5 minutes ago" sample essentially never exists, so this accepts
// the nearest real one within a reasonable window instead of demanding an
// exact timestamp match.
function closestBefore(arr, targetTs, toleranceMs) {
  let best = null;
  for (const s of arr) {
    if (s.ts <= targetTs && (!best || s.ts > best.ts)) best = s;
  }
  if (!best || targetTs - best.ts > toleranceMs) return null;
  return best;
}

function computeMomentum(symbol, currentPrice, now) {
  const arr = history.get(String(symbol).toUpperCase());
  if (!arr || !arr.length) return { delta5m: null, delta30m: null };
  const s5 = closestBefore(arr, now - 5 * 60000, 3 * 60000);
  const s30 = closestBefore(arr, now - 30 * 60000, 8 * 60000);
  return {
    delta5m: s5 ? Number((((currentPrice - s5.price) / s5.price) * 100).toFixed(3)) : null,
    delta30m: s30 ? Number((((currentPrice - s30.price) / s30.price) * 100).toFixed(3)) : null,
  };
}

// Computes momentum for each row from history BEFORE this call, then
// records the current price as a new sample. Order matters — recording
// first would make every row compare its price to itself (always 0).
function applyMomentum(rows) {
  const now = Date.now();
  return (rows || []).map((row) => {
    const price = Number(row?.price);
    if (!row || !row.symbol || !Number.isFinite(price) || price <= 0) return row;
    const { delta5m, delta30m } = computeMomentum(row.symbol, price, now);
    recordSample(row.symbol, price, now);
    return { ...row, delta5m, delta30m };
  });
}

module.exports = { applyMomentum, recordSample, computeMomentum };
