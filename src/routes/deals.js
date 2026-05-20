// ── Deals Finder — Multi-source aggregator (100% free, no API key) ──────────
// Sources: Reddit JSON · SlickDeals RSS · DealNews RSS · Google News RSS · DealsList RSS
const { writeJson, readRequestBody } = require("../utils");

const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHAT_ID   = (process.env.TELEGRAM_CHAT_ID  || "").trim();

// In-memory stores
let dealWatches      = [];
let recentDealAlerts = [];

// ── Category → Reddit subreddits ──────────────────────────────────────────────
const CATEGORY_SUBS = {
  electronics: "buildapcsales+techdeals+electronicsdeals+frugalmalefashion+deals",
  realestate:  "realestate+RealEstateInvesting+FirstTimeHomeBuyer+REBubble",
  cars:        "cardeals+UsedCars+askcarsales+cars",
  furniture:   "frugal+malelivingspace+deals+HomeImprovement",
  general:     "deals+frugal+coupons+Flipping+beermoney",
  jobs:        "forhire+jobs+remotework+WorkOnline",
  luxury:      "Watches+malefashionadvice+jewelry+frugalmalefashion",
};

// ── Category → DealNews RSS feed ─────────────────────────────────────────────
const DEALNEWS_FEEDS = {
  electronics: "https://www.dealnews.com/c196/Electronics/?rss=1",
  cars:        "https://www.dealnews.com/c174/Cars-Transportation/?rss=1",
  furniture:   "https://www.dealnews.com/c197/Home-Garden/?rss=1",
  luxury:      "https://www.dealnews.com/c200/Clothing-Accessories/?rss=1",
  general:     "https://www.dealnews.com/featured.rss",
  realestate:  "https://www.dealnews.com/featured.rss",
  jobs:        "https://www.dealnews.com/featured.rss",
};

// ── Category → SlickDeals department ─────────────────────────────────────────
const SD_DEPT = {
  electronics: "2",   // Electronics
  cars:        "45",  // Automotive
  furniture:   "63",  // Home & Garden
  luxury:      "5",   // Clothing & Accessories
};

// ── Shared fetch headers ──────────────────────────────────────────────────────
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":     "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// ── Minimal RSS/XML parser (no dependencies) ──────────────────────────────────
function parseRSS(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];

    // Get tag text content — handles CDATA
    const txt = (tag) => {
      const re = new RegExp(
        `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i"
      );
      const r = re.exec(block);
      return r ? r[1].trim() : null;
    };

    // Get named attribute from a tag
    const attr = (tag, attribute) => {
      const re = new RegExp(`<${tag}[^>]+${attribute}="([^"]+)"`, "i");
      const r = re.exec(block);
      return r ? r[1] : null;
    };

    const title   = txt("title")   || "";
    const link    = txt("link")    || txt("guid") || attr("link", "href") || "";
    const desc    = txt("description") || txt("content:encoded") || "";
    const pubDate = txt("pubDate") || txt("published") || null;

    // Image: try media tags, then enclosure, then extract from HTML description
    let image = attr("media:thumbnail", "url")
             || attr("media:content",   "url")
             || attr("enclosure",       "url");
    if (!image && desc) {
      const imgM = /<img[^>]+src="([^"]+)"/i.exec(desc);
      if (imgM) image = imgM[1].replace(/&amp;/g, "&");
    }

    // Strip HTML tags for clean description text
    const cleanDesc = desc
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#\d+;/g, "")
      .replace(/\s+/g, " ").trim()
      .slice(0, 160);

    if (title) items.push({ title, link, description: cleanDesc, pubDate, image });
  }
  return items;
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function extractPrice(text) {
  const m1 = text.match(/\$[\d,]+(?:\.\d{2})?/);
  const m2 = text.match(/\$?([\d,]+(?:\.\d{2})?)/);
  return {
    price:    m1 ? m1[0] : null,
    rawPrice: m2 ? parseFloat(m2[1].replace(/,/g, "")) : null,
  };
}

