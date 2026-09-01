// Gap Fill Tracker — finds open price gaps that haven't been filled yet
// Gaps fill ~70% of the time — high-probability price targets
// Looks at daily candles, finds significant gaps, checks if they're still open

const { writeJson } = require("../utils");

let _cache = null, _cacheTs = 0;
const TTL = 30 * 60 * 1000;

const UNIVERSE = [
  "SPY","QQQ","IWM","NVDA","TSLA","AAPL","META","AMZN","GOOGL","MSFT",
  "AMD","NFLX","COIN","PLTR","MSTR","SOFI","MARA","RIOT","HOOD","UPST",
  "AFRM","CRWD","NET","BBAI","SOUN","IONQ","ACHR","ASTS","RKLB","OKLO",
  "SMR","HIMS","SNAP","UBER","DASH","RDDT","RIVN","IBIT","GLD","SLV",
];

// Routed through the shared providers/yahoo.js fetchYahooBars +
// fetchYahooChartMeta (2026-08-31 audit fix #5) instead of a hand-rolled
// raw https.get, so this tracker gets the same real query1->query2
// fallback and full browser-like headers every other Yahoo consumer
// already has. Reshaped onto this file's own {date,o,h,l,c} bar shape so
// findGaps below needs zero changes.
async function fetchCandles(sym) {
  const { fetchYahooBars, fetchYahooChartMeta } = require("../providers/yahoo");
  try {
    const [yBars, meta] = await Promise.all([
      fetchYahooBars(sym, "60d", "1d"),
      fetchYahooChartMeta(sym),
    ]);
    const bars = yBars
      .map(b => ({ date: new Date(b.time).toISOString().slice(0, 10), o: b.open, h: b.high, l: b.low, c: b.close }))
      .filter(b => b.o && b.c);
    return { sym, bars, price: meta?.regularMarketPrice || 0 };
  } catch { return { sym, bars: [], price: 0 }; }
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
