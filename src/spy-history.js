"use strict";

// spy-history.js — real SPY daily close history, for computing real
// per-trade alpha (trade return vs. what SPY actually did over the exact
// same holding period). Explicit user request, 2026-08-13, following the
// professional-investor audit: "benchmark-relative performance... being
// up 12% means nothing if SPY was up 15%." Same real Yahoo full-history
// technique already proven in src/routes/seasonal-cycle.js (there for
// ^GSPC/seasonality; this is the real SPY ETF itself, the actual real
// benchmark a trader compares against — not substituted for convenience).

const { fetchJsonSafe } = require("./utils");

const CACHE_TTL_MS = 24 * 60 * 60_000; // 24h — only today's bar changes intraday
let _cache = null;
let _cacheTs = 0;

async function fetchSpyFullHistory() {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/SPY?period1=0&period2=${Math.floor(Date.now() / 1000)}&interval=1d`;
  const payload = await fetchJsonSafe(url);
  const result = payload?.chart?.result?.[0];
  const ts = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(ts) || !Array.isArray(closes)) return null;
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (!Number.isFinite(c) || c <= 0) continue;
    bars.push({ date: new Date(ts[i] * 1000), close: c });
  }
  bars.sort((a, b) => a.date - b.date);
  return bars.length ? bars : null;
}

async function getSpyHistoryCached() {
  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_TTL_MS) return _cache;
  const bars = await fetchSpyFullHistory().catch(() => null);
  if (bars) { _cache = bars; _cacheTs = now; }
  return _cache; // real stale cache beats no data if today's fetch fails
}

// Closest real SPY close AT OR BEFORE the given date — same "closest real
// entry, never guessed" convention aplus-score-history.js already uses.
// Returns null (never a guess) if the date is before SPY's real history
// or no real data is available.
function closeOnOrBefore(bars, date) {
  if (!bars || !bars.length) return null;
  const target = date instanceof Date ? date : new Date(date);
  let best = null;
  for (const b of bars) {
    if (b.date <= target) best = b;
    else break;
  }
  return best ? best.close : null;
}

// Real alpha for one closed trade: trade's own real % return vs. SPY's
// real % return over the exact same real open→close dates. Returns null
// (never fabricated) when any required real input is missing.
async function computeTradeAlpha(entry) {
  if (!entry || entry.status !== "closed" || entry.closePrice == null || entry.entry == null) return null;
  const openedAt = entry.openedAt ? new Date(entry.openedAt) : null;
  const closedAt = entry.closedAt ? new Date(entry.closedAt) : null;
  if (!openedAt || !closedAt || Number.isNaN(openedAt.getTime()) || Number.isNaN(closedAt.getTime())) return null;

  const bars = await getSpyHistoryCached();
  const spyOpen = closeOnOrBefore(bars, openedAt);
  const spyClose = closeOnOrBefore(bars, closedAt);
  if (spyOpen == null || spyClose == null) return null;

  const dir = entry.side === "SELL" ? -1 : 1;
  const tradeReturnPct = ((Number(entry.closePrice) - Number(entry.entry)) / Number(entry.entry)) * dir * 100;
  const spyReturnPct = (spyClose / spyOpen - 1) * 100;
  return {
    tradeReturnPct: Math.round(tradeReturnPct * 100) / 100,
    spyReturnPct: Math.round(spyReturnPct * 100) / 100,
    alphaPct: Math.round((tradeReturnPct - spyReturnPct) * 100) / 100,
    beatSpy: tradeReturnPct > spyReturnPct,
  };
}

// Real aggregate across every real closed trade with enough data to
// compute alpha — trades missing dates/prices are honestly excluded, not
// zero-filled.
async function computeJournalAlpha(entries) {
  const closed = (entries || []).filter((e) => e.status === "closed" && e.pnl != null);
  const withAlpha = [];
  for (const e of closed) {
    const a = await computeTradeAlpha(e);
    if (a) withAlpha.push({ id: e.id, ticker: e.ticker, style: e.style, closedAt: e.closedAt, ...a });
  }
  if (!withAlpha.length) {
    return { ok: true, tradesTotal: closed.length, tradesWithAlpha: 0, avgAlphaPct: null, beatSpyRate: null, trades: [] };
  }
  const avgAlpha = withAlpha.reduce((s, t) => s + t.alphaPct, 0) / withAlpha.length;
  const beatSpyRate = Math.round((withAlpha.filter((t) => t.beatSpy).length / withAlpha.length) * 100);
  return {
    ok: true,
    tradesTotal: closed.length,
    tradesWithAlpha: withAlpha.length,
    avgAlphaPct: Math.round(avgAlpha * 100) / 100,
    beatSpyRate,
    trades: withAlpha,
  };
}

module.exports = { getSpyHistoryCached, closeOnOrBefore, computeTradeAlpha, computeJournalAlpha };