function ageHours(pubDate) {
  if (!pubDate) return null;
  try { return Math.max(0, Math.floor((Date.now() - new Date(pubDate).getTime()) / 3_600_000)); }
  catch { return null; }
}

// Simple stable hash for RSS item IDs (avoids duplicate seenIds on re-fetch)
function stableId(prefix, str) {
  let h = 5381;
  for (let i = 0; i < Math.min(str.length, 120); i++) {
    h = (h * 33) ^ str.charCodeAt(i);
    h |= 0;
  }
  return `${prefix}_${Math.abs(h).toString(36)}`;
}

// ── Source 1: Reddit JSON API ─────────────────────────────────────────────────
async function fromReddit(query, category) {
  const subs = CATEGORY_SUBS[category] || CATEGORY_SUBS.general;
  const url  = query && query.trim()
    ? `https://www.reddit.com/r/${subs}/search.json?${new URLSearchParams({ q: query.trim(), restrict_sr: "1", sort: "relevance", t: "month", limit: "25", type: "link" })}`
    : `https://www.reddit.com/r/${subs}/hot.json?limit=25`;

  const res  = await fetch(url, {
    headers: { "User-Agent": "AMTradingPlatform/1.0", Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];

  const data  = await res.json();
  const posts = (data?.data?.children || []).map(c => c.data);

  return posts.filter(p => p && p.title && !p.stickied).map(p => {
    const { price, rawPrice } = extractPrice(p.title);

    // High-res preview image (decode HTML entities in URL)
    let image = null;
    try {
      const prev = p.preview?.images?.[0];
      if (prev) {
        const res = prev.resolutions || [];
        const mid = res.find(r => r.width >= 320) || res[res.length - 1] || prev.source;
        if (mid?.url) image = mid.url.replace(/&amp;/g, "&");
      }
    } catch {}

    const thumb = p.thumbnail && !["self","nsfw","default","image","spoiler",""].includes(p.thumbnail)
      ? p.thumbnail : null;

    return {
      id:         `reddit_${p.id}`,
      title:      p.title,
      description: p.selftext ? p.selftext.slice(0, 160) : "",
      price, rawPrice,
      link:       p.url || `https://reddit.com${p.permalink}`,
      redditLink: `https://reddit.com${p.permalink}`,
      source:     `Reddit  r/${p.subreddit}`,
      sourceKey:  "reddit",
      image:      image || (thumb && thumb.startsWith("http") ? thumb : null),
      score:      p.score || 0,
      comments:   p.num_comments || 0,
      age:        p.created_utc ? Math.floor((Date.now() / 1000 - p.created_utc) / 3600) : null,
      category,
    };
  });
}

// ── Source 2: SlickDeals RSS ──────────────────────────────────────────────────
async function fromSlickDeals(query, category) {
  const params = new URLSearchParams({ mode: "frontpage", searcharea: "deals", rss: "1" });
  if (query && query.trim()) params.set("q", query.trim());
  if (SD_DEPT[category])      params.set("dept", SD_DEPT[category]);

  const res = await fetch(`https://slickdeals.net/newsearch.php?${params}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];

  const xml   = await res.text();
  const items = parseRSS(xml);

  return items.slice(0, 20).map(item => {
    const { price, rawPrice } = extractPrice(item.title + " " + item.description);
    return {
      id:          stableId("sd", item.title),
      title:       item.title,
      description: item.description,
      price, rawPrice,
      link:        item.link,
      redditLink:  null,
      source:      "SlickDeals",
      sourceKey:   "slickdeals",
      image:       item.image || null,
      score:       0,
      comments:    0,
      age:         ageHours(item.pubDate),
      category,
    };
  });
}

// ── Source 3: DealNews RSS ────────────────────────────────────────────────────
async function fromDealNews(query, category) {
  const feedUrl = DEALNEWS_FEEDS[category] || DEALNEWS_FEEDS.general;
  const res     = await fetch(feedUrl, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
  if (!res.ok) return [];

  const xml   = await res.text();
  const items = parseRSS(xml);

  const filtered = query && query.trim()
    ? items.filter(i =>
        i.title.toLowerCase().includes(query.toLowerCase()) ||
        i.description.toLowerCase().includes(query.toLowerCase())
      )
    : items;

  return filtered.slice(0, 15).map(item => {
    const { price, rawPrice } = extractPrice(item.title + " " + item.description);
    return {
      id:          stableId("dn", item.title),
      title:       item.title,
      description: item.description,
      price, rawPrice,
      link:        item.link,
      redditLink:  null,
      source:      "DealNews",
      sourceKey:   "dealnews",
      image:       item.image || null,
      score:       0,
      comments:    0,
      age:         ageHours(item.pubDate),
      category,
    };
  });
}

// ── Source 4: Google News RSS (free, no key) ──────────────────────────────────
async function fromGoogle(query, category) {
  const q   = query && query.trim()
    ? `${query.trim()} deal sale discount`
    : `best deals ${category} sale`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
  if (!res.ok) return [];

  const xml   = await res.text();
  const items = parseRSS(xml);

  return items.slice(0, 15).map(item => {
    const { price, rawPrice } = extractPrice(item.title + " " + item.description);
    return {
      id:          stableId("gn", item.title),
      title:       item.title,
      description: item.description,
      price, rawPrice,
      link:        item.link,
      redditLink:  null,
      source:      "Google News",
      sourceKey:   "google",
      image:       item.image || null,
      score:       0,
      comments:    0,
      age:         ageHours(item.pubDate),
      category,
    };
  });
}

// ── Source 5: DealsList RSS ───────────────────────────────────────────────────
async function fromDealsList(query) {
  // Try their main RSS; URL may vary — caught gracefully if it 404s
  const url = query && query.trim()
    ? `https://www.dealslist.com/search/?q=${encodeURIComponent(query.trim())}&feed=rss`
    : "https://www.dealslist.com/feed/";

  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
  if (!res.ok) return [];

  const xml   = await res.text();
  const items = parseRSS(xml);

  return items.slice(0, 15).map(item => {
    const { price, rawPrice } = extractPrice(item.title + " " + item.description);
    return {
      id:          stableId("dl", item.title),
      title:       item.title,
      description: item.description,
      price, rawPrice,
      link:        item.link,
      redditLink:  null,
      source:      "DealsList",
      sourceKey:   "dealslist",
      image:       item.image || null,
      score:       0,
      comments:    0,
      age:         ageHours(item.pubDate),
      category,
    };
  });
}

// ── Multi-source aggregator ───────────────────────────────────────────────────
async function searchDeals(query, category = "general", maxPrice = null) {
  // Run all sources in parallel; failures are isolated
  const [reddit, slickdeals, dealnews, google, dealslist] = await Promise.allSettled([
    fromReddit(query, category).catch(() => []),
    fromSlickDeals(query, category).catch(() => []),
    fromDealNews(query, category).catch(() => []),
    fromGoogle(query, category).catch(() => []),
    fromDealsList(query).catch(() => []),
  ]);

  const get = r => (r.status === "fulfilled" ? r.value || [] : []);

  let results = [
    ...get(reddit),
    ...get(slickdeals),
    ...get(dealnews),
    ...get(google),
    ...get(dealslist),
  ];

  // Filter by max price
  if (maxPrice) {
    const cap = Number(maxPrice);
    results = results.filter(r => r.rawPrice === null || r.rawPrice <= cap);
  }

  // Sort: Reddit by upvote score, everything else by freshness
  results.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;
    return (a.age ?? 9999) - (b.age ?? 9999);
  });

  return { results, query };
}

// ── Telegram helper ───────────────────────────────────────────────────────────
async function tg(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    const res  = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) console.error("[Deals] Telegram send failed:", json.description);
  } catch (err) {
    console.error("[Deals] Telegram error:", err.message);
  }
}

