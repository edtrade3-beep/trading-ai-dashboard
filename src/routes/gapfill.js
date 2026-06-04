// Gap Fill Tracker — finds open price gaps that haven't been filled yet
// Gaps fill ~70% of the time — high-probability price targets
// Looks at daily candles, finds significant gaps, checks if they're still open

const https  = require("https");
const { writeJson } = require("../utils");

let _cache = null, _cacheTs = 0;
const TTL = 30 * 60 * 1000;

const UNIVERSE = [
  "SPY","QQQ","IWM","NVDA","TSLA","AAPL","META","AMZN","GOOGL","MSFT",
  "AMD","NFLX","COIN","PLTR","MSTR","SOFI","MARA","RIOT","HOOD","UPST",
  "AFRM","CRWD","NET","BBAI","SOUN","IONQ","ACHR","ASTS","RKLB","OKLO",
  "SMR","HIMS","SNAP","UBER","DASH","RDDT","RIVN","IBIT","GLD","SLV",
];

function fetchCandles(sym) {
  return new Promise(resolve => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=60d`;
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => {
        try {
          const j = JSON.parse(d);
          const r = j?.chart?.result?.[0];
          const ts = r?.timestamp || [];
          const q  = r?.indicators?.quote?.[0] || {};
          const meta = r?.meta || {};
          const bars = ts.map((t, i) => ({
            date: new Date(t * 1000).toISOString().slice(0, 10),
            o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i],
          })).filter(b => b.o && b.c);
          resolve({ sym, bars, price: meta.regularMarketPrice || 0 });
        } catch { resolve({ sym, bars: [], price: 0 }); }
      });
    });
    req.on("error", () => resolve({ sym, bars: [], price: 0 }));
    req.setTimeout(7000, () => { req.destroy(); resolve({ sym, bars: [], price: 0 }); });
  });
}

function findGaps(sym, bars, currentPrice) {
  if (bars.length < 5 || currentPrice <= 0) return [];
  const gaps = [];

  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1];
    const curr = bars[i];
    if (!prev.h || !prev.l || !curr.o || !prev.c) continue;

    // Gap Up: today's open > yesterday's high
    if (curr.o > prev.h * 1.005) {
      const gapTop    = curr.o;
      const gapBottom = prev.h;
      const gapPct    = ((gapTop - gapBottom) / gapBottom * 100);
      if (gapPct < 0.5) continue; // ignore tiny gaps

      // Is gap still open? Current price must be above gapBottom (not filled)
      const filled = currentPrice <= gapBottom * 1.001;
      if (!filled) {
        gaps.push({
          sym, type: "UP", date: curr.date,
          gapTop: Math.round(gapTop * 100) / 100,
          gapBottom: Math.round(gapBottom * 100) / 100,
          fillTarget: Math.round(gapBottom * 100) / 100,
          gapPct: Math.round(gapPct * 10) / 10,
          distToFill: Math.round((currentPrice - gapBottom) / currentPrice * 100 * 10) / 10,
          daysOpen: Math.round((Date.now() - new Date(curr.date)) / 86400000),
          currentPrice: Math.round(currentPrice * 100) / 100,
        });
      }
    }

    // Gap Down: today's open < yesterday's low
    if (curr.o < prev.l * 0.995) {
      const gapTop    = prev.l;
      const gapBottom = curr.o;
      const gapPct    = ((gapTop - gapBottom) / gapTop * 100);
      if (gapPct < 0.5) continue;

      // Is gap still open? Current price must be below gapTop (not filled)
      const filled = currentPrice >= gapTop * 0.999;
      if (!filled) {
        gaps.push({
          sym, type: "DOWN", date: curr.date,
          gapTop: Math.round(gapTop * 100) / 100,
          gapBottom: Math.round(gapBottom * 100) / 100,
          fillTarget: Math.round(gapTop * 100) / 100,
          gapPct: Math.round(gapPct * 10) / 10,
          distToFill: Math.round((gapTop - currentPrice) / currentPrice * 100 * 10) / 10,
          daysOpen: Math.round((Date.now() - new Date(curr.date)) / 86400000),
          currentPrice: Math.round(currentPrice * 100) / 100,
        });
      }
    }
  }

  // Return biggest gap per stock only (most significant)
  return gaps.sort((a, b) => b.gapPct - a.gapPct).slice(0, 2);
}

async function runGapFillScan(symbols) {
  const syms = symbols || UNIVERSE;
  const allGaps = [];

  // Batch of 5
  for (let i = 0; i < syms.length; i += 5) {
    const batch = await Promise.all(syms.slice(i, i + 5).map(fetchCandles));
    for (const { sym, bars, price } of batch) {
      const gaps = findGaps(sym, bars, price);
      allGaps.push(...gaps);
    }
  }

  return allGaps
    .sort((a, b) => {
      // Priority: closer to fill + bigger gap
      const scoreA = (100 - a.distToFill) + a.gapPct;
      const scoreB = (100 - b.distToFill) + b.gapPct;
      return scoreB - scoreA;
    })
    .slice(0, 25);
}

async function handleGapFill(req, res, requestUrl) {
  if (_cache && Date.now() - _cacheTs < TTL) {
    return writeJson(res, 200, { ok: true, gaps: _cache, updatedAt: new Date(_cacheTs).toISOString() });
  }
  try {
    const wl = requestUrl.searchParams.get("symbols");
    const symbols = wl ? wl.split(",").map(s => s.trim().toUpperCase()) : null;
    const gaps = await runGapFillScan(symbols);
    _cache = gaps; _cacheTs = Date.now();
    return writeJson(res, 200, { ok: true, gaps, updatedAt: new Date(_cacheTs).toISOString() });
  } catch (e) {
    return writeJson(res, 200, { ok: false, gaps: [], error: e.message });
  }
}

module.exports = { handleGapFill };
