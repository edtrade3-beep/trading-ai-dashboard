// Insider Buy Screener — SEC Form 4 filings (free, no API key)
// Only shows PURCHASES (not sales, not options exercises)
// Source: SEC EDGAR full-text search API

const https  = require("https");
const { writeJson } = require("../utils");

let _cache = null, _cacheTs = 0;
const TTL = 60 * 60 * 1000; // 1 hour

function secGet(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "efts.sec.gov",
      path,
      method: "GET",
      headers: {
        "User-Agent": "DixieMotors Trading Platform contact@example.com",
        "Accept": "application/json",
      },
    };
    const req = https.request(opts, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("SEC timeout")); });
    req.end();
  });
}

function secGet2(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "data.sec.gov",
      path,
      method: "GET",
      headers: {
        "User-Agent": "DixieMotors Trading Platform contact@example.com",
        "Accept": "application/json",
      },
    };
    const req = https.request(opts, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("SEC timeout")); });
    req.end();
  });
}

// Get recent Form 4 filings mentioning "P" (purchase) transaction code
async function fetchRecentInsiderBuys() {
  const today = new Date();
  const start = new Date(today); start.setDate(start.getDate() - 14); // last 14 days
  const fmt = d => d.toISOString().slice(0, 10);

  const path = `/LATEST/search-index?q=%22transaction+code%22+%22P%22&forms=4&dateRange=custom&startdt=${fmt(start)}&enddt=${fmt(today)}&hits.hits._source=period_of_report,display_names,file_date,period_of_report`;

  const data = await secGet(path);
  if (!data?.hits?.hits) return [];

  const seen = new Set();
  const buys = [];

  for (const hit of (data.hits.hits || []).slice(0, 40)) {
    const src  = hit._source || {};
    const name = String(src.display_names || "").trim();
    const date = String(src.file_date || src.period_of_report || "").slice(0, 10);
    const id   = hit._id || "";

    // Extract ticker from display_names (format: "COMPANY NAME (TICKER)")
    const tickerMatch = name.match(/\(([A-Z]{1,5})\)/);
    const ticker = tickerMatch ? tickerMatch[1] : null;
    if (!ticker || seen.has(ticker + date)) continue;
    seen.add(ticker + date);

    buys.push({ ticker, company: name.replace(/\s*\([^)]+\)$/, ""), date, id });
  }

  return buys.slice(0, 20);
}

// Enrich with Yahoo price data
function fetchPrice(sym) {
  return new Promise(resolve => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`;
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => {
        try {
          const meta = JSON.parse(d)?.chart?.result?.[0]?.meta || {};
          resolve({ price: meta.regularMarketPrice || 0, chg: meta.regularMarketChangePercent || 0 });
        } catch { resolve({ price: 0, chg: 0 }); }
      });
    });
    req.on("error", () => resolve({ price: 0, chg: 0 }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ price: 0, chg: 0 }); });
  });
}

async function runInsiderScreen() {
  const filings = await fetchRecentInsiderBuys();
  const enriched = await Promise.all(filings.map(async f => {
    const { price, chg } = await fetchPrice(f.ticker);
    return { ...f, price: Math.round(price * 100) / 100, chg: Math.round(chg * 100) / 100 };
  }));
  return enriched.filter(f => f.price > 0);
}

async function handleInsider(req, res) {
  if (_cache && Date.now() - _cacheTs < TTL) {
    return writeJson(res, 200, { ok: true, results: _cache, updatedAt: new Date(_cacheTs).toISOString() });
  }
  try {
    const results = await runInsiderScreen();
    _cache = results; _cacheTs = Date.now();
    return writeJson(res, 200, { ok: true, results, updatedAt: new Date(_cacheTs).toISOString() });
  } catch (e) {
    return writeJson(res, 200, { ok: false, results: [], error: e.message });
  }
}

module.exports = { handleInsider };
