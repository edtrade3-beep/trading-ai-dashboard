// Compression Scanner — finds stocks coiling before a big move
// Signals: ATR shrinking + volume drying up + price near key level
// = spring loaded, about to break

const https  = require("https");
const { writeJson } = require("../utils");

let _cache = null, _cacheTs = 0;
const TTL = 20 * 60 * 1000; // 20 min

const UNIVERSE = [
  // Mega-cap tech
  "NVDA","TSLA","AAPL","META","AMZN","GOOGL","MSFT","AMD","NFLX","AVGO",
  // High-momentum
  "COIN","PLTR","MSTR","SMCI","HOOD","RBLX","UPST","AFRM","CRWD","PANW",
  "NET","SNOW","DKNG","PATH","AI","ZS","OKTA","GTLB","DDOG","MDB",
  // Small/Mid momentum
  "RIVN","SOFI","MARA","RIOT","BBAI","SOUN","IONQ","ACHR","ASTS","RKLB",
  "OKLO","SMR","NNE","HIMS","RXRX","RDDT","SNAP","PINS","ABNB","DASH",
  "UBER","LYFT","HOOD","OPEN","AFRM","SQ","PYPL","SHOP","SE","MELI",
  // Energy/Crypto
  "MARA","RIOT","CLSK","IREN","HUT","BTBT","IBIT","BITO",
  "VST","CEG","GEV","CCJ","NNE","OKLO","SMR",
  // ETFs
  "SPY","QQQ","IWM","XLK","XLE","XLF","XBI","ARKK","SOXL",
  // Biotech/Healthcare
  "MRNA","BNTX","HIMS","RXRX","NVAX","CRSP","BEAM","NTLA",
  // Other
  "GM","F","RIVN","LCID","NIO","XPEV","LI",
];

