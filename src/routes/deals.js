// ── Deals Finder ─────────────────────────────────────────────────────────────
// Sources: Reddit JSON · SlickDeals RSS · DealNews RSS · Google News RSS
const { writeJson, readRequestBody } = require("../utils");

const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHAT_ID   = (process.env.TELEGRAM_CHAT_ID  || "").trim();

let dealWatches      = [];
let recentDealAlerts = [];

// ─── Reddit subreddits per category ──────────────────────────────────────────
const SUBS = {
  electronics: "buildapcsales+techdeals+electronicsdeals+deals",
  realestate:  "realestate+RealEstateInvesting+FirstTimeHomeBuyer",
  cars:        "cardeals+UsedCars+askcarsales",
  furniture:   "frugal+malelivingspace+deals",
  general:     "deals+frugal+coupons",
  jobs:        "forhire+jobs+remotework",
  luxury:      "Watches+malefashionadvice+frugalmalefashion",
};

// ─── Tiny RSS/Atom parser ─────────────────────────────────────────────────────
function parseRSS(xml) {
  const out = [];
  // Support both RSS <item> and Atom <entry>
  const re = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    const get = tag => {
      const r = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i").exec(b);
      return r ? r[1].trim() : "";
    };
    const getAttr = (tag, attr) => {
      const r = new RegExp(`<${tag}[^>]+${attr}="([^"]+)"`, "i").exec(b);
      return r ? r[1] : null;
    };
    const title = get("title");
    if (!title) continue;
    // Atom uses <link href="..."/> or <link>url</link>; RSS uses <link>url</link>
    const linkHref = getAttr("link", "href");
    const link     = linkHref || get("link") || get("guid") || get("id");
    const desc     = get("description") || get("content:encoded") || get("content") || get("summary") || "";
    const pub      = get("pubDate") || get("published") || get("updated") || null;
    let   img      = getAttr("media:thumbnail", "url") || getAttr("media:content", "url") || getAttr("enclosure", "url");
    if (!img) {
      const im = /<img[^>]+src="([^"]+)"/i.exec(desc);
      if (im) img = im[1].replace(/&amp;/g, "&");
    }
    const clean = desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
    out.push({ title, link, description: clean, pubDate: pub, image: img });
  }
  return out;
}

function priceOf(text) {
  const m1 = (text || "").match(/\$[\d,]+(?:\.\d{2})?/);
  const m2 = (text || "").match(/\$?([\d,]+(?:\.\d{2})?)/);
  return { price: m1?.[0] || null, rawPrice: m2 ? parseFloat(m2[1].replace(/,/g, "")) : null };
}

function hoursAgo(pub) {
  if (!pub) return null;
  try { return Math.max(0, Math.floor((Date.now() - new Date(pub)) / 3600000)); } catch { return null; }
}

function hashId(prefix, s) {
  let h = 5381;
  for (let i = 0; i < Math.min(s.length, 80); i++) { h = ((h << 5) - h) ^ s.charCodeAt(i); h |= 0; }
  return `${prefix}_${Math.abs(h).toString(36)}`;
}

// ─── Fetch with timeout + error swallowing ────────────────────────────────────
async function safeFetch(url, opts, timeoutMs = 7000) {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) { console.warn(`[Deals] ${url.slice(0,50)} → HTTP ${res.status}`); return null; }
    return res;
  } catch (e) {
    console.warn(`[Deals] ${url.slice(0,50)} → ${e.message}`);
    return null;
  }
}

