"use strict";
/**
 * Reddit Finance/Tech News aggregator
 * Tries Reddit JSON API first; falls back to RSS if blocked (common on cloud IPs).
 * Results cached 8 minutes to stay well within rate limits.
 *
 * Subreddits covered:
 *   Finance:  wallstreetbets, stocks, investing, StockMarket, finance, SecurityAnalysis, options
 *   Tech:     technology, tech, artificial, MachineLearning, singularity
 */

const UA = "AMTradingPlatform/1.0 (finance news reader; github.com/edtrade3-beep)";

// ── Subreddit catalogue ───────────────────────────────────────────────────────

const FINANCE_SUBS = [
  { sub: "wallstreetbets",   label: "WSB",      cat: "finance" },
  { sub: "stocks",           label: "Stocks",   cat: "finance" },
  { sub: "investing",        label: "Invest",   cat: "finance" },
  { sub: "StockMarket",      label: "Market",   cat: "finance" },
  { sub: "finance",          label: "Finance",  cat: "finance" },
  { sub: "SecurityAnalysis", label: "DD",       cat: "finance" },
  { sub: "options",          label: "Options",  cat: "finance" },
];

const TECH_SUBS = [
  { sub: "technology",       label: "Tech",     cat: "tech" },
  { sub: "artificial",       label: "AI",       cat: "tech" },
  { sub: "MachineLearning",  label: "ML",       cat: "tech" },
  { sub: "singularity",      label: "Future",   cat: "tech" },
];

const ALL_SUBS = [...FINANCE_SUBS, ...TECH_SUBS];

// ── Cache ─────────────────────────────────────────────────────────────────────
const _cache = new Map();
function cached(key, ttlMs, fn) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return Promise.resolve(hit.value);
  return fn().then(val => { _cache.set(key, { ts: Date.now(), value: val }); return val; });
}

// ── Mini RSS/Atom parser ──────────────────────────────────────────────────────
function parseRSS(xml, subreddit, label) {
  const out = [];
  const re  = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    const get = tag => {
      const r = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i").exec(b);
      return r ? r[1].trim() : "";
    };
    const getAttr = (tag, attr) => {
      const r = new RegExp(`<${tag}[^>]+${attr}="([^"]+)"`, "i").exec(b);
      return r ? r[1] : "";
    };
    const raw   = get("title");
    const title = raw.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
                     .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim().slice(0, 200);
    if (!title || title.length < 10) continue;
    const url = getAttr("link", "href") || get("link") || get("guid") || get("id") || "";
    if (!url) continue;
    const pub = get("pubDate") || get("published") || get("updated") || "";
    out.push({ title, url, subreddit, label, score: 0, comments: 0, pub });
  }
  return out;
}

// ── Reddit JSON parser ────────────────────────────────────────────────────────
function parseJSON(data, subreddit, label) {
  return (data?.data?.children || [])
    .filter(c => c.data && !c.data.stickied && (c.data.title || "").length > 10)
    .map(c => ({
      title:     c.data.title.replace(/&amp;/g, "&").slice(0, 200),
      url:       `https://www.reddit.com${c.data.permalink}`,
      extUrl:    c.data.url || "",
      subreddit,
      label,
      score:     c.data.score    || 0,
      comments:  c.data.num_comments || 0,
      flair:     c.data.link_flair_text || "",
      pub:       c.data.created_utc ? new Date(c.data.created_utc * 1000).toISOString() : "",
    }));
}

// ── Fetch one subreddit ───────────────────────────────────────────────────────
async function fetchSub(sub, label, sort = "hot", limit = 6) {
  // 1) Try JSON API
  try {
    const r = await fetch(
      `https://www.reddit.com/r/${sub}/${sort}.json?limit=${limit}&raw_json=1`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8_000) }
    );
    if (r.ok) {
      const d = await r.json();
      const posts = parseJSON(d, sub, label);
      if (posts.length > 0) return posts;
    }
  } catch { /* fall through to RSS */ }

  // 2) RSS/Atom fallback
  try {
    const r = await fetch(
      `https://www.reddit.com/r/${sub}/${sort}/.rss?limit=${limit}`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8_000) }
    );
    if (r.ok) {
      const xml = await r.text();
      return parseRSS(xml, sub, label);
    }
  } catch { /* ignore */ }

  return [];
}

// ── Fetch all finance subs ────────────────────────────────────────────────────
async function fetchFinanceNews(opts = {}) {
  const { sort = "hot", postsPerSub = 4, subs = FINANCE_SUBS } = opts;
  return cached(`finance:${sort}:${postsPerSub}`, 8 * 60_000, async () => {
    const results = await Promise.allSettled(
      subs.map(s => fetchSub(s.sub, s.label, sort, postsPerSub))
    );
    const all = [];
    for (const r of results) if (r.status === "fulfilled") all.push(...r.value);
    return all.sort((a, b) => b.score - a.score);
  });
}

// ── Fetch all tech subs ───────────────────────────────────────────────────────
async function fetchTechNews(opts = {}) {
  const { sort = "hot", postsPerSub = 4 } = opts;
  return cached(`tech:${sort}:${postsPerSub}`, 8 * 60_000, async () => {
    const results = await Promise.allSettled(
      TECH_SUBS.map(s => fetchSub(s.sub, s.label, sort, postsPerSub))
    );
    const all = [];
    for (const r of results) if (r.status === "fulfilled") all.push(...r.value);
    return all.sort((a, b) => b.score - a.score);
  });
}

// ── Fetch BOTH finance + tech ─────────────────────────────────────────────────
async function fetchAllNews(opts = {}) {
  const { sort = "hot", postsPerSub = 4 } = opts;
  return cached(`all:${sort}:${postsPerSub}`, 8 * 60_000, async () => {
    const results = await Promise.allSettled(
      ALL_SUBS.map(s => fetchSub(s.sub, s.label, sort, postsPerSub))
    );
    const all = [];
    for (const r of results) if (r.status === "fulfilled") all.push(...r.value);
    return all.sort((a, b) => b.score - a.score);
  });
}

// ── Single subreddit by name ──────────────────────────────────────────────────
async function fetchSubreddit(subName, sort = "hot", limit = 8) {
  const meta = ALL_SUBS.find(s => s.sub.toLowerCase() === subName.toLowerCase());
  const label = meta ? meta.label : subName;
  return fetchSub(subName, label, sort, limit);
}

module.exports = {
  fetchFinanceNews,
  fetchTechNews,
  fetchAllNews,
  fetchSubreddit,
  FINANCE_SUBS,
  TECH_SUBS,
  ALL_SUBS,
};
