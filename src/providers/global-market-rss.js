// global-market-rss.js — non-ticker-scoped, $0/keyless RSS feeds for the
// News Intelligence Engine's broader-coverage leg (Unified... no — News
// Intelligence Engine V1, 2026-09-05, see .claude/plans/proud-yawning-
// unicorn.md). Same real hand-rolled regex parsing convention
// src/providers/googlenews.js already established — no new npm
// dependency, one small isolated function per source so one feed going
// down never affects the others.
//
// Both feeds below were verified live (real HTTP 200, real current
// pubDate) before being added — never guessed at from memory. A real,
// disclosed gap: a U.S. Treasury press-release RSS feed was tried first
// (several plausible URLs under home.treasury.gov) and every one either
// timed out or redirected to the bare homepage with no discoverable feed
// link — Treasury does not appear to publish a working public RSS feed
// today. Left out rather than guessed at; see COST_GUARD.md.
function stripTags(s) { return String(s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim(); }
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  if (!m) return "";
  return stripTags(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
}

async function fetchRssFeed(url, source, limit) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, limit).map((m) => {
      const block = m[1] || "";
      const title = tag(block, "title");
      const pub = tag(block, "pubDate");
      return {
        title: title || "Untitled",
        source, publisher: source,
        link: tag(block, "link"),
        publishedAt: pub ? new Date(pub).toISOString() : null,
        summary: tag(block, "description"),
      };
    }).filter((n) => n.title && n.title !== "Untitled");
  } catch { return []; }
}

// Federal Reserve — real, live, official press-release feed (verified
// 2026-09-05: HTTP 200, current pubDate). No key, no rate limit disclosed
// by the Fed beyond normal fair-use.
function fetchFedPressReleases(limit = 15) {
  return fetchRssFeed("https://www.federalreserve.gov/feeds/press_all.xml", "Federal Reserve", limit);
}

// MarketWatch top stories — real, live, general market-news feed
// (verified 2026-09-05: HTTP 200, current pubDate; a same-family WSJ
// markets feed was tried too but its pubDates were over a year stale —
// dropped rather than trusted as "live"). Broad general-market coverage,
// not ticker-scoped.
function fetchMarketWatchTopStories(limit = 15) {
  return fetchRssFeed("https://feeds.content.dowjones.io/public/rss/mw_topstories", "MarketWatch", limit);
}

module.exports = { fetchFedPressReleases, fetchMarketWatchTopStories };
