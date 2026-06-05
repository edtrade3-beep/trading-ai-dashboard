const https   = require("https");
const { writeJson } = require("../utils");
const { fetchFinvizStats, fetchFinvizChartBuffer } = require("../providers/finviz");

// ── News cache (3-min TTL) ───────────────────────────────────────────────────
let _newsCache = null, _newsCacheTs = 0;
const NEWS_TTL = 3 * 60 * 1000;

// Multiple RSS feeds — tried in order until one works
const NEWS_FEEDS = [
  { url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC,^NDX,^DJI&region=US&lang=en-US", source: "Yahoo Finance" },
  { url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=SPY,QQQ,AAPL,NVDA,TSLA,MSFT,META,AMZN&region=US&lang=en-US", source: "Yahoo Finance" },
  { url: "https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best", source: "Reuters" },
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/", source: "MarketWatch" },
];

function fetchRss(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/rss+xml,text/xml,*/*" }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchRss(res.headers.location));
      }
      let d = ""; res.on("data", c => d += c); res.on("end", () => resolve(d));
    });
    req.on("error", reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function parseRss(xml, source) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = (block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                   block.match(/<title>([\s\S]*?)<\/title>/))?.[1]?.trim() || "";
    const link  = (block.match(/<link>([\s\S]*?)<\/link>/) ||
                   block.match(/<link\s[^>]*href="([^"]+)"/))?.[1]?.trim() || "";
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/))?.[1]?.trim() || "";
    if (!title || title.length < 8) continue;
    // Format time as HH:MM AM/PM
    let time = "";
    try {
      const d = new Date(pubDate);
      if (!isNaN(d)) time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" });
    } catch {}
    items.push({ time, title: title.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#39;/g,"'").replace(/&quot;/g,'"'), url: link, tickers: [], source });
  }
  return items;
}

async function fetchMarketNews() {
  for (const feed of NEWS_FEEDS) {
    try {
      const xml   = await fetchRss(feed.url);
      const items = parseRss(xml, feed.source);
      if (items.length >= 3) return items;
    } catch {}
  }
  return [];
}

// Keep Finviz fetchHtml for quote/chart endpoints
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Referer": "https://finviz.com/",
};
function fetchHtml(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 3) return reject(new Error("too many redirects"));
    const req = https.get(url, { headers: HEADERS }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith("http") ? res.headers.location : "https://finviz.com" + res.headers.location;
        return resolve(fetchHtml(next, redirects + 1));
      }
      let d = ""; res.on("data", c => d += c); res.on("end", () => resolve(d));
    });
    req.on("error", reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function parseFinvizNews(html) {
  const items = [];

  // Current Finviz structure (2025-2026):
  // <tr class="styled-row is-hoverable ...">
  //   <td class="news_date-cell color-text is-muted">12:51PM</td>
  //   <td class="news_link-cell" ...><a href="https://..." class="nn-tab-link" ...>TITLE</a></td>
  // </tr>
  const rowRe = /<tr[^>]*class="[^"]*styled-row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const row = m[1];
    // Time from news_date-cell
    const timeM = row.match(/class="[^"]*news_date-cell[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    const time  = timeM ? timeM[1].replace(/<[^>]+>/g,"").trim() : "";
    // Link + title from nn-tab-link anchor
    const linkM = row.match(/class="nn-tab-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>|href="([^"]+)"[^>]*class="nn-tab-link"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkM) continue;
    const url   = linkM[1] || linkM[3] || "";
    const title = (linkM[2] || linkM[4] || "").replace(/<[^>]+>/g,"").trim();
    if (!url || !title || title.length < 10) continue;
    items.push({ time, title, url, tickers: [], source: "Finviz" });
  }

  // Fallback: grab all nn-tab-link anchors directly
  if (items.length === 0) {
    const re2 = /href="(https?:\/\/[^"]+)"[^>]*class="nn-tab-link"[^>]*>([\s\S]*?)<\/a>|class="nn-tab-link"[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m2;
    while ((m2 = re2.exec(html)) !== null) {
      const url   = m2[1] || m2[3] || "";
      const title = (m2[2] || m2[4] || "").replace(/<[^>]+>/g,"").trim();
      if (title.length > 15) items.push({ time: "", title, url, tickers: [], source: "Finviz" });
    }
  }
  return items;
}

async function handleFinviz(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;

  // GET /api/finviz/news?limit=30  — market news via RSS feeds (Yahoo Finance, MarketWatch)
  if (pathname === "/api/finviz/news") {
    const limit = Math.min(parseInt(searchParams.get("limit") || "30", 10), 60);
    const force = searchParams.get("refresh") === "1";
    if (!force && _newsCache && _newsCache.length > 0 && Date.now() - _newsCacheTs < NEWS_TTL) {
      return writeJson(res, 200, { ok: true, items: _newsCache.slice(0, limit), cached: true });
    }
    try {
      const items = await fetchMarketNews();
      if (items.length > 0) { _newsCache = items; _newsCacheTs = Date.now(); }
      const out = (items.length > 0 ? items : (_newsCache || [])).slice(0, limit);
      return writeJson(res, 200, { ok: true, items: out, count: out.length, cached: false });
    } catch (err) {
      if (_newsCache && _newsCache.length > 0) return writeJson(res, 200, { ok: true, items: _newsCache.slice(0, limit), cached: true, stale: true });
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