// Fetch 30 days of daily OHLCV via Yahoo v8
function fetchHistory(sym) {
  return new Promise(resolve => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=30d`;
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => {
        try {
          const j   = JSON.parse(d);
          const r   = j?.chart?.result?.[0];
          const ts  = r?.timestamp || [];
          const q   = r?.indicators?.quote?.[0] || {};
          const meta = r?.meta || {};
          const bars = ts.map((t, i) => ({
            t, o: q.open?.[i], h: q.high?.[i], l: q.low?.[i],
            c: q.close?.[i], v: q.volume?.[i],
          })).filter(b => b.c && b.v);
          resolve({ sym, bars, price: meta.regularMarketPrice || 0 });
        } catch { resolve({ sym, bars: [], price: 0 }); }
      });
    });
    req.on("error", () => resolve({ sym, bars: [], price: 0 }));
    req.setTimeout(7000, () => { req.destroy(); resolve({ sym, bars: [], price: 0 }); });
  });
}

function atr(bars, n) {
  if (bars.length < n + 1) return 0;
  let sum = 0;
  for (let i = bars.length - n; i < bars.length; i++) {
    const prev = bars[i - 1].c;
    const tr   = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - prev), Math.abs(bars[i].l - prev));
    sum += tr;
  }
  return sum / n;
}

function analyze(sym, bars, price) {
  if (bars.length < 15 || price <= 0) return null;

  // ATR compression: recent 5d vs prior 10d
  const atrRecent = atr(bars, 5);
  const atrPrior  = atr(bars.slice(0, bars.length - 5), 10);
  const atrRatio  = atrPrior > 0 ? atrRecent / atrPrior : 1;  // <1 = compressed

  // Volume compression: recent 3d avg vs 20d avg
  const recentVol  = bars.slice(-3).reduce((s, b) => s + b.v, 0) / 3;
  const historicVol= bars.slice(-20).reduce((s, b) => s + b.v, 0) / 20;
  const volRatio   = historicVol > 0 ? recentVol / historicVol : 1; // <1 = drying up

  // Price range compression: recent 5d range vs prior 10d range
  const recentRange  = Math.max(...bars.slice(-5).map(b => b.h)) - Math.min(...bars.slice(-5).map(b => b.l));
  const historicRange= Math.max(...bars.slice(-15).map(b => b.h)) - Math.min(...bars.slice(-15).map(b => b.l));
  const rangeRatio   = historicRange > 0 ? recentRange / historicRange : 1;

  // Key levels: 20d high and 20d low
  const high20  = Math.max(...bars.slice(-20).map(b => b.h));
  const low20   = Math.min(...bars.slice(-20).map(b => b.l));
  const nearHigh = price > 0 ? (high20 - price) / price * 100 : 100;  // % below 20d high
  const nearLow  = price > 0 ? (price - low20)  / price * 100 : 100;  // % above 20d low

  // Direction bias: last 3 closes trending up or down
  const last3    = bars.slice(-3).map(b => b.c);
  const trending = last3[2] > last3[1] && last3[1] > last3[0] ? "UP"
                 : last3[2] < last3[1] && last3[1] < last3[0] ? "DOWN" : "FLAT";

  // Squeeze Score (0-100):
  // ATR compressed  (0-30): ratio < 0.5 = 30, < 0.65 = 22, < 0.8 = 14, < 1 = 7
  // Volume drying   (0-25): ratio < 0.5 = 25, < 0.65 = 18, < 0.8 = 11, < 1 = 5
  // Range compressed(0-20): ratio < 0.4 = 20, < 0.6 = 13, < 0.8 = 7
  // Near 20d high   (0-25): within 2% = 25, 5% = 17, 10% = 9, 15% = 4
  let score = 0;
  score += atrRatio  < 0.50 ? 30 : atrRatio  < 0.65 ? 22 : atrRatio  < 0.80 ? 14 : atrRatio < 1.0 ? 7 : 0;
  score += volRatio  < 0.50 ? 25 : volRatio  < 0.65 ? 18 : volRatio  < 0.80 ? 11 : volRatio < 1.0 ? 5 : 0;
  score += rangeRatio< 0.40 ? 20 : rangeRatio< 0.60 ? 13 : rangeRatio< 0.80 ? 7  : 0;
  score += nearHigh  < 2    ? 25 : nearHigh  < 5    ? 17 : nearHigh  < 10   ? 9  : nearHigh < 15 ? 4 : 0;

  const grade = score >= 70 ? "🔥 PRIME" : score >= 50 ? "⚡ BUILDING" : score >= 30 ? "👀 WATCH" : "LOW";

  return {
    sym, price: Math.round(price * 100) / 100,
    score, grade,
    atrRatio:   Math.round(atrRatio   * 100) / 100,
    volRatio:   Math.round(volRatio   * 100) / 100,
    rangeRatio: Math.round(rangeRatio * 100) / 100,
    nearHigh:   Math.round(nearHigh   * 10)  / 10,
    high20:     Math.round(high20     * 100) / 100,
    low20:      Math.round(low20      * 100) / 100,
    trending,
  };
}

async function runCompression(symbols) {
  const syms = symbols && symbols.length ? symbols : UNIVERSE;
  // Deduplicate
  const uniq = [...new Set(syms)];
  // Fetch in batches of 10
  const results = [];
  for (let i = 0; i < uniq.length; i += 10) {
    const batch = await Promise.all(uniq.slice(i, i + 10).map(s => fetchHistory(s)));
    for (const { sym, bars, price } of batch) {
      const r = analyze(sym, bars, price);
      if (r && r.score >= 20) results.push(r); // lower threshold = more results
    }
  }
  return results.sort((a, b) => b.score - a.score);
}

async function handleCompression(req, res, requestUrl) {
  if (_cache && Date.now() - _cacheTs < TTL) {
    return writeJson(res, 200, { ok: true, results: _cache, updatedAt: new Date(_cacheTs).toISOString() });
  }
  try {
    // Merge: user watchlist + request symbols + default universe (deduplicated)
    const extra = requestUrl.searchParams.get("symbols");
    const extraSyms = extra ? extra.split(",").map(s => s.trim().toUpperCase()).filter(Boolean) : [];

    // Load user watchlist from settings
    let watchlistSyms = [];
    try {
      const { loadSettings } = require("../settings-store");
      const settings = loadSettings() || {};
      watchlistSyms = Array.isArray(settings.watchlistSymbols) ? settings.watchlistSymbols
        : Array.isArray(settings.watchlists?.[0]?.symbols) ? settings.watchlists[0].symbols : [];
    } catch {}

    // Merge all, deduplicate, cap at 80
    const allSyms = [...new Set([...extraSyms, ...watchlistSyms, ...UNIVERSE])].slice(0, 80);

    const results = await runCompression(allSyms);
    _cache = results; _cacheTs = Date.now();
    return writeJson(res, 200, { ok: true, results, total: allSyms.length, updatedAt: new Date(_cacheTs).toISOString() });
  } catch (e) {
    return writeJson(res, 200, { ok: false, results: [], error: e.message });
  }
}

module.exports = { handleCompression };
