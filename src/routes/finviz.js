const https   = require("https");
const { writeJson } = require("../utils");
const { fetchFinvizStats, fetchFinvizChartBuffer } = require("../providers/finviz");

// ── News cache — refreshed by background loop every 5 min ───────────────────
let _newsCache = [];
let _newsCacheTs = 0;
let _newsSource = "—";

// ── Finviz scraper ──────────────────────────────────────────────────────────
function fetchFinvizHtml(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 4) return reject(new Error("too many redirects"));
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Referer": "https://finviz.com/",
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith("http") ? res.headers.location : "https://finviz.com" + res.headers.location;
        return resolve(fetchFinvizHtml(next, redirects + 1));
      }
      let d = ""; res.on("data", c => d += c); res.on("end", () => resolve({ status: res.statusCode, body: d }));
    });
    req.on("error", reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function parseFinvizPage(html) {
  const items = [];
  // Match all nn-tab-link anchors — these are always the news links on finviz.com/news.ashx
  const re = /class="nn-tab-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>|href="([^"]+)"[^>]*class="nn-tab-link"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url   = (m[1] || m[3] || "").trim();
    const title = (m[2] || m[4] || "").replace(/<[^>]+>/g, "").trim();
    if (!url || title.length < 10) continue;
    // Try to find a time near this match (look back ~300 chars)
    const before = html.slice(Math.max(0, re.lastIndex - title.length - 400), re.lastIndex);
    const timeM  = before.match(/(\d{1,2}:\d{2}(?:AM|PM))\s*<\/td>/i);
    const time   = timeM ? timeM[1] : "";
    items.push({ time, title, url, tickers: [], source: "Finviz" });
  }
  return items;
}

// ── RSS fallback feeds ───────────────────────────────────────────────────────
const RSS_FEEDS = [
  { url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=SPY,QQQ,NVDA,AAPL,TSLA,MSFT,META,AMZN&region=US&lang=en-US", source: "Yahoo Finance" },
  { url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC,^NDX,^DJI&region=US&lang=en-US", source: "Yahoo Finance" },
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/", source: "MarketWatch" },
];

function fetchRss(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/rss+xml,text/xml,*/*" }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return resolve(fetchRss(res.headers.location));
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
    const b = m[1];
    const title = (b.match(/<title><!\[CDATA\[([\s\S]*?)\]\]>/) || b.match(/<title>([\s\S]*?)<\/title>/))?.[1]?.trim() || "";
    const link  = (b.match(/<link>([\s\S]*?)<\/link>/) || b.match(/<link[^>]*href="([^"]+)"/))?.[1]?.trim() || "";
    const pub   = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/))?.[1]?.trim() || "";
    if (!title || title.length < 8) continue;
    let time = "";
    try { const d = new Date(pub); if (!isNaN(d)) time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" }); } catch {}
    items.push({ time, title: title.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#39;/g,"'").replace(/&quot;/g,'"'), url: link, tickers: [], source });
  }
  return items;
}

// ── Master fetch: Finviz first, RSS fallback ─────────────────────────────────
async function refreshNews() {
  // 1. Try Finviz
  try {
    const { status, body } = await fetchFinvizHtml("https://finviz.com/news.ashx");
    if (status === 200 && body.length > 10000) {
      const items = parseFinvizPage(body);
      if (items.length >= 5) {
        _newsCache = items; _newsCacheTs = Date.now(); _newsSource = "Finviz";
        console.log(`[news] Finviz OK — ${items.length} headlines`);
        return;
      }
    }
  } catch (e) { console.log("[news] Finviz failed:", e.message); }

  // 2. RSS fallback
  for (const feed of RSS_FEEDS) {
    try {
      const xml   = await fetchRss(feed.url);
      const items = parseRss(xml, feed.source);
      if (items.length >= 3) {
        _newsCache = items; _newsCacheTs = Date.now(); _newsSource = feed.source;
        console.log(`[news] ${feed.source} RSS OK — ${items.length} headlines`);
        return;
      }
    } catch {}
  }
  console.log("[news] All sources failed — keeping stale cache");
}

// ── Background loop: fetch immediately on startup, then every 5 min ──────────
refreshNews();
setInterval(refreshNews, 5 * 60 * 1000);


async function handleFinviz(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;

  // GET /api/finviz/news?limit=40  — serve pre-cached headlines (refreshed every 5 min)
  if (pathname === "/api/finviz/news") {
    const limit = Math.min(parseInt(searchParams.get("limit") || "40", 10), 60);
    // Force-refresh: trigger an immediate background refresh then serve what we have
    if (searchParams.get("refresh") === "1") refreshNews().catch(() => {});
    const ageMin = _newsCacheTs > 0 ? Math.floor((Date.now() - _newsCacheTs) / 60000) : null;
    return writeJson(res, 200, {
      ok: true,
      items: _newsCache.slice(0, limit),
      count: _newsCache.length,
      source: _newsSource,
      ageMin,
      updatedAt: _newsCacheTs > 0 ? new Date(_newsCacheTs).toISOString() : null,
    });
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
