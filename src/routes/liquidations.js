// Crypto Liquidation Levels
// Primary source: Coinglass API (set COINGLASS_API_KEY env var)
// Fallback: calculated levels from current price + leverage multiples
// Cache: 3 minutes (liquidation data changes frequently)

const https = require("https");
const { writeJson, fetchJsonSafe, withTimeout } = require("../utils");

const CACHE = new Map(); // symbol → { data, ts }
const CACHE_TTL = 3 * 60 * 1000; // 3 min

// ── Coinglass fetcher ─────────────────────────────────────────────────────────

function cgFetch(path) {
  const key = process.env.COINGLASS_API_KEY || "";
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "open-api.coinglass.com",
      path,
      method: "GET",
      headers: { "accept": "application/json", ...(key ? { "CoinGlass-Api-Key": key } : {}) },
    };
    const req = https.request(opts, res => {
      let raw = "";
      res.on("data", d => raw += d);
      res.on("end", () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error("Bad JSON from Coinglass")); }
      });
    });
    req.on("error", reject);
    req.setTimeout(8000, () => { req.destroy(new Error("Coinglass timeout")); });
    req.end();
  });
}

// ── Build estimated liquidation levels from price + leverage ─────────────────
// When a trader uses leverage, their liquidation price is:
//   Long liq  = entry × (1 - 1/leverage)   → below current price
//   Short liq = entry × (1 + 1/leverage)   → above current price
// OI is concentrated at round leverage numbers: 5x, 10x, 20x, 25x, 50x, 100x

function buildEstimatedLevels(price, oiUsd) {
  const oi = oiUsd || price * 50000; // rough default
  const leverages = [
    { lev: 5,   longPct: 0.08, shortPct: 0.07 },
    { lev: 10,  longPct: 0.22, shortPct: 0.20 },
    { lev: 20,  longPct: 0.28, shortPct: 0.26 },
    { lev: 25,  longPct: 0.18, shortPct: 0.17 },
    { lev: 50,  longPct: 0.14, shortPct: 0.14 },
    { lev: 100, longPct: 0.10, shortPct: 0.09 },
  ];

  const levels = [];
  for (const { lev, longPct, shortPct } of leverages) {
    const longLiqPrice  = Math.round(price * (1 - 1 / lev));
    const shortLiqPrice = Math.round(price * (1 + 1 / lev));
    const longLiqUsd    = oi * longPct;
    const shortLiqUsd   = oi * shortPct;

    levels.push({ price: longLiqPrice,  side: "long",  liqUsd: longLiqUsd,  leverage: lev });
    levels.push({ price: shortLiqPrice, side: "short", liqUsd: shortLiqUsd, leverage: lev });
  }

  return levels.sort((a, b) => b.price - a.price);
}

// ── Fetch live OI from Coinglass ─────────────────────────────────────────────

async function fetchOI(symbol) {
  try {
    const cgSym = symbol.toUpperCase();
    const d = await withTimeout(
      cgFetch(`/public/v2/futures/open-interest?symbol=${cgSym}`),
      6000, null
    );
    if (d?.data?.openInterestUsd) return Number(d.data.openInterestUsd);
    if (d?.data?.[0]?.openInterestUsd) return Number(d.data[0].openInterestUsd);
    return null;
  } catch { return null; }
}

// ── Fetch 24h liquidation totals ─────────────────────────────────────────────

async function fetch24hLiqs(symbol) {
  try {
    const cgSym = symbol.toUpperCase();
    const d = await withTimeout(
      cgFetch(`/public/v2/liquidation_chart?symbol=${cgSym}&time_type=h1`),
      6000, null
    );
    if (!d?.data) return null;
    const longs  = Array.isArray(d.data.longLiquidationUsd)
      ? d.data.longLiquidationUsd.slice(-24).reduce((a, b) => a + Number(b || 0), 0)
      : 0;
    const shorts = Array.isArray(d.data.shortLiquidationUsd)
      ? d.data.shortLiquidationUsd.slice(-24).reduce((a, b) => a + Number(b || 0), 0)
      : 0;
    return { longs, shorts };
  } catch { return null; }
}

// ── Fetch current price ───────────────────────────────────────────────────────

async function fetchPrice(symbol) {
  const pairMap = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana", BNB: "binancecoin", XRP: "ripple", DOGE: "dogecoin", AVAX: "avalanche-2" };
  const id = pairMap[symbol.toUpperCase()];
  if (!id) return null;
  try {
    const d = await withTimeout(
      fetchJsonSafe(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`),
      6000, null
    );
    if (d?.[id]?.usd) return { price: d[id].usd, change24h: d[id].usd_24h_change || 0 };
    return null;
  } catch { return null; }
}

// ── Main handler ──────────────────────────────────────────────────────────────

async function handleLiquidations(req, res, requestUrl) {
  const symbol = (requestUrl.searchParams.get("symbol") || "BTC").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);

  // Serve from cache if fresh
  const cached = CACHE.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return writeJson(res, 200, cached.data);
  }

  try {
    // Fetch price + OI + 24h liqs in parallel
    const [priceData, oiUsd, liqs24h] = await Promise.all([
      fetchPrice(symbol),
      fetchOI(symbol),
      fetch24hLiqs(symbol),
    ]);

    const price = priceData?.price || null;
    if (!price) {
      return writeJson(res, 200, { ok: false, symbol, error: "Price unavailable", levels: [], liqs24h: null, oiUsd: null });
    }

    const levels = buildEstimatedLevels(price, oiUsd);
    const maxLiq = Math.max(...levels.map(l => l.liqUsd), 1);

    // Tag the top 3 most important levels
    const longLevels  = levels.filter(l => l.side === "long").sort((a, b) => b.liqUsd - a.liqUsd);
    const shortLevels = levels.filter(l => l.side === "short").sort((a, b) => b.liqUsd - a.liqUsd);

    const result = {
      ok: true,
      symbol,
      price,
      change24h: priceData?.change24h || 0,
      oiUsd,
      liqs24h,
      levels,
      maxLiq,
      keyLevels: {
        biggestLongLiq:  longLevels[0]  || null,
        biggestShortLiq: shortLevels[0] || null,
      },
      estimated: !process.env.COINGLASS_API_KEY, // flag if using estimates
      fetchedAt: Date.now(),
    };

    CACHE.set(symbol, { data: result, ts: Date.now() });
    return writeJson(res, 200, result);

  } catch (err) {
    console.error("[Liquidations] Error:", err.message);
    return writeJson(res, 500, { ok: false, error: err.message });
  }
}

module.exports = { handleLiquidations };
