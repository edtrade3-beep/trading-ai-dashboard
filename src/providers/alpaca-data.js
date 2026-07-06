// Free Alpaca market data (you already have the keys). Returns bars in the SAME
// shape as the Yahoo provider so it can transparently replace it. Equities only —
// crypto (BTC-USD) and indices (^VIX) are left to Yahoo via the caller's fallback.
const KEYS = () => ({
  id: process.env.ALPACA_KEY_ID || process.env.ALPACA_API_KEY_ID || "",
  secret: process.env.ALPACA_SECRET_KEY || process.env.ALPACA_API_SECRET_KEY || "",
});
const TF = {
  "1m": "1Min", "2m": "2Min", "5m": "5Min", "15m": "15Min", "30m": "30Min",
  "60m": "1Hour", "1h": "1Hour", "1d": "1Day", "1day": "1Day", "1wk": "1Week", "1w": "1Week",
};
const DAYS = { "1d": 4, "5d": 8, "1mo": 33, "3mo": 95, "6mo": 190, "1y": 375, "2y": 740, "3y": 1105, "5y": 1835 };
function startISO(range) {
  const days = DAYS[range] || 375;
  return new Date(Date.now() - days * 86400000).toISOString();
}

// Returns [{ time(ms), open, high, low, close, volume }] or null if unavailable.
async function fetchAlpacaBars(symbol, range, interval) {
  const { id, secret } = KEYS();
  if (!id || !secret) return null;
  if (/[-^=/]/.test(symbol)) return null;       // BTC-USD, ^VIX, futures — not equities
  const tf = TF[interval] || "1Day";
  const start = startISO(range);
  const headers = { "APCA-API-KEY-ID": id, "APCA-API-SECRET-KEY": secret };
  let bars = [], token = null, pages = 0;
  try {
    do {
      const url = `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars`
        + `?timeframe=${tf}&start=${encodeURIComponent(start)}&limit=10000&adjustment=all&feed=iex`
        + (token ? `&page_token=${encodeURIComponent(token)}` : "");
      const r = await fetch(url, { headers });
      if (!r.ok) return bars.length ? bars : null;
      const j = await r.json();
      for (const b of (j.bars || [])) bars.push({ time: new Date(b.t).getTime(), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v || 0 });
      token = j.next_page_token || null;
    } while (token && ++pages < 6);
    return bars.length ? bars : null;
  } catch { return bars.length ? bars : null; }
}

module.exports = { fetchAlpacaBars };
