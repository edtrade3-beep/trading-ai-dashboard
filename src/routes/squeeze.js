// Short Squeeze Screener
// Combines: short interest % float + recent price momentum + relative volume
// High short interest + rising price + high volume = squeeze candidate
// Data: short interest from Finviz, quotes from Yahoo

const { fetchJsonSafe, withTimeout, writeJson } = require("../utils");

let _cache = null;
let _cacheTs = 0;
const TTL = 30 * 60 * 1000; // 30 min

const SQUEEZE_UNIVERSE = [
  "GME","AMC","BBBY","MEME","KOSS","EXPR","CLOV","WKHS","RIDE","NKLA",
  "MSTR","COIN","HOOD","SOFI","AFRM","UPST","OPEN","OFFERPAD","PSFE",
  "BBAI","SOUN","RGTI","IONQ","ACHR","ASTS","RKLB","OKLO","SMR","NNE",
  "NVAX","MRNA","BNTX","OCGN","AGEN","CPRX","HIMS","RXRX",
  "RIVN","LCID","GOEV","FSR","XPEV","NIO","MULN","FFIE",
  "MARA","RIOT","CLSK","IREN","HUT","BTBT","CIFR",
  "SPCE","ATER","PRTY","CANO","VINCO","BIOR","PETZ",
  "TSLA","NVDA","AMD","META","PLTR","SNOW","PATH","AI",
];

async function fetchYahooQuote(sym) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${sym}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume,averageDailyVolume3Month,shortPercentOfFloat,shortRatio,fiftyTwoWeekHigh,fiftyTwoWeekLow,marketCap,floatShares`;
  const d = await withTimeout(fetchJsonSafe(url), 6000, null);
  return d?.quoteResponse?.result?.[0] || null;
}

async function runSqueezeScreen() {
  if (_cache && Date.now() - _cacheTs < TTL) return _cache;

  // Batch fetch in chunks of 15
  const CHUNK = 15;
  const chunks = [];
  for (let i = 0; i < SQUEEZE_UNIVERSE.length; i += CHUNK)
    chunks.push(SQUEEZE_UNIVERSE.slice(i, i + CHUNK));

  const settled = await Promise.allSettled(chunks.map(c => {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${c.join(",")}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume,averageDailyVolume3Month,shortPercentOfFloat,shortRatio,fiftyTwoWeekHigh,fiftyTwoWeekLow,marketCap,floatShares`;
    return withTimeout(fetchJsonSafe(url), 8000, null);
  }));

  const quotes = settled.flatMap(r =>
    r.status === "fulfilled" ? (r.value?.quoteResponse?.result || []) : []
  );

  const results = quotes
    .filter(q => q && q.regularMarketPrice > 0.5 && q.regularMarketPrice < 500)
    .map(q => {
      const sym      = String(q.symbol || "").toUpperCase();
      const price    = Number(q.regularMarketPrice || 0);
      const chg1d    = Number(q.regularMarketChangePercent || 0);
      const vol      = Number(q.regularMarketVolume || 0);
      const avgVol   = Number(q.averageDailyVolume3Month || q.averageDailyVolume10Day || 1);
      const rvol     = avgVol > 0 ? Math.round((vol / avgVol) * 100) / 100 : 0;
      const siPct    = Number(q.shortPercentOfFloat || 0) * 100; // convert to %
      const siDays   = Number(q.shortRatio || 0);
      const hi52     = Number(q.fiftyTwoWeekHigh || 0);
      const lo52     = Number(q.fiftyTwoWeekLow || 0);
      const floatSh  = Number(q.floatShares || 0);
      const mktCap   = Number(q.marketCap || 0);

      // Distance from 52w high (lower = closer to squeeze ignition)
      const distFromHi = hi52 > 0 ? Math.round((hi52 - price) / hi52 * 100) : 100;

      // Squeeze Score (0-100):
      // Short Interest %: 0-30 (anything >30% float = very high)
      // Days to Cover: 0-20 (>7 days = hard to exit)
      // RVOL: 0-20 (high volume = squeeze starting)
      // Price momentum: 0-20 (positive = squeezing)
      // Distance from 52w high: 0-10 (closer = more pressure)
      let score = 0;
      score += Math.min(30, siPct > 30 ? 30 : siPct > 20 ? 22 : siPct > 10 ? 14 : siPct > 5 ? 7 : 0);
      score += Math.min(20, siDays > 10 ? 20 : siDays > 7 ? 15 : siDays > 5 ? 10 : siDays > 3 ? 5 : 0);
      score += Math.min(20, rvol > 5 ? 20 : rvol > 3 ? 15 : rvol > 2 ? 10 : rvol > 1.5 ? 5 : 0);
      score += Math.min(20, chg1d > 10 ? 20 : chg1d > 5 ? 15 : chg1d > 2 ? 10 : chg1d > 0 ? 5 : 0);
      score += Math.min(10, distFromHi < 5 ? 10 : distFromHi < 10 ? 7 : distFromHi < 20 ? 4 : 0);

      const grade =
        score >= 70 ? "🔥 HIGH"   :
        score >= 45 ? "⚡ MEDIUM" :
        score >= 25 ? "👀 WATCH"  : "LOW";

      return {
        sym, price, chg1d: Math.round(chg1d * 100) / 100,
        rvol, siPct: Math.round(siPct * 10) / 10,
        siDays: Math.round(siDays * 10) / 10,
        floatM: floatSh > 0 ? Math.round(floatSh / 1e6 * 10) / 10 : null,
        mktCapB: mktCap > 0 ? Math.round(mktCap / 1e9 * 100) / 100 : null,
        distFromHi, score, grade,
      };
    })
    .filter(r => r.siPct > 3 || r.rvol > 2) // only meaningful candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  _cache = results;
  _cacheTs = Date.now();
  return results;
}

async function handleSqueeze(req, res) {
  try {
    const results = await runSqueezeScreen();
    return writeJson(res, 200, { ok: true, results, updatedAt: new Date(_cacheTs).toISOString() });
  } catch (e) {
    return writeJson(res, 200, { ok: false, results: [], error: e.message });
  }
}

module.exports = { handleSqueeze };
