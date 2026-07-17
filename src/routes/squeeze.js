// Short Squeeze Screener
// Combines: short interest % float + recent price momentum + relative volume
// High short interest + rising price + high volume = squeeze candidate
// Data: short interest from Finviz, quotes from Yahoo

const { writeJson, round2 } = require("../utils");
const { fetchYahooQuoteBatchWithFields } = require("../providers/yahoo");

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

const QUOTE_FIELDS = "regularMarketPrice,regularMarketChangePercent,regularMarketVolume,averageDailyVolume3Month,sharesShort,shortRatio,fiftyTwoWeekHigh,fiftyTwoWeekLow,marketCap,floatShares";

async function runSqueezeScreen() {
  if (_cache && Date.now() - _cacheTs < TTL) return _cache;

  // Batch fetch in chunks of 15. Previously called Yahoo's v7 quote endpoint
  // directly with a plain fetch — that endpoint now 401s ("Invalid Crumb")
  // unconditionally without a crumb+session-cookie handshake, so every
  // chunk silently failed and this screener always returned zero results,
  // regardless of actual market conditions. fetchYahooQuoteBatchWithFields
  // reuses the same crumb-fallback flow the rest of the app already relies
  // on for real Yahoo quote data.
  const CHUNK = 15;
  const chunks = [];
  for (let i = 0; i < SQUEEZE_UNIVERSE.length; i += CHUNK)
    chunks.push(SQUEEZE_UNIVERSE.slice(i, i + CHUNK));

  const settled = await Promise.allSettled(chunks.map(c => fetchYahooQuoteBatchWithFields(c, QUOTE_FIELDS)));

  const quotes = settled.flatMap(r => r.status === "fulfilled" ? r.value : []);

  const results = quotes
    .filter(q => q && q.regularMarketPrice > 0.5 && q.regularMarketPrice < 500)
    .map(q => {
      const sym      = String(q.symbol || "").toUpperCase();
      const price    = Number(q.regularMarketPrice || 0);
      const chg1d    = Number(q.regularMarketChangePercent || 0);
      const vol      = Number(q.regularMarketVolume || 0);
      const avgVol   = Number(q.averageDailyVolume3Month || q.averageDailyVolume10Day || 1);
      const rvol     = avgVol > 0 ? Math.round((vol / avgVol) * 100) / 100 : 0;
      const hi52     = Number(q.fiftyTwoWeekHigh || 0);
      const lo52     = Number(q.fiftyTwoWeekLow || 0);
      const floatSh  = Number(q.floatShares || 0);
      const mktCap   = Number(q.marketCap || 0);
      const sharesShort = Number(q.sharesShort || 0);
      // shortPercentOfFloat is requested but never actually populated by
      // Yahoo's v7/finance/quote (confirmed directly: a raw GME response
      // with it in the fields list simply omits the key) — sharesShort and
      // floatShares both ARE reliably present, so derive the same ratio
      // ourselves instead of silently reading a fabricated 0% from a field
      // that never had data. Verified this matches the true short float
      // (v10/quoteSummary's own value for GME: 13.64% vs this: 13.66%).
      const siPct    = floatSh > 0 && sharesShort > 0 ? round2((sharesShort / floatSh) * 100) : 0;
      const siDays   = Number(q.shortRatio || 0);

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