// ── Background watch checker — runs every 30 min from server.js ───────────────
async function checkDealWatches() {
  if (!dealWatches.length) return;
  const now      = Date.now();
  const INTERVAL = 30 * 60 * 1000;

  for (const watch of dealWatches) {
    if (watch.lastChecked && now - watch.lastChecked < INTERVAL) continue;
    watch.lastChecked = now;

    const { results } = await searchDeals(watch.query, watch.category, watch.maxPrice);
    if (!results.length) continue;

    const seen     = new Set(watch.seenIds || []);
    const newDeals = results.filter(r => !seen.has(r.id));
    if (!newDeals.length) continue;

    watch.seenIds    = [...seen, ...newDeals.map(r => r.id)].slice(-500);
    watch.lastAlerted = now;

    const top = newDeals.slice(0, 5);
    let msg   = `DEAL ALERT: "${watch.query}" (${watch.category.toUpperCase()})\n`;
    msg      += `${top.length} new deal${top.length > 1 ? "s" : ""} found:\n\n`;
    for (const d of top) {
      msg += `• ${d.title}`;
      if (d.price) msg += `  ${d.price}`;
      msg += `\n  ${d.source}`;
      if (d.score) msg += ` · ${d.score} upvotes`;
      msg += `\n  ${d.link.slice(0, 80)}\n\n`;
    }
    if (newDeals.length > 5) msg += `...and ${newDeals.length - 5} more.\n`;

    await tg(msg);

    recentDealAlerts.unshift({
      id:       `a${now}`,
      watchId:  watch.id,
      query:    watch.query,
      category: watch.category,
      count:    newDeals.length,
      at:       new Date().toISOString(),
      preview:  top.slice(0, 3).map(d => ({ title: d.title, price: d.price, source: d.source, score: d.score })),
    });
    if (recentDealAlerts.length > 60) recentDealAlerts.length = 60;

    console.log(`[Deals] Alert sent for "${watch.query}": ${newDeals.length} new deals`);
  }
}

