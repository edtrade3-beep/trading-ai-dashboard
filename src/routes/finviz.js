const https   = require("https");
const { writeJson } = require("../utils");
const { fetchFinvizStats, fetchFinvizChartBuffer } = require("../providers/finviz");

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finviz.com/",
};

// ── News cache (2-min TTL) ───────────────────────────────────────────────────
let _newsCache = null, _newsCacheTs = 0;
const NEWS_TTL = 2 * 60 * 1000;

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: HEADERS }, res => {
      let d = ""; res.on("data", c => d += c); res.on("end", () => resolve(d));
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function parseFinvizNews(html) {
  const items = [];
  // Finviz news rows: <tr class="nn"> or <tr class="nw"> with <td class="nn-date"> and <td class="nn-tab-link">
  // Pattern: find all news table rows
  const rowRe = /class="nn[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const row = m[1];
    // Time
    const timeM = row.match(/class="nn-date"[^>]*>([\s\S]*?)<\/td>/i);
    const time  = timeM ? timeM[1].replace(/<[^>]+>/g,"").trim() : "";
    // Link + title
    const linkM = row.match(/href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkM) continue;
    const url   = linkM[1];
    const title = linkM[2].replace(/<[^>]+>/g,"").trim();
    if (!title || title.length < 10) continue;
    // Ticker (optional, in a separate <a> tag with nn-tab-link class)
    const tickM = row.match(/class="nn-tab-link"[^>]*>([\s\S]*?)<\/a>/gi);
    const tickers = tickM ? tickM.map(t => t.replace(/<[^>]+>/g,"").trim()).filter(Boolean) : [];
    // Source — often in a <span> or bold
    const srcM  = row.match(/<span[^>]*>([\s\S]*?)<\/span>/i);
    const src   = srcM ? srcM[1].replace(/<[^>]+>/g,"").trim() : "Finviz";
    items.push({ time, title, url, tickers, source: src || "Finviz" });
  }

  // Fallback: try <a> links with news pattern if above yields nothing
  if (items.length === 0) {
    const re2 = /href="(https?:\/\/[^"]+)"[^>]*class="[^"]*news[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let m2;
    while ((m2 = re2.exec(html)) !== null) {
      const title = m2[2].replace(/<[^>]+>/g,"").trim();
      if (title.length > 15) items.push({ time: "", title, url: m2[1], tickers: [], source: "Finviz" });
    }
  }
  return items;
}

async function handleFinviz(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;

  // GET /api/finviz/news?limit=30  — scrape finviz.com/news.ashx
  if (pathname === "/api/finviz/news") {
    const limit = Math.min(parseInt(searchParams.get("limit") || "30", 10), 60);
    const force = searchParams.get("refresh") === "1";
    if (!force && _newsCache && Date.now() - _newsCacheTs < NEWS_TTL) {
      return writeJson(res, 200, { ok: true, items: _newsCache.slice(0, limit), cached: true });
    }
    try {
      const html  = await fetchHtml("https://finviz.com/news.ashx");
      const items = parseFinvizNews(html);
      if (items.length > 0) { _newsCache = items; _newsCacheTs = Date.now(); }
      return writeJson(res, 200, { ok: true, items: (items.length ? items : (_newsCache || [])).slice(0, limit), cached: false });
    } catch (err) {
      // Return stale cache if available
      if (_newsCache) return writeJson(res, 200, { ok: true, items: _newsCache.slice(0, limit), cached: true, stale: true });
      return writeJson(res, 502, { ok: false, error: err.message });
    }
  }

  // GET /api/finviz/quote?symbol=AAPL
  if (pathname === "/api/finviz/quote") {
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) return writeJson(res, 400, { error: "symbol is required" });
    try {
      const data = await fetchFinvizStats(symbol);
      return writeJson(res, 200, data);
    } catch (err) {
      return writeJson(res, 502, { error: err.message });
    }
  }

  // GET /api/finviz/chart?symbol=AAPL&period=d   (period: d/w/m)
  if (pathname === "/api/finviz/chart") {
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    const period = searchParams.get("period") || "d";
    if (!symbol) return writeJson(res, 400, { error: "symbol is required" });
    try {
      const { buf, contentType } = await fetchFinvizChartBuffer(symbol, period);
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": buf.length,
        "Cache-Control": "public, max-age=180",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(buf);
    } catch (err) {
      return writeJson(res, 502, { error: err.message });
    }
    return;
  }

  return writeJson(res, 404, { error: "Unknown Finviz endpoint" });
}

module.exports = handleFinviz;