// ─── Source: Reddit (JSON API with RSS Atom fallback) ─────────────────────────
async function fromReddit(query, category) {
  const subs = SUBS[category] || SUBS.general;
  const q    = query && query.trim();

  // ── Try JSON API first ────────────────────────────────────────────────────
  const jsonUrl = q
    ? `https://www.reddit.com/r/${subs}/search.json?q=${encodeURIComponent(q)}&restrict_sr=1&sort=relevance&t=month&limit=25&type=link`
    : `https://www.reddit.com/r/${subs}/hot.json?limit=25`;

  const jsonRes = await safeFetch(jsonUrl, {
    headers: { "User-Agent": "AMTradingPlatform/1.0 (deals finder)", Accept: "application/json" }
  }, 10000);

  if (jsonRes) {
    const data = await jsonRes.json().catch(() => null);
    const posts = (data?.data?.children || []).map(c => c.data).filter(p => p?.title && !p.stickied);
    if (posts.length > 0) {
      return posts.map(p => {
        const { price, rawPrice } = priceOf(p.title);
        let image = null;
        try {
          const prev = p.preview?.images?.[0];
          if (prev) {
            const arr  = prev.resolutions || [];
            const pick = arr.find(r => r.width >= 320) || arr[arr.length - 1] || prev.source;
            if (pick?.url) image = pick.url.replace(/&amp;/g, "&");
          }
        } catch {}
        const thumb = p.thumbnail && !["self","nsfw","default","image","spoiler",""].includes(p.thumbnail) && p.thumbnail.startsWith("http") ? p.thumbnail : null;
        return {
          id: `reddit_${p.id}`, title: p.title,
          description: (p.selftext || "").slice(0, 160),
          price, rawPrice,
          link:       p.url || `https://reddit.com${p.permalink}`,
          redditLink: `https://reddit.com${p.permalink}`,
          source: `r/${p.subreddit}`, sourceKey: "reddit",
          image: image || thumb,
          score: p.score || 0, comments: p.num_comments || 0,
          age: p.created_utc ? Math.floor((Date.now() / 1000 - p.created_utc) / 3600) : null,
          category,
        };
      });
    }
  }

  // ── Fallback: Reddit Atom/RSS feed ────────────────────────────────────────
  console.log("[Deals] Reddit JSON failed/empty — trying RSS fallback");
  const rssUrl = q
    ? `https://www.reddit.com/r/${subs}/search.rss?q=${encodeURIComponent(q)}&restrict_sr=1&sort=relevance&t=month`
    : `https://www.reddit.com/r/${subs}/hot.rss`;

  const rssRes = await safeFetch(rssUrl, {
    headers: { "User-Agent": "AMTradingPlatform/1.0 (deals finder)", Accept: "application/rss+xml, application/atom+xml, text/xml" }
  }, 10000);
  if (!rssRes) return [];

  const xml = await rssRes.text().catch(() => "");
  return parseRSS(xml).slice(0, 20).map(item => {
    const { price, rawPrice } = priceOf(item.title + " " + item.description);
    // Reddit Atom links often have the permalink in <link href="..."/>
    const redditLink = item.link?.includes("reddit.com") ? item.link : null;
    return {
      id: hashId("rr", item.title + (item.link || "")),
      title: item.title, description: item.description,
      price, rawPrice,
      link: item.link || `https://reddit.com/r/${subs}`,
      redditLink,
      source: `r/${subs.split("+")[0]}`, sourceKey: "reddit",
      image: item.image,
      score: 0, comments: 0, age: hoursAgo(item.pubDate),
      category,
    };
  });
}

// ─── Source: SlickDeals RSS ───────────────────────────────────────────────────
async function fromSlickDeals(query) {
  const q   = query && query.trim() ? `&q=${encodeURIComponent(query.trim())}` : "";
  const url = `https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&rss=1${q}`;
  const res = await safeFetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; RSS reader)" } });
  if (!res) return [];
  const xml = await res.text().catch(() => "");
  return parseRSS(xml).slice(0, 15).map(item => {
    const { price, rawPrice } = priceOf(item.title + " " + item.description);
    return { id: hashId("sd", item.title), title: item.title, description: item.description,
      price, rawPrice, link: item.link, redditLink: null, source: "SlickDeals", sourceKey: "slickdeals",
      image: item.image, score: 0, comments: 0, age: hoursAgo(item.pubDate), category: "general" };
  });
}

// ─── Source: DealNews RSS ─────────────────────────────────────────────────────
const DEALNEWS = {
  electronics: "https://www.dealnews.com/c196/Electronics/?rss=1",
  cars:        "https://www.dealnews.com/c174/Cars-Transportation/?rss=1",
  furniture:   "https://www.dealnews.com/c197/Home-Garden/?rss=1",
  luxury:      "https://www.dealnews.com/c200/Clothing-Accessories/?rss=1",
};

async function fromDealNews(query, category) {
  const url = DEALNEWS[category] || "https://www.dealnews.com/featured.rss";
  const res = await safeFetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; RSS reader)" } });
  if (!res) return [];
  const xml = await res.text().catch(() => "");
  const all = parseRSS(xml);
  const filtered = query && query.trim()
    ? all.filter(i => (i.title + i.description).toLowerCase().includes(query.toLowerCase()))
    : all;
  return filtered.slice(0, 12).map(item => {
    const { price, rawPrice } = priceOf(item.title + " " + item.description);
    return { id: hashId("dn", item.title), title: item.title, description: item.description,
      price, rawPrice, link: item.link, redditLink: null, source: "DealNews", sourceKey: "dealnews",
      image: item.image, score: 0, comments: 0, age: hoursAgo(item.pubDate), category };
  });
}

