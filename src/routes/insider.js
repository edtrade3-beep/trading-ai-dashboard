// Insider Buy Screener — SEC Form 4 filings (free, no API key)
// Only shows PURCHASES (transaction code "P" in the non-derivative table),
// not sales, grants, option exercises, gifts, or tax withholding.
// Source: SEC EDGAR full-text search API (to list recent Form 4 filings)
// + individual Form 4 XML documents (to read each one's real transaction
// codes) — see the comment above listRecentForm4Filings() for why listing
// alone isn't enough.

const https  = require("https");
const { writeJson } = require("../utils");

let _cache = null, _cacheTs = 0;
const TTL = 60 * 60 * 1000; // 1 hour

// SEC requires a real contact string in the User-Agent for all automated
// access (https://www.sec.gov/os/accessing-edgar-data) — reusing the same
// one already used elsewhere in this file/app for SEC requests.
const SEC_UA = "DixieMotors Trading Platform contact@example.com";

// Scanned window: SEC files ~300 Form 4s/day, so 14 days is ~4,200 filings —
// far more than can be fetched+parsed respectfully within SEC's fair-access
// rate limit (10 req/s) inside one background refresh. 3 days (~900
// filings) is honestly what this can fully cover each hour-cached refresh;
// claiming "14 days" while secretly only scanning a fraction of it would
// just be a quieter version of the same silently-incomplete-data problem
// this rewrite exists to fix. The UI copy says "Last 3 days" to match.
const SCAN_DAYS = 3;
const MAX_FILINGS = 500;
const FETCH_CONCURRENCY = 4;

function httpsGetJson(hostname, path) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: "GET", headers: { "User-Agent": SEC_UA, "Accept": "application/json" } }, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("SEC timeout")); });
    req.end();
  });
}

function httpsGetText(hostname, path) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: "GET", headers: { "User-Agent": SEC_UA } }, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => resolve(d));
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("SEC timeout")); });
    req.end();
  });
}

// List recent Form 4 filings. Deliberately NO free-text query string —
// EDGAR's full-text search only indexes filings' rendered prose, and Form
// 4s are structured XML (issuer/reportingOwner/transactionCoding fields),
// not prose, so phrase-searching for a transaction code like "P" always
// returned zero hits (confirmed: forms=4 alone returns 10,000+ hits;
// adding the phrase "transaction code" collapses that to ~20; adding "P"
// on top of that returns exactly 0, every time, regardless of the actual
// date range). Listing filings by form type + date range works fine —
// only the code-level filtering needs to happen from the real documents,
// which fetchForm4Purchases() below does per filing.
async function listRecentForm4Filings() {
  const today = new Date();
  const start = new Date(today); start.setDate(start.getDate() - SCAN_DAYS);
  const fmt = d => d.toISOString().slice(0, 10);
  const startdt = fmt(start), enddt = fmt(today);

  const out = [];
  const pageSize = 100;
  for (let from = 0; out.length < MAX_FILINGS && from < 900; from += pageSize) {
    const path = `/LATEST/search-index?forms=4&dateRange=custom&startdt=${startdt}&enddt=${enddt}&from=${from}`;
    const data = await httpsGetJson("efts.sec.gov", path).catch(() => null);
    const hits = data?.hits?.hits || [];
    if (!hits.length) break;
    for (const h of hits) {
      const src = h._source || {};
      const [accessionRaw, filename] = String(h._id || "").split(":");
      if (!accessionRaw || !filename) continue;
      // The accession number's own prefix (before the first dash) is the
      // filer's CIK by EDGAR convention — more reliable than trusting
      // array order in _source.ciks, which isn't documented as guaranteed.
      const cik = accessionRaw.split("-")[0].replace(/^0+/, "") || "0";
      out.push({
        cik,
        accession: accessionRaw.replace(/-/g, ""),
        filename,
        fileDate: src.file_date || enddt,
      });
    }
    if (hits.length < pageSize) break; // last page
  }
  return out.slice(0, MAX_FILINGS);
}

