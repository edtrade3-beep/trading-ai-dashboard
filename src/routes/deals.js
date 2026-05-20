// ── Deals Finder — Reddit community deals (100% free, no API key) ──
// Uses Reddit's public JSON API: reddit.com/r/{sub}/search.json
const { writeJson, readRequestBody } = require("../utils");

const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHAT_ID   = (process.env.TELEGRAM_CHAT_ID  || "").trim();

// In-memory stores
let dealWatches      = [];
let recentDealAlerts = [];

// ── Subreddit map per category ────────────────────────────────────────────────
const CATEGORY_SUBS = {
  electronics: "buildapcsales+techdeals+electronicsdeals+frugalmalefashion+deals",
  realestate:  "realestate+RealEstateInvesting+FirstTimeHomeBuyer+REBubble",
  cars:        "cardeals+UsedCars+askcarsales+cars",
  furniture:   "frugal+malelivingspace+deals+HomeImprovement",
  general:     "deals+frugal+coupons+Flipping+beermoney",
  jobs:        "forhire+jobs+remotework+WorkOnline",
  luxury:      "Watches+malefashionadvice+jewelry+frugalmalefashion",
};

const DEFAULT_SUBS = {
  electronics: ["buildapcsales", "techdeals", "deals"],
  realestate:  ["realestate", "RealEstateInvesting"],
  cars:        ["cardeals", "UsedCars"],
  furniture:   ["frugal", "deals"],
  general:     ["deals", "frugal"],
  jobs:        ["forhire", "remotework"],
  luxury:      ["frugalmalefashion", "deals"],
};

// ── Reddit JSON search ────────────────────────────────────────────────────────
async function searchDeals(query, category = "general", maxPrice = null) {
  const subs = CATEGORY_SUBS[category] || CATEGORY_SUBS.general;

  let url;
  if (query && query.trim()) {
    // Search within specific subreddits
    const params = new URLSearchParams({
      q:           query.trim(),
      restrict_sr: "1",
      sort:        "relevance",
      t:           "month",
      limit:       "25",
      type:        "link",
    });
    url = `https://www.reddit.com/r/${subs}/search.json?${params}`;
  } else {
    // No query — grab top/hot posts from the subreddits
    url = `https://www.reddit.com/r/${subs}/hot.json?limit=25`;
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "AMTradingPlatform/1.0 (deals finder)",
        "Accept":     "application/json",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      return { results: [], error: `Reddit returned ${res.status}` };
    }

    const data = await res.json();
    const posts = (data?.data?.children || []).map(c => c.data);

    let results = posts
      .filter(p => p && p.title && !p.stickied)
      .map(p => {
        // Try to extract price from title  e.g. "$499", "499.99"
        const priceMatch = p.title.match(/\$[\d,]+(?:\.\d{2})?/);
        const rawPriceMatch = p.title.match(/\$?([\d,]+(?:\.\d{2})?)/);
        const rawPrice = rawPriceMatch ? parseFloat(rawPriceMatch[1].replace(/,/g, "")) : null;

        // Thumbnail — Reddit gives "self" or "nsfw" strings for non-image
        const thumb = p.thumbnail && !["self","nsfw","default","image","spoiler",""].includes(p.thumbnail)
          ? p.thumbnail : null;

        return {
          id:          p.id,
          title:       p.title,
          description: p.selftext ? p.selftext.slice(0, 120) : "",
          price:       priceMatch ? priceMatch[0] : null,
          rawPrice:    rawPrice,
          link:        p.url || `https://reddit.com${p.permalink}`,
          redditLink:  `https://reddit.com${p.permalink}`,
          source:      `r/${p.subreddit}`,
          thumbnail:   thumb,
          score:       p.score || 0,
          comments:    p.num_comments || 0,
          age:         p.created_utc ? Math.floor((Date.now()/1000 - p.created_utc) / 3600) : null,
          category,
        };
      });

    // Filter by max price if set
    if (maxPrice) {
      const cap = Number(maxPrice);
      results = results.filter(r => r.rawPrice === null || r.rawPrice <= cap);
    }

    // Sort by score descending (hottest deals first)
    results.sort((a, b) => b.score - a.score);

    return { results, query };
  } catch (e) {
    return { results: [], error: `Reddit fetch failed: ${e.message}` };
  }
}

// ── Telegram helper ───────────────────────────────────────────────────────────
async function tg(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    });
  } catch {}
}

// ── Background watch checker — called every 30 min from server.js ─────────────
async function checkDealWatches() {
  if (!dealWatches.length) return;
  const now      = Date.now();
  const INTERVAL = 30 * 60 * 1000;

  for (const watch of dealWatches) {
    if (watch.lastChecked && now - watch.lastChecked < INTERVAL) continue;
    watch.lastChecked = now;

    const { results, error } = await searchDeals(watch.query, watch.category, watch.maxPrice);
    if (error || !results.length) continue;

    const seen     = new Set(watch.seenIds || []);
    const newDeals = results.filter(r => !seen.has(r.id));
    if (!newDeals.length) continue;

    watch.seenIds = [...seen, ...newDeals.map(r => r.id)].slice(-500);
    watch.lastAlerted = now;

    const top = newDeals.slice(0, 5);
    let msg   = `DEAL ALERT: "${watch.query}" (${watch.category.toUpperCase()})\n`;
    msg      += `${top.length} new deal${top.length > 1 ? "s" : ""} on Reddit:\n\n`;
    for (const d of top) {
      msg += `• ${d.title}`;
      if (d.price) msg += `  ${d.price}`;
      msg += `\n  ${d.source} · ${d.score} upvotes\n`;
      msg += `  ${d.link.slice(0, 80)}\n\n`;
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