// ─── Source: Google News RSS (free, no key) ───────────────────────────────────
async function fromGoogle(query, category) {
  const q   = query && query.trim() ? `${query.trim()} deal discount` : `best deals ${category}`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await safeFetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; RSS reader)" } });
  if (!res) return [];
  const xml = await res.text().catch(() => "");
  return parseRSS(xml).slice(0, 12).map(item => {
    const { price, rawPrice } = priceOf(item.title + " " + item.description);
    return { id: hashId("gn", item.title), title: item.title, description: item.description,
      price, rawPrice, link: item.link, redditLink: null, source: "Google News", sourceKey: "google",
      image: item.image, score: 0, comments: 0, age: hoursAgo(item.pubDate), category };
  });
}

// ─── Source: DealsList ────────────────────────────────────────────────────────
async function fromDealsList(query) {
  const url = query && query.trim()
    ? `https://www.dealslist.com/search/?q=${encodeURIComponent(query.trim())}&feed=rss`
    : "https://www.dealslist.com/feed/";
  const res = await safeFetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; RSS reader)" } });
  if (!res) return [];
  const xml = await res.text().catch(() => "");
  return parseRSS(xml).slice(0, 10).map(item => {
    const { price, rawPrice } = priceOf(item.title + " " + item.description);
    return { id: hashId("dl", item.title), title: item.title, description: item.description,
      price, rawPrice, link: item.link, redditLink: null, source: "DealsList", sourceKey: "dealslist",
      image: item.image, score: 0, comments: 0, age: hoursAgo(item.pubDate), category: "general" };
  });
}

// ─── Aggregate all sources ────────────────────────────────────────────────────
async function searchDeals(query, category = "general", maxPrice = null) {
  const t0 = Date.now();
  let results = [];
  let sourceStatus = {};

  try {
    const [r, sd, dn, gn, dl] = await Promise.allSettled([
      fromReddit(query, category),
      fromSlickDeals(query),
      fromDealNews(query, category),
      fromGoogle(query, category),
      fromDealsList(query),
    ]);

    const ok = (p, name) => {
      if (p.status === "fulfilled") {
        const arr = p.value || [];
        sourceStatus[name] = arr.length;
        return arr;
      }
      sourceStatus[name] = -1; // -1 = error
      console.warn(`[Deals] ${name} rejected:`, p.reason?.message);
      return [];
    };

    results = [
      ...ok(r,  "reddit"),
      ...ok(sd, "slickdeals"),
      ...ok(dn, "dealnews"),
      ...ok(gn, "google"),
      ...ok(dl, "dealslist"),
    ];

    if (maxPrice) {
      const cap = Number(maxPrice);
      results = results.filter(x => x.rawPrice === null || x.rawPrice <= cap);
    }

    results.sort((a, b) => (b.score - a.score) || ((a.age ?? 9999) - (b.age ?? 9999)));

    const ms = Date.now() - t0;
    console.log(`[Deals] "${query}" (${category}) → ${results.length} results in ${ms}ms |`,
      Object.entries(sourceStatus).map(([k,v]) => `${k}:${v}`).join(" "));
  } catch (err) {
    console.error("[Deals] crash:", err.message);
  }

  return { results, query, sourceStatus };
}

// ─── Telegram helper ──────────────────────────────────────────────────────────
async function tg(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) console.error("[Deals] TG:", j.description);
  } catch (e) { console.error("[Deals] TG:", e.message); }
}