// Fetch one Form 4 XML and return only genuine open-market PURCHASES
// (transactionCode "P" with a real per-share price) from its non-derivative
// transaction table. Grants/awards (A), option exercises (M), gifts (G),
// tax withholding (F), and sales (S) are all different codes and not the
// "bought with their own real money" signal this screener is for.
async function fetchForm4Purchases(entry) {
  const path = `/Archives/edgar/data/${entry.cik}/${entry.accession}/${entry.filename}`;
  const xml = await httpsGetText("www.sec.gov", path).catch(() => null);
  if (!xml) return [];

  const tag = (name, src) => (src.match(new RegExp(`<${name}>([^<]*)</${name}>`)) || [])[1] || "";
  const ticker = tag("issuerTradingSymbol", xml).trim().toUpperCase();
  if (!ticker) return [];
  const company = tag("issuerName", xml).trim();
  const ownerName = tag("rptOwnerName", xml).trim();
  const officerTitle = tag("officerTitle", xml).trim();
  const isDirector = /<isDirector>1<\/isDirector>/.test(xml);
  const isOfficer = /<isOfficer>1<\/isOfficer>/.test(xml);
  const isTenPct = /<isTenPercentOwner>1<\/isTenPercentOwner>/.test(xml);
  const role = officerTitle || (isDirector ? "Director" : isOfficer ? "Officer" : isTenPct ? "10% Owner" : "Insider");

  const results = [];
  const txBlocks = xml.match(/<nonDerivativeTransaction>[\s\S]*?<\/nonDerivativeTransaction>/g) || [];
  for (const block of txBlocks) {
    const code = tag("transactionCode", block);
    if (code !== "P") continue;
    const shares = Number(tag("value", (block.match(/<transactionShares>[\s\S]*?<\/transactionShares>/) || [""])[0]));
    const price = Number(tag("value", (block.match(/<transactionPricePerShare>[\s\S]*?<\/transactionPricePerShare>/) || [""])[0]));
    const txDate = tag("value", (block.match(/<transactionDate>[\s\S]*?<\/transactionDate>/) || [""])[0]) || entry.fileDate;
    if (!(shares > 0) || !(price > 0)) continue; // real open-market buys always have a real price
    results.push({
      ticker, company, owner: ownerName, role,
      shares, buyPrice: Math.round(price * 100) / 100,
      value: Math.round(shares * price),
      date: entry.fileDate, transactionDate: txDate,
    });
  }
  return results;
}

// Enrich with current Yahoo price data (same v8/finance/chart endpoint
// already used elsewhere in this app — not the v7/v10 endpoints that
// require Yahoo's crumb handshake).
function fetchPrice(sym) {
  return new Promise(resolve => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`;
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => {
        try {
          const meta = JSON.parse(d)?.chart?.result?.[0]?.meta || {};
          const price = meta.regularMarketPrice || 0;
          const prevClose = meta.previousClose || meta.chartPreviousClose || 0;
          // regularMarketChangePercent isn't reliably present on this
          // endpoint (confirmed: often missing even when price and
          // previousClose both are — e.g. a real TSM lookup returned
          // price $409.74, previousClose $436.96, a real -6.2% move, but
          // regularMarketChangePercent was null) — `|| 0` there would
          // silently show a fabricated "+0%" for a stock that actually
          // moved significantly. Compute it from the two fields that are
          // reliably present instead; null (not 0) when genuinely unknown.
          const chg = price > 0 && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : null;
          resolve({ price, chg });
        } catch { resolve({ price: 0, chg: null }); }
      });
    });
    req.on("error", () => resolve({ price: 0, chg: null }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ price: 0, chg: null }); });
  });
}

async function runInsiderScreen() {
  const entries = await listRecentForm4Filings();
  const purchases = [];
  for (let i = 0; i < entries.length; i += FETCH_CONCURRENCY) {
    const batch = entries.slice(i, i + FETCH_CONCURRENCY);
    const settled = await Promise.allSettled(batch.map(fetchForm4Purchases));
    for (const r of settled) if (r.status === "fulfilled") purchases.push(...r.value);
    // Small pause between batches — SEC's fair-access policy asks for no
    // more than ~10 requests/second; 4 concurrent + this pause keeps a
    // comfortable margin under that instead of bursting as fast as possible.
    if (i + FETCH_CONCURRENCY < entries.length) await new Promise(r => setTimeout(r, 150));
  }

  const byTicker = [...new Set(purchases.map(p => p.ticker))];
  const prices = new Map();
  for (let i = 0; i < byTicker.length; i += FETCH_CONCURRENCY) {
    const batch = byTicker.slice(i, i + FETCH_CONCURRENCY);
    const settled = await Promise.allSettled(batch.map(t => fetchPrice(t).then(q => [t, q])));
    for (const r of settled) if (r.status === "fulfilled") prices.set(r.value[0], r.value[1]);
  }

  return purchases
    .map(p => {
      const q = prices.get(p.ticker) || { price: 0, chg: null };
      return {
        ticker: p.ticker, company: p.company, owner: p.owner, role: p.role,
        shares: p.shares, buyPrice: p.buyPrice, value: p.value,
        date: p.date, transactionDate: p.transactionDate,
        price: Math.round((q.price || 0) * 100) / 100,
        chg: q.chg != null ? Math.round(q.chg * 100) / 100 : null,
      };
    })
    .filter(r => r.price > 0)
    .sort((a, b) => new Date(b.date) - new Date(a.date) || b.value - a.value)
    .slice(0, 40);
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
