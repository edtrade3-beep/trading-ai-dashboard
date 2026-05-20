// ── Deals Finder — SerpAPI-powered search + Telegram alert watches ──
const { writeJson, readRequestBody } = require("../utils");

const SERPAPI_KEY        = (process.env.SERPAPI_KEY || "").trim();
const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHAT_ID   = (process.env.TELEGRAM_CHAT_ID  || "").trim();

// In-memory stores (reset on server restart — good enough for alerts)
let dealWatches      = [];   // { id, query, category, maxPrice, location, seenIds[], lastChecked, lastAlerted, createdAt }
let recentDealAlerts = [];   // last 60 alert events shown in UI

// ── SerpAPI search ────────────────────────────────────────────────────────────
async function searchDeals(query, category, maxPrice, location) {
  if (!SERPAPI_KEY) return { results: [], error: "SERPAPI_KEY not configured on server" };

  const useOrganic = category === "realestate" || category === "cars" || category === "jobs";

  let q = query || "";
  if (!q) {
    const defaults = {
      electronics: "electronics deals sale",
      realestate:  "homes for sale below market value",
      cars:        "used cars best deals",
      furniture:   "furniture sale clearance deals",
      general:     "best deals today sale",
      jobs:        "remote jobs hiring now",
    };
    q = defaults[category] || "best deals sale";
  }
  if (location && (category === "realestate" || category === "cars")) q += ` ${location}`;

  const params = new URLSearchParams({
    engine:  useOrganic ? "google" : "google_shopping",
    q,
    api_key: SERPAPI_KEY,
    num:     "20",
    hl:      "en",
    gl:      "us",
  });

  try {
    const res  = await fetch(`https://serpapi.com/search.json?${params}`, {
      headers: { "User-Agent": "AxiomPlatform/1.0" },
      signal:  AbortSignal.timeout(18000),
    });
    const data = await res.json();

    if (data.error) return { results: [], error: data.error };

    let results = [];

    if (useOrganic) {
      // Real estate / cars — use organic results
      results = (data.organic_results || []).slice(0, 15).map((r, i) => ({
        id:          `org-${i}`,
        title:       r.title || "",
        description: r.snippet || "",
        price:       null,
        rawPrice:    null,
        link:        r.link || "",
        source:      r.displayed_link || r.source || "",
        thumbnail:   r.thumbnail || null,
        category,
      }));
    } else {
      // Electronics / general — use shopping results
      results = (data.shopping_results || []).map(r => ({
        id:          String(r.product_id || r.position || Math.random()),
        title:       r.title || "",
        description: r.snippet || "",
        price:       r.price || null,
        rawPrice:    typeof r.extracted_price === "number" ? r.extracted_price : null,
        link:        r.link || "",
        source:      r.source || "",
        thumbnail:   r.thumbnail || null,
        rating:      r.rating  || null,
        reviews:     r.reviews || null,
        category,
      }));

      if (maxPrice) {
        const cap = Number(maxPrice);
        results = results.filter(r => r.rawPrice === null || r.rawPrice <= cap);
      }
    }

    return { results, query: q };
  } catch (e) {
    return { results: [], error: e.message };
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
  const now = Date.now();
  const INTERVAL = 30 * 60 * 1000; // 30 minutes

  for (const watch of dealWatches) {
    if (watch.lastChecked && now - watch.lastChecked < INTERVAL) continue;
    watch.lastChecked = now;

    const { results, error } = await searchDeals(
      watch.query, watch.category, watch.maxPrice, watch.location
    );
    if (error || !results.length) continue;

    const seen     = new Set(watch.seenIds || []);
    const newDeals = results.filter(r => !seen.has(r.id));
    if (!newDeals.length) continue;

    // Remember seen IDs (cap to 500)
    watch.seenIds = [...seen, ...newDeals.map(r => r.id)].slice(-500);
    watch.lastAlerted = now;

    // Build Telegram message
    const top = newDeals.slice(0, 5);
    let msg  = `DEAL ALERT: "${watch.query}" (${watch.category.toUpperCase()})\n`;
    msg     += `${top.length} new deal${top.length > 1 ? "s" : ""} found:\n\n`;
    for (const d of top) {
      msg += `• ${d.title}`;
      if (d.price) msg += `  ${d.price}`;
      msg += `\n  ${d.source}\n`;
      if (d.link) msg += `  ${d.link.slice(0, 80)}\n`;
      msg += "\n";
    }
    if (newDeals.length > 5) msg += `...and ${newDeals.length - 5} more.\n`;

    await tg(msg);

    // Log for UI
    recentDealAlerts.unshift({
      id:       `a${now}`,
      watchId:  watch.id,
      query:    watch.query,
      category: watch.category,
      count:    newDeals.length,
      at:       new Date().toISOString(),
      preview:  top.slice(0, 3).map(d => ({ title: d.title, price: d.price, source: d.source })),
    });
    if (recentDealAlerts.length > 60) recentDealAlerts.length = 60;

    console.log(`[Deals] Alert sent for watch "${watch.query}": ${newDeals.length} new deals`);
  }
}

// ── HTTP route handler ────────────────────────────────────────────────────────
async function handleDeals(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;

  // Search
  if (pathname === "/api/deals/search") {
    const q        = searchParams.get("q")        || "";
    const category = searchParams.get("category") || "general";
    const maxPrice = searchParams.get("maxPrice") || null;
    const location = searchParams.get("location") || "";
    const { results, error, query } = await searchDeals(q, category, maxPrice, location);
    return writeJson(res, 200, { ok: !error, results: results || [], error: error || null, query });
  }

  // List watches + recent alerts
  if (pathname === "/api/deals/watches" && req.method === "GET") {
    return writeJson(res, 200, { ok: true, watches: dealWatches, recentAlerts: recentDealAlerts });
  }

  // Create watch
  if (pathname === "/api/deals/watches" && req.method === "POST") {
    let body = {};
    try { body = JSON.parse(await readRequestBody(req)); } catch {}
    const watch = {
      id:          String(Date.now()),
      query:       String(body.query    || "").trim(),
      category:    String(body.category || "general"),
      maxPrice:    body.maxPrice ? Number(body.maxPrice) : null,
      location:    String(body.location || "").trim(),
      createdAt:   new Date().toISOString(),
      lastChecked: null,
      lastAlerted: null,
      seenIds:     [],
    };
    if (!watch.query) return writeJson(res, 400, { ok: false, error: "query required" });
    dealWatches.push(watch);
    return writeJson(res, 200, { ok: true, watch });
  }

  // Delete watch
  if (pathname.startsWith("/api/deals/watches/") && req.method === "DELETE") {
    const id = pathname.split("/").pop();
    dealWatches = dealWatches.filter(w => w.id !== id);
    return writeJson(res, 200, { ok: true });
  }

  // Manual Telegram test for a watch
  if (pathname === "/api/deals/test-alert" && req.method === "POST") {
    await tg("DEALS TEST: Telegram alert from your AM Trading platform is working.");
    return writeJson(res, 200, { ok: true });
  }

  return writeJson(res, 404, { ok: false, error: "Not found" });
}

module.exports = handleDeals;
module.exports.checkDealWatches = checkDealWatches;