// ─── Background watch checker ─────────────────────────────────────────────────
async function checkDealWatches() {
  if (!dealWatches.length) return;
  const now = Date.now(), INTERVAL = 30 * 60 * 1000;
  for (const w of dealWatches) {
    if (w.lastChecked && now - w.lastChecked < INTERVAL) continue;
    w.lastChecked = now;
    const { results } = await searchDeals(w.query, w.category, w.maxPrice);
    if (!results.length) continue;
    const seen = new Set(w.seenIds || []);
    const fresh = results.filter(r => !seen.has(r.id));
    if (!fresh.length) continue;
    w.seenIds = [...seen, ...fresh.map(r => r.id)].slice(-500);
    w.lastAlerted = now;
    const top = fresh.slice(0, 5);
    let msg = `DEAL ALERT: "${w.query}" (${w.category.toUpperCase()})\n${top.length} new deal${top.length > 1 ? "s" : ""}:\n\n`;
    for (const d of top) {
      msg += `• ${d.title}${d.price ? "  " + d.price : ""}\n  ${d.source}\n  ${d.link.slice(0, 80)}\n\n`;
    }
    if (fresh.length > 5) msg += `...and ${fresh.length - 5} more.\n`;
    await tg(msg);
    recentDealAlerts.unshift({ id: `a${now}`, watchId: w.id, query: w.query, category: w.category,
      count: fresh.length, at: new Date().toISOString(),
      preview: top.slice(0, 3).map(d => ({ title: d.title, price: d.price, source: d.source })) });
    if (recentDealAlerts.length > 60) recentDealAlerts.length = 60;
    console.log(`[Deals] Alert: "${w.query}" → ${fresh.length} new deals`);
  }
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────
async function handleDeals(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;

  // Ping — quick health check
  if (pathname === "/api/deals/ping") {
    return writeJson(res, 200, { ok: true, ts: Date.now() });
  }

  // Debug — test each source individually and report status
  if (pathname === "/api/deals/debug") {
    const t0 = Date.now();
    const [r, sd, dn, gn, dl] = await Promise.allSettled([
      fromReddit("", "electronics"),
      fromSlickDeals(""),
      fromDealNews("", "electronics"),
      fromGoogle("", "electronics"),
      fromDealsList(""),
    ]);
    const status = {
      reddit:     r.status  === "fulfilled" ? r.value.length  : `ERROR: ${r.reason?.message}`,
      slickdeals: sd.status === "fulfilled" ? sd.value.length : `ERROR: ${sd.reason?.message}`,
      dealnews:   dn.status === "fulfilled" ? dn.value.length : `ERROR: ${dn.reason?.message}`,
      google:     gn.status === "fulfilled" ? gn.value.length : `ERROR: ${gn.reason?.message}`,
      dealslist:  dl.status === "fulfilled" ? dl.value.length : `ERROR: ${dl.reason?.message}`,
      ms: Date.now() - t0,
    };
    console.log("[Deals] /debug →", status);
    return writeJson(res, 200, { ok: true, status });
  }

  if (pathname === "/api/deals/search") {
    const q        = (searchParams.get("q")        || "").trim();
    const category = searchParams.get("category")  || "general";
    const maxPrice = searchParams.get("maxPrice")  || null;
    try {
      const { results, query, sourceStatus } = await searchDeals(q, category, maxPrice);
      return writeJson(res, 200, { ok: true, results, query, sourceStatus });
    } catch (err) {
      console.error("[Deals] handler crash:", err.message);
      return writeJson(res, 500, { ok: false, results: [], error: err.message });
    }
  }

  if (pathname === "/api/deals/watches" && req.method === "GET") {
    return writeJson(res, 200, { ok: true, watches: dealWatches, recentAlerts: recentDealAlerts });
  }

  if (pathname === "/api/deals/watches" && req.method === "POST") {
    let body = {};
    try { body = JSON.parse(await readRequestBody(req)); } catch {}
    const w = {
      id: String(Date.now()), query: String(body.query || "").trim(),
      category: String(body.category || "general"), maxPrice: body.maxPrice ? Number(body.maxPrice) : null,
      createdAt: new Date().toISOString(), lastChecked: null, lastAlerted: null, seenIds: [],
    };
    if (!w.query) return writeJson(res, 400, { ok: false, error: "query required" });
    dealWatches.push(w);
    return writeJson(res, 200, { ok: true, watch: w });
  }

  if (pathname.startsWith("/api/deals/watches/") && req.method === "DELETE") {
    const id = pathname.split("/").pop();
    dealWatches = dealWatches.filter(w => w.id !== id);
    return writeJson(res, 200, { ok: true });
  }

  if (pathname === "/api/deals/test-alert" && req.method === "POST") {
    await tg("DEALS TEST: Telegram alert is working.");
    return writeJson(res, 200, { ok: true });
  }

  return writeJson(res, 404, { ok: false, error: "Not found" });
}

module.exports = handleDeals;
module.exports.checkDealWatches = checkDealWatches;