// ── HTTP route handler ────────────────────────────────────────────────────────
async function handleDeals(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;

  if (pathname === "/api/deals/search") {
    const q        = searchParams.get("q")        || "";
    const category = searchParams.get("category") || "general";
    const maxPrice = searchParams.get("maxPrice") || null;
    const { results, error, query } = await searchDeals(q, category, maxPrice);
    return writeJson(res, 200, { ok: !error, results: results || [], error: error || null, query });
  }

  if (pathname === "/api/deals/watches" && req.method === "GET") {
    return writeJson(res, 200, { ok: true, watches: dealWatches, recentAlerts: recentDealAlerts });
  }

  if (pathname === "/api/deals/watches" && req.method === "POST") {
    let body = {};
    try { body = JSON.parse(await readRequestBody(req)); } catch {}
    const watch = {
      id:          String(Date.now()),
      query:       String(body.query    || "").trim(),
      category:    String(body.category || "general"),
      maxPrice:    body.maxPrice ? Number(body.maxPrice) : null,
      createdAt:   new Date().toISOString(),
      lastChecked: null,
      lastAlerted: null,
      seenIds:     [],
    };
    if (!watch.query) return writeJson(res, 400, { ok: false, error: "query required" });
    dealWatches.push(watch);
    return writeJson(res, 200, { ok: true, watch });
  }

  if (pathname.startsWith("/api/deals/watches/") && req.method === "DELETE") {
    const id = pathname.split("/").pop();
    dealWatches = dealWatches.filter(w => w.id !== id);
    return writeJson(res, 200, { ok: true });
  }

  if (pathname === "/api/deals/test-alert" && req.method === "POST") {
    await tg("DEALS TEST: Telegram alert from your AM Trading platform is working.");
    return writeJson(res, 200, { ok: true });
  }

  return writeJson(res, 404, { ok: false, error: "Not found" });
}

module.exports = handleDeals;
module.exports.checkDealWatches = checkDealWatches;
